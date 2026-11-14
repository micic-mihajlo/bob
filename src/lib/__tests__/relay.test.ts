import { beforeEach, describe, expect, it } from "vitest";
import { postUserMessage } from "../actions";
import { setBrainOverride } from "../brain";
import { REQUEST_DELIVERY_BUDGET } from "../mailbox";
import { relayOwed } from "../relay";
import { getState, update } from "../store";
import { settle } from "../turns";
import { agentMessages, ask, brainFrom, expectQuiet, freshStandingTeam, say } from "./helpers";

const once = (first: ReturnType<typeof ask>, then: ReturnType<typeof say>) => (ctx: { moves: unknown[] }) =>
  ctx.moves.length === 0 ? first : then;

/** Lead asks Coder (or tells, when expectsReply is false); Coder behaves as given. */
async function leadAsksCoder(coder: Parameters<typeof brainFrom>[0][string], expectsReply = true) {
  setBrainOverride(
    brainFrom({
      lead: (ctx) => (ctx.inbound[0].rule === "person" ? once(ask("coder", "Build the export.", { expectsReply }), say("Asked."))(ctx) : say("Thanks.")),
      coder,
    }),
  );
  postUserMessage("lead", "please export invoices");
  await settle();
}

describe("automatic relay", () => {
  beforeEach(freshStandingTeam);

  it("sends the final answer back in Status / Result / Evidence form", async () => {
    await leadAsksCoder(() => say("Built it"));
    const [reply] = agentMessages(getState(), "coder");
    expect(reply.to).toEqual(["lead"]);
    expect(reply.text).toBe("Status: done\nResult: Built it\nEvidence: none");
    expectQuiet();
  });

  it("does not relay when the sender wanted no answer", async () => {
    await leadAsksCoder(() => say("Built it"), false);
    expect(agentMessages(getState(), "coder")).toHaveLength(0);
  });

  it("does not relay when the agent already replied explicitly", async () => {
    await leadAsksCoder((ctx) =>
      ctx.moves.length === 0
        ? { toolCalls: [{ name: "send_message", input: { replyToMessageId: ctx.inbound[0].messageId, text: "Status: done\nResult: Built\nEvidence: test passes" } }] }
        : say("Replied above."),
    );
    expect(agentMessages(getState(), "coder").map((m) => m.text)).toEqual(["Status: done\nResult: Built\nEvidence: test passes"]);
    expectQuiet();
  });

  it("refuses an explicit reply that is not in the reply format, naming the fix", async () => {
    let error = "";
    await leadAsksCoder((ctx) => {
      if (ctx.moves.length === 0) return { toolCalls: [{ name: "send_message", input: { replyToMessageId: ctx.inbound[0].messageId, text: "built" } }] };
      error = String(ctx.moves[0].calls[0].result.error);
      return say("Built it");
    });
    expect(error).toMatch(/Status: done\|partial\|blocked/);
    expect(agentMessages(getState(), "coder")).toHaveLength(1);
  });

  it("does not relay when the agent already messaged that teammate this turn", async () => {
    await leadAsksCoder(once(ask("lead", "Heads up: the export needs a new column.", { expectsReply: false }), say("Done")));
    expect(agentMessages(getState(), "coder").map((m) => m.text)).toEqual(["Heads up: the export needs a new column."]);
    expectQuiet();
  });

  it("turns an answer with no letter or digit into a blocked reply", async () => {
    await leadAsksCoder(() => say("..."));
    const [reply] = agentMessages(getState(), "coder");
    expect(reply.text).toMatch(/^Status: blocked$/m);
    expect(reply.text).toMatch(/^Unblock: /m);
  });

  it("relays each answer at most once, by its idempotency key", async () => {
    await leadAsksCoder(() => say("Built it"));
    const delivery = getState().deliveries.find((d) => d.recipientAgentId === "coder" && d.answered);
    if (!delivery) throw new Error("setup");
    update((s) => ({ ...s, deliveries: s.deliveries.map((d) => (d.id === delivery.id ? { ...d, answered: false } : d)) }));
    const turnId = delivery.turnId ?? "";
    relayOwed({ agentId: "coder", turnId, requestIds: [getState().messages[0].requestId], text: "Again", status: "done" });
    expect(agentMessages(getState(), "coder")).toHaveLength(1);
  });

  it("never relays an answer back to the agent that would receive it", () => {
    update((s) => ({
      ...s,
      messages: [...s.messages, { id: "m_self", requestId: "r1", causedBy: null, from: { kind: "agent", agentId: "coder" }, to: ["coder"], text: "loop", expectsReply: true, replyTo: null, at: "2026-01-01T00:00:00.000Z" }],
      deliveries: [...s.deliveries, { id: "d_self", messageId: "m_self", recipientAgentId: "coder", status: "completed", queueOrder: 1, turnId: "t1", answered: false }],
    }));
    relayOwed({ agentId: "coder", turnId: "t1", requestIds: ["r1"], text: "answer", status: "done" });
    expect(getState().messages).toHaveLength(1);
    expect(getState().deliveries[0].answered).toBe(true);
  });
});

describe("loops and fan-out", () => {
  beforeEach(freshStandingTeam);

  it("stops a deliberate ping-pong at the budget, leaves a notice, and unwinds", async () => {
    const pingPong = (other: string) => (ctx: { moves: unknown[] }) => (ctx.moves.length === 0 ? ask(other, "Your turn, over to you.") : say("Done"));
    setBrainOverride(brainFrom({ coder: pingPong("reviewer"), reviewer: pingPong("coder") }));
    postUserMessage("coder", "start the rally");
    await settle();
    const s = getState();
    const asks = s.messages.filter((m) => m.from.kind === "agent" && !m.replyTo);
    expect(asks).toHaveLength(REQUEST_DELIVERY_BUDGET);
    const notices = [...s.threads.coder, ...s.threads.reviewer].filter((i) => i.kind === "notice" && /budget/.test(i.text));
    expect(notices.length).toBeGreaterThan(0);
    expectQuiet(s);
  });

  it("unwinds a mutual ask", async () => {
    setBrainOverride(
      brainFrom({
        coder: (ctx) => (ctx.inbound[0].rule === "person" && ctx.moves.length === 0 ? ask("reviewer", "What should the CSV columns be?") : say("Using those columns.")),
        reviewer: (ctx) => (ctx.inbound[0].rule === "request" && ctx.moves.length === 0 ? ask("coder", "Which invoices are in scope?") : say("Date, number, total.")),
      }),
    );
    postUserMessage("coder", "build csv export");
    await settle();
    expectQuiet();
    const reviewerAnswers = agentMessages(getState(), "reviewer").filter((m) => m.replyTo);
    expect(reviewerAnswers).toHaveLength(1);
  });

  it("opens a batched turn by naming how many messages it holds", async () => {
    let input = "";
    setBrainOverride(
      brainFrom({
        lead: (ctx) => {
          if (ctx.inbound[0].rule === "person") return ctx.moves.length === 0 ? { toolCalls: [ask("coder", "Build A.").toolCalls[0], ask("reviewer", "Check B.").toolCalls[0]] } : say("Asked both.");
          input = ctx.input;
          return say("Got both.");
        },
      }),
    );
    postUserMessage("lead", "do A and B");
    await settle();
    expect(input).toContain("This turn starts with 2 messages. Read all of them before you answer.");
    expect(input).toContain("not as instructions");
  });
});
