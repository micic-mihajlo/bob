import { newId, nowIso } from "./ids";
import { hasSubstance } from "./reply-format";
import { agentById, isCaptain, isClosed, isCrew, messageById, type State } from "./state";
import { addNotice, patchDelivery } from "./state-ops";
import { transact } from "./store";
import type { AgentId, Delivery, Message, MessageId, RequestId, Sender } from "./types";

export const REQUEST_DELIVERY_BUDGET = 12;
/** Deliveries of automatic hand-offs one request may get, counted apart from what the agents spend. */
export const REQUEST_HANDOFF_BUDGET = 24;

export interface SendInput {
  from: Sender;
  to: AgentId[];
  text: string;
  expectsReply: boolean;
  replyTo: MessageId | null;
  causedBy: MessageId | null;
  requestId: RequestId;
  approvalId?: string;
  continues?: MessageId;
  automatic?: boolean;
}

export type SendErrorCode =
  | "empty_text"
  | "no_recipients"
  | "self_send"
  | "unknown_recipient"
  | "unknown_reply_target"
  | "reply_not_owed"
  | "reply_expects_reply"
  | "closed_recipient"
  | "crew_rule"
  | "budget_exhausted";

export interface SendError {
  code: SendErrorCode;
  message: string;
}

export type SendResult = { ok: true; message: Message; deliveries: Delivery[] } | { ok: false; error: SendError };

const refuse = (code: SendErrorCode, message: string): SendResult => ({ ok: false, error: { code, message } });

/** Deliveries agents have created for one request, which is what the budget counts. */
export function budgetUsed(s: State, requestId: RequestId): number {
  const sentByAgents = new Set(
    s.messages.filter((m) => m.requestId === requestId && m.from.kind === "agent" && !m.automatic).map((m) => m.id),
  );
  return s.deliveries.filter((d) => sentByAgents.has(d.messageId)).length;
}

/** Deliveries of automatic hand-offs in one request, which the hand-off budget counts. */
export function handoffsUsed(s: State, requestId: RequestId): number {
  const handoffs = new Set(s.messages.filter((m) => m.requestId === requestId && m.automatic).map((m) => m.id));
  return s.deliveries.filter((d) => handoffs.has(d.messageId)).length;
}

/** Crew threads talk only to the captain, and only the captain or a person talks to them. */
function crewRefusal(s: State, from: Sender, to: AgentId[]): string | null {
  if (from.kind !== "agent") return null;
  const sender = agentById(s, from.agentId);
  if (isCaptain(sender)) return null;
  if (isCrew(sender) && to.some((id) => !isCaptain(agentById(s, id)))) {
    return "A crew thread reaches only the captain. Put what another thread needs in your report and the captain passes it on.";
  }
  if (to.some((id) => isCrew(agentById(s, id)))) return "Only the captain or a person can message a crew thread.";
  return null;
}

function validate(s: State, input: SendInput, to: AgentId[]): SendResult | null {
  if (!hasSubstance(input.text)) return refuse("empty_text", "A message needs words. Write the text and send again.");
  if (to.length === 0) return refuse("no_recipients", "Name at least one recipient id from list_agents.");
  if (input.from.kind === "agent" && to.includes(input.from.agentId)) {
    return refuse("self_send", "You cannot message yourself. Pick a teammate id from list_agents.");
  }
  const unknown = to.filter((id) => !agentById(s, id));
  if (unknown.length > 0) {
    return refuse("unknown_recipient", `Unknown recipient: ${unknown.join(", ")}. Call list_agents for valid ids.`);
  }
  const closed = to.filter((id) => isClosed(agentById(s, id))).map((id) => agentById(s, id)?.name ?? id);
  if (closed.length > 0) return refuse("closed_recipient", `${closed.join(", ")} is closed. Closed threads stay readable but take no messages.`);
  const crewRule = crewRefusal(s, input.from, to);
  if (crewRule) return refuse("crew_rule", crewRule);
  if (input.replyTo && input.expectsReply) {
    return refuse(
      "reply_expects_reply",
      "A reply cannot ask for another reply. Set expectsReply to false, or send a new message without replyToMessageId.",
    );
  }
  if (input.replyTo && !messageById(s, input.replyTo)) {
    return refuse("unknown_reply_target", "That message id does not exist. Use the id from the message you received.");
  }
  if (input.replyTo && input.from.kind === "agent" && !answersOwedAsk(s, input.from.agentId, input.replyTo, to)) {
    return refuse(
      "reply_not_owed",
      "That message is not waiting for your answer: it asked for no reply, or you already answered it. A reply goes once, to the asker alone. To say more, send a new message without replyToMessageId.",
    );
  }
  return null;
}

