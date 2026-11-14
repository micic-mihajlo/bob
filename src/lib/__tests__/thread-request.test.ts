import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { postUserMessage } from "../actions";
import { getState } from "../store";
import { callTool } from "../tools";
import { settle } from "../turns";
import { freshTeam } from "./helpers";

const CSV =
  "Users want to export their tasks as CSV: all tasks, columns id, title, hours, status and due date. Done when tasksToCsv returns a header row and one row per task.";
const OVERDUE =
  "Add isOverdue(task, today) in src/overdue.ts: true when the task is not paid and its dueDate is before today. Done means a vitest test passes for a paid task, an unpaid one past due, and one due today.";

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
    const inv1 = getState().agents.find((a) => a.code === "TAS-1")!;

    const wrong = await callTool("message_thread", { threadId: "TAS-1", text: "Also add isOverdue in src/overdue.ts." }, asBob(requestOf(OVERDUE)));
    expect(String(wrong.result.error)).toMatch(/^TAS-1 belongs to the request "Users want to export their tasks as CSV.*", and this is the request "Add isOverdue.*"\. Start a new thread for this request/);
    expect(getState().messages.some((m) => m.to.includes(inv1.id) && m.text.startsWith("Also add isOverdue"))).toBe(false);

    const own = await callTool("message_thread", { threadId: "TAS-1", text: "One more check on the CSV header.", expectsReply: false }, asBob(requestOf(CSV)));
    expect(own.result.error).toBeUndefined();
  });
});
