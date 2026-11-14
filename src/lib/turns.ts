import { autopilotCalls } from "./autopilot";
import { brainKind, getBrain } from "./brain";
import { runSdkTurn, usesSdk } from "./brain/agent-sdk";
import type { CallRecord, MoveRecord, ToolCallRequest } from "./brain/types";
import { globals } from "./globals";
import { newId, nowIso } from "./ids";
import type { ReplyStatus } from "./reply-format";
import { relayOwed } from "./relay";
import { withUnplannedNotices } from "./thread-status";
import { closePending } from "./threads";
import { agentById, messageById, type State } from "./state";
import { addNotice, addThreadItem, patchDelivery, patchTurn, stamp } from "./state-ops";
import { liveMove } from "./live";
import { getConfig, getState, transact, update } from "./store";
import { preloadedFiles, workspaceContext } from "./thread-workspace";
import { callTool } from "./tools";
import { conflictLeft } from "./tools/pull-requests";
import { buildContext } from "./turn-context";
import { planTurn, type StartedTurn } from "./turn-start";
import type { AgentId, DeliveryStatus } from "./types";

/** Moves per turn. Crew threads read, write, commit and check in their workspace, so they get more. */
export const MAX_MOVES = 8;
export const MAX_CAPTAIN_MOVES = 12;
export const MAX_CREW_MOVES = 24;
/** A review or research thread reads and checks; it never writes code, so it gets fewer moves. */
export const MAX_CHECK_MOVES = 12;

/** Wall-clock budget for one turn, checked before every move. */
export const MAX_TURN_MS = 10 * 60_000;
/** Moves left when the turn is told to wrap up, so it reports what it has instead of running out. */
const WRAP_UP_AT = 3;

const STEP_LIMIT_TEXT = "I reached the step limit for this turn before finishing.";
const TIME_LIMIT_TEXT = "I ran out of time for this turn before finishing.";

const FINISH: Record<string, string> = {
  build: "open or update your pull request if you have a change, then report what is done and what is not",
  review: "record_review with the verdict your evidence supports, then report",
  research: "record what you found, then report",
};

/** Calls that finish a turn's job, with the answer they leave. Once one has run, a step or time limit does not fail the turn. */
const TERMINAL: Record<string, (r: Record<string, unknown>) => string> = {
  report: () => "Reported.",
  record_review: (r) => `Recorded my review of #${r.pullRequest}: ${r.verdict === "approve" ? "approved" : "changes requested"}.`,
  open_pull_request: (r) => `Opened pull request #${r.number} (id ${r.pullRequestId}) on branch ${r.branch}.`,
  record_note: () => "Recorded what I found.",
};
const EDITS = new Set(["write_files", "edit_files"]);

/** The answer of a turn whose last successful terminal call came after its last file change, else null. */
function finishedWork(moves: MoveRecord[]): string | null {
  const calls = moves.flatMap((m) => m.calls).filter((c) => !("error" in c.result));
  const at = calls.findLastIndex((c) => c.name in TERMINAL);
  if (at < 0 || calls.slice(at + 1).some((c) => EDITS.has(c.name))) return null;
  return TERMINAL[calls[at].name](calls[at].result);
}

const wrapUpNote = (left: number, role: string | undefined) =>
  `Budget (data): you have ${left} move${left === 1 ? "" : "s"} left in this turn. Stop exploring and finish now: ${FINISH[role ?? ""] ?? "answer with what you have"}.`;

