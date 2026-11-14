"use client";

import { useBob } from "@/components/app/BobContext";
import { AgentAvatar } from "@/components/features/agents/AgentAvatar";
import { agentMood } from "@/components/features/agents/agent-mood";
import { Badge } from "@/components/ui/Badge";
import { buttonClass, cx } from "@/components/ui/classes";
import { threadLine } from "@/lib/client/agent-status";
import { threadStatusOf } from "@/lib/client/crew";
import { sidebarMessageTime, type SidebarAgentState } from "@/lib/client/sidebar-rows";
import type { Agent } from "@/lib/types";
import { SidebarAgentIndicator, SidebarWaitChip, sidebarStateLabel } from "./SidebarAgentIndicator";

/** The label beside the name: the captain's part, a crew thread's work, a standing agent's title. */
function badgeOf(agent: Agent): string {
  if (agent.kind === "captain") return "Captain";
  return agent.title.trim();
}

/**
 * One thread in the list, as the reference draws an agent row. A waiting row (in "Needs you") shows
 * what the person does next in the time slot and previews what it waits on.
 */
export function SidebarAgentRow({ agent, state, waiting = false }: { agent: Agent; state: SidebarAgentState | undefined; waiting?: boolean }) {
  const { snapshot, agentsById, selectedAgent, selectAgent, focusThread } = useBob();
  const thread = snapshot.threads[agent.id];
  const status = threadStatusOf(snapshot, agent);
  const name = agent.code ?? agent.name;
  const badge = badgeOf(agent);
  const wait = waiting && state?.kind === "waiting" ? state : undefined;
  const preview = wait?.detail || threadLine(agent, status, snapshot.activity[agent.id], thread, agentsById);
  const active = selectedAgent?.id === agent.id;
  const stateLabel = state ? sidebarStateLabel(state) : "";
  const approvalId = wait?.reason === "approval" ? (snapshot.needsYou?.find((item) => item.agentId === agent.id)?.approvalId ?? null) : null;

  const row = (
    <button
      type="button"
      className={buttonClass({ variant: "ghost", className: cx("agent-row", active && "agent-row-active") })}
      aria-label={`${name}${badge ? `, ${badge}` : ""}${wait ? "" : `. ${preview}`}${stateLabel ? `. ${stateLabel}` : ""}`}
      aria-pressed={active ? "true" : "false"}
      data-slot="button"
      data-variant="ghost"
      data-size="default"
      onClick={() => (wait ? focusThread({ agentId: agent.id, approvalId }) : selectAgent(agent.id))}
    >
      <span className="agent-row-avatar">
        <AgentAvatar agent={agent} motion="idle" mood={agentMood(snapshot, agent.id)} />
        <SidebarAgentIndicator state={state} />
      </span>
      <span className="agent-row-copy">
        <span className="agent-row-heading">
          <span className="agent-row-title">
            <span className="agent-row-name">
              <strong>{name}</strong>
            </span>
            {badge ? (
              <Badge className="agent-role-badge" title={badge}>
                <span>{badge}</span>
              </Badge>
            ) : null}
          </span>
          {wait ? (
            <SidebarWaitChip reason={wait.reason} />
          ) : (
            <span className="agent-row-time">{sidebarMessageTime(thread?.items.at(-1)?.at ?? agent.createdAt)}</span>
          )}
        </span>
        <span className="agent-row-preview">{preview}</span>
      </span>
      {state ? <span className="sr-only">{stateLabel}</span> : null}
    </button>
  );

  return (
    <div className="sidebar-agent-item" data-chat-id={waiting ? undefined : agent.id}>
      {wait ? (
        <div className="sidebar-agent-tooltip-trigger" title={`${sidebarStateLabel(wait)}. Select to ${wait.reason === "approval" ? "review" : wait.reason === "question" ? "answer" : "open"}`}>
          {row}
        </div>
      ) : (
        row
      )}
    </div>
  );
}
