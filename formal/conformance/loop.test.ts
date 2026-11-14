import { beforeEach, describe, expect, it } from "vitest";
import { postUserMessage } from "@/lib/actions";
import { setBrainOverride } from "@/lib/brain";
import type { Move, TurnContext } from "@/lib/brain/types";
import { brainFrom, freshStandingTeam, say } from "@/lib/__tests__/helpers";
import { budgetUsed } from "@/lib/mailbox";
import { getState } from "@/lib/store";
import { settle } from "@/lib/turns";
import { traceWhy } from "@/lib/why";
import { pick, SEEDS, seeded, subset } from "./random";

/** BobFormal.Mailbox.BUDGET */
const BUDGET = 12;

/** A teammate that, for a move or two, messages random teammates, then ends its turn. */
const randomTeammate = (rand: () => number, ids: string[]) => (ctx: TurnContext): Move => {
  if (ctx.moves.length >= 2 || rand() < 0.15) return say("Done.");
  const others = ids.filter((id) => id !== ctx.agent.id);
  return {
    toolCalls: [{ name: "send_message", input: { recipientAgentIds: subset(rand, others), text: "Please look at this.", expectsReply: rand() < 0.6 } }],
  };
};

describe("the real turn loop conforms to BobFormal.Mailbox and BobFormal.Trace", () => {
  beforeEach(freshStandingTeam);

  it.each(SEEDS)("random cascade %i terminates within the bound and every message traces to the person", async (seed) => {
    const rand = seeded(seed);
    const s0 = getState();
    const teammates = s0.agents.filter((a) => a.kind !== "captain").map((a) => a.id);
    const ids = s0.agents.map((a) => a.id);
    setBrainOverride(brainFrom(Object.fromEntries(teammates.map((id) => [id, randomTeammate(rand, ids)]))));
    const posted = postUserMessage(pick(rand, teammates), "Users want to export their tasks as CSV.");
    if (!posted.ok) throw new Error(posted.error);
    await settle();

    const s = getState();
    const requestId = s.messages.find((m) => m.id === posted.messageId)?.requestId ?? "";
    expect(budgetUsed(s, requestId)).toBeLessThanOrEqual(2 * BUDGET);
    expect(s.turns.filter((t) => t.status === "running")).toHaveLength(0);
    expect(s.deliveries.filter((d) => d.status === "queued")).toHaveLength(0);

    const position = new Map(s.messages.map((m, i) => [m.id, i]));
    for (const [i, m] of s.messages.entries()) {
      expect(m.causedBy === null, m.id).toBe(m.from.kind === "user");
      if (m.causedBy) expect(position.get(m.causedBy) ?? Infinity).toBeLessThan(i);
      const hops = traceWhy(s, m.id);
      expect(hops[hops.length - 1].message.from.kind).toBe("user");
      expect(new Set(hops.map((h) => h.message.id)).size).toBe(hops.length);
    }
  });
});
