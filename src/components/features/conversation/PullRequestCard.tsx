"use client";

import { Check, ChevronRight, Clock3, GitMerge, GitPullRequest, LoaderCircle, MessageSquareText, X } from "lucide-react";
import { useBob } from "@/components/features/window/BobContext";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/classes";
import { displayName } from "@/lib/client/crew";
import {
  changeTotals,
  isPullRequest,
  isReview,
  PULL_REQUEST_STATE_LABEL,
  pullRequestState,
  reviewsOf,
  VERDICT_LABEL,
  type PullRequestArtifact,
  type PullRequestState,
  type ReviewArtifact,
} from "@/lib/client/pull-requests";
import type { Artifact } from "@/lib/types";
import { pullRequestIdOf } from "@/lib/client/why-graph";

function StatusIcon({ state }: { state: PullRequestState }) {
  if (state === "merged") return <GitMerge aria-hidden="true" />;
  if (state === "closed") return <X aria-hidden="true" />;
  if (state === "open") return <LoaderCircle aria-hidden="true" />;
  if (state === "awaiting_merge") return <Clock3 aria-hidden="true" />;
  return <Check aria-hidden="true" />;
}

function WhyButton({ artifact, subject }: { artifact: Artifact; subject: string }) {
  const { openWhy } = useBob();
  const messageId = artifact.messageId;
  return (
    <Button
      variant="ghost"
      size="xs"
      className="chat-action-card-open"
      aria-label={`Why does ${subject} exist?`}
      disabled={messageId === null}
      onClick={() => messageId && openWhy(messageId, pullRequestIdOf(artifact))}
    >
      Why?
      <ChevronRight aria-hidden="true" />
    </Button>
  );
}

function PullRequestBody({ artifact }: { artifact: PullRequestArtifact }) {
  const { snapshot, agentsById } = useBob();
  const totals = changeTotals(artifact.pullRequest.files);
  const review = reviewsOf(snapshot.artifacts, artifact.id)[0];
  const reviewer = review ? agentsById.get(review.agentId) : undefined;
  return (
    <div className="approval-card-content">
      <div className="approval-detail-row">
        <span className="approval-detail-label">
          +{totals.additions} −{totals.deletions} in {artifact.pullRequest.files.length} {artifact.pullRequest.files.length === 1 ? "file" : "files"}
        </span>
        <strong>{artifact.pullRequest.branch}</strong>
      </div>
      {review ? (
        <div className="approval-detail-row">
          <span className="approval-detail-label">Review{reviewer ? ` by ${displayName(reviewer)}` : ""}</span>
          <strong>
            {VERDICT_LABEL[review.review.verdict]}
            {review.review.findings.length > 0
              ? ` · ${review.review.findings.length} ${review.review.findings.length === 1 ? "finding" : "findings"}`
              : ""}
          </strong>
        </div>
      ) : null}
    </div>
  );
}

function PullRequestCardView({ artifact, animate }: { artifact: PullRequestArtifact; animate: boolean }) {
  const { snapshot } = useBob();
  const state = pullRequestState(artifact, snapshot.approvals);
  const titleId = `pull-request-${artifact.id}-title`;
  return (
    <article aria-labelledby={titleId} className={cx("conversation-interaction-card chat-action-card", animate && "chat-action-entry-animated")} data-artifact-id={artifact.id}>
      <header className="chat-action-card-header">
        <span className="chat-action-card-icon" aria-hidden="true">
          <GitPullRequest />
        </span>
        <div className="chat-action-card-heading">
          <span className="chat-action-card-eyebrow">Opened pull request #{artifact.pullRequest.number}</span>
          <h3 className="chat-action-card-title" id={titleId}>
            {artifact.title}
          </h3>
        </div>
        <WhyButton artifact={artifact} subject={`pull request #${artifact.pullRequest.number}`} />
      </header>
      <PullRequestBody artifact={artifact} />
      <footer className="chat-action-card-footer">
        <span className="chat-action-card-status" role="status" data-state={state}>
          <StatusIcon state={state} />
          {PULL_REQUEST_STATE_LABEL[state]}
        </span>
      </footer>
    </article>
  );
}

function ReviewCardView({ artifact, animate }: { artifact: ReviewArtifact; animate: boolean }) {
  const { snapshot } = useBob();
  const reviewed = snapshot.artifacts.find((candidate) => candidate.id === artifact.review.pullRequestId);
  const number = reviewed && isPullRequest(reviewed) ? reviewed.pullRequest.number : null;
  const titleId = `review-${artifact.id}-title`;
  const findings = artifact.review.findings;
  return (
    <article aria-labelledby={titleId} className={cx("conversation-interaction-card chat-action-card", animate && "chat-action-entry-animated")} data-artifact-id={artifact.id}>
      <header className="chat-action-card-header">
        <span className="chat-action-card-icon" aria-hidden="true">
          <MessageSquareText />
        </span>
        <div className="chat-action-card-heading">
          <span className="chat-action-card-eyebrow">Reviewed pull request{number === null ? "" : ` #${number}`}</span>
          <h3 className="chat-action-card-title" id={titleId}>
            {artifact.title}
          </h3>
        </div>
        <WhyButton artifact={artifact} subject="this review" />
      </header>
      {findings.length > 0 ? (
        <div className="approval-card-content">
          {findings.slice(0, 3).map((finding, index) => (
            <div key={index} className="approval-detail-row">
              <span className="approval-detail-label">
                {finding.severity} · {finding.category}
              </span>
              <strong>
                {finding.path}
                {finding.line === null ? "" : `:${finding.line}`} {finding.comment}
              </strong>
            </div>
          ))}
        </div>
      ) : null}
      <footer className="chat-action-card-footer">
        <span className="chat-action-card-status" role="status">
          {artifact.review.verdict === "approve" ? <Check aria-hidden="true" /> : <X aria-hidden="true" />}
          {VERDICT_LABEL[artifact.review.verdict]}
        </span>
      </footer>
    </article>
  );
}

/** A pull request or a review in the chat, in the reference's chat action card. */
export function ArtifactCard({ artifactId, animate = false }: { artifactId: string; animate?: boolean }) {
  const { snapshot } = useBob();
  const artifact = snapshot.artifacts.find((candidate) => candidate.id === artifactId);
  if (!artifact) return null;
  if (isPullRequest(artifact)) return <PullRequestCardView artifact={artifact} animate={animate} />;
  if (isReview(artifact)) return <ReviewCardView artifact={artifact} animate={animate} />;
  return null;
}
