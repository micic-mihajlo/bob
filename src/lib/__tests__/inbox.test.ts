import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { decideApproval, postUserMessage } from "../actions";
import { setBrainOverride } from "../brain";
import { addInboxItem, inboxItem, promoteInboxOrder, SAMPLE_INBOX } from "../inbox";
import { candidateOutcome } from "../client/inbox";
import { buildSnapshot } from "../snapshot";
import { messageById } from "../state";
import { needsYou } from "../thread-status";
import { getState, update } from "../store";
import type { Artifact } from "../types";
import { callTool } from "../tools";
import { settle } from "../turns";
import { traceWhy } from "../why";
import { brainFrom, freshTeam } from "./helpers";

const [MEETING, ERROR] = SAMPLE_INBOX;
const requestOf = (inboxId: string) => messageById(getState(), inboxItem(getState(), inboxId)?.messageId ?? "")?.requestId ?? "";
const asBob = (requestId: string, causedBy: string | null = null) => ({ agentId: "bob", turnId: "turn_test", requestId, causedBy });
const line = (text: string, start: string) => text.split("\n").find((l) => l.startsWith(start)) ?? "";

const CSV = { quote: line(MEETING.text, "Dana: A CSV export"), ask: "Export all tasks as CSV", user: "the accountant", behaviour: "exports every task to a CSV file", acceptance: "a test shows a header row, one row per task, and a name with a comma stays quoted" };
const OVERDUE = { quote: line(MEETING.text, "Dana: Second thing"), ask: "List overdue tasks", user: "finance", behaviour: "sees every sent task past its due date", acceptance: "a test shows only sent tasks past their due date" };
const SLOW = { quote: "Dana: And honestly the tasks page just feels slow and clunky.", ask: "Make the tasks page faster", question: "Which part feels slow: loading the list, searching, or something else?" };

