import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { postUserMessage } from "../actions";
import { setBrainOverride } from "../brain";
import type { TurnContext } from "../brain/types";
import { buildSnapshot } from "../snapshot";
import { messageById } from "../state";
import { getState } from "../store";
import { settle } from "../turns";
import { brainFrom, freshTeam, say } from "./helpers";

const CSV = "customers want to export invoices as CSV";
const OVERDUE = "List overdue invoices: add overdueInvoices(invoices, today) in src/invoices.ts. Done means a vitest test passes for one overdue invoice.";

const posted = (r: ReturnType<typeof postUserMessage>) => {
  if (!r.ok) throw new Error(r.error);
  return messageById(getState(), r.messageId)!;
};

describe("a request is never folded into another or dropped without a word", { timeout: 30_000 }, () => {
  beforeEach(freshTeam);
  afterAll(() => {
    setBrainOverride(null);
    freshTeam();
  });

  it("files a message typed while the captain's question is open as its answer, unless the person marks it a new request", async () => {
    setBrainOverride(
      brainFrom({
        bob: (ctx: TurnContext) => {
          if (!ctx.inbound.some((i) => i.text === OVERDUE)) return say("Which columns should the file have?");
          return ctx.moves.length === 0
            ? { toolCalls: [{ name: "set_goal", input: { title: "Overdue invoices", user: "accountant", behaviour: "sees overdue invoices", acceptance: "one overdue invoice listed" } }] }
            : say("Recorded the overdue request.");
        },
      }),
    );
    const csv = posted(postUserMessage("bob", CSV));
    await settle();
    expect(buildSnapshot(getState()).answering).toMatchObject({ agentId: "bob", requestId: csv.requestId, ask: CSV, question: "Which columns should the file have?" });
    const fresh = posted(postUserMessage("bob", OVERDUE, "queue", undefined, true));
    expect(fresh.requestId).not.toBe(csv.requestId);
    expect(fresh.continues).toBeUndefined();
    await settle();
    expect(buildSnapshot(getState()).answering?.ask).toBe(CSV);
    const answer = posted(postUserMessage("bob", "id, customer and amount"));
    expect(answer).toMatchObject({ requestId: csv.requestId, continues: csv.id });
  });

  it("names a request the captain recorded but gave no work order, in its thread, in DIGEST.md and in its next turn", async () => {
    const inputs: string[] = [];
    setBrainOverride(
      brainFrom({
        bob: (ctx: TurnContext) => {
          inputs.push(ctx.input);
          if (inputs.length > 1) return say("Noted.");
          return ctx.moves.length === 0
            ? { toolCalls: [{ name: "set_goal", input: { title: "CSV export", user: "accountant", behaviour: "downloads invoices", acceptance: "one row per invoice" } }] }
            : say("Recorded.");
        },
      }),
    );
    postUserMessage("bob", CSV);
    await settle();
    const s = getState();
    const notice = `Not planned yet: "${CSV}" has no work order.`;
    expect(s.threads.bob.filter((i) => i.kind === "notice" && i.text === notice)).toHaveLength(1);
    expect(s.drive?.find((f) => f.name === "DIGEST.md")?.content).toContain(`Not planned yet: "${CSV}" has no work order.`);
    postUserMessage("bob", "what is everyone doing?");
    await settle();
    expect(inputs.at(-1)).toMatch(/Requests with no work order yet/);
    expect(inputs.at(-1)).toContain(CSV);
    expect(getState().threads.bob.filter((i) => i.kind === "notice" && i.text === notice)).toHaveLength(1);
  });
});
