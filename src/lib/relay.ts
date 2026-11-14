import { isDeferred, owedDeliveries } from "./asks";
import { applySend } from "./mailbox";
import { hasSubstance, toReply, type ReplyStatus } from "./reply-format";
import { messageById, type State } from "./state";
import { patchDelivery } from "./state-ops";
import { update } from "./store";
import type { AgentId, Delivery, Message, RequestId, TurnId } from "./types";

export interface RelayInput {
  agentId: AgentId;
  turnId: TurnId;
  requestIds: RequestId[];
  /** The turn's final text, sent on as the answer. */
  text: string;
  status: ReplyStatus;
  unblock?: string;
}

export type RelayDecision =
  | { kind: "send"; delivery: Delivery; message: Message; text: string; key: string }
  | { kind: "release"; delivery: Delivery; reason: "self" | "already_messaged" }
  | { kind: "defer"; delivery: Delivery }
  | { kind: "duplicate"; delivery: Delivery };

const relayKey = (d: Delivery) => `relay:${d.id}`;

const NO_ANSWER = toReply(
  "Finished the turn without a written answer.",
  "blocked",
  "Ask again with a clearer request, or give the work to someone else.",
);

/** A question back to the asker is not an answer; anything else the agent told them this turn is. */
function toldDuringTurn(s: State, input: RelayInput, to: AgentId): boolean {
  return (s.threads[input.agentId] ?? []).some(
    (i) => i.kind === "message_out" && i.turnId === input.turnId && i.to.includes(to) && !i.expectsReply,
  );
}

function decide(s: State, input: RelayInput, d: Delivery): RelayDecision | null {
  const message = messageById(s, d.messageId);
  if (!message || message.from.kind !== "agent") return null;
  if (s.relayKeys.includes(relayKey(d))) return { kind: "duplicate", delivery: d };
  if (message.from.agentId === input.agentId) return { kind: "release", delivery: d, reason: "self" };
  if (isDeferred(s, input.agentId, message)) return { kind: "defer", delivery: d };
  if (toldDuringTurn(s, input, message.from.agentId)) return { kind: "release", delivery: d, reason: "already_messaged" };
  const text = hasSubstance(input.text) ? toReply(input.text, input.status, input.unblock) : NO_ANSWER;
  return { kind: "send", delivery: d, message, text, key: relayKey(d) };
}

/** What the automatic relay would do for every answer this agent owes in these requests. Pure. */
export function planRelays(s: State, input: RelayInput): RelayDecision[] {
  return owedDeliveries(s, input.agentId, input.requestIds)
    .map((d) => decide(s, input, d))
    .filter((x): x is RelayDecision => x !== null);
}

function applyDecision(s: State, input: RelayInput, decision: RelayDecision, woken: AgentId[]): State {
  if (decision.kind === "release") return patchDelivery(s, decision.delivery.id, { answered: true });
  if (decision.kind !== "send") return s;
  const { message } = decision;
  const sent = applySend(s, {
    from: { kind: "agent", agentId: input.agentId },
    to: message.from.kind === "agent" ? [message.from.agentId] : [],
    text: decision.text,
    expectsReply: false,
    replyTo: message.id,
    causedBy: message.id,
    requestId: message.requestId,
  });
  if (!sent.result.ok) return s;
  woken.push(...sent.result.message.to);
  return { ...sent.state, relayKeys: [...sent.state.relayKeys, decision.key] };
}

/** Answers, on the agent's behalf, everything it owes and is no longer working on. Returns who to wake. */
export function relayOwed(input: RelayInput): AgentId[] {
  const woken: AgentId[] = [];
  update((s) => planRelays(s, input).reduce((acc, d) => applyDecision(acc, input, d, woken), s));
  return [...new Set(woken)];
}
