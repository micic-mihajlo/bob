"use client";

import { useBob } from "@/components/app/BobContext";
import { CodeChip } from "@/components/common/CodeChip";
import { ROLE_LABEL } from "@/components/common/RoleIcon";
import { ThreadFace } from "@/components/common/ThreadFace";
import { indicatorFor, threadLine } from "@/lib/client/agent-status";
import { threadStatusOf } from "@/lib/client/crew";
import type { Agent } from "@/lib/types";
import { AgentIndicator } from "./AgentIndicator";

export function ThreadRow({ agent }: { agent: Agent }) {
  const { snapshot, agentsById, selectedAgent, selectAgent } = useBob();
  const activity = snapshot.activity[agent.id];
  const thread = snapshot.threads[agent.id];
  const status = threadStatusOf(snapshot, agent);
  const indicator = status === "closed" ? indicatorFor(undefined, thread) : indicatorFor(activity, thread);

  return (
    <button
      type="button"
      className="team-row thread-row"
      aria-current={selectedAgent?.id === agent.id ? "page" : undefined}
      data-indicator={indicator.kind}
      data-status={status}
      onClick={() => selectAgent(agent.id)}
    >
      <span className="team-row-face">
        <ThreadFace agent={agent} size={36} />
        <AgentIndicator indicator={indicator} />
      </span>
      <span className="team-row-text">
        <span className="team-row-top">
          <span className="thread-row-name">
            {agent.code ? <CodeChip code={agent.code} /> : null}
            <strong className="team-row-name">{agent.title || agent.name}</strong>
          </span>
        </span>
        <span className="team-row-line">
          {agent.crewRole ? <span className="sr-only">{ROLE_LABEL[agent.crewRole]} thread. </span> : null}
          {threadLine(agent, status, activity, thread, agentsById)}
        </span>
      </span>
    </button>
  );
}
