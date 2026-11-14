"use client";

import { HelpCircle, X } from "lucide-react";
import { useBob } from "@/components/features/window/BobContext";
import { FileList } from "@/components/features/files/FileList";
import { Button } from "@/components/ui/Button";
import type { BadgeVariant } from "@/components/ui/classes";
import { nameOf } from "@/lib/client/crew";
import { formatClock } from "@/lib/client/format";
import type { FileReferenceTone } from "@/lib/client/file-reference";
import { isPullRequest, PULL_REQUEST_STATE_LABEL, pullRequestState, VERDICT_LABEL, type PullRequestState } from "@/lib/client/pull-requests";
import type { Artifact } from "@/lib/types";
import { PaneFrame } from "./PaneFrame";
import { Activity } from "lucide-react";
import { pullRequestIdOf } from "@/lib/client/why-graph";

const KIND: Record<Artifact["kind"], { badge: string; tone: FileReferenceTone }> = {
  pull_request: { badge: "PR", tone: "source" },
  review: { badge: "REV", tone: "script" },
  note: { badge: "NOTE", tone: "default" },
};

const STATUS_VARIANT: Record<PullRequestState, BadgeVariant> = {
  open: "info-light",
  approved: "success-light",
  awaiting_merge: "warning-light",
  merged: "success-light",
  closed: "secondary",
};

/** Everything the team made, newest first, as the reference's file rows. Why? traces a row back. */
export function ActivityPane({ onClose }: { onClose: () => void }) {
  const { snapshot, agentsById, selectAgent, openWhy } = useBob();
  const artifacts = [...snapshot.artifacts].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  // A pull request reads the same here as on its card: waiting at the merge gate is not "Approved".
  // A review reads its verdict, so a review that asked for changes is not "Open".
  const statusOf = (artifact: Artifact) => {
    if (artifact.review) {
      const approved = artifact.review.verdict === "approve";
      return { label: VERDICT_LABEL[artifact.review.verdict], variant: (approved ? "success-light" : "warning-light") as BadgeVariant };
    }
    const state = isPullRequest(artifact) ? pullRequestState(artifact, snapshot.approvals) : artifact.status;
    return { label: PULL_REQUEST_STATE_LABEL[state], variant: STATUS_VARIANT[state] };
  };

  return (
    <PaneFrame className="conversation-files-panel bob-activity-panel" label="Activity">
      <header className="file-preview-header conversation-files-header">
        <Activity className="file-preview-file-icon side-panel-pane-title" aria-hidden="true" />
        <h2 className="side-panel-pane-title">Activity</h2>
        <span className="conversation-files-summary">{artifacts.length === 1 ? "1 artifact" : `${artifacts.length} artifacts`}</span>
        <Button variant="ghost" className="browser-toolbar-button side-panel-pane-close" aria-label="Close panel" onClick={onClose}>
          <X className="browser-toolbar-icon" aria-hidden="true" />
        </Button>
      </header>
      <div className="conversation-files-content">
        <div>
          <FileList
            label="Artifacts"
            groupByDay
            filters={false}
            emptyTitle="No artifacts yet"
            emptyDescription="Pull requests, reviews and notes show up here as the team makes them."
            rows={artifacts.map((artifact) => ({
              key: artifact.id,
              name: artifact.title,
              at: artifact.at,
              badge: KIND[artifact.kind].badge,
              tone: KIND[artifact.kind].tone,
              meta: [formatClock(artifact.at), nameOf(agentsById, artifact.agentId), artifact.review?.headSha?.slice(0, 7) ?? ""].filter(Boolean),
              status: statusOf(artifact),
              actionLabel: `Open the thread of ${artifact.title}`,
              disabled: !agentsById.has(artifact.agentId),
              onOpen: () => selectAgent(artifact.agentId),
              trailing: artifact.messageId ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="file-row-menu-trigger"
                  aria-label={`Why? Trace ${artifact.title} back to what was asked`}
                  title="Why?"
                  onClick={() => artifact.messageId && openWhy(artifact.messageId, pullRequestIdOf(artifact))}
                >
                  <HelpCircle aria-hidden="true" />
                </Button>
              ) : null,
            }))}
          />
        </div>
      </div>
    </PaneFrame>
  );
}
