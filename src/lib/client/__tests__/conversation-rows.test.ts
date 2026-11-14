import { describe, expect, it } from "vitest";
import { dayMarkerLabel, formatChatTimestamp } from "../chat-time";
import { buildConversationRows } from "../conversation-rows";
import { threadStatusOf } from "../crew";
import { buildWhyTrace } from "../why-trace";
import type { Agent, Artifact, Snapshot, ThreadItem, WhyHop } from "@/lib/types";

const at = (minute: number, second = 0) => new Date(Date.UTC(2026, 10, 14, 9, minute, second)).toISOString();

const step = (id: string, turnId: string, minute: number): ThreadItem => ({
  kind: "step",
  id,
  turnId,
  tool: "read_file",
  label: `Reading ${id}`,
  at: at(minute),
});

const ITEMS: ThreadItem[] = [
  { kind: "user_text", id: "u1", text: "customers want CSV", at: at(0) },
  step("s1", "t1", 1),
  { kind: "message_out", id: "o1", turnId: "t1", messageId: "m1", to: ["inv-1"], text: "Build it", expectsReply: true, at: at(1, 30) },
  step("s2", "t1", 2),
  { kind: "agent_text", id: "a1", turnId: "t1", text: "INV-1 is building it.", at: at(3) },
  { kind: "message_in", id: "i1", messageId: "m2", from: "inv-1", text: "Opened #1", isReply: true, at: at(10) },
  step("s3", "t2", 11),
  { kind: "approval", id: "p1", approvalId: "apr", at: at(12) },
];

const pullRequest = (agentId: string, turnId: string, minute: number): Artifact => ({
  id: `pr-${agentId}`,
  kind: "pull_request",
  title: "Add CSV export",
  detail: "",
  status: "open",
  agentId,
  turnId,
  requestId: "r1",
  messageId: "m1",
  at: at(minute),
  pullRequest: { number: 1, branch: "inv-1-csv", headSha: "abc", files: [], patch: "", merged: false },
});

describe("buildConversationRows", () => {
  it("puts a finished turn's steps above its answer, and a turn with no answer gets its own steps row", () => {
    const rows = buildConversationRows(ITEMS, null, "bob", []);
    expect(rows.map((row) => row.kind)).toEqual(["user", "sent", "agent", "received", "steps", "approval"]);
    const answer = rows[2];
    expect(answer?.kind === "agent" && answer.steps?.steps.map((item) => item.id)).toEqual(["s1", "s2"]);
    expect(answer?.kind === "agent" && answer.steps?.durationMs).toBe(2 * 60_000);
    const alone = rows[4];
    expect(alone?.kind === "steps" && alone.steps.steps.map((item) => item.id)).toEqual(["s3"]);
  });

  it("leaves the running turn's steps to the activity line", () => {
    const rows = buildConversationRows(ITEMS, { since: at(11), turnId: "t2" }, "bob", []);
    expect(rows.some((row) => row.kind === "steps")).toBe(false);
  });

  it("places a pull request after the turn that opened it, and after its author's next message elsewhere", () => {
    const own = buildConversationRows(ITEMS, null, "bob", [pullRequest("bob", "t1", 2)]);
    expect(own.map((row) => row.kind)).toEqual(["user", "sent", "agent", "artifact", "received", "steps", "approval"]);
    const other = buildConversationRows(ITEMS, null, "bob", [pullRequest("inv-1", "tx", 9)]);
    expect(other.map((row) => row.kind)).toEqual(["user", "sent", "agent", "received", "artifact", "steps", "approval"]);
  });

  it("shows a review only in the reviewer's own thread", () => {
    const review: Artifact = {
      ...pullRequest("inv-2", "tx", 9),
      id: "rv",
      kind: "review",
      pullRequest: undefined,
      review: { pullRequestId: "pr-inv-1", verdict: "approve", findings: [] },
    };
    expect(buildConversationRows(ITEMS, null, "bob", [review]).some((row) => row.kind === "artifact")).toBe(false);
  });
});

describe("chat time labels", () => {
  const now = new Date(2026, 10, 14, 12, 0);
  it("marks the first row of each day only", () => {
    const morning = new Date(2026, 10, 14, 9, 42).toISOString();
    expect(dayMarkerLabel(undefined, morning, now, "en-US")).toBe("Today 9:42 AM");
    expect(dayMarkerLabel(morning, new Date(2026, 10, 14, 10, 0).toISOString(), now, "en-US")).toBeNull();
    expect(dayMarkerLabel(undefined, new Date(2026, 10, 13, 9, 42).toISOString(), now, "en-US")).toBe("Yesterday 9:42 AM");
    expect(dayMarkerLabel(undefined, new Date(2026, 7, 19, 9, 42).toISOString(), now, "en-US")).toBe("Wed, Aug 19 9:42 AM");
  });

  it("shows the clock today and the date on other days", () => {
    expect(formatChatTimestamp(new Date(2026, 10, 14, 9, 42).toISOString(), now, "en-US")).toBe("09:42 AM");
    expect(formatChatTimestamp(new Date(2026, 7, 19, 9, 42).toISOString(), now, "en-US")).toBe("Aug 19, 2026, 9:42 AM");
  });
});

describe("buildWhyTrace", () => {
  const hop = (id: string, second: number, from: WhyHop["message"]["from"], fromName: string, toNames: string[], text: string): WhyHop => ({
    message: { id, requestId: "r1", causedBy: null, from, to: [], text, expectsReply: true, replyTo: null, at: at(0, second) },
    fromName,
    toNames,
  });

  it("lays the hops on one axis from the person's sentence to the newest message", () => {
    const trace = buildWhyTrace([
      hop("m3", 40, { kind: "agent", agentId: "inv-1" }, "INV-1", ["Bob"], "Opened #1"),
      hop("m2", 10, { kind: "agent", agentId: "bob" }, "Bob", ["INV-1"], "Build it"),
      hop("m1", 0, { kind: "user" }, "You", ["Bob"], "customers want to export invoices as CSV"),
    ]);
    expect(trace.durationMs).toBe(40_000);
    expect(trace.agentCount).toBe(2);
    expect(trace.spans.at(-1)).toMatchObject({ fromPerson: true, text: "customers want to export invoices as CSV", at: 0, width: 0.25, label: "10s" });
    expect(trace.spans[0]).toMatchObject({ at: 1, width: 0, label: "" });
    expect(trace.ticks.map((tick) => tick.label)).toEqual(["0s", "10s", "20s", "30s", "40s"]);
  });

  it("counts an agent that only received a message on the path", () => {
    const trace = buildWhyTrace([
      hop("m2", 10, { kind: "agent", agentId: "bob" }, "Bob", ["FIR-1"], "Goal: export invoices as CSV"),
      hop("m1", 0, { kind: "user" }, "You", ["Bob"], "customers want to export invoices as CSV"),
    ]);
    expect(trace.agentCount).toBe(2);
  });
});

describe("threadStatusOf", () => {
  const agent = { id: "inv-1", kind: "crew" } as Agent;
  const snapshot = (threadState: Snapshot["threadState"]) => ({ activity: {}, threadState }) as unknown as Snapshot;

  it("prefers threadState: closed, then needs you, then the run status", () => {
    expect(threadStatusOf(snapshot({ "inv-1": { status: "working", needsYou: true, closed: true } }), agent)).toBe("closed");
    expect(threadStatusOf(snapshot({ "inv-1": { status: "working", needsYou: true, closed: false } }), agent)).toBe("needs_you");
    expect(threadStatusOf(snapshot({ "inv-1": { status: "failed", needsYou: false, closed: false } }), agent)).toBe("failed");
  });
});
