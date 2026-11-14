"use client";

import { FileDiff, HelpCircle } from "lucide-react";
import { useBob } from "@/components/app/BobContext";
import { CodeChip } from "@/components/common/CodeChip";
import { displayName } from "@/lib/client/crew";
import { formatClock } from "@/lib/client/format";
import { isPullRequest, reviewsOf, VERDICT_LABEL } from "@/lib/client/pull-requests";
import { PullRequestSummary } from "./PullRequestSummary";

export function PullRequestCard({ artifactId }: { artifactId: string }) {
  const { snapshot, agentsById, openThreadTab, openWhy } = useBob();
  const artifact = snapshot.artifacts.find((entry) => entry.id === artifactId);
  if (!artifact || !isPullRequest(artifact)) return null;
  const author = agentsById.get(artifact.agentId);
  const review = reviewsOf(snapshot.artifacts, artifact.id)[0];
  const messageId = artifact.messageId;

  return (
    <section className="entry pr-card" aria-label={`Pull request #${artifact.pullRequest.number}`}>
      <p className="pr-card-eyebrow">
        {author ? <CodeChip code={displayName(author)} /> : null}
        opened a pull request · {formatClock(artifact.at)}
      </p>
      <h3 className="pr-card-title">{artifact.title}</h3>
      <PullRequestSummary artifact={artifact} />
      <footer className="pr-card-actions">
        {review ? (
          <span className="verdict" data-verdict={review.review.verdict}>
            {VERDICT_LABEL[review.review.verdict]}
          </span>
        ) : (
          <span className="pr-card-hint">Not reviewed yet</span>
        )}
        <button type="button" className="btn btn-quiet btn-small" onClick={() => openThreadTab(artifact.agentId, "changes")}>
          <FileDiff className="icon" size={14} aria-hidden="true" />
          View changes
        </button>
        {messageId ? (
          <button type="button" className="btn btn-quiet btn-small" onClick={() => openWhy(messageId)}>
            <HelpCircle className="icon" size={14} aria-hidden="true" />
            Why?
          </button>
        ) : null}
      </footer>
    </section>
  );
}