describe("the inbox: raw materials in, triaged into the backlog", { timeout: 60_000 }, () => {
  beforeEach(() => {
    freshTeam();
    setBrainOverride(brainFrom({}));
  });
  afterAll(() => {
    setBrainOverride(null);
    freshTeam();
  });

  it("stores a meeting, wakes the captain, and triage puts testable asks in the backlog quoting their line and vague ones under Needs you", async () => {
    const added = addInboxItem(MEETING);
    if (!added.ok) throw new Error(added.error);
    await settle();
    const item = inboxItem(getState(), added.inboxId);
    expect(item?.status).toBe("new");
    expect(messageById(getState(), item?.messageId ?? "")?.inboxId).toBe(added.inboxId);
    expect(getState().turns.some((t) => t.agentId === "bob" && t.messageIds.includes(item?.messageId ?? ""))).toBe(true);
    const shown = getState().threads.bob;
    expect(shown.filter((i) => i.kind === "notice").map((i) => (i.kind === "notice" ? i.text : ""))).toContain("Triaging: customer call, Nov 13");
    expect(shown.some((i) => i.kind === "user_text")).toBe(false);

    const ctx = asBob(requestOf(added.inboxId), item?.messageId ?? null);
    const misquoted = await callTool("triage_inbox", { inboxId: added.inboxId, candidates: [{ ...CSV, quote: "Dana wants CSV." }] }, ctx);
    expect(String(misquoted.result.error)).toMatch(/Quote each line exactly/);
    const untestable = await callTool("triage_inbox", { inboxId: added.inboxId, candidates: [{ quote: SLOW.quote, ask: SLOW.ask }] }, ctx);
    expect(String(untestable.result.error)).toMatch(/not testable yet/);

    const triaged = await callTool("triage_inbox", { inboxId: added.inboxId, candidates: [CSV, OVERDUE, SLOW] }, ctx);
    expect(triaged.result.error).toBeUndefined();
    const backlog = getState().roadmap.backlog ?? [];
    expect(backlog.map((w) => w.title)).toEqual([CSV.ask, OVERDUE.ask]);
    expect(backlog[0].source).toEqual({ inboxId: added.inboxId, kind: "meeting", label: "customer call, Nov 13", quote: CSV.quote });
    expect(inboxItem(getState(), added.inboxId)?.status).toBe("triaged");
    expect(needsYou(getState()).filter((n) => n.title === "Unclear ask from customer call, Nov 13").map((n) => n.detail)).toEqual([`"${SLOW.quote}" ${SLOW.question}`]);

    const started = await callTool("start_thread", { role: "build", title: "CSV", brief: "Goal: CSV." }, ctx);
    expect(String(started.result.error)).toMatch(/nothing from the inbox starts on its own/);
    expect(getState().agents.filter((a) => a.kind === "crew")).toHaveLength(0);

    await callTool("triage_inbox", { inboxId: added.inboxId, candidates: [{ ...SLOW, user: "the accountant", behaviour: "the task list loads in under a second", acceptance: "a test lists 1,000 tasks in under 100 ms" }] }, ctx);
    expect(getState().roadmap.backlog?.map((w) => w.title)).toEqual([CSV.ask, OVERDUE.ask, SLOW.ask]);
    expect(needsYou(getState()).some((n) => n.title.startsWith("Unclear ask"))).toBe(false);
  });

  it("a reply while an inbox question is open answers that item, unless the person marks it a new request", async () => {
    const added = addInboxItem(MEETING);
    if (!added.ok) throw new Error(added.error);
    await settle();
    await callTool("triage_inbox", { inboxId: added.inboxId, candidates: [CSV, SLOW] }, asBob(requestOf(added.inboxId)));
    const item = inboxItem(getState(), added.inboxId)!;
    expect(buildSnapshot(getState()).answering).toEqual({ agentId: "bob", requestId: requestOf(added.inboxId), ask: SLOW.quote, question: SLOW.question });
    const fresh = postUserMessage("bob", "Also add a dark mode.", "queue", undefined, true);
    expect(fresh.ok && messageById(getState(), fresh.messageId)?.continues).toBeFalsy();
    const answer = postUserMessage("bob", "Searching the list is slow.");
    const sent = answer.ok ? messageById(getState(), answer.messageId) : undefined;
    expect(sent?.continues).toBe(item.messageId);
    expect(sent?.requestId).not.toBe(requestOf(added.inboxId));
    await settle();
  });

  it("a promoted work order builds from a brief whose Why? ends at the quoted line and its source", async () => {
    const added = addInboxItem(MEETING);
    if (!added.ok) throw new Error(added.error);
    await settle();
    await callTool("triage_inbox", { inboxId: added.inboxId, candidates: [CSV] }, asBob(requestOf(added.inboxId)));
    const order = getState().roadmap.backlog?.[0];
    const promoted = promoteInboxOrder(order?.id ?? "");
    if (!promoted.ok) throw new Error(promoted.error);
    await settle();
    const go = messageById(getState(), promoted.messageId);
    expect(go?.text).toContain(CSV.quote);
    const typed = getState().threads.bob.filter((i) => i.kind === "user_text").map((i) => (i.kind === "user_text" ? i.text : ""));
    expect(typed).toEqual([`Build this: ${CSV.ask}`]);
    const ctx = asBob(go?.requestId ?? "", promoted.messageId);
    await callTool("set_today", { workOrderIds: [order?.id] }, ctx);
    const started = await callTool("start_thread", { role: "build", title: "CSV export", brief: "Goal: CSV export.", workOrderId: order?.id }, ctx);
    expect(started.result.error).toBeUndefined();
    const brief = getState().messages.find((m) => m.to.includes(String(started.result.threadId)));
    const hops = traceWhy(getState(), brief?.id ?? "");
    expect(hops.at(-1)?.source).toEqual({ inboxId: added.inboxId, kind: "meeting", label: "customer call, Nov 13", quote: CSV.quote });
    expect(hops.at(-1)?.message.from.kind).toBe("user");
  });

  describe("links an error to the shipped pull request it is about, not just the newest one on that file", () => {
    const pr = (number: number, title: string, patch: string, path = "src/tasks.ts") =>
      ({ id: `art_pr${number}`, kind: "pull_request", agentId: "bob", requestId: `req_${number}`, title, detail: "", at: "", pullRequest: { number, branch: `b${number}`, headSha: "abc", files: [{ path, additions: 3, deletions: 0 }], patch, merged: true } }) as unknown as Artifact;
    const followUpOf = (artifacts: Artifact[]) => {
      update((s) => ({ ...s, artifacts: [...s.artifacts, ...artifacts] }));
      const added = addInboxItem(ERROR);
      if (!added.ok) throw new Error(added.error);
      return inboxItem(getState(), added.inboxId)?.followUpOf?.number;
    };

    it("prefers the diff that has the function its stack names", () => {
      expect(followUpOf([pr(1, "#1", "+export function exportTasks(tasks: Task[]) {"), pr(2, "#2", "+export function overdueTasks(tasks: Task[], today: string) {")])).toBe(1);
    });

    it("with no function in common, prefers the title that shares the error's words", () => {
      expect(followUpOf([pr(1, "Add CSV export to the tasks page", "+function downloadCsv() {"), pr(2, "Add overdueTasks filter with oldest-due first", "+export function overdueTasks() {")])).toBe(1);
    });

    it("finds the pull request it is about even when that one changed other files than the error names", () => {
      expect(followUpOf([pr(1, "Export all tasks as a correctly quoted CSV file", "+export function toCsv() {", "src/format.ts"), pr(2, "Add overdueTasks and the Overdue count in the page summary", "+export function overdueTasks() {")])).toBe(1);
    });

    it("links nothing when no pull request changed its files or shares enough of its words", () => {
      expect(followUpOf([pr(1, "Show a dark mode toggle", "+export function toggleTheme() {", "src/theme.ts")])).toBeUndefined();
    });
  });

  it("tells the triage turn what already shipped, and an ask a merged pull request already does gets no new work order", async () => {
    const shippedPr = { id: "art_pr1", kind: "pull_request", agentId: "bob", requestId: "req_csv", title: "Add task CSV export with a test", detail: "", at: "", pullRequest: { number: 1, branch: "b1", headSha: "abc", files: [{ path: "src/tasks.ts", additions: 3, deletions: 0 }], patch: "+function downloadCsv() {", merged: true } } as unknown as Artifact;
    update((s) => ({ ...s, artifacts: [...s.artifacts, shippedPr] }));
    const added = addInboxItem(MEETING);
    if (!added.ok) throw new Error(added.error);
    await settle();
    const item = inboxItem(getState(), added.inboxId)!;
    expect(messageById(getState(), item.messageId)?.text).toMatch(/Already shipped \(data\)[\s\S]*- #1 "Add task CSV export with a test"/);
    const ctx = asBob(requestOf(added.inboxId));
    const wrong = await callTool("triage_inbox", { inboxId: added.inboxId, candidates: [{ quote: CSV.quote, ask: CSV.ask, shippedIn: 9 }] }, ctx);
    expect(String(wrong.result.error)).toMatch(/No merged pull request #9/);
    const triaged = await callTool("triage_inbox", { inboxId: added.inboxId, candidates: [{ quote: CSV.quote, ask: CSV.ask, shippedIn: 1 }, OVERDUE] }, ctx);
    expect(triaged.result.error).toBeUndefined();
    expect(String(triaged.result.next)).toMatch(/Already shipped, so not planned again: "Export all tasks as CSV" in #1/);
    expect((getState().roadmap.backlog ?? []).map((w) => w.title)).toEqual([OVERDUE.ask]);
    const csv = inboxItem(getState(), added.inboxId)?.candidates.find((c) => c.quote === CSV.quote);
    expect(csv?.shippedIn).toEqual({ pullRequestId: "art_pr1", number: 1 });
    expect(candidateOutcome(csv!, getState().roadmap)).toEqual({ kind: "shipped", number: 1 });
  });

  it("Learn: a merge that touches the module an error names resolves it, and a new error about the shipped change reopens it as a follow-up", async () => {
    const error = addInboxItem({ ...ERROR, text: ERROR.text.replace("src/tasks.ts", "src/csv.ts") });
    if (!error.ok) throw new Error(error.error);
    await settle();
    setBrainOverride(null);
    postUserMessage("bob", "Customers want to export all tasks as CSV. Done when a test shows one row per task.");
    await settle();
    const pending = getState().approvals.find((a) => a.status === "pending");
    expect(decideApproval(pending?.id ?? "", "approved").ok).toBe(true);
    await settle();
    const pr = getState().artifacts.find((a) => a.kind === "pull_request");
    expect(pr?.pullRequest?.merged).toBe(true);
    expect(pr?.pullRequest?.files.map((f) => f.path)).toContain("src/csv.ts");
    expect(inboxItem(getState(), error.inboxId)?.status).toBe("resolved");
    expect(inboxItem(getState(), error.inboxId)?.resolvedBy).toMatchObject({ pullRequestId: pr?.id, number: 1 });

    setBrainOverride(brainFrom({}));
    const again = addInboxItem({ kind: "error", source: "production error, Nov 15", text: "Error: CSV export crashed on an empty task list.\n    at toCsv (src/csv.ts:12:5)" });
    if (!again.ok) throw new Error(again.error);
    await settle();
    expect(inboxItem(getState(), again.inboxId)?.followUpOf).toEqual({ pullRequestId: pr?.id, number: 1 });
    expect(inboxItem(getState(), error.inboxId)?.status).toBe("reopened");
    await callTool(
      "triage_inbox",
      { inboxId: again.inboxId, candidates: [{ quote: "Error: CSV export crashed on an empty task list.", ask: "Export an empty task list", user: "the accountant", behaviour: "exports a month with no tasks", acceptance: "a test exports an empty list as just the header row" }] },
      asBob(requestOf(again.inboxId)),
    );
    const followUp = getState().roadmap.backlog?.find((w) => w.source?.inboxId === again.inboxId);
    expect(followUp?.title).toBe("Follow-up to #1: Export an empty task list");
    expect(followUp?.source?.followUpOf).toBe(1);
  });
});
