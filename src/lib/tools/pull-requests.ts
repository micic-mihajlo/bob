import { z } from "zod";
import { acceptanceTampering } from "../acceptance";
import { newId, nowIso } from "../ids";
import { scheduleKnowledgeIngest } from "../graph/knowledge";
import { resolveOnMerge } from "../inbox";
import { completeWorkOrder, updateWorkOrder } from "../roadmap";
import { agentById, messageById, type State } from "../state";
import { patchArtifact } from "../state-ops";
import { recordReleaseNote } from "../release-notes-live";
import { shipToLinear } from "../integrations/linear/outbound";
import { getState, transact } from "../store";
import { threadWorkspace, workspaceOptions } from "../thread-workspace";
import { findPullRequest, isPullRequest, nextPullRequestNumber, type PullRequestArtifact } from "../threads";
import type { Agent, Artifact, InboxItem, ReviewFinding } from "../types";
import { afterLocalMerge, mergeOnGitHub, postReviewToGitHub, publishToGitHub } from "../integrations/github";
import { conflictsWithMain, git, mergePullRequest, openPullRequest, type Workspace } from "../workspace";
import { askForReReview, askToUpdateBranch, handFindingsToBuilder, maxFixRounds, reviewGateRefusal } from "./handoff";
import { verificationRefusal } from "../verification";
import { treeOfCommit } from "../verify/run";
import { done, fail, type ToolContext, type ToolOutput } from "./context";

const PATCH_PREVIEW = 6_000;

export const openPullRequestSchema = z.object({
  title: z.string().min(1).max(100).describe("One line saying what the change does."),
  body: z.string().min(1).describe("Why the change is needed, what it touches, and how you checked it."),
  commitMessage: z.string().min(1).optional().describe("Commits every uncommitted change with this message first. Defaults to the title."),
});
type OpenInput = z.infer<typeof openPullRequestSchema>;
type Opened = { headSha: string; files: PullRequestArtifact["pullRequest"]["files"]; patch: string; tree: string | null };

function linkWorkOrder(s: State, agent: Agent, artifactId: string): State {
  if (!agent.workOrderId) return s;
  const linked = updateWorkOrder(s.roadmap, agent.workOrderId, { status: "review", artifactId });
  return linked.ok ? { ...s, roadmap: linked.roadmap } : s;
}

/** A second call on the same branch updates the open pull request instead of numbering a new one. */
function upsertPullRequest(s: State, ctx: ToolContext, agent: Agent, branch: string, input: OpenInput, opened: Opened) {
  const existing = s.artifacts.find((a): a is PullRequestArtifact => isPullRequest(a) && a.pullRequest.branch === branch && !a.pullRequest.merged);
  const data = { branch, headSha: opened.headSha, files: opened.files, patch: opened.patch, merged: false, ...(opened.tree ? { tree: opened.tree } : {}) };
  if (existing) {
    const pullRequest = { ...existing.pullRequest, ...data };
    const state = patchArtifact(s, existing.id, { title: input.title, detail: input.body, status: "open", pullRequest });
    return { state: linkWorkOrder(state, agent, existing.id), value: { ...existing, pullRequest } };
  }
  const artifact: PullRequestArtifact = {
    id: newId("art"),
    kind: "pull_request",
    title: input.title,
    detail: input.body,
    status: "open",
    agentId: agent.id,
    turnId: ctx.turnId,
    requestId: ctx.requestId,
    messageId: ctx.causedBy,
    at: nowIso(),
    pullRequest: { number: nextPullRequestNumber(s), ...data },
  };
  return { state: linkWorkOrder({ ...s, artifacts: [...s.artifacts, artifact] }, agent, artifact.id), value: artifact };
}

/** Stages and commits whatever the thread changed, so opening a pull request is one call. */
async function commitPending(ws: Workspace, message: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const status = await git(ws, ["status", "--porcelain"]);
  if (!status.ok) return status;
  if (status.output.trim() === "") return { ok: true };
  const added = await git(ws, ["add", "--all"]);
  if (!added.ok) return added;
  const commit = await git(ws, ["commit", "--quiet", "-m", message]);
  return commit.ok ? { ok: true } : commit;
}

