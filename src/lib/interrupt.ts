import { descendsFrom, liveAsks } from "./asks";
import { nowIso } from "./ids";
import { relayOwed } from "./relay";
import { agentName, messageById, runningTurn, type State } from "./state";
import { addNotice, patchTurn } from "./state-ops";
import { getState, transact } from "./store";
import { closePending } from "./threads";
import { drain } from "./turns";
import type { AgentId, Message, RequestId, Turn } from "./types";

export type InterruptResult = { ok: true; stopped: AgentId[]; stillRunning: AgentId[] } | { ok: false; error: string };

interface Scope {
  agentId: AgentId;
  requests: Set<RequestId>;
  /** Messages the stopped agent started, and every message they caused, however many hops away. */
  subtree: Set<string>;
}

function scopeOf(s: State, agentId: AgentId, requests: Set<RequestId>): Scope {
  const roots = s.messages.filter(
    (m) => m.from.kind === "agent" && m.from.agentId === agentId && !m.replyTo && requests.has(m.requestId),
  );
  const inTree = (m: Message) => roots.some((r) => r.id === m.id || descendsFrom(s, m.id, r.id));
  return { agentId, requests, subtree: new Set(s.messages.filter(inTree).map((m) => m.id)) };
}

const turnsToStop = (s: State, scope: Scope): Turn[] =>
  s.turns.filter(
    (t) =>
      t.status === "running" &&
      (t.agentId === scope.agentId || (scope.requests.has(t.requestId) && t.messageIds.some((id) => scope.subtree.has(id)))),
  );

/** Closes the stopped work's open deliveries, so nobody picks them up and no answer flows back into it. */
function closeSubtree(s: State, scope: Scope): State {
  return {
    ...s,
    deliveries: s.deliveries.map((d) => {
      if (!scope.subtree.has(d.messageId) || d.answered) return d;
      return d.status === "queued" ? { ...d, status: "cancelled", answered: true } : { ...d, answered: true };
    }),
  };
}

function describe(s: State, root: AgentId, others: AgentId[], stillRunning: AgentId[]): string {
  const names = (ids: AgentId[]) => ids.map((id) => agentName(s, id)).join(", ");
  const parts = [`Stopped ${agentName(s, root)}.`];
  if (others.length > 0) parts.push(`Also stopped work it started: ${names(others)}.`);
  if (stillRunning.length > 0) parts.push(`Still running in this request, not started by it: ${names(stillRunning)}.`);
  parts.push("A model call already under way may finish in the background; its result is discarded.");
  return parts.join(" ");
}

function requestsOf(s: State, agentId: AgentId): Set<RequestId> {
  const own = runningTurn(s, agentId);
  if (own) return new Set([own.requestId]);
  return new Set(liveAsks(s, agentId).map((d) => messageById(s, d.messageId)?.requestId).filter((x): x is string => !!x));
}

function applyInterrupt(s: State, agentId: AgentId): { state: State; value: InterruptResult } {
  const requests = requestsOf(s, agentId);
  if (requests.size === 0) {
    return { state: s, value: { ok: false, error: `${agentName(s, agentId)} is not working on anything right now.` } };
  }
  const scope = scopeOf(s, agentId, requests);
  const turns = turnsToStop(s, scope);
  const at = nowIso();
  let next = closePending(
    closeSubtree(
      turns.reduce((acc, t) => patchTurn(acc, t.id, { status: "interrupted", endedAt: at }), s),
      scope,
    ),
  );
  const others = [...new Set(turns.map((t) => t.agentId))].filter((id) => id !== agentId);
  const stillRunning = next.turns.filter((t) => t.status === "running" && requests.has(t.requestId)).map((t) => t.agentId);
  next = addNotice(next, agentId, "info", describe(next, agentId, others, stillRunning));
  next = others.reduce((acc, id) => addNotice(acc, id, "info", `Stopped because ${agentName(s, agentId)} was stopped.`), next);
  return { state: next, value: { ok: true, stopped: [agentId, ...others], stillRunning } };
}

/**
 * Stops the agent's turn and all work its messages started, through any number of teammates. Loops stop at
 * their next step. An agent stopped while waiting has no loop to answer its asker, so it answers here.
 */
export function interrupt(agentId: AgentId): InterruptResult {
  const hadTurn = !!runningTurn(getState(), agentId);
  const requestIds = [...requestsOf(getState(), agentId)];
  const result = transact((s) => applyInterrupt(s, agentId));
  if (!result.ok || hadTurn) return result;
  const woken = relayOwed({
    agentId,
    turnId: "",
    requestIds,
    text: "I was stopped before I could finish.",
    status: "blocked",
    unblock: "Ask the person whether to continue.",
  });
  woken.forEach(drain);
  return result;
}
