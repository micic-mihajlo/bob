import type { State } from "./state";
import type { Artifact, RequestId } from "./types";
import { traceWhy } from "./why";

/**
 * One request, readable at every station: the commit trailers a crew thread's commits carry, and the trace
 * block every pull request body opens with.
 */
export interface RequestTrace {
  requestId: RequestId;
  workOrderId: string | null;
  workOrderTitle: string | null;
  thread: string;
  /** The first thing the person typed for this request. */
  ask: string | null;
  answers: { question: string; answer: string }[];
  acceptance: string | null;
  review: string;
  approval: string;
}

const OPEN = "<!-- bob-trace -->";
const CLOSE = "<!-- /bob-trace -->";

export function traceTrailers(requestId: RequestId, workOrderId: string | null, thread: string): string[] {
  return [`Bob-Request: ${requestId}`, `Bob-Work-Order: ${workOrderId ?? "none"}`, `Bob-Thread: ${thread}`];
}

function reviewLine(s: State, pr: Artifact): string {
  const review = [...s.artifacts].reverse().find((a) => a.review?.pullRequestId === pr.id)?.review;
  if (!review) return "not reviewed yet";
  const n = review.findings.length;
  return `${review.verdict === "approve" ? "approved" : "changes requested"}, ${n} finding${n === 1 ? "" : "s"}`;
}

function approvalLine(s: State, pr: Artifact): string {
  if (pr.pullRequest?.merged) return "approved by the person and merged";
  const approval = [...s.approvals].reverse().find((a) => a.pullRequestId === pr.id);
  if (!approval) return "not asked yet";
  return approval.status === "pending" ? "waiting on the person" : approval.status === "approved" ? "approved by the person" : "denied by the person";
}

/** The trace of a pull request, from its message back to what the person typed. */
export function traceOf(s: State, pr: Artifact): RequestTrace {
  const agent = s.agents.find((a) => a.id === pr.agentId);
  const hops = pr.messageId ? traceWhy(s, pr.messageId) : [];
  const person = hops.filter((h) => h.message.from.kind === "user");
  const brief = hops.find((h) => h.message.from.kind === "agent" && h.message.to.includes(pr.agentId))?.message.text ?? "";
  const workOrderId = agent?.workOrderId ?? null;
  const order = [...s.roadmap.today, ...(s.roadmap.backlog ?? [])].find((w) => w.id === workOrderId);
  return {
    requestId: pr.requestId,
    workOrderId,
    workOrderTitle: order?.title ?? null,
    thread: agent?.code ?? pr.agentId,
    ask: person.at(-1)?.message.text ?? null,
    answers: person.flatMap((h) => (h.question ? [{ question: h.question, answer: h.message.text }] : [])).reverse(),
    acceptance: /^.*?Acceptance:[ \t]*(.+?)\.?$/m.exec(brief)?.[1] ?? s.roadmap.goal?.acceptance ?? null,
    review: reviewLine(s, pr),
    approval: approvalLine(s, pr),
  };
}

const quote = (text: string) => `"${text.replace(/\s+/g, " ").trim()}"`;

export function traceBlock(t: RequestTrace): string {
  return [
    OPEN,
    `**Trace** request \`${t.requestId}\` · work order \`${t.workOrderId ?? "none"}\` · thread ${t.thread}`,
    "",
    `- Asked: ${t.ask ? quote(t.ask) : "not recorded"}`,
    ...t.answers.map((a) => `- Bob asked: ${quote(a.question)} The person answered: ${quote(a.answer)}`),
    `- Work order: ${t.workOrderTitle ?? "none"}${t.acceptance ? `. Acceptance: ${t.acceptance}` : ""}`,
    `- Review: ${t.review}`,
    `- Approval: ${t.approval}`,
    CLOSE,
  ].join("\n");
}

/** A body with the trace block on top, replacing an older one. */
export function withTraceBlock(body: string, block: string): string {
  const start = body.indexOf(OPEN);
  const end = body.indexOf(CLOSE);
  const rest = start >= 0 && end > start ? body.slice(0, start) + body.slice(end + CLOSE.length) : body;
  return `${block}\n\n${rest.trim()}`;
}

/** Every pull request's body opens with its current trace. The store applies this on every change. */
export function withPullRequestTraces(s: State): State {
  let changed = false;
  const artifacts = s.artifacts.map((a) => {
    if (a.kind !== "pull_request") return a;
    const detail = withTraceBlock(a.detail, traceBlock(traceOf(s, a)));
    if (detail === a.detail) return a;
    changed = true;
    return { ...a, detail };
  });
  return changed ? { ...s, artifacts } : s;
}