export async function openPullRequestTool(input: OpenInput, ctx: ToolContext): Promise<ToolOutput> {
  const s = getState();
  const agent = agentById(s, ctx.agentId);
  if (!agent?.branch) return fail("This thread has no branch of its own, so it cannot open a pull request.");
  const branch = agent.branch;
  const ws = await threadWorkspace(s.project, agent.id);
  const committed = await commitPending(ws, input.commitMessage ?? input.title);
  if (!committed.ok) return fail(committed.error);
  const opened = await openPullRequest(ws, { branch, title: input.title, body: input.body });
  if (!opened.ok) return fail(opened.error);
  const tree = await treeOfCommit(ws, opened.headSha);
  const pr = transact((x) => upsertPullRequest(x, ctx, agent, branch, input, { ...opened, tree }));
  const github = await publishToGitHub(s.project.id, pr.id);
  const reviewer = askForReReview(pr);
  return done({
    pullRequestId: pr.id,
    number: pr.pullRequest.number,
    branch,
    ...(github ? { github: "url" in github ? github.url : `not published: ${github.error}` } : {}),
    files: pr.pullRequest.files,
    patch: opened.patch.slice(0, PATCH_PREVIEW),
    next: reviewer
      ? `Updated. The review runs again on this head by itself. Read the diff; report only if you are blocked, then end your turn with one line.`
      : `Read this diff. If it does what the brief asks, call report once naming pull request #${pr.pullRequest.number} (id ${pr.id}) and branch ${branch}.`,
  }, reviewer ? { wake: [reviewer] } : {});
}

const findingSchema = z.object({
  path: z.string().min(1).describe("File the finding is about."),
  line: z.number().int().min(1).nullable().optional().describe("Line in the new version, if one applies."),
  category: z.enum(["bug", "security", "performance", "tests", "style"]),
  severity: z.enum(["low", "medium", "high"]),
  confidence: z.number().min(0).max(1).optional().describe("How sure you are, 0 to 1. Defaults to 0.8."),
  comment: z.string().min(1).describe("What is wrong and what to change."),
});

export const recordReviewSchema = z.object({
  pullRequestId: z.string().min(1).describe("The pull request's id, or its number as \"#3\"."),
  verdict: z.enum(["approve", "request_changes"]).describe("approve only when it is correct and safe to merge as it is."),
  findings: z.array(findingSchema).default([]).describe("Every issue you found, blocking or not."),
  summary: z.string().optional().describe("One or two sentences on what you checked."),
});
type ReviewInput = z.infer<typeof recordReviewSchema>;

const DEFAULT_CONFIDENCE = 0.8;

function reviewArtifact(input: ReviewInput, pr: PullRequestArtifact, ctx: ToolContext): Artifact {
  const findings = reviewArtifactFindings(input);
  const verdict = input.verdict === "approve" ? "Approved" : "Changes requested";
  return {
    id: newId("art"),
    kind: "review",
    title: `Review of #${pr.pullRequest.number}: ${pr.title}`,
    detail: input.summary?.trim() || `${verdict} with ${findings.length} finding${findings.length === 1 ? "" : "s"}.`,
    status: input.verdict === "approve" ? "approved" : "open",
    agentId: ctx.agentId,
    turnId: ctx.turnId,
    requestId: ctx.requestId,
    messageId: ctx.causedBy,
    at: nowIso(),
    review: { pullRequestId: pr.id, verdict: input.verdict, findings, headSha: pr.pullRequest.headSha },
  };
}

/** A change to an acceptance test always blocks: the verdict becomes request_changes with a high finding per file. */
function withAcceptanceFindings(input: ReviewInput): ReviewInput {
  const s = getState();
  const pr = findPullRequest(s, input.pullRequestId);
  const tampered = pr ? acceptanceTampering(s, pr) : [];
  if (tampered.length === 0) return input;
  const findings = tampered.map((t) => ({ ...t, line: null, category: "tests" as const, severity: "high" as const, confidence: 1 }));
  return { ...input, verdict: "request_changes", findings: [...input.findings, ...findings] };
}

export async function recordReview(given: ReviewInput, ctx: ToolContext): Promise<ToolOutput> {
  const input = withAcceptanceFindings(given);
  const out = storeReview(input, ctx);
  const pr = typeof out.result.reviewId === "string" ? findPullRequest(getState(), input.pullRequestId) : undefined;
  if (pr) await postReviewToGitHub(pr.id, { verdict: input.verdict, findings: reviewArtifactFindings(input), summary: input.summary });
  if (!pr || input.verdict !== "request_changes") return out;
  const reviewer = agentById(getState(), ctx.agentId)?.name ?? ctx.agentId;
  const handed = handFindingsToBuilder(pr, reviewer, reviewArtifactFindings(input));
  if (!handed.to) return out;
  const builder = agentById(getState(), handed.to)?.name ?? handed.to;
  const max = maxFixRounds(getState());
  const note =
    handed.round <= max
      ? `Your findings went to ${builder} automatically (fix round ${handed.round} of ${max}); you get its new head to review again.`
      : `That was the last fix round; ${builder} now reports blocked to the captain.`;
  return { ...out, result: { ...out.result, next: `${note} Now call report once with your verdict in Status / Result / Evidence form.` }, wake: [...(out.wake ?? []), handed.to] };
}