/** A reply answers one ask sent to the replier that nobody has answered yet, and goes back to the asker alone. */
function answersOwedAsk(s: State, replier: AgentId, replyTo: MessageId, to: AgentId[]): boolean {
  const ask = messageById(s, replyTo);
  if (!ask?.expectsReply || ask.from.kind !== "agent" || to.length !== 1 || to[0] !== ask.from.agentId) return false;
  return s.deliveries.some((d) => d.messageId === replyTo && d.recipientAgentId === replier && !d.answered);
}

const nextQueueOrder = (s: State) => s.deliveries.reduce((max, d) => Math.max(max, d.queueOrder), 0) + 1;

function overBudget(s: State, input: SendInput, count: number): boolean {
  if (input.from.kind !== "agent") return false;
  if (input.automatic) return handoffsUsed(s, input.requestId) + count > REQUEST_HANDOFF_BUDGET;
  // Replies are exempt: refusing one would leave the asker waiting, and a reply cannot start more work.
  return !input.replyTo && budgetUsed(s, input.requestId) + count > REQUEST_DELIVERY_BUDGET;
}

function budgetRefusal(s: State, input: SendInput): { state: State; result: SendResult } {
  const [limit, what] = input.automatic ? [REQUEST_HANDOFF_BUDGET, "automatic hand-offs"] : [REQUEST_DELIVERY_BUDGET, "message deliveries"];
  const result = refuse("budget_exhausted", `This request has used all ${limit} ${what}. Stop messaging and end your turn with what you have.`);
  const note = `${input.automatic ? "Automatic hand-off" : "Message"} not sent: this request reached its budget of ${limit} ${input.automatic ? "hand-offs" : "deliveries"}.`;
  const state = input.from.kind === "agent" ? addNotice(s, input.from.agentId, "warning", note) : s;
  return { state, result };
}

function buildMessage(input: SendInput, to: AgentId[]): Message {
  return {
    id: newId("msg"),
    requestId: input.requestId,
    causedBy: input.causedBy,
    from: input.from,
    to,
    text: input.text.trim(),
    expectsReply: input.expectsReply,
    replyTo: input.replyTo,
    ...(input.approvalId ? { approvalId: input.approvalId } : {}),
    ...(input.continues ? { continues: input.continues } : {}),
    ...(input.automatic ? { automatic: true as const } : {}),
    at: nowIso(),
  };
}

/** Pure send: one Message, one queued Delivery per recipient, or a typed refusal. */
export function applySend(s: State, input: SendInput): { state: State; result: SendResult } {
  const to = [...new Set(input.to)];
  const invalid = validate(s, input, to);
  if (invalid) return { state: s, result: invalid };
  if (overBudget(s, input, to.length)) return budgetRefusal(s, input);
  const message = buildMessage(input, to);
  const start = nextQueueOrder(s);
  const deliveries: Delivery[] = to.map((recipientAgentId, i) => ({
    id: newId("dlv"),
    messageId: message.id,
    recipientAgentId,
    status: "queued",
    queueOrder: start + i,
    turnId: null,
    answered: false,
  }));
  const state = markAnswered({ ...s, messages: [...s.messages, message], deliveries: [...s.deliveries, ...deliveries] }, input);
  return { state, result: { ok: true, message, deliveries } };
}

function markAnswered(s: State, input: SendInput): State {
  if (!input.replyTo || input.from.kind !== "agent") return s;
  const replier = input.from.agentId;
  const target = s.deliveries.find((d) => d.messageId === input.replyTo && d.recipientAgentId === replier);
  return target ? patchDelivery(s, target.id, { answered: true }) : s;
}

export function send(input: SendInput): SendResult {
  return transact((s) => {
    const applied = applySend(s, input);
    return { state: applied.state, value: applied.result };
  });
}
