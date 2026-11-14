import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { postUserMessage } from "../actions";
import { getState } from "../store";
import { callTool } from "../tools";
import { settle } from "../turns";
import { freshTeam } from "./helpers";

const CSV =
  "Customers want to export invoices as CSV: all invoices, columns id, customer, amount, status and due date. Done when invoicesToCsv returns a header row and one row per invoice.";
const OVERDUE =
  "Add isOverdue(invoice, today) in src/overdue.ts: true when the invoice is not paid and its dueDate is before today. Done means a vitest test passes for a paid invoice, an unpaid one past due, and one due today.";

const requestOf = (text: string) => getState().messages.find((m) => m.from.kind === "user" && m.text === text)!.requestId;
const asBob = (requestId: string) => ({ agentId: "bob", turnId: "turn_test", requestId, causedBy: null });

describe("a crew thread belongs to one request", { timeout: 60_000 }, () => {
  beforeEach(freshTeam);
  afterAll(freshTeam);

  it("refuses to send another request's work into a thread, and still takes follow-ups for its own", async () => {
    postUserMessage("bob", CSV);
    await settle();
    postUserMessage("bob", OVERDUE);
    await settle();
    const inv1 = getState().agents.find((a) => a.code === "INV-1")!;

    const wrong = await callTool("message_thread", { threadId: "INV-1", text: "Also add isOverdue in src/overdue.ts." }, asBob(requestOf(OVERDUE)));
    expect(String(wrong.result.error)).toMatch(/^INV-1 belongs to the request "Customers want to export invoices as CSV.*", and this is the request "Add isOverdue.*"\. Start a new thread for this request/);
    expect(getState().messages.some((m) => m.to.includes(inv1.id) && m.text.startsWith("Also add isOverdue"))).toBe(false);

    const own = await callTool("message_thread", { threadId: "INV-1", text: "One more check on the CSV header.", expectsReply: false }, asBob(requestOf(CSV)));
    expect(own.result.error).toBeUndefined();
  });

  it("starts another thread for a work order still being built after today dropped it", async () => {
    postUserMessage("bob", CSV);
    await settle();
    const as = asBob(requestOf(CSV));
    const builder = getState().agents.find((a) => a.code === "INV-1")!;
    for (const a of getState().agents.filter((a) => a.crewRole === "review" && !a.closedAt)) await callTool("close_thread", { threadId: a.id }, as);
    expect((await callTool("set_today", { workOrderIds: [] }, as)).result.error).toBeUndefined();

    const review = { role: "review", title: "Review again", brief: "Review the pull request again." };
    expect((await callTool("start_thread", { ...review, workOrderId: builder.workOrderId }, as)).result.error).toBeUndefined();
    expect(String((await callTool("start_thread", { ...review, workOrderId: "wo_unknown" }, as)).result.error)).toMatch(/is not in today/);
  });
});