const reviewArtifactFindings = (input: ReviewInput): ReviewFinding[] =>
  input.findings.map((f) => ({ ...f, line: f.line ?? null, confidence: f.confidence ?? DEFAULT_CONFIDENCE }));

function storeReview(input: ReviewInput, ctx: ToolContext): ToolOutput {
  return transact((s) => {
    const pr = findPullRequest(s, input.pullRequestId);
    if (!pr) return { state: s, value: fail(`No pull request ${input.pullRequestId}. Use the id or number from your brief.`) };
    if (pr.pullRequest.merged) return { state: s, value: fail(`#${pr.pullRequest.number} is already merged. There is nothing to review.`) };
    const review = reviewArtifact(input, pr, ctx);
    const withReview = { ...s, artifacts: [...s.artifacts, review] };
    const state = patchArtifact(withReview, pr.id, { status: input.verdict === "approve" ? "approved" : "open" });
    const next = "Recorded. Now call report once with your verdict in Status / Result / Evidence form.";
    return { state, value: done({ reviewId: review.id, pullRequest: pr.pullRequest.number, verdict: input.verdict, next }) };
  });
}

export const mergeSchema = z.object({
  pullRequestId: z.string().min(1).describe("The pull request's id, or its number as \"#3\"."),
});

function markMerged(s: State, pr: PullRequestArtifact): { state: State; value: string | null } {
  const merged = patchArtifact(s, pr.id, { status: "merged", pullRequest: { ...pr.pullRequest, merged: true } });
  const owner = agentById(s, pr.agentId);
  const orders = [...s.roadmap.today, ...(s.roadmap.backlog ?? [])];
  const order = orders.find((w) => w.artifactId === pr.id) ?? orders.find((w) => w.id === owner?.workOrderId);
  if (!order) return { state: merged, value: null };
  const completed = completeWorkOrder(merged.roadmap, order.id, pr.id);
  return { state: completed.ok ? { ...merged, roadmap: completed.roadmap } : merged, value: order.id };
}

function approvalRefusal(s: State, pr: PullRequestArtifact): string | null {
  const approvals = s.approvals.filter((a) => a.pullRequestId === pr.id);
  const approved = approvals.filter((a) => a.status === "approved");
  if (approved.some((a) => a.headSha === pr.pullRequest.headSha)) return null;
  const n = `#${pr.pullRequest.number}`;
  if (approved.length > 0) {
    const stale = `${n} changed after the person approved it, so that approval no longer covers it.`;
    return reviewGateRefusal(s, pr)
      ? `${stale} It goes back through review on its new head by itself. Tell the person that, and end your turn.`
      : `${stale} Its review already approves the new head: call request_approval again with pullRequestId "${pr.id}", say what changed, and end your turn.`;
  }
  if (approvals.some((a) => a.status === "pending")) return `The person has not decided on merging ${n} yet. End your turn and wait for the decision.`;
  return `Merging ${n} needs the person's approval first. Call request_approval with pullRequestId "${pr.id}", tell the person what will be merged, and end your turn.`;
}

