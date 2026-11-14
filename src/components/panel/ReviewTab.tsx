"use client";

import { ScanSearch } from "lucide-react";
import { useBob } from "@/components/app/BobContext";
import { PanelEmpty } from "@/components/common/PanelEmpty";
import { displayName } from "@/lib/client/crew";
import { pullRequestsBy, reviewsForThread } from "@/lib/client/pull-requests";
import type { Agent } from "@/lib/types";
import { ReviewCard } from "./ReviewCard";

export function ReviewTab({ agent }: { agent: Agent }) {
  const { snapshot } = useBob();
  const reviews = reviewsForThread(snapshot.artifacts, agent.id);
  const pullRequest = pullRequestsBy(snapshot.artifacts, agent.id)[0];

  if (reviews.length === 0) {
    return pullRequest ? (
      <PanelEmpty icon={ScanSearch} title="Not reviewed yet">
        Pull request #{pullRequest.pullRequest.number} waits for a review thread to look at it.
      </PanelEmpty>
    ) : (
      <PanelEmpty icon={ScanSearch} title="Nothing to review">
        {displayName(agent)} has no pull request or review yet. Findings show up here once a review thread records them.
      </PanelEmpty>
    );
  }

  return (
    <div className="panel-scroll">
      {reviews.map((review) => (
        <ReviewCard key={review.id} review={review} />
      ))}
    </div>
  );
}
