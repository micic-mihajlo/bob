"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AgentAvatar } from "@/components/features/agents/AgentAvatar";
import { useBob } from "@/components/features/window/BobContext";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/classes";
import type { AgentMessageMarkerModel, ChatActionMarkerModel, ChatActionMarkerStatus, QueueDeliveryStatus } from "@/lib/client/chat-action-markers";
import { formatChatTimestamp } from "@/lib/client/chat-time";
import { displayName } from "@/lib/client/crew";
import { prefersReducedMotion } from "@/lib/client/reduced-motion";
import type { Agent } from "@/lib/types";
import { AgentMessageText } from "./AgentMessageText";

interface ChatActionMarkerProps {
  marker: ChatActionMarkerModel;
  agents: readonly Agent[];
  announce?: boolean | undefined;
  onSelectAgent: (agentId: string) => void;
  /** Opens or closes the text of an agent message whose marker sets `expanded`, by its `messageId`. */
  onToggleAgentMessage?: ((messageId: string) => void) | undefined;
  /** Draws the text of an open agent message under its marker. */
  agentMessageText?: ((marker: AgentMessageMarkerModel) => ReactNode) | undefined;
}

/** The parts of a marker that open the text of an agent message, for the markers in a group. */
type AgentMessageTextProps = Pick<ChatActionMarkerProps, "onToggleAgentMessage" | "agentMessageText">;

const STATUS_LABELS = {
  queued: "Queued",
  "in-progress": "In progress",
  "needs-attention": "Needs attention",
  completed: "Completed",
  partial: "Partial",
  failed: "Failed",
  interrupted: "Interrupted",
  cancelled: "Cancelled",
  unavailable: "Unavailable",
} as const satisfies Record<ChatActionMarkerStatus, string>;

const UNAVAILABLE_AGENT = "Unavailable agent";

type SingleChatActionMarkerModel = Exclude<ChatActionMarkerModel, { kind: "agent-message-group" }>;
type AgentMessageGroupMarkerModel = Extract<ChatActionMarkerModel, { kind: "agent-message-group" }>;

function plural(count: number, one: string, other: string): string {
  return count === 1 ? one : other;
}

function agentCount(count: number): string {
  return `${count} ${plural(count, "Blob", "Blobs")}`;
}

/** The text of an open agent message, as the chat draws it under its marker. */
function defaultAgentMessageText(marker: AgentMessageMarkerModel): ReactNode {
  return (
    <div className="ui-text message-markdown" data-variant="body-sm" data-tone="primary">
      <AgentMessageText text={marker.text} />
    </div>
  );
}

/**
 * An update or hand-off row of the chat: a message to or from another agent, a run of them, or a
 * note the runtime wrote. The agents and the chat to open come from the window when not given.
 */
export function ChatActionMarker(
  props: Omit<ChatActionMarkerProps, "agents" | "onSelectAgent"> & Partial<Pick<ChatActionMarkerProps, "agents" | "onSelectAgent">>,
) {
  const { snapshot, selectAgent } = useBob();
  const agents = props.agents ?? snapshot.agents;
  const onSelectAgent = props.onSelectAgent ?? selectAgent;
  const agentMessageText = props.agentMessageText ?? defaultAgentMessageText;
  /*
   * A single agent message turns into a group when the next one arrives, and this component stays
   * mounted while it does. An entry after the ones drawn at mount joins later and is announced. A
   * new row announces all of its entries.
   */
  const [drawnEntryCount] = useState(() => {
    if (props.announce) return 0;
    return props.marker.kind === "agent-message-group" ? props.marker.messages.length : 1;
  });
  if (props.marker.kind === "agent-message-group") {
    return (
      <AgentMessageGroupMarker
        group={props.marker}
        agents={agents}
        drawnMessageCount={drawnEntryCount}
        onSelectAgent={onSelectAgent}
        onToggleAgentMessage={props.onToggleAgentMessage}
        agentMessageText={agentMessageText}
      />
    );
  }
  return (
    <SingleChatActionMarker
      marker={props.marker}
      agents={agents}
      announce={props.announce}
      onSelectAgent={onSelectAgent}
      onToggleAgentMessage={props.onToggleAgentMessage}
      agentMessageText={agentMessageText}
    />
  );
}

