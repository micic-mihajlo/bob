import type { AgentId, Approval, Artifact, ChangedFile, PullRequestData, ReviewData, ReviewFinding } from "@/lib/types";

export type PullRequestArtifact = Artifact & { pullRequest: PullRequestData };
export type ReviewArtifact = Artifact & { review: ReviewData };
export type PullRequestState = "open" | "approved" | "awaiting_merge" | "merged" | "closed";

export function isPullRequest(artifact: Artifact): artifact is PullRequestArtifact {
  return artifact.pullRequest !== undefined;
}

export function isReview(artifact: Artifact): artifact is ReviewArtifact {
  return artifact.review !== undefined;
}

function newestFirst(a: Artifact, b: Artifact): number {
  return Date.parse(b.at) - Date.parse(a.at);
}

export function pullRequestsBy(artifacts: readonly Artifact[], agentId: AgentId): PullRequestArtifact[] {
  return artifacts.filter((artifact): artifact is PullRequestArtifact => isPullRequest(artifact) && artifact.agentId === agentId).sort(newestFirst);
}

export function reviewsOf(artifacts: readonly Artifact[], pullRequestId: string): ReviewArtifact[] {
  return artifacts.filter((artifact): artifact is ReviewArtifact => isReview(artifact) && artifact.review.pullRequestId === pullRequestId).sort(newestFirst);
}

/** Reviews a thread wrote, and reviews of the pull requests it opened. */
export function reviewsForThread(artifacts: readonly Artifact[], agentId: AgentId): ReviewArtifact[] {
  const opened = new Set(pullRequestsBy(artifacts, agentId).map((artifact) => artifact.id));
  return artifacts
    .filter((artifact): artifact is ReviewArtifact => isReview(artifact) && (artifact.agentId === agentId || opened.has(artifact.review.pullRequestId)))
    .sort(newestFirst);
}

/**
 * Merged wins. Short of that, a merge approval for this pull request that is still pending, or that
 * the person gave for its current head, means it waits at the merge gate.
 */
export function pullRequestState(artifact: PullRequestArtifact, approvals: readonly Approval[]): PullRequestState {
  if (artifact.pullRequest.merged || artifact.status === "merged") return "merged";
  if (artifact.status === "closed") return "closed";
  const atGate = approvals.some(
    (approval) =>
      approval.pullRequestId === artifact.id &&
      (approval.status === "pending" || (approval.status === "approved" && approval.headSha === artifact.pullRequest.headSha)),
  );
  return atGate ? "awaiting_merge" : artifact.status;
}

export const PULL_REQUEST_STATE_LABEL: Record<PullRequestState, string> = {
  open: "Open",
  approved: "Approved",
  awaiting_merge: "Awaiting merge",
  merged: "Merged",
  closed: "Closed",
};

export const VERDICT_LABEL: Record<ReviewData["verdict"], string> = {
  approve: "Approved",
  request_changes: "Changes requested",
};

const MERGE_WORDS = /merge|pull request|\bPR\b/i;

/**
 * The pull request an approval is about. `pullRequestId` names it; an approval from before that field
 * falls back to a "#3" in its text, then to the newest pull request of the same request.
 */
export function pullRequestForApproval(artifacts: readonly Artifact[], approval: Approval): PullRequestArtifact | undefined {
  const requests = artifacts.filter(isPullRequest).sort(newestFirst);
  if (approval.pullRequestId) return requests.find((artifact) => artifact.id === approval.pullRequestId);
  const text = `${approval.title} ${approval.detail}`;
  const named = /#(\d+)/.exec(text);
  if (named) return requests.find((artifact) => artifact.pullRequest.number === Number(named[1]));
  if (!MERGE_WORDS.test(text)) return undefined;
  return requests.find((artifact) => artifact.requestId === approval.requestId);
}

export type PreviewTone = "pending" | "passed" | "failed" | "stale";

/**
 * The preview deployment's line on the pull request card: the check's pass or fail once a review ran
 * it, or the deployment's state before that. A preview built from another head is stale.
 */
export function previewStatus(pullRequest: PullRequestData): { label: string; tone: PreviewTone } | null {
  const preview = pullRequest.preview;
  if (!preview) return null;
  if (preview.headSha !== pullRequest.headSha) return { label: "Built from an older head", tone: "stale" };
  if (preview.check) {
    const status = preview.check.status === null ? "" : ` (${preview.check.status})`;
    return preview.check.ok ? { label: `Check passed${status}`, tone: "passed" } : { label: `Check failed${status}`, tone: "failed" };
  }
  if (preview.state === "building") return { label: "Building", tone: "pending" };
  if (preview.state === "ready") return { label: "Ready, not checked yet", tone: "pending" };
  if (preview.state === "missing") return { label: "No deployment for this head", tone: "failed" };
  return { label: "Deployment failed", tone: "failed" };
}

export function changeTotals(files: readonly ChangedFile[]): { additions: number; deletions: number } {
  return files.reduce((sum, file) => ({ additions: sum.additions + file.additions, deletions: sum.deletions + file.deletions }), {
    additions: 0,
    deletions: 0,
  });
}

const SEVERITY_RANK: Record<ReviewFinding["severity"], number> = { high: 0, medium: 1, low: 2 };

/** High severity first, then the findings the reviewer is surest of. */
export function sortFindings(findings: readonly ReviewFinding[]): ReviewFinding[] {
  return [...findings].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.confidence - a.confidence);
}
