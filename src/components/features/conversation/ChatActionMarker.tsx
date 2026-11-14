"use client";

import { ChevronDown } from "lucide-react";
import type { CSSProperties } from "react";
import { AgentAvatar } from "@/components/features/agents/AgentAvatar";
import { useBob } from "@/components/app/BobContext";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/classes";
import { formatChatTimestamp } from "@/lib/client/chat-time";
import { displayName } from "@/lib/client/crew";
import type { Agent, AgentId } from "@/lib/types";

/** The reference's neutral marker colour, which the captain's grey face also wears. */
const NEUTRAL_AGENT_COLOR = "#e4e4e4";

function agentColor(agent: Agent | undefined): string {
  if (!agent || agent.kind === "captain") return NEUTRAL_AGENT_COLOR;
  return `hsl(${agent.hue} 60% 55%)`;
}

function targetStyle(agents: readonly (Agent | undefined)[]): CSSProperties {
  const [first, second] = agents;
  const color = agents.length > 1 ? `color-mix(in oklab, ${agentColor(first)} 50%, ${agentColor(second)})` : agentColor(first);
  return { "--chat-action-agent-color": color } as CSSProperties;
}

export interface AgentMessageMarkerProps {
  direction: "outgoing" | "incoming";
  /** True for a question or a task; false for a message that only informs. */
  expectsReply: boolean;
  agentIds: readonly AgentId[];
  text: string;
  at: string;
  expanded: boolean;
  onToggle: () => void;
  animate?: boolean;
}

/**
 * A message between agents, as one line of the chat: "Messaged Research", "Message from Research".
 * The chevron opens the message text under the line.
 */
export function AgentMessageMarker({ direction, expectsReply, agentIds, text, at, expanded, onToggle, animate = false }: AgentMessageMarkerProps) {
  const { agentsById, selectAgent } = useBob();
  const agents = agentIds.map((agentId) => agentsById.get(agentId));
  const names = agentIds.map((agentId, index) => {
    const agent = agents[index];
    return agent ? displayName(agent) : agentId;
  });
  const label = expectsReply ? (direction === "outgoing" ? "Messaged" : "Message from") : direction === "outgoing" ? "Informed" : "Update from";
  const target = names.length === 1 ? names[0] : `${names.length} agents`;
  const toggleLabel = direction === "incoming" ? `${expanded ? "Hide" : "Show"} the message from ${target}` : `${expanded ? "Hide" : "Show"} the message to ${target}`;
  const single = agentIds.length === 1 ? agentIds[0] : undefined;
  return (
    <div
      data-slot="marker"
      className={cx("ui-marker chat-action-marker chat-action-marker-agent-message", animate && "chat-action-entry-animated")}
      role="group"
      aria-live="off"
      aria-label={`${label} ${target}, Completed`}
    >
      <div className="chat-action-marker-summary">
        <span data-slot="marker-content" className="ui-marker-content chat-action-marker-content">
          <span className="chat-action-marker-label">{label}</span>
          {single !== undefined ? (
            <Button
              variant="ghost"
              className="chat-action-target"
              aria-label={`Open chat with ${target}`}
              style={targetStyle(agents)}
              disabled={!agents[0]}
              onClick={() => selectAgent(single)}
            >
              <AgentAvatar agent={agents[0]} className="chat-action-agent-avatar" />
              <span>{target}</span>
            </Button>
          ) : (
            <button type="button" className="chat-action-target chat-action-agent-menu-trigger" title={names.join(", ")} style={targetStyle(agents)}>
              <span className="chat-action-avatar-stack" aria-hidden="true">
                {agents.slice(0, 3).map((agent, index) => (
                  <AgentAvatar key={agentIds[index]} agent={agent} className="chat-action-agent-avatar" />
                ))}
              </span>
              <span>{target}</span>
            </button>
          )}
          <time className="chat-action-marker-time" dateTime={at}>
            {formatChatTimestamp(at)}
          </time>
          <Button
            variant="ghost"
            size="icon-xs"
            className="chat-action-history-toggle"
            aria-expanded={expanded ? "true" : "false"}
            aria-label={toggleLabel}
            onClick={onToggle}
          >
            <ChevronDown aria-hidden="true" />
          </Button>
        </span>
        {expanded ? (
          <div className="chat-action-message-text">
            <span className="ui-text" data-variant="body-sm" data-tone="primary">
              {text}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** A line the system wrote into the thread, in the reference's text-only marker. */
export function NoticeMarker({ tone, text, at }: { tone: "info" | "warning"; text: string; at: string }) {
  return (
    <div
      data-slot="marker"
      className={cx("ui-marker chat-action-marker", tone === "warning" ? "chat-action-marker-unavailable" : "chat-action-marker-channel-change")}
      role="group"
      aria-live="off"
      aria-label={text}
      data-tone={tone}
    >
      <div className="chat-action-marker-summary">
        <span data-slot="marker-content" className="ui-marker-content chat-action-marker-content">
          <span className="chat-action-marker-label">{text}</span>
          <time className="chat-action-marker-time" dateTime={at}>
            {formatChatTimestamp(at)}
          </time>
        </span>
      </div>
    </div>
  );
}
