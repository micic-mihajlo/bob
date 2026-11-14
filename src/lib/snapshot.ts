import { liveAsks } from "./asks";
import { brainKind } from "./brain";
import { policyFor } from "./policy";
import { releaseNotesOf } from "./release-notes";
import { requestControls } from "./usage";
import { messageById, runningTurn, type State } from "./state";
import { needsYou, threadStateOf, threadStatusOf } from "./thread-status";
import type { AgentActivity, AgentId, Delivery, Snapshot, ThreadView, WaitingOn } from "./types";

function activityOf(s: State, agentId: AgentId): AgentActivity {
  const approval = s.approvals.find((a) => a.agentId === agentId && a.status === "pending");
  if (approval) return { state: "needs_you", reason: approval.title };
  const turn = runningTurn(s, agentId);
  if (turn) {
    const steps = (s.threads[agentId] ?? []).filter((i) => i.kind === "step" && i.turnId === turn.id);
    const last = steps[steps.length - 1];
    return { state: "working", since: turn.startedAt, step: last?.kind === "step" ? last.label : null, turnId: turn.id };
  }
  const asks = liveAsks(s, agentId);
  if (asks.length > 0) return { state: "waiting", onAgentIds: [...new Set(asks.map((d) => d.recipientAgentId))] };
  return { state: "idle" };
}

/** The reply to an ask, if one was sent, and whether the asker has yet to read it. */
function replyUnhandled(s: State, ask: Delivery): boolean {
  const reply = s.messages.find(
    (m) => m.replyTo === ask.messageId && m.from.kind === "agent" && m.from.agentId === ask.recipientAgentId,
  );
  const delivery = reply && s.deliveries.find((d) => d.messageId === reply.id);
  return !!delivery && (delivery.status === "queued" || delivery.status === "running");
}

function waitingState(d: Delivery): WaitingOn["state"] {
  if (d.status === "failed" || d.status === "cancelled") return "failed";
  if (d.answered) return "replied";
  return d.status === "queued" ? "asked" : "working";
}

/** Asks shown in the thread until their answers have been handled. */
function waitingOn(s: State, agentId: AgentId): WaitingOn[] {
  const live = new Set(liveAsks(s, agentId).map((d) => d.id));
  return s.deliveries
    .filter((d) => {
      const m = messageById(s, d.messageId);
      if (!m || !m.expectsReply || m.from.kind !== "agent" || m.from.agentId !== agentId) return false;
      return live.has(d.id) || replyUnhandled(s, d);
    })
    .map((d) => {
      const reply = s.messages.find((m) => m.replyTo === d.messageId && m.from.kind === "agent" && m.from.agentId === d.recipientAgentId);
      const askedAt = messageById(s, d.messageId)?.at;
      return { messageId: d.messageId, agentId: d.recipientAgentId, state: waitingState(d), ...(askedAt ? { askedAt } : {}), ...(reply ? { repliedAt: reply.at } : {}) };
    });
}

function threadOf(s: State, agentId: AgentId): ThreadView {
  const items = s.threads[agentId] ?? [];
  return {
    agentId,
    items,
    waitingOn: waitingOn(s, agentId),
    queued: s.deliveries.filter((d) => d.recipientAgentId === agentId && d.status === "queued").length,
    unread: Math.max(0, items.length - (s.readMarks[agentId] ?? 0)),
  };
}

export function buildSnapshot(s: State): Snapshot {
  const needs = needsYou(s);
  return {
    rev: s.rev,
    project: s.project,
    agents: s.agents,
    activity: Object.fromEntries(s.agents.map((a) => [a.id, activityOf(s, a.id)])),
    threads: Object.fromEntries(s.agents.map((a) => [a.id, threadOf(s, a.id)])),
    approvals: s.approvals,
    artifacts: s.artifacts,
    roadmap: s.roadmap,
    brain: brainKind(),
    threadStatus: Object.fromEntries(s.agents.map((a) => [a.id, threadStatusOf(s, a, needs)])),
    threadState: Object.fromEntries(s.agents.map((a) => [a.id, threadStateOf(s, a, needs)])),
    needsYou: needs,
    drive: s.drive ?? [],
    releaseNotes: releaseNotesOf(s),
    requests: requestControls(s),
    budgets: policyFor(s.project.id).budgets,
    live: s.live ?? {},
  };
}
