import { send } from "../mailbox";
import { addNotice } from "../state-ops";
import { agentById, captainOf, isClosed, type State } from "../state";
import { getState, update } from "../store";
import type { PullRequestArtifact } from "../threads";
import type { AgentId, Artifact, ReviewFinding } from "../types";

/** Fix rounds a build thread gets on one pull request before it reports blocked instead. */
export const MAX_FIX_ROUNDS = 2;

export const reviewsOf = (s: State, prId: string): (Artifact & { review: NonNullable<Artifact["review"]> })[] =>
  s.artifacts.filter((a): a is Artifact & { review: NonNullable<Artifact["review"]> } => a.kind === "review" && a.review?.pullRequestId === prId);

export const latestReview = (s: State, prId: string) => reviewsOf(s, prId).at(-1);

/**
 * Why the person may not be asked to merge yet, or null when the latest review approves the pull
 * request's current head. An approval card always stands on a review of exactly what would merge.
 */
export function reviewGateRefusal(s: State, pr: PullRequestArtifact): string | null {
  const review = latestReview(s, pr.id);
  const n = `#${pr.pullRequest.number}`;
  const head = pr.pullRequest.headSha.slice(0, 7);
  if (!review) return `${n} has no review yet. Start a review thread for it and ask the person only after it approves.`;
  if (review.review.headSha && review.review.headSha !== pr.pullRequest.headSha) {
    return `${n} changed to ${head} after its last review, which covered ${review.review.headSha.slice(0, 7)}. The review runs again on the new head; ask the person after it approves.`;
  }
  if (review.review.verdict !== "approve") return `The latest review of ${n} requests changes. The build thread is fixing them; ask the person after a review approves.`;
  return null;
}

const findingLine = (f: ReviewFinding) => `- ${f.path}${f.line ? `:${f.line}` : ""} [${f.severity} ${f.category}] ${f.comment}`;

/**
 * Sends a message on the captain's behalf, as the captain itself would with message_thread, and shows it
 * in the captain's thread. Returns the recipient to wake, or null when it could not be sent.
 */
function sendForCaptain(to: AgentId, text: string, expectsReply: boolean, requestId: string): AgentId | null {
  const s = getState();
  const captain = captainOf(s);
  const target = agentById(s, to);
  if (!captain || !target || isClosed(target)) return null;
  const sent = send({ from: { kind: "agent", agentId: captain.id }, to: [to], text, expectsReply, replyTo: null, causedBy: null, requestId, automatic: true });
  if (!sent.ok) return null;
  update((x) => addNotice(x, captain.id, "info", `Sent to ${target.name} automatically: ${text.split("\n")[0]}`));
  return to;
}

/**
 * After a review requests changes: the findings go straight to the build thread that owns the pull
 * request. After MAX_FIX_ROUNDS rounds it is told once to stop and report blocked with what is still open,
 * and later change requests on that pull request hand nothing more to it.
 */
export function handFindingsToBuilder(pr: PullRequestArtifact, reviewerName: string, findings: ReviewFinding[]): { to: AgentId | null; round: number } {
  const s = getState();
  const round = reviewsOf(s, pr.id).filter((r) => r.review.verdict === "request_changes").length;
  if (round > MAX_FIX_ROUNDS + 1) return { to: null, round };
  const n = `#${pr.pullRequest.number}`;
  const list = findings.length ? findings.map(findingLine).join("\n") : "- (the reviewer listed no findings; read its summary)";
  const text =
    round <= MAX_FIX_ROUNDS
      ? `Review by ${reviewerName} requests changes on pull request ${n} (id ${pr.id}), fix round ${round} of ${MAX_FIX_ROUNDS}:\n${list}\nFix them on your branch, run the tests, then call open_pull_request again. The review runs again by itself on your new head, so report only if you are blocked.`
      : `Review by ${reviewerName} still requests changes on pull request ${n} (id ${pr.id}) after ${MAX_FIX_ROUNDS} fix rounds. Change no more code. Call report with Status: blocked, list these open findings in Result, and in Unblock say what decision you need:\n${list}`;
  return { to: sendForCaptain(pr.agentId, text, round > MAX_FIX_ROUNDS, pr.requestId), round };
}

/** After a pull request gets a new head: its last reviewer checks it again, once per head, so approval always follows a review of the current head. */
export function askForReReview(pr: PullRequestArtifact): AgentId | null {
  const s = getState();
  const last = latestReview(s, pr.id);
  if (!last || last.review.headSha === pr.pullRequest.headSha) return null;
  const head = `new head ${pr.pullRequest.headSha.slice(0, 7)}`;
  if (s.messages.some((m) => m.automatic && m.to.includes(last.agentId) && m.text.includes(`(id ${pr.id},`) && m.text.includes(head))) return null;
  const n = `#${pr.pullRequest.number}`;
  const open = last.review.findings.filter((f) => f.severity !== "low");
  const check = open.length ? `Check these findings are fixed:\n${open.map(findingLine).join("\n")}\n` : "";
  const text = `Pull request ${n} (id ${pr.id}, branch ${pr.pullRequest.branch}) has a new head ${pr.pullRequest.headSha.slice(0, 7)} since your review. Review it again: your first message shows the new diff. ${check}Run the tests, call record_review once for this head, then report your verdict.`;
  return sendForCaptain(last.agentId, text, true, pr.requestId);
}

/** A pull request that conflicts with main goes back to its build thread to bring its branch up to date. */
export function askToUpdateBranch(pr: PullRequestArtifact, conflicts: string[]): AgentId | null {
  const files = conflicts.length ? ` in ${conflicts.join(", ")}` : "";
  const text = `Pull request #${pr.pullRequest.number} (id ${pr.id}) conflicts with main${files}, because another change merged first. Run git fetch origin and git merge origin/main on your branch, resolve the conflicts so both changes keep working, run the tests, then call open_pull_request again. The review runs again by itself on your new head.`;
  return sendForCaptain(pr.agentId, text, false, pr.requestId);
}
