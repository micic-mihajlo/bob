"use client";

import { useBob } from "@/components/app/BobContext";
import { Avatar } from "@/components/common/Avatar";
import { indicatorFor, statusLine } from "@/lib/client/agent-status";
import { formatClock } from "@/lib/client/format";
import type { Agent } from "@/lib/types";
import { AgentIndicator } from "./AgentIndicator";

export function AgentRow({ agent }: { agent: Agent }) {
  const { snapshot, agentsById, selectedAgent, selectAgent } = useBob();
  const activity = snapshot.activity[agent.id];
  const thread = snapshot.threads[agent.id];
  const indicator = indicatorFor(activity, thread);
  const status = statusLine(agent, activity, thread, agentsById);
  const lastAt = thread?.items.at(-1)?.at;
  const selected = selectedAgent?.id === agent.id;

  return (
    <button
      type="button"
      className="team-row"
      aria-current={selected ? "page" : undefined}
      data-indicator={indicator.kind}
      onClick={() => selectAgent(agent.id)}
    >
      <span className="team-row-face">
        <Avatar agent={agent} size={36} />
        <AgentIndicator indicator={indicator} />
      </span>
      <span className="team-row-text">
        <span className="team-row-top">
          <strong className="team-row-name">{agent.name}</strong>
          {lastAt ? <span className="team-row-clock">{formatClock(lastAt)}</span> : null}
        </span>
        <span className="team-row-line">{status}</span>
      </span>
    </button>
  );
}
