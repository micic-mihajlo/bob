"use client";

import { ScanSearch } from "lucide-react";
import { useBob } from "@/components/features/window/BobContext";
import { Badge } from "@/components/ui/Badge";
import type { BadgeVariant } from "@/components/ui/classes";
import { Card } from "@/components/ui/Surface";
import { displayName } from "@/lib/client/crew";
import { formatClock, pluralize } from "@/lib/client/format";
import { isPullRequest, pullRequestsBy, reviewsForThread, sortFindings, VERDICT_LABEL, type ReviewArtifact } from "@/lib/client/pull-requests";
import type { Agent, ReviewData, ReviewFinding } from "@/lib/types";
import { PaneFrame, PaneHeader } from "./PaneFrame";

const VERDICT_VARIANT: Record<ReviewData["verdict"], BadgeVariant> = { approve: "success-light", request_changes: "destructive-light" };
const SEVERITY: Record<ReviewFinding["severity"], { label: string; variant: BadgeVariant }> = {
  high: { label: "High", variant: "destructive-light" },
  medium: { label: "Medium", variant: "warning-light" },
  low: { label: "Low", variant: "info-light" },
};
const CATEGORY_LABEL: Record<ReviewFinding["category"], string> = {
  bug: "Bug",
  security: "Security",
  performance: "Performance",
  tests: "Tests",
  style: "Style",
};

function ReviewCard({ review }: { review: ReviewArtifact }) {
  const { snapshot, agentsById } = useBob();
  const reviewer = agentsById.get(review.agentId);
  const target = snapshot.artifacts.find((artifact) => artifact.id === review.review.pullRequestId);
  const findings = sortFindings(review.review.findings);
  return (
    <Card className="bob-pane-card bob-review-card">
      <div className="bob-review-head">
        <Badge variant={VERDICT_VARIANT[review.review.verdict]}>{VERDICT_LABEL[review.review.verdict]}</Badge>
        <span className="bob-pane-muted">
          {[reviewer ? displayName(reviewer) : null, target && isPullRequest(target) ? `on #${target.pullRequest.number}` : null, formatClock(review.at)]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </div>
      {review.detail ? <p className="bob-review-detail">{review.detail}</p> : null}
      <h3 className="bob-pane-label">{pluralize(findings.length, "finding")}</h3>
      {findings.length === 0 ? (
        <p className="bob-pane-muted">No findings. The reviewer had nothing to flag.</p>
      ) : (
        <ul className="bob-review-findings">
          {findings.map((finding, index) => {
            const where = finding.line === null ? finding.path : `${finding.path}:${finding.line}`;
            return (
              <li key={`${where}-${index}`} className="bob-review-finding" data-severity={finding.severity}>
                <div className="bob-review-finding-head">
                  <Badge variant={SEVERITY[finding.severity].variant}>{SEVERITY[finding.severity].label}</Badge>
                  <Badge variant="outline">{CATEGORY_LABEL[finding.category]}</Badge>
                  <span className="bob-review-confidence" title="How sure the reviewer is">
                    {Math.round(finding.confidence * 100)}%
                  </span>
                </div>
                <code className="bob-review-where" title={where}>
                  {where}
                </code>
                <p className="bob-review-comment">{finding.comment}</p>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/** The review results of a crew thread: each verdict with its findings, high severity first. */
export function ReviewPane({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const { snapshot } = useBob();
  const reviews = reviewsForThread(snapshot.artifacts, agent.id);
  const pullRequest = pullRequestsBy(snapshot.artifacts, agent.id)[0];
  return (
    <PaneFrame className="bob-review-panel" label="Review">
      <PaneHeader title="Review" onClose={onClose} />
      <div className="bob-pane-body">
        {reviews.length === 0 ? (
          <div className="bob-pane-empty">
            <ScanSearch aria-hidden="true" />
            <p>
              {pullRequest
                ? `Pull request #${pullRequest.pullRequest.number} waits for a review thread to look at it.`
                : `${displayName(agent)} has no pull request or review yet. Findings show up here once a review thread records them.`}
            </p>
          </div>
        ) : (
          reviews.map((review) => <ReviewCard key={review.id} review={review} />)
        )}
      </div>
    </PaneFrame>
  );
}
