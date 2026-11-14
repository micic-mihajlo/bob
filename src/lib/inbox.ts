import { z } from "zod";
import { newId, nowIso } from "./ids";
import { send } from "./mailbox";
import { addSourcedOrder } from "./roadmap";
import { captainOf, messageById, type State } from "./state";
import { getState, transact, update } from "./store";
import { isPullRequest, requestAsk, type PullRequestArtifact } from "./threads";
import { done, fail, type ToolContext, type ToolOutput } from "./tools/context";
import { drain } from "./turns";
import { askOnLinear } from "./integrations/linear/outbound";
import type { InboxCandidate, InboxItem, InboxKind, LinearIssueRef, RequestId, WorkOrder } from "./types";

export const INBOX_KINDS = ["meeting", "feedback", "error"] as const;

/** A sample for the demo: a customer call with two clear asks and one vague complaint, and a production error. */
export const SAMPLE_INBOX: { kind: InboxKind; source: string; text: string }[] = [
  {
    kind: "meeting",
    source: "customer call, Nov 13",
    text: [
      "Customer call with Dana Reyes, finance lead at Northwind Supply, Nov 13.",
      "Dana: At month end our accountant exports every invoice to a spreadsheet for the books. Right now she copies them out by hand.",
      "Dana: A CSV export of all invoices with id, customer, amount, status and due date would save her most of a day.",
      "Mihajlo: What counts as done for you?",
      "Dana: She opens the file and sees one row per invoice under a header row, and names like \"Acme, Inc.\" stay in one column.",
      "Dana: Second thing: nobody notices when an invoice goes overdue. We'd like a list of every sent invoice past its due date, so someone can chase it the next morning.",
      "Dana: And honestly the invoices page just feels slow and clunky.",
      "Mihajlo: Thanks, I'll take these back to the team.",
    ].join("\n"),
  },
  {
    kind: "error",
    source: "production error, Nov 14 09:12 UTC",
    text: [
      "Error: CSV import rejected the invoices export: row 3 has 6 columns, expected 5.",
      "The customer name \"Acme, Inc.\" was written without quotes, so its comma split the row.",
      "    at exportInvoices (src/invoices.ts:31:18)",
    ].join("\n"),
  },
];

export const inboxItems = (s: State): InboxItem[] => s.inbox ?? [];
export const inboxItem = (s: State, id: string): InboxItem | undefined => inboxItems(s).find((i) => i.id === id);

const patchItem = (s: State, id: string, patch: Partial<InboxItem>): State => ({
  ...s,
  inbox: inboxItems(s).map((i) => (i.id === id ? { ...i, ...patch } : i)),
});

/** A request that only an inbox item started: nothing in it may start a thread until the person promotes the work. */
export const isInboxRequest = (s: State, requestId: RequestId): boolean => inboxItems(s).some((i) => messageById(s, i.messageId)?.requestId === requestId);

/** File names an item mentions, such as invoices.ts from "at toCsv (src/invoices.ts:31:18)". */
function mentionedFiles(text: string): string[] {
  return [...new Set([...text.matchAll(/[\w./-]*?([\w-]+\.(?:tsx?|jsx?|mjs|py|go|rb|css|json))\b/g)].map((m) => m[1]))];
}

const baseName = (path: string) => path.split("/").pop() ?? path;

