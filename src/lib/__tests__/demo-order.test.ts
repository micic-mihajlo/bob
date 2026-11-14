import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { decideApproval, postUserMessage } from "../actions";
import { setBrainOverride } from "../brain";
import { scriptBrain } from "../brain/script";
import type { ToolCallRequest } from "../brain/types";
import { trackOf } from "../roadmap";
import { getState } from "../store";
import { isPullRequest } from "../threads";
import { settle } from "../turns";
import { requestControls } from "../usage";
import { traceWhy } from "../why";
import { freshTeam } from "./helpers";

const OVERDUE =
  "List overdue invoices: add overdueInvoices(invoices, today) in src/invoices.ts that returns the sent invoices whose due date is before today, oldest due date first. Done means a vitest test passes for one overdue, one paid and one not-yet-due invoice.";
const CSV =
  "Add invoicesToCsv(invoices) in src/csv.ts: one header row id,customer,amount,status,dueDate, then one row per invoice. Done means a vitest test in src/csv.test.ts passes for a plain row and for a customer name with a comma.";

const pending = () => getState().approvals.filter((a) => a.status === "pending");

/**
 * BOB-11's live run: the CSV request is typed while the overdue request waits at its merge approval. The
 * captain plans CSV but holds its start_thread, and starts the thread in the turn that holds the approval.
 */
function holdStartUntilApproval(): void {
  let held: ToolCallRequest | null = null;
  setBrainOverride({
    async next(ctx) {
      const move = await scriptBrain.next(ctx);
      if (ctx.agent.kind !== "captain") return move;
      if (ctx.inbound.some((m) => m.text === CSV)) {
        const start = move.toolCalls.find((c) => c.name === "start_thread");
        if (!start) return move;
        held = start;
        return { text: "The plan is set; the build starts once the first change merges.", toolCalls: move.toolCalls.filter((c) => c !== start) };
      }
      if (held && ctx.inbound.some((m) => m.rule === "decision") && move.toolCalls.length === 0) {
        const start = held;
        held = null;
        return { toolCalls: [start] };
      }
      return move;
    },
  });
}

describe("two requests in demo order", { timeout: 120_000 }, () => {
  beforeEach(freshTeam);
  afterAll(freshTeam);

  it("traces the second request's pull request to its own sentence when its thread starts in the approval's turn", async () => {
    holdStartUntilApproval();
    postUserMessage("bob", OVERDUE);
    await settle();
    const first = pending()[0];
    expect(first).toBeTruthy();
    postUserMessage("bob", CSV);
    await settle();
    expect(getState().agents.filter((a) => a.crewRole === "build")).toHaveLength(1);
    decideApproval(first.id, "approved");
    await settle();
    for (const a of pending()) decideApproval(a.id, "approved");
    await settle();
    const s = getState();
    const prs = s.artifacts.filter(isPullRequest);
    expect(prs.map((p) => p.pullRequest.merged)).toEqual([true, true]);
    const roots = prs.map((p) => traceWhy(s, p.messageId!).at(-1)?.message.text);
    expect(roots).toEqual([OVERDUE, CSV]);
    const csv = s.messages.find((m) => m.text === CSV)!.requestId;
    expect(prs[1].requestId).toBe(csv);
    const csvThreads = s.agents.filter((a) => a.kind === "crew" && s.turns.some((t) => t.agentId === a.id && t.requestId === csv)).map((a) => a.id);
    expect(csvThreads.length).toBeGreaterThanOrEqual(2);
    expect(s.turns.filter((t) => csvThreads.includes(t.agentId)).every((t) => t.requestId === csv)).toBe(true);
    expect(trackOf(s.roadmap, csv)?.stageTitle).toBe("Learn");
  });

  it("bills the second request's build to that request, so the first one's clock stays still while it waits at its merge", async () => {
    holdStartUntilApproval();
    postUserMessage("bob", OVERDUE);
    await settle();
    const first = pending()[0];
    const overdueThreads = getState().agents.map((a) => a.id);
    postUserMessage("bob", CSV);
    await settle();
    decideApproval(first.id, "approved");
    await settle();
    const s = getState();
    const billed = new Set(s.turns.filter((t) => t.requestId === first.requestId).map((t) => t.agentId));
    expect([...billed].every((id) => overdueThreads.includes(id))).toBe(true);
    const later = requestControls(s, Date.now() + 10 * 60_000).find((c) => c.requestId === first.requestId);
    expect(later?.alerts.some((a) => /has run/.test(a))).toBe(false);
  });
});
