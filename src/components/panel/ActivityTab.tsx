"use client";

import { FileText, GitPullRequest, HelpCircle, MessageSquareCode, Package } from "lucide-react";
import { useBob } from "@/components/app/BobContext";
import { formatClock } from "@/lib/client/format";
import type { Artifact } from "@/lib/types";

const KIND_ICON = { pull_request: GitPullRequest, review: MessageSquareCode, note: FileText } as const;
const KIND_LABEL = { pull_request: "Pull request", review: "Review", note: "Note" } as const;
const STATUS_LABEL: Record<Artifact["status"], string> = {
  open: "Open",
  approved: "Approved",
  merged: "Merged",
  closed: "Closed",
};

export function ActivityTab() {
  const { snapshot, agentsById, openWhy } = useBob();
  const artifacts = [...snapshot.artifacts].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  if (artifacts.length === 0) {
    return (
      <div className="panel-scroll panel-empty">
        <Package className="icon" size={20} aria-hidden="true" />
        <p className="panel-empty-title">No artifacts yet</p>
        <p className="empty-line">Pull requests, reviews and notes show up here as the team makes them.</p>
      </div>
    );
  }

  return (
    <div className="panel-scroll">
      <ul className="artifacts">
        {artifacts.map((artifact) => {
          const Icon = KIND_ICON[artifact.kind];
          const author = agentsById.get(artifact.agentId)?.name ?? "A former teammate";
          return (
            <li key={artifact.id} className="artifact">
              <Icon className="icon artifact-icon" size={16} aria-hidden="true" />
              <div className="artifact-copy">
                <p className="artifact-title">{artifact.title}</p>
                <p className="artifact-meta">
                  {KIND_LABEL[artifact.kind]} by {author} · {formatClock(artifact.at)}
                </p>
                {artifact.detail ? <p className="artifact-detail">{artifact.detail}</p> : null}
              </div>
              <div className="artifact-side">
                <span className="status-badge" data-status={artifact.status}>
                  {STATUS_LABEL[artifact.status]}
                </span>
                {artifact.messageId ? (
                  <button type="button" className="btn btn-quiet btn-small" onClick={() => artifact.messageId && openWhy(artifact.messageId)}>
                    <HelpCircle className="icon" size={14} aria-hidden="true" />
                    Why?
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
