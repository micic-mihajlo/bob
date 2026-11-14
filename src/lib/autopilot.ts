import type { MoveRecord, ToolCallRequest } from "./brain/types";
import { unmetCriteria } from "./roadmap";
import { agentById, isCaptain, isClosed, messageById, type State } from "./state";
import { isPullRequest, type PullRequestArtifact } from "./threads";
import { latestReview, reviewGateRefusal, reviewsOf } from "./tools/handoff";
import type { StartedTurn } from "./turn-start";

/** 1-based index of the Build stage in STAGES. */
const BUILD_STAGE = 3;

const inbound = (s: State, t: StartedTurn) => t.messageIds.map((id) => messageById(s, id)).filter((m) => !!m);

/** The person approved a merge card: merge it. */
function mergeApproved(s: State, t: StartedTurn): ToolCallRequest[] {
  const approvals = inbound(s, t)
    .map((m) => (m.approvalId ? s.approvals.find((a) => a.id === m.approvalId) : undefined))
    .filter((a) => a?.status === "approved" && a.pullRequestId);
  const prs = approvals
    .map((a) => s.artifacts.find((x): x is PullRequestArtifact => x.id === a?.pullRequestId && isPullRequest(x)))
    .filter((pr): pr is PullRequestArtifact => !!pr && !pr.pullRequest.merged);
  return prs.map((pr) => ({ name: "merge_pull_request", input: { pullRequestId: pr.id } }));
}

/** A merge just landed: close the threads that built and reviewed it. */
function closeMerged(s: State, last: MoveRecord | undefined): ToolCallRequest[] {
  const merged = (last?.calls ?? []).filter((c) => c.name === "merge_pull_request" && c.result.merged === true);
  const owners = merged.flatMap((c) => {
    const pr = s.artifacts.find((x): x is PullRequestArtifact => x.id === (c.input as { pullRequestId?: string }).pullRequestId && isPullRequest(x));
    return pr ? [pr.agentId, ...reviewsOf(s, pr.id).map((r) => r.agentId)] : [];
  });
  return [...new Set(owners)]
    .filter((id) => {
      const agent = agentById(s, id);
      return !!agent && agent.kind === "crew" && !isClosed(agent);
    })
    .map((threadId) => ({ name: "close_thread", input: { threadId } }));
}

/** A review thread reported and its review approves the pull request's current head: leave Build if its gate holds, and ask the person. */
function askAfterApproval(s: State, t: StartedTurn): ToolCallRequest[] {
  const reviewers = inbound(s, t).flatMap((m) => (m.from.kind === "agent" ? [agentById(s, m.from.agentId)] : [])).filter((a) => a?.crewRole === "review");
  if (reviewers.length === 0) return [];
  const ready = s.artifacts.filter(
    (a): a is PullRequestArtifact =>
      isPullRequest(a) &&
      !a.pullRequest.merged &&
      reviewers.some((r) => latestReview(s, a.id)?.agentId === r?.id) &&
      reviewGateRefusal(s, a) === null &&
      !s.approvals.some((x) => x.pullRequestId === a.id && (x.status === "pending" || (x.status === "approved" && x.headSha === a.pullRequest.headSha))),
  );
  if (ready.length === 0) return [];
  const advance = s.roadmap.stage === BUILD_STAGE && unmetCriteria(s.roadmap).length === 0 ? [{ name: "advance_stage", input: {} }] : [];
  return [
    ...advance,
    ...ready.map((pr) => {
      const review = latestReview(s, pr.id);
      const reviewer = agentById(s, review?.agentId ?? "")?.name ?? "the reviewer";
      const { number, branch, headSha, files } = pr.pullRequest;
      const open = review?.review?.findings.length ?? 0;
      const detail = `Merges #${number} (${pr.title}) from ${branch} at ${headSha.slice(0, 7)} into main. Files: ${files.map((f) => `${f.path} (+${f.additions} -${f.deletions})`).join(", ")}. ${reviewer} approved this head${open ? ` with ${open} non-blocking finding${open === 1 ? "" : "s"}` : ""}.`;
      return { name: "request_approval", input: { title: `Merge #${number}: ${pr.title}`, detail, pullRequestId: pr.id } };
    }),
  ];
}

/**
 * Captain steps whose next action the rules already fix, run before its first model call so no model
 * round trip is spent on them: an approved merge is merged and its threads closed, and a review that
 * approves the current head goes straight to the person as a merge card. Returns the next calls to run,
 * or none.
 */
export function autopilotCalls(s: State, t: StartedTurn, moves: MoveRecord[]): ToolCallRequest[] {
  if (!isCaptain(agentById(s, t.agentId))) return [];
  if (moves.length === 0) {
    const merge = mergeApproved(s, t);
    return merge.length > 0 ? merge : askAfterApproval(s, t);
  }
  return moves.length === 1 ? closeMerged(s, moves[0]) : [];
}
