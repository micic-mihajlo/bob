import { getBrain } from "./brain";
import type { CallRecord, MoveRecord, ToolCallRequest } from "./brain/types";
import { globals } from "./globals";
import { newId, nowIso } from "./ids";
import type { ReplyStatus } from "./reply-format";
import { relayOwed } from "./relay";
import { agentById, messageById, type State } from "./state";
import { addNotice, addThreadItem, patchDelivery, patchTurn, stamp } from "./state-ops";
import { getConfig, getState, transact, update } from "./store";
import { callTool } from "./tools";
import { buildContext } from "./turn-context";
import { planTurn, type StartedTurn } from "./turn-start";
import type { AgentId, DeliveryStatus } from "./types";

/** Moves per turn. Crew threads read, write, commit and check in their workspace, so they get more. */
export const MAX_MOVES = 8;
export const MAX_CAPTAIN_MOVES = 12;
export const MAX_CREW_MOVES = 24;

const STEP_LIMIT_TEXT = "I reached the step limit for this turn before finishing.";

function maxMoves(agentId: AgentId): number {
  const kind = agentById(getState(), agentId)?.kind;
  return kind === "crew" ? MAX_CREW_MOVES : kind === "captain" ? MAX_CAPTAIN_MOVES : MAX_MOVES;
}

const sleep = (ms: number) => (ms > 0 ? new Promise<void>((r) => setTimeout(r, ms)) : Promise.resolve());
const isRunning = (turnId: string) => getState().turns.find((t) => t.id === turnId)?.status === "running";

/** Starts the agent's next turn if it is idle. The turn runs detached from whoever called. */
export function drain(agentId: AgentId): void {
  const turn = transact((s) => {
    const plan = planTurn(s, agentId);
    return plan ? { state: plan.state, value: plan.started } : { state: s, value: null };
  });
  if (!turn) return;
  const { inflight } = globals();
  const run: Promise<void> = runTurn(turn)
    .catch((error: unknown) => failTurn(turn, error))
    .finally(() => inflight.delete(run));
  inflight.add(run);
}

/** Resolves once no turn is running. Tests use it instead of sleeping. */
export async function settle(): Promise<void> {
  const { inflight } = globals();
  while (inflight.size > 0) await Promise.allSettled([...inflight]);
}

const markActed = (s: State, turnId: string): State =>
  s.actedTurnIds.includes(turnId) ? s : { ...s, actedTurnIds: [...s.actedTurnIds, turnId] };

function addAgentText(t: StartedTurn, text: string): void {
  update((s) => markActed(addThreadItem(s, t.agentId, { kind: "agent_text", ...stamp(), turnId: t.turnId, text }), t.turnId));
}

async function runTurn(t: StartedTurn): Promise<void> {
  const initial = getState();
  const moves: MoveRecord[] = [];
  let final: string | null = STEP_LIMIT_TEXT;
  const limit = maxMoves(t.agentId);
  for (let i = 0; i < limit; i++) {
    await sleep(getConfig().pace);
    const ctx = isRunning(t.turnId) ? buildContext(getState(), initial, t, moves) : null;
    if (!ctx) return finishStopped(t);
    const move = await getBrain().next(ctx);
    if (!isRunning(t.turnId)) return finishStopped(t);
    const text = move.text?.trim() || null;
    if (move.toolCalls.length === 0) {
      final = text;
      break;
    }
    if (text) addAgentText(t, text);
    const executed = await executeMove(t, move.toolCalls);
    if (!executed) return finishStopped(t);
    moves.push({ text, calls: executed.calls });
    if (executed.endTurn) {
      final = null;
      break;
    }
  }
  finishTurn(t, final);
}

async function executeMove(t: StartedTurn, calls: ToolCallRequest[]): Promise<{ calls: CallRecord[]; endTurn: boolean } | null> {
  const ctx = { agentId: t.agentId, turnId: t.turnId, requestId: t.requestId, causedBy: t.messageIds[0] ?? null };
  const records: CallRecord[] = [];
  const woken = new Set<AgentId>();
  let endTurn = false;
  for (const call of calls) {
    if (!isRunning(t.turnId)) return null;
    update((s) => markActed(s, t.turnId));
    const out = await callTool(call.name, call.input, ctx);
    records.push({ id: call.id ?? newId("call"), name: call.name, input: call.input, result: out.result });
    out.wake?.forEach((id) => woken.add(id));
    endTurn = endTurn || !!out.endTurn;
    await sleep(getConfig().pace / 2);
  }
  woken.forEach(drain);
  return { calls: records, endTurn };
}

const requestIdsOf = (t: StartedTurn) => {
  const s = getState();
  return [...new Set(t.messageIds.map((id) => messageById(s, id)?.requestId).filter((x): x is string => !!x))];
};

function closeTurn(t: StartedTurn, status: "completed" | "interrupted" | "failed", deliveries: DeliveryStatus): void {
  update((s) => {
    const turn = s.turns.find((x) => x.id === t.turnId);
    const next = turn?.status === "running" ? patchTurn(s, t.turnId, { status, endedAt: nowIso() }) : s;
    return t.deliveryIds.reduce((acc, id) => patchDelivery(acc, id, { status: deliveries }), next);
  });
}

function relayAndDrain(t: StartedTurn, text: string, status: ReplyStatus, unblock?: string): void {
  const woken = relayOwed({ agentId: t.agentId, turnId: t.turnId, requestIds: requestIdsOf(t), text, status, unblock });
  [...woken, t.agentId].forEach(drain);
}

function finishTurn(t: StartedTurn, text: string | null): void {
  if (text) addAgentText(t, text);
  closeTurn(t, "completed", "completed");
  if (text === STEP_LIMIT_TEXT) return relayAndDrain(t, text, "blocked", "Ask me to continue, or narrow the work.");
  relayAndDrain(t, text ?? "", "done");
}

function finishStopped(t: StartedTurn): void {
  closeTurn(t, "interrupted", "cancelled");
  relayAndDrain(t, "I was stopped before I could finish.", "blocked", "Ask the person whether to continue.");
}

/** A turn that did nothing yet may run once more. One that acted is never replayed. */
function failTurn(t: StartedTurn, error: unknown): void {
  const reason = error instanceof Error ? error.message : "Unknown error";
  const s = getState();
  const replay = !s.actedTurnIds.includes(t.turnId) && t.deliveryIds.every((id) => !s.requeuedDeliveryIds.includes(id));
  closeTurn(t, "failed", replay ? "queued" : "failed");
  update((x) => {
    const requeued = replay
      ? { ...x, requeuedDeliveryIds: [...x.requeuedDeliveryIds, ...t.deliveryIds], deliveries: x.deliveries.map((d) => (t.deliveryIds.includes(d.id) ? { ...d, turnId: null } : d)) }
      : x;
    const note = replay ? `That turn failed before doing anything, so it will run once more: ${reason}` : `That turn failed: ${reason}`;
    return addNotice(requeued, t.agentId, "warning", note);
  });
  if (replay) return drain(t.agentId);
  relayAndDrain(t, `I could not finish this: ${reason}`, "blocked", "Fix the error above or give the work to someone else.");
}
