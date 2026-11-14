import { beforeEach, describe, expect, it } from "vitest";
import { freshStandingTeam } from "@/lib/__tests__/helpers";
import { applySend, budgetUsed, REQUEST_DELIVERY_BUDGET, type SendInput } from "@/lib/mailbox";
import { messageById, type State } from "@/lib/state";
import { getState } from "@/lib/store";
import { sendMessage } from "@/lib/tools/messaging";
import type { Message } from "@/lib/types";
import { pick, SEEDS, seeded, subset } from "./random";

/** BobFormal.Mailbox.BUDGET */
const BUDGET = 12;
const REQ = "req_formal";
const REPLY = "Status: done\nResult: Looked at it.\nEvidence: none";

/** BobFormal.Mailbox.accepts, written against the real state. */
function modelAccepts(s: State, i: SendInput): boolean {
  const to = [...new Set(i.to)];
  if (to.length === 0) return false;
  if (i.from.kind === "agent" && to.includes(i.from.agentId)) return false;
  if (i.replyTo && i.expectsReply) return false;
  if (i.replyTo && !messageById(s, i.replyTo)) return false;
  return !(i.from.kind === "agent" && !i.replyTo && budgetUsed(s, i.requestId) + to.length > BUDGET);
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
    firstSends: deliveriesWhere(s, (m) => fromAgent(m) && !m.replyTo).length,
    replySends: deliveriesWhere(s, (m) => fromAgent(m) && !!m.replyTo).length,
    owed: deliveriesWhere(s, (m) => fromAgent(m) && m.expectsReply).filter((d) => !d.answered).length,
    agentMessages: s.messages.filter((m) => m.requestId === REQ && fromAgent(m)).length,
  };
}

/** A random send that follows the factory's reply rule: a reply answers one owed ask, to the asker. */
function randomSend(s: State, rand: () => number, ids: string[]): SendInput {
  const sender = pick(rand, ids);
  const causedBy = s.messages.length > 0 ? pick(rand, s.messages).id : null;
  const owed = s.deliveries.filter((d) => {
    const m = messageById(s, d.messageId);
    return d.recipientAgentId === sender && !d.answered && !!m?.expectsReply && m.from.kind === "agent";
  });
  const base = { from: { kind: "agent" as const, agentId: sender }, causedBy, requestId: REQ };
  if (owed.length > 0 && rand() < 0.5) {
    const ask = messageById(s, pick(rand, owed).messageId) as Message;
    const asker = ask.from.kind === "agent" ? ask.from.agentId : sender;
    return { ...base, to: [asker], text: REPLY, replyTo: ask.id, expectsReply: rand() < 0.1 };
  }
  return { ...base, to: subset(rand, ids), text: "Please look at this.", replyTo: null, expectsReply: rand() < 0.6 };
}

describe("mailbox conforms to BobFormal.Mailbox", () => {
  beforeEach(freshStandingTeam);

  it("uses the same budget as the model", () => {
    expect(REQUEST_DELIVERY_BUDGET).toBe(BUDGET);
  });

  it.each(SEEDS)("random cascade %i: accepts what the model accepts and stays inside the proven bounds", (seed) => {
    const rand = seeded(seed);
    let s = getState();
    const ids = s.agents.map((a) => a.id);
    for (let step = 0; step < 120; step++) {
      const input = randomSend(s, rand, ids);
      const expected = modelAccepts(s, input);
      const applied = applySend(s, input);
      expect(applied.result.ok, JSON.stringify(input)).toBe(expected);
      s = applied.state;
      const c = counters(s);
      expect(c.firstSends).toBeLessThanOrEqual(BUDGET);
      expect(c.replySends + c.owed).toBeLessThanOrEqual(c.firstSends);
      expect(c.agentMessages).toBeLessThanOrEqual(budgetUsed(s, REQ));
      expect(budgetUsed(s, REQ)).toBeLessThanOrEqual(2 * BUDGET);
    }
  });

  it("known gap (send_message_replies_unbounded): two teammates can answer each other's replies past the bound", () => {
    const ctx = (agentId: string, causedBy: string | null) => ({ agentId, turnId: "turn_formal", requestId: REQ, causedBy });
    const first = sendMessage({ recipientAgentIds: ["reviewer"], text: "Can you check this?" }, ctx("coder", null));
    let last = String(first.result.messageId);
    let replier = "reviewer";
    for (let k = 1; k <= 40; k++) {
      const out = sendMessage({ recipientAgentIds: [], text: REPLY, replyToMessageId: last }, ctx(replier, last));
      expect(out.result.error).toBeUndefined();
      last = String(out.result.messageId);
      replier = replier === "reviewer" ? "coder" : "reviewer";
    }
    expect(budgetUsed(getState(), REQ)).toBeGreaterThan(2 * BUDGET);
  });
});