/** The open state of a group row, which its summary uses to draw the toggle. */
interface MarkerGroupToggle {
  expanded: boolean;
  listId: string;
  toggle: () => void;
}

/**
 * The shared body of a group row: the summary, the list of each entry's own marker that opens under
 * it, and the live text that announces an entry that joins the group.
 */
function MarkerGroup(
  props: AgentMessageTextProps & {
    className: string;
    label: string;
    listLabel: string;
    entries: readonly { id: string; marker: SingleChatActionMarkerModel }[];
    drawnCount: number;
    agents: readonly Agent[];
    onSelectAgent: (agentId: string) => void;
    summary: (control: MarkerGroupToggle) => ReactNode;
  },
) {
  const [expanded, setExpanded] = useState(false);
  // Same exit rule as the routine history: the list stays mounted until its closing animation ends.
  const [mounted, setMounted] = useState(false);
  const toggle = (): void => {
    const opening = !expanded;
    setExpanded(opening);
    if (opening || prefersReducedMotion()) setMounted(opening);
  };
  const listId = useId();
  // An entry that joins the group has no row of its own to announce it. The newest one that joined
  // gets a new node in the live text, so a reader announces it even when its text is the same.
  const joinedEntries = props.entries.slice(Math.max(props.drawnCount, props.entries.length - 1));
  return (
    <div data-slot="marker" className={cx("ui-marker", props.className)} role="group" aria-label={props.label}>
      <div className="chat-action-marker-summary">
        <span data-slot="marker-content" className="ui-marker-content chat-action-marker-content">
          {props.summary({ expanded, listId, toggle })}
        </span>
        {mounted ? (
          <div
            className="chat-action-history-panel"
            data-state={expanded ? "open" : "closed"}
            inert={!expanded}
            onAnimationEnd={(event) => {
              if (event.target === event.currentTarget && !expanded) setMounted(false);
            }}
          >
            <div className="chat-action-history-clip">
              <ol id={listId} className="chat-action-history chat-action-group-list" aria-label={props.listLabel}>
                {props.entries.map((entry) => (
                  <li key={entry.id} className="chat-action-history-entry">
                    <SingleChatActionMarker
                      marker={entry.marker}
                      agents={props.agents}
                      onSelectAgent={props.onSelectAgent}
                      onToggleAgentMessage={props.onToggleAgentMessage}
                      agentMessageText={props.agentMessageText}
                    />
                  </li>
                ))}
              </ol>
            </div>
          </div>
        ) : null}
      </div>
      <span className="sr-only" role="status" aria-live="polite">
        {joinedEntries.map((entry) => (
          <span key={entry.id}>{markerAccessibleLabel(entry.marker, props.agents)}</span>
        ))}
      </span>
    </div>
  );
}

/**
 * Consecutive messages to and from other agents, drawn as one row. The row names how many messages
 * and agents there are, and opens to show each message's own marker.
 */
