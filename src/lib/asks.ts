import { messageById, type State } from "./state";
import type { AgentId, Delivery, Message, MessageId, RequestId } from "./types";

/**
 * An ask is a reply-expecting message from one agent. Everything here follows `causedBy`, which forms a
 * tree, so waiting and holding can never loop.
 */

const CLOSED: ReadonlySet<Delivery["status"]> = new Set(["failed", "cancelled"]);

const isAgentAsk = (m: Message | undefined, agentId: AgentId): m is Message =>
  !!m && m.expectsReply && m.from.kind === "agent" && m.from.agentId === agentId;

/** Deliveries of this agent's asks that can still be answered. */
export function liveAsks(s: State, agentId: AgentId): Delivery[] {
  return s.deliveries.filter(
    (d) => !d.answered && !CLOSED.has(d.status) && isAgentAsk(messageById(s, d.messageId), agentId),
  );
}

export function descendsFrom(s: State, messageId: MessageId, ancestorId: MessageId): boolean {
  let cursor = messageById(s, messageId)?.causedBy ?? null;
  while (cursor) {
    if (cursor === ancestorId) return true;
    cursor = messageById(s, cursor)?.causedBy ?? null;
  }
  return false;
}

/** A reply waits while another ask from the same turn of the same asker is still out. */
export function isHeldReply(s: State, d: Delivery): boolean {
  const reply = messageById(s, d.messageId);
  const ask = reply?.replyTo ? messageById(s, reply.replyTo) : undefined;
  if (!ask) return false;
  const siblings = new Set(
    s.messages.filter((m) => isAgentAsk(m, d.recipientAgentId) && m.causedBy === ask.causedBy).map((m) => m.id),
  );
  return liveAsks(s, d.recipientAgentId).some((x) => siblings.has(x.messageId));
}

const isReplyDelivery = (s: State, d: Delivery) => !!messageById(s, d.messageId)?.replyTo;

/** What the agent handles next, FIFO. Replies to one fan-out arrive together in one batch. */
export function nextBatch(s: State, agentId: AgentId): Delivery[] {
  const ready = s.deliveries
    .filter((d) => d.recipientAgentId === agentId && d.status === "queued" && !isHeldReply(s, d))
    .sort((a, b) => a.queueOrder - b.queueOrder);
  const head = ready[0];
  if (!head) return [];
  return isReplyDelivery(s, head) ? ready.filter((d) => isReplyDelivery(s, d)) : [head];
}

const pendingApproval = (s: State, agentId: AgentId, requestId: RequestId) =>
  s.approvals.some((a) => a.agentId === agentId && a.requestId === requestId && a.status === "pending");

/** An answered ask whose reply the asker has not read yet. */
function replyUnread(s: State, ask: Delivery): boolean {
  const reply = s.messages.find(
    (m) => m.replyTo === ask.messageId && m.from.kind === "agent" && m.from.agentId === ask.recipientAgentId,
  );
  return !!reply && s.deliveries.some((d) => d.messageId === reply.id && d.status === "queued");
}

/** True while the agent is still working on this message: an ask it caused is open, or an approval is pending. */
export function isDeferred(s: State, agentId: AgentId, message: Message): boolean {
  if (pendingApproval(s, agentId, message.requestId)) return true;
  const open = s.deliveries.filter((d) => {
    const ask = messageById(s, d.messageId);
    if (!isAgentAsk(ask, agentId) || CLOSED.has(d.status)) return false;
    return !d.answered || replyUnread(s, d);
  });
  return open.some((d) => descendsFrom(s, d.messageId, message.id));
}

/** Asks to this agent, in these requests, whose turn has ended and that nobody has answered. */
export function owedDeliveries(s: State, agentId: AgentId, requestIds: RequestId[]): Delivery[] {
  return s.deliveries.filter((d) => {
    const m = messageById(s, d.messageId);
    return (
      d.recipientAgentId === agentId &&
      !d.answered &&
      (d.status === "completed" || CLOSED.has(d.status)) &&
      !!m &&
      m.expectsReply &&
      m.from.kind === "agent" &&
      requestIds.includes(m.requestId)
    );
  });
}
