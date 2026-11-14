"use client";

import { useBob } from "@/components/app/BobContext";
import { CodeChip } from "@/components/common/CodeChip";
import { displayName } from "@/lib/client/crew";
import { formatClock, pluralize } from "@/lib/client/format";
import { isPullRequest, sortFindings, VERDICT_LABEL, type ReviewArtifact } from "@/lib/client/pull-requests";
import { FindingRow } from "./FindingRow";

export function ReviewCard({ review }: { review: ReviewArtifact }) {
  const { snapshot, agentsById } = useBob();
  const reviewer = agentsById.get(review.agentId);
  const target = snapshot.artifacts.find((artifact) => artifact.id === review.review.pullRequestId);
  const findings = sortFindings(review.review.findings);

  return (
    <section className="card review-card" aria-label={`Review: ${VERDICT_LABEL[review.review.verdict]}`}>
      <header className="review-head">
        <span className="verdict verdict-large" data-verdict={review.review.verdict}>
          {VERDICT_LABEL[review.review.verdict]}
        </span>
        <span className="review-meta">
          {reviewer ? <CodeChip code={displayName(reviewer)} /> : null}
          {target && isPullRequest(target) ? <span>on #{target.pullRequest.number}</span> : null}
          <time dateTime={review.at}>{formatClock(review.at)}</time>
        </span>
      </header>
      {review.detail ? <p className="review-detail">{review.detail}</p> : null}
      <h3 className="card-label">{pluralize(findings.length, "finding")}</h3>
      {findings.length === 0 ? (
        <p className="empty-line">No findings. The reviewer had nothing to flag.</p>
      ) : (
        <ul className="findings">
          {findings.map((finding, index) => (
            <FindingRow key={`${finding.path}:${finding.line ?? ""}:${index}`} finding={finding} />
          ))}
        </ul>
      )}
    </section>
  );
}