/** Function names in the item's stack frames, such as exportInvoices in "at exportInvoices (src/invoices.ts:31:18)". */
const framedFunctions = (text: string): string[] => [...text.matchAll(/\bat (?:[\w$]+\.)*([\w$]+) \(/g)].map((m) => m[1]);

const STOP_WORDS = new Set(["the", "and", "for", "with", "add", "has", "was", "not", "its", "from", "into", "this", "that"]);
const wordsOf = (text: string): Set<string> => new Set((text.toLowerCase().match(/[a-z]{3,}/g) ?? []).filter((w) => !STOP_WORDS.has(w)));

const mergedPullRequests = (s: State): PullRequestArtifact[] => s.artifacts.filter((a): a is PullRequestArtifact => isPullRequest(a) && a.pullRequest.merged);

/** Shared words that link an error to a pull request whose files it does not name. */
const TOPIC_WORDS = 3;

/**
 * Merged pull requests an error is about, best match first. One counts when it changed a file the error names
 * or shares at least TOPIC_WORDS words with the error through its title and the ask it came from. Order: a diff
 * that has a function the stack names, then the most shared words, then a changed file the error names, then newest.
 */
function shippedMatches(s: State, text: string): PullRequestArtifact[] {
  const mentioned = new Set(mentionedFiles(text));
  const functions = framedFunctions(text);
  const words = wordsOf(text);
  return mergedPullRequests(s)
    .reverse()
    .map((pr) => ({
      pr,
      named: functions.some((f) => new RegExp(`\\b${f.replace(/\$/g, "\\$")}\\b`).test(pr.pullRequest.patch)),
      shared: [...wordsOf(`${pr.title} ${requestAsk(s, pr.requestId ?? "") ?? ""}`)].filter((w) => words.has(w)).length,
      touched: pr.pullRequest.files.some((f) => mentioned.has(baseName(f.path))),
    }))
    .filter((m) => m.touched || m.shared >= TOPIC_WORDS)
    .sort((x, y) => Number(y.named) - Number(x.named) || y.shared - x.shared || Number(y.touched) - Number(x.touched))
    .map((m) => m.pr);
}

function framed(s: State, item: InboxItem): string {
  const follow = item.followUpOf ? `\nThis error names files that #${item.followUpOf.number} changed, which already shipped, so its asks are follow-ups to #${item.followUpOf.number}.` : "";
  const merged = mergedPullRequests(s).map((pr) => `- #${pr.pullRequest.number} ${JSON.stringify(pr.title)}, asked as ${JSON.stringify(requestAsk(s, pr.requestId) ?? pr.title)}`);
  const shipped = merged.length > 0 && item.kind !== "error" ? [`Already shipped (data). For an ask one of these already does, pass its number as shippedIn instead of planning it again:\n${merged.join("\n")}`] : [];
  return [
    `Inbox item ${item.id}: ${item.kind === "error" ? "an" : "a"} ${item.kind} from ${JSON.stringify(item.source)}.${follow}`,
    "Triage it: pull out every ask it holds and record them with one triage_inbox call. Do not start threads, set the goal or plan today; the person promotes work from the backlog.",
    ...shipped,
    "---",
    item.text,
  ].join("\n");
}

/** Stores raw material and wakes the captain with a triage turn. An error about a shipped change is linked to that pull request, and an error it had resolved reopens. */
export function addInboxItem(input: { kind: InboxKind; source: string; text: string; linear?: LinearIssueRef }): { ok: true; inboxId: string } | { ok: false; error: string } {
  const s = getState();
  const captain = captainOf(s);
  if (!captain) return { ok: false, error: "There is no captain to triage it." };
  const text = input.text.trim();
  if (!text) return { ok: false, error: "The item has no text." };
  const shipped = input.kind === "error" ? shippedMatches(s, text)[0] : undefined;
  const id = newId("inb");
  const draft: Omit<InboxItem, "messageId"> = {
    id,
    kind: input.kind,
    source: input.source.trim() || input.kind,
    text,
    at: nowIso(),
    status: "new",
    candidates: [],
    ...(shipped ? { followUpOf: { pullRequestId: shipped.id, number: shipped.pullRequest.number } } : {}),
    ...(input.linear ? { linear: input.linear } : {}),
  };
  const sent = send({ from: { kind: "user" }, to: [captain.id], text: framed(s, { ...draft, messageId: "" }), expectsReply: false, replyTo: null, causedBy: null, requestId: newId("req"), inboxId: id });
  if (!sent.ok) return { ok: false, error: sent.error.message };
  update((x) => {
    const reopened = shipped ? inboxItems(x).map((i) => (i.kind === "error" && i.resolvedBy?.pullRequestId === shipped.id ? { ...i, status: "reopened" as const } : i)) : inboxItems(x);
    return { ...x, inbox: [{ ...draft, messageId: sent.message.id }, ...reopened] };
  });
  drain(captain.id);
  return { ok: true, inboxId: id };
}

const shippedAsks = (candidates: InboxCandidate[]): string => {
  const shipped = candidates.filter((c) => c.shippedIn);
  return shipped.length ? `Already shipped, so not planned again: ${shipped.map((c) => `${JSON.stringify(c.ask)} in #${c.shippedIn?.number}`).join(", ")}; tell the person.` : "";
};

export const triageInboxSchema = z.object({
  inboxId: z.string().min(1).describe("The inbox item's id, such as inb_..."),
  candidates: z
    .array(
      z.object({
        quote: z.string().min(1).describe("The line from the item this ask comes from, copied exactly."),
        ask: z.string().min(1).max(100).describe("The ask as a work order title: a verb and a thing."),
        user: z.string().optional().describe("Who needs it. Leave out when the item does not say."),
        behaviour: z.string().optional().describe("What they can do afterwards. Leave out when the item does not say."),
        acceptance: z.string().optional().describe("One check a test could assert. Leave out when the item does not say."),
        question: z.string().optional().describe("For an ask you cannot test yet: the one question for the person."),
        shippedIn: z.number().int().positive().optional().describe("The number of a merged pull request that already does this ask. No work order is made."),
      }),
    )
    .min(1)
    .max(8),
});

/**
 * Records the asks in an inbox item. One with a user, a behaviour and an acceptance check passes the
 * same intent gate as a typed request and becomes a backlog work order quoting its source line; one
 * without is vague, and its question goes to the person. Calling again with the same quote updates
 * that ask, so a vague one becomes a work order once the person answers.
 */
export function triageInbox(input: z.infer<typeof triageInboxSchema>, ctx: ToolContext): ToolOutput {
  const out = transact<ToolOutput>((s) => {
    const item = inboxItem(s, input.inboxId);
    if (!item) return { state: s, value: fail(`No inbox item ${input.inboxId}.`) };
    const missing = input.candidates.filter((c) => !item.text.includes(c.quote.trim()));
    if (missing.length > 0) return { state: s, value: fail(`Quote each line exactly as the item has it. Not found: ${missing.map((c) => JSON.stringify(c.quote)).join(", ")}.`) };
    let roadmap = s.roadmap;
    const created: WorkOrder[] = [];
    const candidates = [...item.candidates];
    for (const c of input.candidates) {
      const quote = c.quote.trim();
      const prior = candidates.find((x) => x.quote === quote);
      if (c.shippedIn !== undefined) {
        const pr = mergedPullRequests(s).find((p) => p.pullRequest.number === c.shippedIn);
        if (!pr) return { state: s, value: fail(`No merged pull request #${c.shippedIn}. Pass shippedIn only for one listed as already shipped.`) };
        const next: InboxCandidate = { id: prior?.id ?? newId("ask"), quote, ask: c.ask, verdict: "testable", workOrderId: prior?.workOrderId ?? null, question: null, shippedIn: { pullRequestId: pr.id, number: pr.pullRequest.number } };
        if (prior) candidates[candidates.indexOf(prior)] = next;
        else candidates.push(next);
        continue;
      }
      const testable = [c.user, c.behaviour, c.acceptance].every((v) => !!v?.trim());
      if (!testable && !c.question?.trim()) return { state: s, value: fail(`${JSON.stringify(c.ask)} is not testable yet: give user, behaviour and acceptance, or the question for the person.`) };
      let workOrderId = prior?.workOrderId ?? null;
      if (testable && !workOrderId) {
        const title = item.followUpOf ? `Follow-up to #${item.followUpOf.number}: ${c.ask}` : c.ask;
        const added = addSourcedOrder(roadmap, title, { inboxId: item.id, kind: item.kind, label: item.source, quote, ...(item.followUpOf ? { followUpOf: item.followUpOf.number } : {}) });
        roadmap = added.roadmap;
        created.push(added.order);
        workOrderId = added.order.id;
      }
      const next: InboxCandidate = { id: prior?.id ?? newId("ask"), quote, ask: c.ask, verdict: testable ? "testable" : "vague", workOrderId, question: testable ? null : (c.question?.trim() ?? null) };
      if (prior) candidates[candidates.indexOf(prior)] = next;
      else candidates.push(next);
    }
    const vague = candidates.filter((c) => c.verdict === "vague");
    const state = patchItem({ ...s, roadmap }, item.id, { candidates, status: item.status === "new" ? "triaged" : item.status });
    const next = [
      created.length ? `Added to the backlog: ${created.map((w) => `${w.id} ${JSON.stringify(w.title)}`).join(", ")}.` : "No new work orders.",
      shippedAsks(candidates),
      vague.length ? `The person sees ${vague.length} question${vague.length === 1 ? "" : "s"} under Needs you; ask them in your reply too.` : "",
      "Start nothing: the person promotes backlog work. End your turn with what you found, in a few lines.",
    ].filter(Boolean).join(" ");
    void ctx;
    return { state, value: done({ inboxId: item.id, workOrders: created.map((w) => ({ id: w.id, title: w.title })), vague: vague.map((c) => ({ ask: c.ask, question: c.question })), next }) };
  });
  void askOnLinear(input.inboxId);
  return out;
}

/** The captain's view of open inbox questions, so an answer from the person can be triaged again. */
export function inboxBlock(s: State): string | null {
  const open = inboxItems(s).flatMap((item) => item.candidates.filter((c) => c.verdict === "vague").map((c) => ({ inboxId: item.id, source: item.source, quote: c.quote, ask: c.ask, question: c.question })));
  if (open.length === 0) return null;
  return `Inbox asks waiting on the person (data). When the person answers one, call triage_inbox with its inboxId and the same quote, now with user, behaviour and acceptance:\n${open.map((o) => JSON.stringify(o)).join("\n")}`;
}

/**
 * Learn: after a merge, an error in the inbox that the change fixed is resolved, with the pull request as
 * evidence. It matches when the error's work order is the one that merged, or when the error names a
 * file the change touched. Returns what it resolved.
 */
export function resolveOnMerge(s: State, pr: PullRequestArtifact, workOrderId: string | null): { state: State; resolved: InboxItem[] } {
  const touched = new Set(pr.pullRequest.files.map((f) => baseName(f.path)));
  const fixes = (i: InboxItem) =>
    i.kind === "error" &&
    (i.status === "new" || i.status === "triaged" || i.status === "reopened") &&
    (i.candidates.some((c) => !!workOrderId && c.workOrderId === workOrderId) || mentionedFiles(i.text).some((f) => touched.has(f)));
  const resolved = inboxItems(s).filter(fixes);
  if (resolved.length === 0) return { state: s, resolved };
  const at = nowIso();
  const by = { pullRequestId: pr.id, number: pr.pullRequest.number, at };
  const state = resolved.reduce((acc, i) => patchItem(acc, i.id, { status: "resolved", resolvedBy: by }), s);
  return { state, resolved };
}

/** What a person can promote: a backlog work order that came from the inbox goes to the captain to build now. */
export function promoteInboxOrder(workOrderId: string): { ok: true; messageId: string } | { ok: false; error: string } {
  const s = getState();
  const captain = captainOf(s);
  const order = (s.roadmap.backlog ?? []).find((w) => w.id === workOrderId);
  if (!captain || !order?.source) return { ok: false, error: `No inbox work order ${workOrderId} in the backlog.` };
  const text = `Build work order ${order.id} now: ${JSON.stringify(order.title)}. It came from ${order.source.label}: "${order.source.quote}". It is already in the backlog, so don't plan it again with set_roadmap: put ${order.id} in today with set_today and start its build thread with workOrderId ${order.id}.`;
  const sent = send({ from: { kind: "user" }, to: [captain.id], text, shown: `Build this: ${order.title}`, expectsReply: false, replyTo: null, causedBy: null, requestId: newId("req") });
  if (!sent.ok) return { ok: false, error: sent.error.message };
  drain(captain.id);
  return { ok: true, messageId: sent.message.id };
}
