import { z } from "zod";
import { newId, nowIso } from "../ids";
import { completeWorkOrder, updateWorkOrder } from "../roadmap";
import { agentById, type State } from "../state";
import { patchArtifact } from "../state-ops";
import { getState, transact } from "../store";
import { threadWorkspace, workspaceOptions } from "../thread-workspace";
import { findPullRequest, isPullRequest, nextPullRequestNumber, type PullRequestArtifact } from "../threads";
import type { Agent, Artifact, ReviewFinding } from "../types";
import { mergePullRequest, openPullRequest } from "../workspace";
import { done, fail, type ToolContext, type ToolOutput } from "./context";

const PATCH_PREVIEW = 6_000;

export const openPullRequestSchema = z.object({
  title: z.string().min(1).max(100).describe("One line saying what the change does."),
  body: z.string().min(1).describe("Why the change is needed, what it touches, and how you checked it."),
});
type OpenInput = z.infer<typeof openPullRequestSchema>;
type Opened = { headSha: string; files: PullRequestArtifact["pullRequest"]["files"]; patch: string };

function linkWorkOrder(s: State, agent: Agent, artifactId: string): State {
  if (!agent.workOrderId) return s;
  const linked = updateWorkOrder(s.roadmap, agent.workOrderId, { status: "review", artifactId });
  return linked.ok ? { ...s, roadmap: linked.roadmap } : s;
}

/** A second call on the same branch updates the open pull request instead of numbering a new one. */
function upsertPullRequest(s: State, ctx: ToolContext, agent: Agent, branch: string, input: OpenInput, opened: Opened) {
  const existing = s.artifacts.find((a): a is PullRequestArtifact => isPullRequest(a) && a.pullRequest.branch === branch && !a.pullRequest.merged);
  const data = { branch, headSha: opened.headSha, files: opened.files, patch: opened.patch, merged: false };
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

export async function openPullRequestTool(input: OpenInput, ctx: ToolContext): Promise<ToolOutput> {
  const s = getState();
  const agent = agentById(s, ctx.agentId);
  if (!agent?.branch) return fail("This thread has no branch of its own, so it cannot open a pull request.");
  const branch = agent.branch;
  const opened = await openPullRequest(await threadWorkspace(s.project, agent.id), { branch, title: input.title, body: input.body });
  if (!opened.ok) return fail(opened.error);
  const pr = transact((x) => upsertPullRequest(x, ctx, agent, branch, input, opened));
  return done({
    pullRequestId: pr.id,
    number: pr.pullRequest.number,
    branch,
    files: pr.pullRequest.files,
    patch: opened.patch.slice(0, PATCH_PREVIEW),
    next: `Read this diff. If it does what the brief asks, call report once naming pull request #${pr.pullRequest.number} (id ${pr.id}) and branch ${branch}.`,
  });
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
  const findings: ReviewFinding[] = input.findings.map((f) => ({ ...f, line: f.line ?? null, confidence: f.confidence ?? DEFAULT_CONFIDENCE }));
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
    review: { pullRequestId: pr.id, verdict: input.verdict, findings },
  };
}

export function recordReview(input: ReviewInput, ctx: ToolContext): ToolOutput {
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
  const order = s.roadmap.today.find((w) => w.artifactId === pr.id) ?? s.roadmap.today.find((w) => w.id === owner?.workOrderId);
  if (!order) return { state: merged, value: null };
  const completed = completeWorkOrder(merged.roadmap, order.id, pr.id);
  return { state: completed.ok ? { ...merged, roadmap: completed.roadmap } : merged, value: order.id };
}

function approvalRefusal(s: State, pr: PullRequestArtifact): string | null {
  const approvals = s.approvals.filter((a) => a.pullRequestId === pr.id);
  if (approvals.some((a) => a.status === "approved")) return null;
  const n = `#${pr.pullRequest.number}`;
  if (approvals.some((a) => a.status === "pending")) return `The person has not decided on merging ${n} yet. End your turn and wait for the decision.`;
  return `Merging ${n} needs the person's approval first. Call request_approval with pullRequestId "${pr.id}", tell the person what will be merged, and end your turn.`;
}

/** Refuses in code without an approved approval for this pull request. Safe to call again. */
export async function mergePullRequestTool(input: z.infer<typeof mergeSchema>): Promise<ToolOutput> {
  const s = getState();
  const pr = findPullRequest(s, input.pullRequestId);
  if (!pr) return fail(`No pull request ${input.pullRequestId}. Call list_threads or read the artifacts for valid ids.`);
  const refused = approvalRefusal(s, pr);
  if (refused) return fail(refused);
  const result = pr.pullRequest.merged ? null : await mergePullRequest(s.project.id, { branch: pr.pullRequest.branch }, workspaceOptions());
  if (result && !result.ok) {
    return fail(`Could not merge #${pr.pullRequest.number}: ${result.error}. Tell the person; if it conflicts, ask the build thread to bring its branch up to date with main.`);
  }
  const workOrderId = transact((x) => {
    const fresh = findPullRequest(x, pr.id);
    return fresh ? markMerged(x, fresh) : { state: x, value: null };
  });
  const next = "Merged. Close this work order's threads with close_thread and update DIGEST.md.";
  return done({ merged: true, alreadyMerged: !result || result.alreadyMerged, number: pr.pullRequest.number, workOrderId, next });
}
