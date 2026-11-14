import { nextBatch } from "./asks";
import { newId, nowIso } from "./ids";
import { agentById, messageById, runningTurn, type State } from "./state";
import { addThreadItem, patchDelivery, stamp } from "./state-ops";
import type { AgentId, Delivery, Message, ThreadItem, Turn } from "./types";

export interface StartedTurn {
  turnId: string;
  agentId: AgentId;
  requestId: string;
  deliveryIds: string[];
  messageIds: string[];
}

function inboundItem(m: Message): ThreadItem {
  if (m.from.kind === "user") return { kind: "user_text", ...stamp(), text: m.text };
  return { kind: "message_in", ...stamp(), messageId: m.id, from: m.from.agentId, text: m.text, isReply: m.replyTo !== null };
}

function showInbound(s: State, agentId: AgentId, batch: Delivery[]): State {
  return batch.reduce((acc, d) => {
    const m = messageById(acc, d.messageId);
    // A requeued delivery was already shown when it first started.
    if (!m || acc.requeuedDeliveryIds.includes(d.id)) return acc;
    return addThreadItem(acc, agentId, inboundItem(m));
  }, s);
}

/** Claims the agent's next batch if it is idle. Pure, so the check and the claim happen in one update. */
export function planTurn(s: State, agentId: AgentId): { state: State; started: StartedTurn } | null {
  if (!agentById(s, agentId) || runningTurn(s, agentId)) return null;
  const batch = nextBatch(s, agentId);
  const messages = batch.map((d) => messageById(s, d.messageId)).filter((m): m is Message => !!m);
  if (messages.length === 0) return null;
  const turn: Turn = {
    id: newId("turn"),
    agentId,
    requestId: messages[0].requestId,
    messageIds: messages.map((m) => m.id),
    status: "running",
    startedAt: nowIso(),
    endedAt: null,
  };
  const claimed = batch.reduce(
    (acc, d) => patchDelivery(acc, d.id, { status: "running", turnId: turn.id }),
    { ...s, turns: [...s.turns, turn] },
  );
  const started: StartedTurn = {
    turnId: turn.id,
    agentId,
    requestId: turn.requestId,
    deliveryIds: batch.map((d) => d.id),
    messageIds: turn.messageIds,
  };
  return { state: showInbound(claimed, agentId, batch), started };
}