function maxMoves(agentId: AgentId): number {
  const agent = agentById(getState(), agentId);
  if (agent?.kind === "crew") return agent.crewRole === "build" ? MAX_CREW_MOVES : MAX_CHECK_MOVES;
  return agent?.kind === "captain" ? MAX_CAPTAIN_MOVES : MAX_MOVES;
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

/** The step pace is for the scripted brain, whose moves are instant; a model's own latency already paces the UI. */
const pace = () => (brainKind() === "model" && !globals().brainOverride ? 0 : getConfig().pace);

const briefOf = (s: State, t: StartedTurn) => t.messageIds.map((id) => messageById(s, id)?.text ?? "").join("\n");

async function runTurn(t: StartedTurn): Promise<void> {
  const initial = getState();
  const workspace = await workspaceContext(initial, t.agentId, briefOf(initial, t));
  const preloaded = preloadedFiles(workspace);
  if (preloaded.length > 0) {
    const label = `Read ${preloaded.length} file${preloaded.length === 1 ? "" : "s"}`;
    const detail = `Loaded into this turn's first message:\n${preloaded.join("\n")}`;
    update((s) => addThreadItem(s, t.agentId, { kind: "step", ...stamp(), turnId: t.turnId, tool: "read_files", label, outcome: "ok", seconds: 0, detail }));
  }
  const moves: MoveRecord[] = [];
  let final: string | null = STEP_LIMIT_TEXT;
  const limit = maxMoves(t.agentId);
  const started = Date.now();
  for (let calls = autopilotCalls(getState(), t, moves); calls.length > 0; calls = autopilotCalls(getState(), t, moves)) {
    const executed = await executeMove(t, calls);
    if (!executed) return finishStopped(t);
    moves.push({ text: null, calls: executed.calls });
    if (executed.endTurn) return finishTurn(t, null);
  }
  if (usesSdk(t.agentId)) return runSdk(t, initial, moves, workspace);
  for (let i = 0; i < limit; i++) {
    if (Date.now() - started > MAX_TURN_MS) {
      final = TIME_LIMIT_TEXT;
      break;
    }
    await sleep(pace());
    const built = isRunning(t.turnId) ? buildContext(getState(), initial, t, moves, workspace) : null;
    if (!built) return finishStopped(t);
    const left = limit - i;
    const ctx = left <= WRAP_UP_AT ? { ...built, input: `${built.input}\n\n${wrapUpNote(left, built.agent.crewRole)}` } : built;
    const live = liveMove(t.agentId, t.turnId);
    const move = await getBrain().next(ctx, live).finally(() => live.stop());
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
  await finishChecked(t, final === STEP_LIMIT_TEXT || final === TIME_LIMIT_TEXT ? (finishedWork(moves) ?? final) : final);
}

/** BOB_ENGINE=sdk: one coding-agent query in place of the move loop, ending the way the loop would. */
async function runSdk(t: StartedTurn, initial: State, moves: MoveRecord[], workspace: string | null): Promise<void> {
  const built = isRunning(t.turnId) ? buildContext(getState(), initial, t, moves, workspace) : null;
  if (!built) return finishStopped(t);
  const { outcome, moves: made } = await runSdkTurn(built, t.messageIds[0] ?? null, liveMove(t.agentId, t.turnId), drain, MAX_TURN_MS);
  if (outcome.kind === "stopped" || !isRunning(t.turnId)) return finishStopped(t);
  if (outcome.kind === "ended") return finishChecked(t, null);
  if (outcome.kind === "answered") return finishChecked(t, outcome.text);
  await finishChecked(t, finishedWork([...moves, ...made]) ?? (outcome.kind === "time_limit" ? TIME_LIMIT_TEXT : STEP_LIMIT_TEXT));
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
    await sleep(pace() / 2);
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
    const closed = closePending(t.deliveryIds.reduce((acc, id) => patchDelivery(acc, id, { status: deliveries }), next));
    return agentById(closed, t.agentId)?.kind === "captain" ? withUnplannedNotices(closed, t.agentId) : closed;
  });
}

function relayAndDrain(t: StartedTurn, text: string, status: ReplyStatus, unblock?: string): void {
  const woken = relayOwed({ agentId: t.agentId, turnId: t.turnId, requestIds: requestIdsOf(t), text, status, unblock });
  [...woken, t.agentId].forEach(drain);
}

/** A turn that hit its step or time limit before its terminal call ends failed, with a notice and a blocked report, so nothing waits on it. */
function finishTurn(t: StartedTurn, text: string | null): void {
  if (text !== STEP_LIMIT_TEXT && text !== TIME_LIMIT_TEXT) {
    if (text) addAgentText(t, text);
    closeTurn(t, "completed", "completed");
    return relayAndDrain(t, text ?? "", "done");
  }
  update((s) => addNotice(s, t.agentId, "warning", text));
  closeTurn(t, "failed", "failed");
  relayAndDrain(t, `${text} ${progressOf(t)}`, "blocked", "Ask me to continue from my branch, or narrow the work.");
}

/** A turn asked to bring its pull request up to date with main never ends done while it still conflicts: it reports blocked instead. */
async function finishChecked(t: StartedTurn, text: string | null): Promise<void> {
  const left = text === STEP_LIMIT_TEXT || text === TIME_LIMIT_TEXT ? null : await conflictLeft(getState(), t.turnId);
  if (!left) return finishTurn(t, text);
  if (text) addAgentText(t, text);
  closeTurn(t, "completed", "completed");
  relayAndDrain(t, left, "blocked", "Ask me again to merge main into my branch, or resolve the conflict by hand.");
}

/** What the turn got done, for the report a limit forces: its last few steps. */
function progressOf(t: StartedTurn): string {
  const steps = (getState().threads[t.agentId] ?? []).filter((i) => i.kind === "step" && i.turnId === t.turnId);
  if (steps.length === 0) return "No steps ran.";
  const last = steps.slice(-4).map((i) => (i.kind === "step" ? i.label : "")).join("; ");
  return `${steps.length} steps ran; the last were: ${last}.`;
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
