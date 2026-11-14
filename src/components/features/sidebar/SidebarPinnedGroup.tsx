"use client";

import { useBob } from "@/components/features/window/BobContext";
import { AgentAvatar } from "@/components/features/agents/AgentAvatar";
import { agentMood } from "@/components/features/agents/agent-mood";
import { Badge } from "@/components/ui/Badge";
import { buttonClass, cx } from "@/components/ui/classes";
import type { SidebarAgentState } from "@/lib/client/sidebar-rows";
import type { Agent, AgentId } from "@/lib/types";
import { SidebarAgentContextMenu } from "./SidebarAgentContextMenu";
import { SidebarAgentIndicator, sidebarStateLabel } from "./SidebarAgentIndicator";
import { useMenuAnchor } from "./SidebarMenu";
import type { useSidebarPins } from "./sidebar-pins";

/** The pinned strip above the sections. Alt+Left and Alt+Right move a tile. */
export function SidebarPinnedGroup({
  agents,
  states,
  pins,
}: {
  agents: readonly Agent[];
  states: Readonly<Record<AgentId, SidebarAgentState>>;
  pins: ReturnType<typeof useSidebarPins>;
}) {
  if (agents.length === 0) return null;
  return (
    <section className="sidebar-chat-group sidebar-pinned-group" aria-label="Pinned chats">
      <ul className="sidebar-pinned-list">
        {agents.map((agent) => (
          <SidebarPinnedItem key={agent.id} agent={agent} state={states[agent.id]} pins={pins} />
        ))}
      </ul>
    </section>
  );
}

function SidebarPinnedItem({ agent, state, pins }: { agent: Agent; state: SidebarAgentState | undefined; pins: ReturnType<typeof useSidebarPins> }) {
  const { snapshot, selectedAgent, selectAgent } = useBob();
  const menu = useMenuAnchor();
  const name = agent.code ?? agent.name;
  const title = agent.kind === "captain" ? "Captain" : agent.title.trim();
  const active = selectedAgent?.id === agent.id;
  const stateLabel = state?.kind === "waiting" || state?.kind === "failed" ? sidebarStateLabel(state) : "";
  return (
    <li
      className="sidebar-pinned-item"
      data-pinned-key={`agent:${agent.id}`}
      onKeyDown={(event) => {
        if (!event.altKey) return;
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          pins.movePinned(agent.id, -1);
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          pins.movePinned(agent.id, 1);
        }
      }}
    >
      <button
        type="button"
        className={buttonClass({ variant: "ghost", className: cx("agent-row sidebar-pinned-row", active && "agent-row-active") })}
        aria-label={stateLabel ? `${name}, pinned agent. ${stateLabel}` : `${name}, pinned agent`}
        title={stateLabel || undefined}
        aria-pressed={active ? "true" : "false"}
        aria-haspopup="menu"
        data-expanded={menu.anchor ? "" : undefined}
        onClick={() => selectAgent(agent.id)}
        onContextMenu={menu.openAtPointer}
      >
        <span className="agent-row-avatar sidebar-pinned-avatar">
          <AgentAvatar agent={agent} motion="idle" mood={agentMood(snapshot, agent.id)} />
          <SidebarAgentIndicator state={state} />
        </span>
        <span className="agent-row-copy sidebar-pinned-copy">
          <strong className="sidebar-pinned-name" title={name}>
            {name}
          </strong>
          {title ? (
            <Badge className="sidebar-pinned-title" title={title}>
              <span>{title}</span>
            </Badge>
          ) : null}
        </span>
        {state ? <span className="sr-only">{sidebarStateLabel(state)}</span> : null}
      </button>
      {menu.anchor ? <SidebarAgentContextMenu agent={agent} pinned anchor={menu.anchor} pins={pins} onClose={menu.close} /> : null}
    </li>
  );
}