function AgentMessageGroupMarker(
  props: AgentMessageTextProps & {
    group: AgentMessageGroupMarkerModel;
    agents: readonly Agent[];
    drawnMessageCount: number;
    onSelectAgent: (agentId: string) => void;
  },
) {
  const agentIds = [
    ...new Set(
      props.group.messages.flatMap(({ marker }) =>
        marker.direction === "incoming" ? [marker.sourceAgentId] : marker.targetDeliveries.map((delivery) => delivery.agentId),
      ),
    ),
  ];
  const agents = agentIds.map((agentId) => props.agents.find((agent) => agent.id === agentId));
  const count = props.group.messages.length;
  const label = `${count} ${plural(count, "message", "messages")} with`;
  const firstAgent = agents[0];
  const agentsLabel = agentIds.length !== 1 ? agentCount(agentIds.length) : firstAgent ? displayName(firstAgent) : UNAVAILABLE_AGENT;
  return (
    <MarkerGroup
      className="chat-action-marker chat-action-marker-agent-message chat-action-marker-agent-message-group"
      label={`${label} ${agentsLabel}`}
      listLabel="Messages with Blobs"
      entries={props.group.messages}
      drawnCount={props.drawnMessageCount}
      agents={props.agents}
      onSelectAgent={props.onSelectAgent}
      onToggleAgentMessage={props.onToggleAgentMessage}
      agentMessageText={props.agentMessageText}
      summary={(control) => (
        <>
          <span className="chat-action-marker-label">{label}</span>
          <Button
            variant="ghost"
            type="button"
            className="chat-action-target"
            style={agentTargetsStyle(agents)}
            aria-expanded={control.expanded ? "true" : "false"}
            aria-controls={control.listId}
            aria-label={`${control.expanded ? "Hide" : "Show"} ${count} ${plural(count, "message", "messages")} with ${agentsLabel}`}
            data-cuelume-tap={control.expanded ? "close" : "open"}
            onClick={control.toggle}
          >
            <span className="chat-action-avatar-stack" aria-hidden="true">
              {agents.slice(0, 3).map((agent, index) => (
                <AgentAvatar key={agentIds[index]} agent={agent} className="chat-action-agent-avatar" />
              ))}
            </span>
            <span>{agentsLabel}</span>
          </Button>
          <time className="chat-action-marker-time" dateTime={props.group.timestamp}>
            {formatMarkerTime(props.group.timestamp)}
          </time>
        </>
      )}
    />
  );
}

function SingleChatActionMarker(props: Omit<ChatActionMarkerProps, "marker"> & { marker: SingleChatActionMarkerModel }) {
  const label = markerLabel(props.marker);
  // An agent message whose text the chat has opens it under the marker with its toggle.
  const textMessage =
    props.marker.kind === "agent-message" && props.marker.expanded !== undefined && props.onToggleAgentMessage && props.agentMessageText
      ? props.marker
      : undefined;
  const openTextMessage = textMessage?.expanded === true ? textMessage : undefined;
  // A runtime note keeps its tone and its whole text in its title, since a long one is cut to two lines.
  const note = props.marker.kind === "channel-change" || props.marker.kind === "unavailable" ? props.marker : undefined;
  return (
    <div
      data-slot="marker"
      className={`ui-marker chat-action-marker chat-action-marker-${props.marker.kind}`}
      role={props.announce ? "status" : "group"}
      aria-live={props.announce ? "polite" : "off"}
      aria-label={markerAccessibleLabel(props.marker, props.agents)}
      data-tone={note?.tone}
    >
      <div className="chat-action-marker-summary">
        <span data-slot="marker-content" className="ui-marker-content chat-action-marker-content">
          <span className="chat-action-marker-label" title={note ? label : undefined}>
            {label}
          </span>
          {props.marker.kind === "agent-message" ? <AgentTarget marker={props.marker} agents={props.agents} onSelectAgent={props.onSelectAgent} /> : null}
          <time className="chat-action-marker-time" dateTime={props.marker.timestamp}>
            {formatMarkerTime(props.marker.timestamp)}
          </time>
          {textMessage ? (
            <AgentMessageTextToggle marker={textMessage} agents={props.agents} onToggle={() => props.onToggleAgentMessage?.(textMessage.messageId)} />
          ) : null}
        </span>
        {openTextMessage ? <div className="chat-action-message-text">{props.agentMessageText?.(openTextMessage)}</div> : null}
      </div>
    </div>
  );
}