/** Refuses in code without an approved approval for this pull request. Safe to call again. */
export async function mergePullRequestTool(input: z.infer<typeof mergeSchema>): Promise<ToolOutput> {
  const s = getState();
  const pr = findPullRequest(s, input.pullRequestId);
  if (!pr) return fail(`No pull request ${input.pullRequestId}. Call list_threads or read the artifacts for valid ids.`);
  const refused = approvalRefusal(s, pr) ?? (pr.pullRequest.merged ? null : verificationRefusal(s, pr));
  if (refused) return fail(refused);
  const remote = pr.pullRequest.merged ? null : await mergeOnGitHub(s.project.id, pr.id);
  const result = pr.pullRequest.merged ? null : await mergePullRequest(s.project.id, { branch: pr.pullRequest.branch }, workspaceOptions());
  if (result?.ok) await afterLocalMerge(s.project.id, pr.id);
  const mainMoved = !!result?.ok && (!result.alreadyMerged || !!remote?.mainMoved);
  if (result && !result.ok) {
    const conflict = await conflictsWithMain(s.project.id, pr.pullRequest.branch, workspaceOptions());
    const owner = conflict.ok && conflict.conflicts.length > 0 ? askToUpdateBranch(pr, conflict.conflicts) : null;
    if (owner) {
      const name = agentById(getState(), owner)?.name ?? owner;
      return { result: { error: `Could not merge #${pr.pullRequest.number}: ${result.error}. ${name} was asked to merge main into its branch; the review runs again on its new head, then ask the person again. End your turn.` }, wake: [owner] };
    }
    return fail(`Could not merge #${pr.pullRequest.number}: ${result.error}. Tell the person.`);
  }
  const workOrderId = transact((x) => {
    const fresh = findPullRequest(x, pr.id);
    return fresh ? markMerged(x, fresh) : { state: x, value: null };
  });
  void shipToLinear(pr.id, recordReleaseNote(pr.id));
  scheduleKnowledgeIngest();
  const resolved = transact((x) => {
    const fresh = findPullRequest(x, pr.id);
    if (!fresh) return { state: x, value: [] as InboxItem[] };
    const out = resolveOnMerge(x, fresh, workOrderId);
    return { state: out.state, value: out.resolved };
  });
  const fixed = resolved.length ? ` Resolved in the inbox, with #${pr.pullRequest.number} as evidence: ${resolved.map((i) => `${i.id} (${i.source})`).join(", ")}.` : "";
  const updating = mainMoved ? await updateConflictingPullRequests(s.project.id, pr.id) : [];
  const also = updating.length ? ` ${updating.map((u) => `#${u.number}`).join(", ")} now conflicts with main; its build thread was asked to update its branch.` : "";
  const next = `Merged. Close this work order's threads with close_thread.${also}${fixed}`;
  const github = findPullRequest(getState(), pr.id)?.pullRequest.github;
  const onGitHub = github ? { github: github.merged ? `merged ${github.url}` : `not merged on GitHub: ${github.error ?? remote?.error ?? "unknown"}` } : {};
  return done({ merged: true, alreadyMerged: !mainMoved, number: pr.pullRequest.number, workOrderId, next, ...(resolved.length ? { resolvedInbox: resolved.map((i) => i.id) } : {}), ...onGitHub }, { wake: updating.map((u) => u.owner) });
}

/**
 * Why a turn asked to bring a pull request up to date with main cannot end done: its published branch still
 * conflicts with main. Null when the turn carried no such ask, or every branch it was asked about merges cleanly.
 */
export async function conflictLeft(s: State, turnId: string): Promise<string | null> {
  const asks = (s.turns.find((t) => t.id === turnId)?.messageIds ?? []).map((id) => messageById(s, id)?.text ?? "").filter((text) => text.includes(" conflicts with main"));
  if (asks.length === 0) return null;
  const prs = s.artifacts.filter((a): a is PullRequestArtifact => isPullRequest(a) && !a.pullRequest.merged && asks.some((text) => text.includes(`(id ${a.id})`)));
  for (const pr of prs) {
    const conflict = await conflictsWithMain(s.project.id, pr.pullRequest.branch, workspaceOptions());
    if (conflict.ok && conflict.conflicts.length > 0) {
      return `Pull request #${pr.pullRequest.number} still conflicts with main in ${conflict.conflicts.join(", ")}: its branch was not brought up to date.`;
    }
  }
  return null;
}

/** After a merge, every other open pull request that now conflicts with main goes back to its owner, so none is stranded. */
async function updateConflictingPullRequests(projectId: string, mergedId: string): Promise<{ number: number; owner: string }[]> {
  const open = getState().artifacts.filter((a): a is PullRequestArtifact => isPullRequest(a) && !a.pullRequest.merged && a.id !== mergedId);
  const asked: { number: number; owner: string }[] = [];
  for (const pr of open) {
    const conflict = await conflictsWithMain(projectId, pr.pullRequest.branch, workspaceOptions());
    if (!conflict.ok || conflict.conflicts.length === 0) continue;
    const owner = askToUpdateBranch(pr, conflict.conflicts);
    if (owner) asked.push({ number: pr.pullRequest.number, owner });
  }
  return asked;
}
