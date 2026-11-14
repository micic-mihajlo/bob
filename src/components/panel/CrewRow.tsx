"use client";

import { GitBranch } from "lucide-react";
import { useBob } from "@/components/app/BobContext";
import { CodeChip } from "@/components/common/CodeChip";
import { ROLE_LABEL } from "@/components/common/RoleIcon";
import { ThreadFace } from "@/components/common/ThreadFace";
import { THREAD_STATUS_LABEL, displayName, threadStatusOf } from "@/lib/client/crew";
import { pullRequestsBy, reviewsForThread, VERDICT_LABEL } from "@/lib/client/pull-requests";
import type { Agent } from "@/lib/types";

export function CrewRow({ agent }: { agent: Agent }) {
  const { snapshot, selectedAgent, selectAgent } = useBob();
  const status = threadStatusOf(snapshot, agent);
  const pullRequest = pullRequestsBy(snapshot.artifacts, agent.id)[0];
  const review = reviewsForThread(snapshot.artifacts, agent.id)[0];
  const name = displayName(agent);

  return (
    <li>
      <button
        type="button"
        className="crew-row"
        data-status={status}
        aria-current={selectedAgent?.id === agent.id ? "page" : undefined}
        aria-label={`Open ${name}, ${agent.title}`}
        onClick={() => selectAgent(agent.id)}
      >
        <ThreadFace agent={agent} size={16} />
        <CodeChip code={name} />
        <span className="crew-row-title">{agent.title || agent.name}</span>
        <span className="crew-status" data-status={status}>
          {THREAD_STATUS_LABEL[status]}
        </span>
        <span className="crew-row-meta">
          {agent.crewRole ? <span>{ROLE_LABEL[agent.crewRole]}</span> : null}
          {agent.branch ? (
            <span className="crew-row-branch">
              <GitBranch className="icon" size={12} aria-hidden="true" />
              <span className="crew-row-branch-name">{agent.branch}</span>
            </span>
          ) : null}
          {pullRequest ? <span className="crew-row-pr">#{pullRequest.pullRequest.number}</span> : null}
          {review ? (
            <span className="verdict" data-verdict={review.review.verdict}>
              {VERDICT_LABEL[review.review.verdict]}
            </span>
          ) : null}
        </span>
      </button>
    </li>
  );
}
