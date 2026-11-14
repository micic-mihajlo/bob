"use client";

import { HelpCircle, X } from "lucide-react";
import { useBob } from "@/components/features/window/BobContext";
import { FileList } from "@/components/features/files/FileList";
import { Button } from "@/components/ui/Button";
import type { BadgeVariant } from "@/components/ui/classes";
import { nameOf } from "@/lib/client/crew";
import { formatClock } from "@/lib/client/format";
import type { FileReferenceTone } from "@/lib/client/file-reference";
import type { Artifact } from "@/lib/types";
import { PaneFrame } from "./PaneFrame";
import { Activity } from "lucide-react";
import { pullRequestIdOf } from "@/lib/client/why-graph";

const KIND: Record<Artifact["kind"], { badge: string; tone: FileReferenceTone; label: string }> = {
  pull_request: { badge: "PR", tone: "source", label: "Pull request" },
  review: { badge: "REV", tone: "script", label: "Review" },
  note: { badge: "NOTE", tone: "default", label: "Note" },
};

const STATUS: Record<Artifact["status"], { label: string; variant: BadgeVariant }> = {
  open: { label: "Open", variant: "info-light" },
  approved: { label: "Approved", variant: "warning-light" },
  merged: { label: "Merged", variant: "success-light" },
  closed: { label: "Closed", variant: "secondary" },
};

/** Everything the team made, newest first, as the reference's file rows. Why? traces a row back. */
export function ActivityPane({ onClose }: { onClose: () => void }) {
  const { snapshot, agentsById, selectAgent, openWhy } = useBob();
  const artifacts = [...snapshot.artifacts].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

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
            summary={artifacts.length === 1 ? "1 artifact" : `${artifacts.length} artifacts`}
            emptyTitle="No artifacts yet"
            emptyDescription="Pull requests, reviews and notes show up here as the team makes them."
            rows={artifacts.map((artifact) => ({
              key: artifact.id,
              name: artifact.title,
              at: artifact.at,
              badge: KIND[artifact.kind].badge,
              tone: KIND[artifact.kind].tone,
              meta: [`${KIND[artifact.kind].label} by ${nameOf(agentsById, artifact.agentId)}`, formatClock(artifact.at)].filter(Boolean),
              status: STATUS[artifact.pullRequest?.merged ? "merged" : artifact.status],
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