/** The chevron that opens the text of an agent message under its marker. */
function AgentMessageTextToggle(props: { marker: AgentMessageMarkerModel; agents: readonly Agent[]; onToggle: () => void }) {
  const expanded = props.marker.expanded === true;
  const name = counterpartName(props.marker, props.agents);
  const label =
    props.marker.direction === "incoming" ? `${expanded ? "Hide" : "Show"} the message from ${name}` : `${expanded ? "Hide" : "Show"} the message to ${name}`;
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      className="chat-action-history-toggle"
      type="button"
      aria-expanded={expanded ? "true" : "false"}
      aria-label={label}
      data-cuelume-tap={expanded ? "close" : "open"}
      onClick={() => props.onToggle()}
    >
      <ChevronDown aria-hidden="true" />
    </Button>
  );
}

function agentName(agents: readonly Agent[], agentId: string | undefined): string {
  const agent = agents.find((candidate) => candidate.id === agentId);
  return agent ? displayName(agent) : UNAVAILABLE_AGENT;
}

/** The agent on the other end: the sender of a message that arrived, or the recipients of one sent. */
function counterpartName(marker: AgentMessageMarkerModel, agents: readonly Agent[]): string {
  if (marker.direction === "incoming") return agentName(agents, marker.sourceAgentId);
  const recipients = marker.targetDeliveries;
  if (recipients.length !== 1) return agentCount(recipients.length);
  return agentName(agents, recipients[0]?.agentId);
}

function AgentTarget(props: { marker: AgentMessageMarkerModel; agents: readonly Agent[]; onSelectAgent: (agentId: string) => void }) {
  const source = props.agents.find((agent) => agent.id === props.marker.sourceAgentId);
  const recipients = props.marker.targetDeliveries;
  if (props.marker.direction !== "outgoing") return <AgentButton agent={source} fallbackId={props.marker.sourceAgentId} onSelectAgent={props.onSelectAgent} />;
  if (recipients.length <= 1) {
    const delivery = recipients[0];
    const singleRecipient = delivery ? props.agents.find((agent) => agent.id === delivery.agentId) : undefined;
    return <AgentButton agent={singleRecipient} fallbackId={delivery?.agentId} onSelectAgent={props.onSelectAgent} />;
  }
  return <AgentMenu recipients={recipients} agents={props.agents} onSelectAgent={props.onSelectAgent} />;
}

