import { z } from "zod";
import { policyFor, protectedFiles } from "../policy";
import { newId, nowIso } from "../ids";
import type { State } from "../state";
import { addThreadItem, stamp } from "../state-ops";
import { transact, update } from "../store";
import { findPullRequest, type PullRequestArtifact } from "../threads";
import type { Approval, Artifact } from "../types";
import { done, fail, type ToolContext, type ToolOutput } from "./context";
import { reviewGateRefusal } from "./handoff";

export const recordArtifactSchema = z.object({
  kind: z.enum(["review", "note"]).describe("Pull requests come only from a build thread's open_pull_request."),
  title: z.string().min(1),
  detail: z.string().min(1),
  status: z.enum(["open", "approved", "closed"]).optional(),
});

export function recordArtifact(input: z.infer<typeof recordArtifactSchema>, ctx: ToolContext): ToolOutput {
  const artifact: Artifact = {
    id: newId("art"),
    kind: input.kind,
    title: input.title,
    detail: input.detail,
    status: input.status ?? "open",
    agentId: ctx.agentId,
    turnId: ctx.turnId,
    requestId: ctx.requestId,
    messageId: ctx.causedBy,
    at: nowIso(),
  };
  update((s) => ({ ...s, artifacts: [...s.artifacts, artifact] }));
  return done({ artifactId: artifact.id, status: artifact.status });
}

export const requestApprovalSchema = z.object({
  title: z.string().min(1).describe("What the person is approving, such as \"Merge #3: dark mode\"."),
  detail: z.string().min(1).describe("What will happen if they approve: for a merge, the branch, the files and the review verdict."),
  pullRequestId: z.string().optional().describe("Set when asking to merge: the pull request's id or number as \"#3\"."),
});
type ApprovalInput = z.infer<typeof requestApprovalSchema>;

const WAIT_NOTE = "A person will decide. You will get a new turn with the decision.";

/** Names the changed files bob.policy.json says always need a person's eyes. */
function withProtectedNote(s: State, pr: PullRequestArtifact, detail: string): string {
  const files = protectedFiles(policyFor(s.project.id), pr.pullRequest.files.map((f) => f.path));
  return files.length ? `${detail}\nPolicy: touches ${files.join(", ")}, which bob.policy.json says always needs your approval.` : detail;
}

function addApproval(s: State, input: ApprovalInput, ctx: ToolContext, pr: PullRequestArtifact | undefined): { state: State; value: string } {
  const approval: Approval = {
    id: newId("apr"),
    agentId: ctx.agentId,
    turnId: ctx.turnId,
    requestId: pr?.requestId ?? ctx.requestId,
    title: input.title,
    detail: pr ? withProtectedNote(s, pr, input.detail) : input.detail,
    status: "pending",
    at: nowIso(),
    ...(pr ? { pullRequestId: pr.id, headSha: pr.pullRequest.headSha } : {}),
  };
  const state = addThreadItem({ ...s, approvals: [...s.approvals, approval] }, ctx.agentId, { kind: "approval", ...stamp(), approvalId: approval.id });
  return { state, value: approval.id };
}

export function requestApproval(input: ApprovalInput, ctx: ToolContext): ToolOutput {
  return transact((s) => {
    const pr = input.pullRequestId ? findPullRequest(s, input.pullRequestId) : undefined;
    if (input.pullRequestId && !pr) return { state: s, value: fail(`No pull request ${input.pullRequestId}. Use its id or number.`) };
    if (pr?.pullRequest.merged) return { state: s, value: fail(`#${pr.pullRequest.number} is already merged.`) };
    const unreviewed = pr ? reviewGateRefusal(s, pr) : null;
    if (unreviewed) return { state: s, value: fail(`${unreviewed} End your turn now.`) };
    const pending = pr && s.approvals.find((a) => a.pullRequestId === pr.id && a.status === "pending");
    if (pending) return { state: s, value: done({ approvalId: pending.id, note: `Already waiting on the person. ${WAIT_NOTE}` }, { endTurn: true }) };
    const approved = pr && s.approvals.find((a) => a.pullRequestId === pr.id && a.status === "approved" && a.headSha === pr.pullRequest.headSha);
    if (approved) return { state: s, value: done({ approvalId: approved.id, note: `The person already approved #${pr.pullRequest.number} at this head. Merge it with merge_pull_request; do not ask again.` }) };
    const added = addApproval(s, input, ctx, pr);
    return { state: added.state, value: done({ approvalId: added.value, note: WAIT_NOTE }, { endTurn: true }) };
  });
}
