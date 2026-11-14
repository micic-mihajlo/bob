import { beforeEach, describe, expect, it } from "vitest";
import { freshStandingTeam } from "@/lib/__tests__/helpers";
import { applySend, budgetUsed, handoffsUsed, REQUEST_DELIVERY_BUDGET, REQUEST_HANDOFF_BUDGET, type SendInput } from "@/lib/mailbox";
import { messageById, type State } from "@/lib/state";
import { getState } from "@/lib/store";
import { sendMessage } from "@/lib/tools/messaging";
import type { Message } from "@/lib/types";
import { pick, SEEDS, seeded, subset } from "./random";

/** BobFormal.Mailbox.BUDGET */
const BUDGET = 12;
/** BobFormal.Mailbox.HANDOFFS */
const HANDOFFS = 24;
const REQ = "req_formal";
const REPLY = "Status: done\nResult: Looked at it.\nEvidence: none";

/** BobFormal.Mailbox.Box.owed for one agent: unanswered deliveries to it of agent asks. */
const owedTo = (s: State, agentId: string) =>
  s.deliveries.filter((d) => {
    const m = messageById(s, d.messageId);
    return d.recipientAgentId === agentId && !d.answered && !!m?.expectsReply && m.from.kind === "agent";
  });

/** BobFormal.Mailbox.accepts and answersOwed, written against the real state. */
function modelAccepts(s: State, i: SendInput): boolean {
  const to = [...new Set(i.to)];
  if (to.length === 0) return false;
  if (i.from.kind === "agent" && to.includes(i.from.agentId)) return false;
  if (i.replyTo && i.expectsReply) return false;
  if (i.replyTo && !messageById(s, i.replyTo)) return false;
  if (i.replyTo && i.from.kind === "agent" && !owedTo(s, i.from.agentId).some((d) => d.messageId === i.replyTo)) return false;
  if (i.from.kind !== "agent") return true;
  if (i.automatic) return handoffsUsed(s, i.requestId) + to.length <= HANDOFFS;
  return !(!i.replyTo && budgetUsed(s, i.requestId) + to.length > BUDGET);
}

const deliveriesWhere = (s: State, test: (m: Message) => boolean) =>
  s.deliveries.filter((d) => {
    const m = messageById(s, d.messageId);
    return !!m && m.requestId === REQ && test(m);
  });

/** The quantities in BobFormal.Mailbox.Inv, read off the real state. */
function counters(s: State) {
  const fromAgent = (m: Message) => m.from.kind === "agent";
  return {
    firstSends: deliveriesWhere(s, (m) => fromAgent(m) && !m.automatic && !m.replyTo).length,
    replySends: deliveriesWhere(s, (m) => fromAgent(m) && !m.automatic && !!m.replyTo).length,
    autoSends: deliveriesWhere(s, (m) => fromAgent(m) && !!m.automatic).length,
    owed: deliveriesWhere(s, (m) => fromAgent(m) && m.expectsReply).filter((d) => !d.answered).length,
    agentMessages: s.messages.filter((m) => m.requestId === REQ && fromAgent(m)).length,
  };
}

/**
 * A random send. Replies go back to the sender of the replied-to message, as `route` does, and are sometimes not owed.
 * About a third are automatic hand-offs, the way `sendForCaptain` sends them.
 */
function randomSend(s: State, rand: () => number, ids: string[]): SendInput {
  const sender = pick(rand, ids);
  const causedBy = s.messages.length > 0 ? pick(rand, s.messages).id : null;
  const owed = owedTo(s, sender);
  const base = { from: { kind: "agent" as const, agentId: sender }, causedBy, requestId: REQ, ...(rand() < 0.35 ? { automatic: true } : {}) };
  const replyTo = owed.length > 0 && rand() < 0.5 ? messageById(s, pick(rand, owed).messageId) : s.messages.length > 0 && rand() < 0.2 ? pick(rand, s.messages) : undefined;
  if (replyTo?.from.kind === "agent" && replyTo.from.agentId !== sender) {
    return { ...base, to: [replyTo.from.agentId], text: REPLY, replyTo: replyTo.id, expectsReply: rand() < 0.1 };
  }
  return { ...base, to: subset(rand, ids), text: "Please look at this.", replyTo: null, expectsReply: rand() < 0.6 };
}

describe("mailbox conforms to BobFormal.Mailbox", () => {
  beforeEach(freshStandingTeam);

  it("uses the same budgets as the model", () => {
    expect(REQUEST_DELIVERY_BUDGET).toBe(BUDGET);
    expect(REQUEST_HANDOFF_BUDGET).toBe(HANDOFFS);
  });

  it.each(SEEDS)("random cascade %i: accepts what the model accepts and stays inside the proven bounds", (seed) => {
    const rand = seeded(seed);
    let s = getState();
    const ids = s.agents.map((a) => a.id);
    for (let step = 0; step < 200; step++) {
      const input = randomSend(s, rand, ids);
      const expected = modelAccepts(s, input);
      const applied = applySend(s, input);
      expect(applied.result.ok, JSON.stringify(input)).toBe(expected);
      s = applied.state;
      const c = counters(s);
      const all = budgetUsed(s, REQ) + handoffsUsed(s, REQ);
      expect(c.firstSends).toBeLessThanOrEqual(BUDGET);
      expect(c.autoSends).toBe(handoffsUsed(s, REQ));
      expect(c.autoSends).toBeLessThanOrEqual(HANDOFFS);
      expect(c.replySends + c.owed).toBeLessThanOrEqual(c.firstSends + c.autoSends);
      expect(c.agentMessages).toBeLessThanOrEqual(all);
      expect(all).toBeLessThanOrEqual(2 * (BUDGET + HANDOFFS));
    }
  });

  it("ping_pong_stops: a teammate cannot answer a reply, so the ping-pong ends after one answer", () => {
    const ctx = (agentId: string, causedBy: string | null) => ({ agentId, turnId: "turn_formal", requestId: REQ, causedBy });
    const first = sendMessage({ recipientAgentIds: ["reviewer"], text: "Can you check this?" }, ctx("coder", null));
    const answer = sendMessage({ recipientAgentIds: [], text: REPLY, replyToMessageId: String(first.result.messageId) }, ctx("reviewer", String(first.result.messageId)));
    expect(answer.result.error).toBeUndefined();
    const again = sendMessage({ recipientAgentIds: [], text: REPLY, replyToMessageId: String(first.result.messageId) }, ctx("reviewer", String(first.result.messageId)));
    expect(String(again.result.error)).toMatch(/not waiting for your answer/);
    const back = sendMessage({ recipientAgentIds: [], text: REPLY, replyToMessageId: String(answer.result.messageId) }, ctx("coder", String(answer.result.messageId)));
    expect(String(back.result.error)).toMatch(/not waiting for your answer/);
    expect(getState().messages.filter((m) => m.requestId === REQ)).toHaveLength(2);
  });
});
