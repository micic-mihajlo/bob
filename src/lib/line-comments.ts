import { postUserMessage, type ActionResult } from "./actions";
import { newId, nowIso } from "./ids";
import { getState, update } from "./store";
import { findPullRequest } from "./threads";
import type { Artifact, LineComment } from "./types";

export interface LineCommentInput {
  path: string;
  startLine: number;
  endLine: number;
  text: string;
}

/** "src/a.ts:4" or "src/a.ts:4-6". */
export const linesLabel = (c: Pick<LineComment, "path" | "startLine" | "endLine">) => `${c.path}:${c.startLine}${c.endLine > c.startLine ? `-${c.endLine}` : ""}`;

/**
 * A person's comment on lines of a pull request. It goes to the pull request's build thread as the person's own
 * message, so the fix that follows traces back to it in Why?, and it is kept as a comment artifact that pins to
 * those lines until the pull request gets a new head.
 */
export function commentOnLines(pullRequestId: string, input: LineCommentInput): ActionResult<{ artifactId: string; messageId: string }> {
  const pr = findPullRequest(getState(), pullRequestId);
  if (!pr) return { ok: false, error: `No pull request ${pullRequestId}.` };
  if (pr.pullRequest.merged) return { ok: false, error: `#${pr.pullRequest.number} is already merged.` };
  const text = input.text.trim();
  if (!text) return { ok: false, error: "Write the comment first." };
  const lineComment: LineComment = {
    pullRequestId: pr.id,
    path: input.path,
    startLine: Math.min(input.startLine, input.endLine),
    endLine: Math.max(input.startLine, input.endLine),
    headSha: pr.pullRequest.headSha,
  };
  const where = linesLabel(lineComment);
  const sent = postUserMessage(
    pr.agentId,
    `Comment on pull request #${pr.pullRequest.number} (id ${pr.id}) at ${where}:\n- ${text}\nFix it on your branch, run the tests, then call open_pull_request again. The review runs again by itself on your new head.`,
  );
  if (!sent.ok) return sent;
  const artifact: Artifact = {
    id: newId("art"),
    kind: "comment",
    title: `Comment on #${pr.pullRequest.number} at ${where}`,
    detail: text,
    status: "open",
    agentId: pr.agentId,
    turnId: pr.turnId,
    requestId: pr.requestId,
    messageId: sent.messageId,
    at: nowIso(),
    lineComment,
  };
  update((s) => ({ ...s, artifacts: [...s.artifacts, artifact] }));
  return { ok: true, artifactId: artifact.id, messageId: sent.messageId };
}
