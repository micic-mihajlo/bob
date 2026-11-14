import { globals } from "./globals";
import { newId } from "./ids";
import { interrupt, type InterruptResult } from "./interrupt";
import { send } from "./mailbox";
import { relayOwed } from "./relay";
import { agentById } from "./state";
import { patchApproval } from "./state-ops";
import { getState, resetState, transact, update } from "./store";
import { addAgent, type NewAgentInput } from "./team";
import { removeProjectWorkspaces } from "./thread-workspace";
import { closeThreadState } from "./threads";
import { drain } from "./turns";
import type { AgentId } from "./types";

/** What a person can do. Routes call these after validating the request body. */

export type ActionResult<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };

/** Finishes the boot sweep once per load: answers askers the restart cut off, then starts queued work. */
export function boot(): void {
  const g = globals();
  const s = getState();
  const orphans = g.pendingBoot;
  if (!orphans) return;
  g.pendingBoot = null;
  for (const turn of s.turns.filter((t) => orphans.includes(t.id))) {
    relayOwed({
      agentId: turn.agentId,
      turnId: turn.id,
      requestIds: [turn.requestId],
      text: "The server restarted while I was working on this.",
      status: "blocked",
      unblock: "Ask again if it is still needed.",
    });
  }
  const waiting = new Set(getState().deliveries.filter((d) => d.status === "queued").map((d) => d.recipientAgentId));
  waiting.forEach(drain);
}

const unknownAgent = (agentId: AgentId) => ({ ok: false as const, error: `No agent with id ${agentId}.` });

export function postUserMessage(agentId: AgentId, text: string): ActionResult<{ messageId: string }> {
  if (!agentById(getState(), agentId)) return unknownAgent(agentId);
  const sent = send({
    from: { kind: "user" },
    to: [agentId],
    text,
    expectsReply: false,
    replyTo: null,
    causedBy: null,
    requestId: newId("req"),
  });
  if (!sent.ok) return { ok: false, error: sent.error.message };
  drain(agentId);
  return { ok: true, messageId: sent.message.id };
}

export function createAgentByPerson(input: NewAgentInput): ActionResult<{ agentId: AgentId }> {
  return transact<ActionResult<{ agentId: AgentId }>>((s) => {
    const added = addAgent(s, input, { kind: "user" });
    return added.ok
      ? { state: added.state, value: { ok: true, agentId: added.agent.id } }
      : { state: s, value: { ok: false, error: added.error } };
  });
}

export function decideApproval(approvalId: string, decision: "approved" | "denied"): ActionResult {
  const approval = getState().approvals.find((a) => a.id === approvalId);
  if (!approval) return { ok: false, error: `No approval with id ${approvalId}.` };
  if (approval.status !== "pending") return { ok: false, error: `That approval was already ${approval.status}.` };
  update((s) => patchApproval(s, approvalId, { status: decision }));
  const verb = decision === "approved" ? "Approved" : "Denied";
  const sent = send({
    from: { kind: "user" },
    to: [approval.agentId],
    text: `${verb}: ${approval.title}`,
    expectsReply: false,
    replyTo: null,
    causedBy: null,
    requestId: approval.requestId,
    approvalId,
  });
  if (!sent.ok) return { ok: false, error: sent.error.message };
  drain(approval.agentId);
  return { ok: true };
}

export function markRead(agentId: AgentId): ActionResult {
  if (!agentById(getState(), agentId)) return unknownAgent(agentId);
  update((s) => {
    const seen = (s.threads[agentId] ?? []).length;
    return s.readMarks[agentId] === seen ? s : { ...s, readMarks: { ...s.readMarks, [agentId]: seen } };
  });
  return { ok: true };
}

export function stopAgent(agentId: AgentId): InterruptResult {
  if (!agentById(getState(), agentId)) return unknownAgent(agentId);
  return interrupt(agentId);
}

export function closeThreadByPerson(agentId: AgentId): ActionResult {
  return transact<ActionResult>((s) => {
    const agent = agentById(s, agentId);
    if (!agent) return { state: s, value: unknownAgent(agentId) };
    if (agent.kind !== "crew") return { state: s, value: { ok: false, error: `${agent.name} is not a crew thread.` } };
    if (agent.closedAt) return { state: s, value: { ok: true } };
    return { state: closeThreadState(s, agentId, "you"), value: { ok: true } };
  });
}

/** Back to the seed, with the project's repository and every thread's clone removed. */
export async function resetAll(): Promise<ActionResult> {
  const projectId = getState().project.id;
  resetState();
  try {
    await removeProjectWorkspaces(projectId);
  } catch (error) {
    return { ok: false, error: `State was reset, but the workspaces could not be removed: ${error instanceof Error ? error.message : "unknown error"}` };
  }
  return { ok: true };
}
