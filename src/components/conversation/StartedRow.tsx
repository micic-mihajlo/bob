"use client";

import { ArrowUpRight } from "lucide-react";
import { useBob } from "@/components/app/BobContext";
import { CodeChip } from "@/components/common/CodeChip";
import { RollingNumber } from "@/components/common/RollingNumber";
import { ThreadFace } from "@/components/common/ThreadFace";
import { THREAD_STATUS_LABEL, displayName, threadStatusOf } from "@/lib/client/crew";
import { formatElapsed } from "@/lib/client/format";
import { elapsedSince } from "@/lib/client/thread-rows";
import { useNow } from "@/lib/client/use-now";
import type { AgentId } from "@/lib/types";

export function StartedRow({ agentId }: { agentId: AgentId }) {
  const { snapshot, agentsById, selectAgent } = useBob();
  const agent = agentsById.get(agentId);
  const activity = snapshot.activity[agentId];
  const since = activity?.state === "working" ? activity.since : null;
  const now = useNow(since !== null);
  if (!agent) return null;
  const status = threadStatusOf(snapshot, agent);
  const name = displayName(agent);

  return (
    <li className="started-row" data-status={status}>
      <ThreadFace agent={agent} size={16} />
      <CodeChip code={name} />
      <span className="started-row-title">{agent.title || agent.name}</span>
      <span className="started-row-status">
        {THREAD_STATUS_LABEL[status]}
        {since !== null ? (
          <span className="started-row-time" aria-hidden="true">
            <RollingNumber value={Math.floor(elapsedSince(since, now) / 1000)} text={formatElapsed(elapsedSince(since, now))} />
          </span>
        ) : null}
      </span>
      <button type="button" className="icon-button icon-button-xs" aria-label={`Open ${name}`} title={`Open ${name}`} onClick={() => selectAgent(agentId)}>
        <ArrowUpRight className="icon" size={14} aria-hidden="true" />
      </button>
    </li>
  );
}
