import { describe, expect, it } from "vitest";
import type { InboxCandidate, WorkOrder } from "@/lib/types";
import { candidateOutcome, inboxStatus, quotedLines } from "../inbox";

const order = (id: string, status: WorkOrder["status"] = "open"): WorkOrder => ({ id, title: id, status, ownerAgentId: null, artifactId: null });
const testable = (workOrderId: string): InboxCandidate => ({
  id: "ask_1",
  quote: "Dana: A CSV export.",
  ask: "Export CSV",
  verdict: "testable",
  workOrderId,
  question: null,
});

describe("candidateOutcome", () => {
  it("offers a backlog order to build", () => {
    expect(candidateOutcome(testable("wo_1"), { today: [], backlog: [order("wo_1")] })).toEqual({ kind: "backlog", order: order("wo_1") });
  });

  it("shows an order already in today as planned", () => {
    expect(candidateOutcome(testable("wo_1"), { today: [order("wo_1", "running")], backlog: [] })).toEqual({
      kind: "planned",
      order: order("wo_1", "running"),
    });
  });

  it("shows the question for a vague ask", () => {
    const vague: InboxCandidate = { ...testable("wo_1"), verdict: "vague", workOrderId: null, question: "Who chases it?" };
    expect(candidateOutcome(vague, { today: [], backlog: [] })).toEqual({ kind: "asked", question: "Who chases it?" });
  });

  it("says nothing when the order is gone", () => {
    expect(candidateOutcome(testable("wo_9"), { today: [], backlog: [] })).toEqual({ kind: "none" });
  });
});

describe("quotedLines", () => {
  it("marks the lines an ask quotes", () => {
    const lines = quotedLines({ text: "Call with Dana.\nDana: A CSV export.\nThanks.", candidates: [testable("wo_1")] });
    expect(lines.map((line) => line.quoted)).toEqual([false, true, false]);
  });
});

describe("inboxStatus", () => {
  it("names the pull request that fixed an error", () => {
    expect(inboxStatus({ status: "resolved", resolvedBy: { pullRequestId: "art_1", number: 4, at: "" } })).toEqual({ label: "Fixed by PR #4", tone: "done" });
  });

  it("flags an error that came back", () => {
    expect(inboxStatus({ status: "reopened" }).tone).toBe("alert");
  });
});
