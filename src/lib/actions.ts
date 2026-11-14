import { writeFile } from "node:fs/promises";
import path from "node:path";
import { openAsk, openFollowUp, openInboxQuestion } from "./brain/intake";
import { globals } from "./globals";
import { newId } from "./ids";
import { isThreadModel, unknownModel } from "./models";
import { interrupt, type InterruptResult } from "./interrupt";
import { send } from "./mailbox";
import { park } from "./projects";
import { relayOwed } from "./relay";
import { agentById, runningTurn } from "./state";
import { addThreadItem, patchApproval, patchDelivery, patchTurn, stamp } from "./state-ops";
import { getState, resetState, transact, update } from "./store";
import { addAgent, type NewAgentInput } from "./team";
import { removeProjectWorkspaces, threadWorkspace, warmProject } from "./thread-workspace";
import { closeThreadState } from "./threads";
import { drain } from "./turns";
import { SAMPLE_PROJECT } from "./seed";
import { hasProject, type AgentId, type Approval } from "./types";
import type { DepsState } from "./workspace";

/** What a person can do. Routes call these after validating the request body. */

export type ActionResult<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };

/** Finishes the boot sweep once per load: answers askers the restart cut off, then starts queued work. */
export function boot(): void {
  const g = globals();
  const s = getState();
  const orphans = g.pendingBoot;
  if (!orphans) return;
  g.pendingBoot = null;
  const rerun = (turnId: string) => s.deliveries.some((d) => s.requeuedDeliveryIds.includes(d.id) && d.status === "queued" && d.turnId === null && s.turns.find((t) => t.id === turnId)?.messageIds.includes(d.messageId));
  for (const turn of s.turns.filter((t) => orphans.includes(t.id) && !rerun(t.id))) {
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

/** How a message reaches a thread that is working: steer lands at its next step, queue runs after the turn. */
export type SendMode = "steer" | "queue";

/** Hands a just-sent person message to the agent's running turn, which reads it at its next step. */
function steerInto(agentId: AgentId, messageId: string, deliveryId: string, text: string, via?: "voice"): boolean {
  return transact((s) => {
    const turn = runningTurn(s, agentId);
    if (!turn) return { state: s, value: false };
    const joined = patchTurn(s, turn.id, { messageIds: [...turn.messageIds, messageId] });
    const claimed = patchDelivery(joined, deliveryId, { status: "completed", turnId: turn.id });
    return { state: addThreadItem(claimed, agentId, { kind: "user_text", ...stamp(), text, ...(via ? { via } : {}) }), value: true };
  });
}

/**
 * A person's message. While the captain's question is open, a message to the captain answers it and joins that
 * request, unless the person marked it a new request. The same holds for the captain's question after the person
 * declined a merge: the answer joins that pull request's request. While only an inbox question is open, the message answers that
 * inbox item: it continues the item's message but keeps a request of its own.
 */
export function postUserMessage(agentId: AgentId, text: string, mode: SendMode = "queue", via?: "voice", newRequest = false): ActionResult<{ messageId: string; steered: boolean }> {
  const agent = agentById(getState(), agentId);
  if (!agent) return unknownAgent(agentId);
  const ask = agent.kind === "captain" && !newRequest ? (openAsk(getState(), agentId) ?? openFollowUp(getState(), agentId)) : null;
  const inbox = agent.kind === "captain" && !newRequest && !ask ? openInboxQuestion(getState()) : null;
  const sent = send({
    from: { kind: "user" },
    to: [agentId],
    text,
    expectsReply: false,
    replyTo: null,
    causedBy: null,
    requestId: ask?.requestId ?? newId("req"),
    ...(ask ? { continues: ask.id } : inbox ? { continues: inbox.item.messageId } : {}),
    ...(via ? { via } : {}),
  });
  if (!sent.ok) return { ok: false, error: sent.error.message };
  const steered = mode === "steer" && steerInto(agentId, sent.message.id, sent.deliveries[0].id, sent.message.text, via);
  if (!steered) drain(agentId);
  return { ok: true, messageId: sent.message.id, steered };
}

export function createAgentByPerson(input: NewAgentInput): ActionResult<{ agentId: AgentId }> {
  return transact<ActionResult<{ agentId: AgentId }>>((s) => {
    const added = addAgent(s, input, { kind: "user" });
    return added.ok
      ? { state: added.state, value: { ok: true, agentId: added.agent.id } }
      : { state: s, value: { ok: false, error: added.error } };
  });
}

/** Writes the acceptance test a person approved into the thread's workspace: the only way past the lock. */
async function writeApprovedAcceptance(approval: Approval): Promise<string> {
  const change = approval.acceptanceChange!;
  const ws = await threadWorkspace(getState().project, approval.agentId);
  await writeFile(path.join(ws.root, change.path), change.content);
  update((s) => addThreadItem(s, approval.agentId, { kind: "step", ...stamp(), turnId: approval.turnId, tool: "acceptance_change", label: "The person approved the acceptance test change", outcome: "ok", seconds: 0, detail: change.path }));
  return ` Bob wrote the approved ${change.path}. It stays locked; run it again, then fix the code until it passes.`;
}

export function decideApproval(approvalId: string, decision: "approved" | "denied"): ActionResult {
  const approval = getState().approvals.find((a) => a.id === approvalId);
  if (!approval) return { ok: false, error: `No approval with id ${approvalId}.` };
  if (approval.status !== "pending") return { ok: false, error: `That approval was already ${approval.status}.` };
  update((s) => patchApproval(s, approvalId, { status: decision }));
  if (approval.acceptanceChange) {
    const run: Promise<void> = (decision === "approved" ? writeApprovedAcceptance(approval) : Promise.resolve(" Your acceptance test is unchanged and stays locked: fix the code, or report blocked."))
      .catch((error: unknown) => ` Writing the approved test failed: ${error instanceof Error ? error.message : "unknown error"}.`)
      .then((note) => void sendDecision(approval, decision, note))
      .finally(() => globals().inflight.delete(run));
    globals().inflight.add(run);
    return { ok: true };
  }
  const sent = sendDecision(approval, decision, "");
  return sent.ok ? { ok: true } : sent;
}

function sendDecision(approval: Approval, decision: "approved" | "denied", note: string): ActionResult {
  const verb = decision === "approved" ? "Approved" : "Denied";
  const sent = send({
    from: { kind: "user" },
    to: [approval.agentId],
    text: `${verb}: ${approval.title}${note}`,
    expectsReply: false,
    replyTo: null,
    causedBy: null,
    requestId: approval.requestId,
    approvalId: approval.id,
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

/** The person picks the model a crew thread runs on. Its next turn uses it. */
export function setThreadModelByPerson(agentId: AgentId, model: string): ActionResult {
  return transact<ActionResult>((s) => {
    const agent = agentById(s, agentId);
    if (!agent) return { state: s, value: unknownAgent(agentId) };
    if (agent.kind !== "crew") return { state: s, value: { ok: false, error: `${agent.name} is not a crew thread.` } };
    if (!isThreadModel(model)) return { state: s, value: { ok: false, error: unknownModel(model) } };
    return { state: { ...s, agents: s.agents.map((a) => (a.id === agentId ? { ...a, model } : a)) }, value: { ok: true } };
  });
}

/**
 * Back to the seed on the same project, or on the invoices sample with sample, with that project's repository and every
 * thread's clone removed. With warm, the repository and its dependencies are made again before it answers.
 */
export async function resetAll(options: { warm?: boolean; sample?: boolean } = {}): Promise<ActionResult<{ deps?: DepsState }>> {
  const project = options.sample ? SAMPLE_PROJECT : getState().project;
  if (getState().project.id !== project.id) park(getState());
  resetState(project);
  if (!hasProject(project)) return { ok: true };
  try {
    await removeProjectWorkspaces(project.id);
    if (options.warm) return { ok: true, deps: await warmProject(project) };
  } catch (error) {
    return { ok: false, error: `State was reset, but the workspaces could not be ${options.warm ? "prepared" : "removed"}: ${error instanceof Error ? error.message : "unknown error"}` };
  }
  return { ok: true };
}
