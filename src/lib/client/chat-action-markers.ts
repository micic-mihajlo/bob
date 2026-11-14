import type { AgentActivity, AgentId, ThreadItem } from "@/lib/types";
import { dayMarkerLabel } from "./chat-time";
import type { ConversationRow } from "./conversation-rows";

export type ChatActionMarkerStatus =
  "queued" | "in-progress" | "needs-attention" | "completed" | "partial" | "failed" | "interrupted" | "cancelled" | "unavailable";

export type AgentDeliveryMarkerStatus = Exclude<ChatActionMarkerStatus, "needs-attention">;

export type QueueDeliveryStatus = "queued" | "starting" | "running" | "completed" | "failed" | "interrupted" | "cancelled";

export interface AgentMessageMarkerModel {
  kind: "agent-message";
  direction: "incoming" | "outgoing";
  sourceAgentId: string;
  targetDeliveries: Array<{ agentId: string; status: QueueDeliveryStatus }>;
  status: AgentDeliveryMarkerStatus;
  timestamp: string;
  /** The id of the thread item, which the timeline keys the open text by. */
  messageId: string;
  /** The sender asked for no answer, so the marker names it as information rather than a request. */
  expectsReply: boolean;
  /** The text of the message, which opens under the marker. */
  text: string;
  /** Set when the message has text: whether the text shows under the marker. */
  expanded?: boolean;
}

export type ChatActionMarkerModel =
  | AgentMessageMarkerModel
  /**
   * Consecutive agent messages, oldest first, drawn as one row. Only the timeline joins them: each
   * stored message keeps its own marker. `timestamp` is the time of the newest message.
   */
  | {
      kind: "agent-message-group";
      messages: Array<{ id: string; marker: AgentMessageMarkerModel }>;
      timestamp: string;
    }
  /** A note the runtime wrote into the thread. `tone` keeps a warning apart. */
  | { kind: "channel-change"; text: string; tone: "info"; timestamp: string }
  | { kind: "unavailable"; label: string; tone: "warning"; timestamp: string };

/**
 * Where a message stands with one recipient. A message that asks for an answer is in progress until
 * the recipient answers it, or while the recipient is still working on it.
 */
function deliveryStatus(
  items: readonly ThreadItem[],
  item: Extract<ThreadItem, { kind: "message_out" }>,
  recipient: AgentId,
  activity: Record<AgentId, AgentActivity>,
): QueueDeliveryStatus {
  if (!item.expectsReply) return "completed";
  const answered = items.some((candidate) => candidate.kind === "message_in" && candidate.from === recipient && candidate.isReply && candidate.at >= item.at);
  if (answered) return "completed";
  return activity[recipient]?.state === "working" ? "running" : "completed";
}

function markerStatus(deliveries: AgentMessageMarkerModel["targetDeliveries"]): AgentDeliveryMarkerStatus {
  return deliveries.some((delivery) => delivery.status === "running" || delivery.status === "starting") ? "in-progress" : "completed";
}

function agentMessageMarker(
  row: Extract<ConversationRow, { kind: "sent" | "received" }>,
  agentId: AgentId,
  items: readonly ThreadItem[],
  activity: Record<AgentId, AgentActivity>,
  open: ReadonlySet<string>,
): AgentMessageMarkerModel {
  const targetDeliveries =
    row.kind === "sent"
      ? row.item.to.map((recipient) => ({ agentId: recipient, status: deliveryStatus(items, row.item, recipient, activity) }))
      : [{ agentId, status: "completed" as const }];
  const marker: AgentMessageMarkerModel = {
    kind: "agent-message",
    direction: row.kind === "sent" ? "outgoing" : "incoming",
    sourceAgentId: row.kind === "sent" ? agentId : row.item.from,
    targetDeliveries,
    status: markerStatus(targetDeliveries),
    timestamp: row.at,
    messageId: row.id,
    expectsReply: row.kind === "sent" ? row.item.expectsReply : !row.item.isReply,
    text: row.item.text,
  };
  return row.item.text.trim() === "" ? marker : { ...marker, expanded: open.has(row.id) };
}

/**
 * The marker each update and hand-off row draws, by row id. Consecutive messages to and from other
 * agents join into one group, so a long exchange between agents does not fill the chat. The group
 * is drawn by its first message's row, so it stays the same row while the exchange grows, and the
 * rows that joined it map to null and draw nothing. A run stops at the first unread row and at a new
 * day, so the unread divider and the day separator keep a row of their own. `open` holds the ids of
 * the messages whose text shows.
 */
export function chatActionMarkers(
  rows: readonly ConversationRow[],
  agentId: AgentId,
  items: readonly ThreadItem[],
  activity: Record<AgentId, AgentActivity>,
  open: ReadonlySet<string>,
  firstUnreadRowId?: string | null,
): Map<string, ChatActionMarkerModel | null> {
  const markers = new Map<string, ChatActionMarkerModel | null>();
  let run: Array<{ row: ConversationRow; marker: AgentMessageMarkerModel }> = [];
  const closeRun = () => {
    const [first, ...joined] = run;
    const last = run.at(-1);
    if (first && last) {
      markers.set(
        first.row.id,
        joined.length === 0
          ? first.marker
          : {
              kind: "agent-message-group",
              messages: run.map((entry) => ({ id: entry.row.id, marker: entry.marker })),
              timestamp: last.marker.timestamp,
            },
      );
      for (const entry of joined) markers.set(entry.row.id, null);
    }
    run = [];
  };

  for (const row of rows) {
    if (row.kind !== "sent" && row.kind !== "received") {
      closeRun();
      if (row.kind !== "notice") continue;
      markers.set(
        row.id,
        row.item.tone === "warning"
          ? { kind: "unavailable", label: row.item.text, tone: "warning", timestamp: row.at }
          : { kind: "channel-change", text: row.item.text, tone: "info", timestamp: row.at },
      );
      continue;
    }
    const previous = run.at(-1)?.row;
    if (previous && (row.id === firstUnreadRowId || dayMarkerLabel(previous.at, row.at) !== null)) closeRun();
    run.push({ row, marker: agentMessageMarker(row, agentId, items, activity, open) });
  }
  closeRun();
  return markers;
}

/** The ids of the messages in a group row, separated by spaces, so a search or focus request finds the row. */
export function groupedMessageIds(marker: ChatActionMarkerModel | undefined): string | undefined {
  return marker?.kind === "agent-message-group" ? marker.messages.map((entry) => entry.id).join(" ") : undefined;
}