/** The recipients of a message sent to several agents, in a menu under the target, each with its delivery. */
function AgentMenu(props: { recipients: AgentMessageMarkerModel["targetDeliveries"]; agents: readonly Agent[]; onSelectAgent: (agentId: string) => void }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const recipientAgents = props.recipients.map((delivery) => props.agents.find((agent) => agent.id === delivery.agentId));

  useLayoutEffect(() => {
    if (!open || !trigger.current) return;
    const rect = trigger.current.getBoundingClientRect();
    setPosition({
      position: "fixed",
      top: rect.bottom + 8,
      left: rect.left + rect.width / 2,
      transform: "translateX(-50%)",
      zIndex: "var(--bob-layer-popover)",
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>("[role=menuitem]:not([data-disabled])")?.focus();
    const close = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !trigger.current?.contains(target)) setOpen(false);
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    };
    const dismiss = () => setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", dismiss);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("resize", dismiss);
    };
  }, [open]);

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Tab") return setOpen(false);
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const items = [...(menu.current?.querySelectorAll<HTMLElement>("[role=menuitem]:not([data-disabled])") ?? [])];
    const index = items.indexOf(document.activeElement as HTMLElement);
    items[(index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
  };

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="chat-action-target chat-action-agent-menu-trigger"
        style={agentTargetsStyle(recipientAgents)}
        aria-haspopup="menu"
        aria-expanded={open ? "true" : "false"}
        aria-controls={open ? menuId : undefined}
        data-expanded={open ? "" : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="chat-action-avatar-stack" aria-hidden="true">
          {props.recipients.slice(0, 3).map((delivery, index) => (
            <AgentAvatar key={delivery.agentId} agent={recipientAgents[index]} className="chat-action-agent-avatar" />
          ))}
        </span>
        <span>{agentCount(props.recipients.length)}</span>
      </button>
      {open && position
        ? createPortal(
            <div data-popper-positioner="" style={position}>
              <div ref={menu} id={menuId} role="menu" className="ui-action-menu chat-action-agent-menu" data-expanded="" onKeyDown={onMenuKeyDown}>
                {props.recipients.map((delivery, index) => {
                  const agent = recipientAgents[index];
                  return (
                    <div
                      key={delivery.agentId}
                      role="menuitem"
                      tabIndex={-1}
                      className="chat-action-agent-menu-item"
                      aria-disabled={agent ? undefined : "true"}
                      data-disabled={agent ? undefined : ""}
                      data-cuelume-tap=""
                      onClick={() => {
                        if (!agent) return;
                        setOpen(false);
                        props.onSelectAgent(delivery.agentId);
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        event.currentTarget.click();
                      }}
                    >
                      <AgentAvatar agent={agent} className="chat-action-agent-avatar" />
                      <span className="chat-action-agent-menu-name">{agent ? displayName(agent) : UNAVAILABLE_AGENT}</span>
                      <span className="chat-action-agent-menu-status">{deliveryStatusLabel(delivery.status)}</span>
                    </div>
                  );
                })}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function AgentButton(props: { agent: Agent | undefined; fallbackId: string | undefined; onSelectAgent: (agentId: string) => void }) {
  const agent = props.agent;
  if (!agent) {
    return (
      <span className="chat-action-target chat-action-target-unavailable" title={props.fallbackId}>
        <AgentAvatar agent={undefined} className="chat-action-agent-avatar" />
        <span>{UNAVAILABLE_AGENT}</span>
      </span>
    );
  }
  const name = displayName(agent);
  return (
    <Button
      variant="ghost"
      type="button"
      className="chat-action-target"
      style={agentTargetStyle(agent)}
      aria-label={`Open chat with ${name}`}
      data-cuelume-tap="navigate"
      onClick={() => props.onSelectAgent(agent.id)}
    >
      <AgentAvatar agent={agent} className="chat-action-agent-avatar" />
      <span>{name}</span>
    </Button>
  );
}

function markerLabel(marker: SingleChatActionMarkerModel): string {
  if (marker.kind === "unavailable") return marker.label;
  if (marker.kind === "channel-change") return marker.text;
  if (marker.expectsReply) return marker.direction === "outgoing" ? "Messaged" : "Message from";
  return marker.direction === "outgoing" ? "Informed" : "Update from";
}

/** The reference's neutral marker colour, which the captain's grey face also wears. */
const NEUTRAL_AGENT_COLOR = "#e4e4e4";

function agentColor(agent: Agent): string {
  if (agent.kind === "captain") return NEUTRAL_AGENT_COLOR;
  return `hsl(${agent.hue} 60% 55%)`;
}

function agentTargetStyle(agent: Agent | undefined): CSSProperties | undefined {
  return agent ? ({ "--chat-action-agent-color": agentColor(agent) } as CSSProperties) : undefined;
}

function agentTargetsStyle(agents: Array<Agent | undefined>): CSSProperties | undefined {
  const colors = agents.flatMap((agent) => (agent ? [agentColor(agent)] : []));
  const mixedColor = colors.reduce<string | undefined>((mix, color, index) => {
    if (!mix) return color;
    const previousColorsWeight = Math.round((index / (index + 1)) * 10_000) / 100;
    return `color-mix(in oklab, ${mix} ${previousColorsWeight}%, ${color})`;
  }, undefined);
  return mixedColor ? ({ "--chat-action-agent-color": mixedColor } as CSSProperties) : undefined;
}

function markerAccessibleLabel(marker: SingleChatActionMarkerModel, agents: readonly Agent[]): string {
  const label = markerLabel(marker);
  if (marker.kind === "unavailable" || marker.kind === "channel-change") return label;
  return `${label} ${counterpartName(marker, agents)}, ${STATUS_LABELS[marker.status]}`;
}

function deliveryStatusLabel(status: QueueDeliveryStatus): string {
  if (status === "starting" || status === "running") return STATUS_LABELS["in-progress"];
  return STATUS_LABELS[status];
}

function formatMarkerTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return formatChatTimestamp(value);
}
