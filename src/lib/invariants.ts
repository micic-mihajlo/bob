import { digestFile } from "./captain-files";
import { inboxItems } from "./inbox";
import type { State } from "./state";
import { needsYou } from "./thread-status";
import { isPullRequest, threadRequestId } from "./threads";
import type { NeedsYouItem, RequestId } from "./types";
import { traceWhy } from "./why";

/** One broken promise the runtime makes, found in a state. */
export interface Violation {
  rule: "merge_without_approval" | "why_not_rooted" | "thread_spans_requests" | "digest_mismatch" | "orphan_turn" | "orphan_delivery" | "stalled";
  detail: string;
}

/** The request a needs-you item waits in: an approval's own, or the asking agent's latest turn's. */
function requestOf(s: State, item: NeedsYouItem): RequestId | null {
  const approval = item.approvalId ? s.approvals.find((a) => a.id === item.approvalId) : undefined;
  if (approval) return approval.requestId;
  return [...s.turns].reverse().find((t) => t.agentId === item.agentId)?.requestId ?? null;
}

/** Invariants that hold at every moment, mid-turn included. */
export function alwaysViolations(s: State): Violation[] {
  const out: Violation[] = [];
  for (const pr of s.artifacts.filter(isPullRequest)) {
    const n = `#${pr.pullRequest.number}`;
    if (pr.pullRequest.merged && !s.approvals.some((a) => a.pullRequestId === pr.id && a.status === "approved" && a.headSha === pr.pullRequest.headSha)) {
      out.push({ rule: "merge_without_approval", detail: `${n} merged at ${pr.pullRequest.headSha.slice(0, 7)} with no approval of that head` });
    }
    const root = pr.messageId ? traceWhy(s, pr.messageId).at(-1)?.message : undefined;
    if (!root || root.from.kind !== "user" || root.approvalId) {
      out.push({ rule: "why_not_rooted", detail: `Why? on ${n} ends at ${root ? `${root.from.kind} message ${root.id}` : "nothing"}, not a person's sentence` });
    }
  }
  const captain = s.agents.find((a) => a.kind === "captain")?.id;
  for (const agent of s.agents.filter((a) => a.kind === "crew")) {
    const requests = new Set(s.messages.filter((m) => m.to.includes(agent.id) && m.from.kind === "agent" && m.from.agentId === captain).map((m) => m.requestId));
    if (requests.size > 1) out.push({ rule: "thread_spans_requests", detail: `${agent.code ?? agent.id} got work for ${requests.size} requests: ${[...requests].join(", ")}` });
  }
  const digest = s.drive.find((f) => f.name === "DIGEST.md")?.content;
  const count = needsYou(s).length;
  const said = digest === undefined ? null : /^Nothing needs you/.test(digest) ? 0 : Number(/^(\d+) things? needs? you/.exec(digest)?.[1] ?? NaN);
  if (digest !== undefined && (digest !== digestFile(s) || said !== count)) {
    out.push({ rule: "digest_mismatch", detail: `DIGEST.md says ${said ?? "nothing"} but ${count} thing(s) need the person` });
  }
  return out;
}

/**
 * Invariants that hold once nothing is running: no turn or delivery is left open, and every open crew
 * thread's request either waits on the person (a card, a question, a failure, or a card they denied)
 * or was stopped by them. Every inbox item is triaged, unless the person stopped its triage.
 */
export function quietViolations(s: State, stoppedRequests: ReadonlySet<RequestId> = new Set()): Violation[] {
  const out: Violation[] = [];
  for (const t of s.turns.filter((x) => x.status === "running")) out.push({ rule: "orphan_turn", detail: `turn ${t.id} of ${t.agentId} still running with nothing in flight` });
  const open = new Set(s.agents.filter((a) => !a.closedAt).map((a) => a.id));
  for (const d of s.deliveries.filter((x) => x.status === "running" || x.status === "queued")) {
    out.push({ rule: "orphan_delivery", detail: `delivery ${d.id} to ${d.recipientAgentId}${open.has(d.recipientAgentId) ? "" : " (closed)"} left ${d.status}` });
  }
  const waiting = new Set(needsYou(s).map((n) => requestOf(s, n)).filter((r): r is RequestId => !!r));
  const lastCard = new Map(s.approvals.map((a) => [a.requestId, a.status] as const));
  for (const [requestId, status] of lastCard) if (status === "denied") waiting.add(requestId);
  for (const agent of s.agents.filter((a) => a.kind === "crew" && !a.closedAt)) {
    const requestId = threadRequestId(s, agent.id);
    if (!requestId || waiting.has(requestId) || stoppedRequests.has(requestId)) continue;
    const merged = s.artifacts.some((a) => isPullRequest(a) && a.pullRequest.merged && s.agents.find((x) => x.id === a.agentId && threadRequestId(s, x.id) === requestId));
    const last = [...s.turns].reverse().find((t) => t.agentId === agent.id);
    if (last?.status === "interrupted" && !merged) continue;
    out.push({ rule: "stalled", detail: `${agent.code ?? agent.id} (${agent.crewRole}) is open in ${requestId}${merged ? " after its pull request merged" : ""}, and nothing waits on the person` });
  }
  const stoppedItem = (messageId: string | undefined) => stoppedRequests.has(s.messages.find((m) => m.id === messageId)?.requestId as RequestId);
  for (const item of inboxItems(s).filter((i) => i.status === "new" && !stoppedItem(i.messageId))) out.push({ rule: "stalled", detail: `inbox item ${item.id} was never triaged` });
  return out;
}
