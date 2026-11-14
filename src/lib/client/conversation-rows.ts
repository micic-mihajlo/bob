import type { AgentId, Artifact, ThreadItem, TurnId } from "@/lib/types";
import { liveSteps, timeOf, type LiveTurn, type StepItem } from "./thread-rows";

type Item<K extends ThreadItem["kind"]> = Extract<ThreadItem, { kind: K }>;

/** The steps of one finished turn, as its steps row shows them. */
export interface TurnSteps {
  turnId: TurnId;
  steps: readonly StepItem[];
  /** From the turn's first item to its last. */
  durationMs: number;
}

/**
 * Failed steps the turn never got past. A failure followed by a passing call of the same tool, such
 * as an acceptance test that runs red first and green after the change, is not counted.
 */
export function unrecoveredFailures(steps: readonly StepItem[]): number {
  return steps.filter((step, index) => step.outcome === "failed" && !steps.slice(index + 1).some((later) => later.tool === step.tool && later.outcome === "ok"))
    .length;
}

/**
 * One row of the reference chat. A finished turn's steps sit above its answer, as the reference
 * draws them; a turn with no answer gets a steps row of its own where its last step was.
 */
export type ConversationRow =
  | { kind: "user"; id: string; at: string; item: Item<"user_text"> }
  | { kind: "agent"; id: string; at: string; item: Item<"agent_text">; steps: TurnSteps | null }
  | { kind: "steps"; id: string; at: string; steps: TurnSteps }
  | { kind: "sent"; id: string; at: string; item: Item<"message_out"> }
  | { kind: "received"; id: string; at: string; item: Item<"message_in"> }
  | { kind: "approval"; id: string; at: string; item: Item<"approval"> }
  | { kind: "notice"; id: string; at: string; item: Item<"notice"> }
  | { kind: "artifact"; id: string; at: string; artifactId: string };

interface TurnFacts {
  steps: StepItem[];
  answerId: string | null;
  lastStepId: string | null;
  first: number;
  last: number;
}

function turnIdOf(item: ThreadItem): TurnId | null {
  return item.kind === "step" || item.kind === "agent_text" || item.kind === "message_out" ? item.turnId : null;
}

function collectTurns(items: readonly ThreadItem[], liveIds: ReadonlySet<string>): Map<TurnId, TurnFacts> {
  const turns = new Map<TurnId, TurnFacts>();
  for (const item of items) {
    const turnId = turnIdOf(item);
    if (turnId === null) continue;
    const time = timeOf(item.at);
    const facts = turns.get(turnId) ?? { steps: [], answerId: null, lastStepId: null, first: time, last: time };
    facts.first = Math.min(facts.first, time);
    facts.last = Math.max(facts.last, time);
    if (item.kind === "agent_text") facts.answerId = item.id;
    if (item.kind === "step" && !liveIds.has(item.id)) {
      facts.steps.push(item);
      facts.lastStepId = item.id;
    }
    turns.set(turnId, facts);
  }
  return turns;
}

function stepsOf(turnId: TurnId, facts: TurnFacts): TurnSteps {
  return { turnId, steps: facts.steps, durationMs: Math.max(0, facts.last - facts.first) };
}

function rowOf(item: ThreadItem, turns: ReadonlyMap<TurnId, TurnFacts>): ConversationRow | null {
  switch (item.kind) {
    case "user_text":
      return { kind: "user", id: item.id, at: item.at, item };
    case "agent_text": {
      const facts = turns.get(item.turnId);
      const steps = facts && facts.answerId === item.id && facts.steps.length > 0 ? stepsOf(item.turnId, facts) : null;
      return { kind: "agent", id: item.id, at: item.at, item, steps };
    }
    case "step": {
      const facts = turns.get(item.turnId);
      if (!facts || facts.answerId !== null || facts.lastStepId !== item.id) return null;
      return { kind: "steps", id: `steps-${item.turnId}`, at: item.at, steps: stepsOf(item.turnId, facts) };
    }
    case "message_out":
      return { kind: "sent", id: item.id, at: item.at, item };
    case "message_in":
      return { kind: "received", id: item.id, at: item.at, item };
    case "approval":
      return { kind: "approval", id: item.id, at: item.at, item };
    case "notice":
      return { kind: "notice", id: item.id, at: item.at, item };
  }
}

function rowTurn(row: ConversationRow): TurnId | null {
  if (row.kind === "agent" || row.kind === "sent") return row.item.turnId;
  if (row.kind === "steps") return row.steps.turnId;
  return null;
}

/**
 * Where an artifact's card sits in one thread: after the turn that made it in its own thread, and in
 * another thread after the first message its author sent there afterwards. Only pull requests show
 * in other threads; a review shows in the reviewer's thread. -1 is the end; null is not shown.
 */
function anchorOf(rows: readonly ConversationRow[], agentId: AgentId, artifact: Artifact): number | null {
  if (artifact.agentId === agentId) return rows.findLastIndex((row) => rowTurn(row) === artifact.turnId);
  if (artifact.pullRequest === undefined) return null;
  const at = timeOf(artifact.at);
  const index = rows.findIndex((row) => row.kind === "received" && row.item.from === artifact.agentId && timeOf(row.item.at) >= at);
  return index < 0 ? null : index;
}

/** The rows of one thread. The running turn's steps are left out; its activity line shows them. */
export function buildConversationRows(
  items: readonly ThreadItem[],
  live: LiveTurn | null,
  agentId: AgentId,
  artifacts: readonly Artifact[],
): ConversationRow[] {
  const liveIds = new Set(live ? liveSteps(items, live).map((step) => step.id) : []);
  const turns = collectTurns(items, liveIds);
  const rows = items.flatMap((item) => {
    const row = rowOf(item, turns);
    return row ? [row] : [];
  });
  const placed = artifacts
    .filter((artifact) => artifact.pullRequest !== undefined || artifact.review !== undefined)
    .flatMap((artifact) => {
      const anchor = anchorOf(rows, agentId, artifact);
      if (anchor === null) return [];
      const row: ConversationRow = { kind: "artifact", id: `artifact-${artifact.id}`, at: artifact.at, artifactId: artifact.id };
      return [{ anchor, row }];
    });
  if (placed.length === 0) return rows;
  const after = (index: number) => placed.filter((entry) => entry.anchor === index).map((entry) => entry.row);
  return [...rows.flatMap((row, index) => [row, ...after(index)]), ...after(-1)];
}

/**
 * How long a run of messages by one sender stays one block. Beyond it the time returns, because a
 * reply an hour later is a new turn of the conversation, not a continuation.
 */
const CHAT_GROUPING_WINDOW_MS = 5 * 60_000;

/** A row of a transcript, as the two fields the grouping rule reads. */
export interface SenderRunRow {
  /** Who wrote the row: "you" or "agent". */
  author: string;
  createdAt?: string;
}

/** Do two messages fall close enough together to stay one block? An unreadable time says no. */
function withinGroupingWindow(previousIso: string | undefined, currentIso: string | undefined): boolean {
  if (previousIso === undefined || currentIso === undefined) return false;
  const previous = new Date(previousIso).getTime();
  const current = new Date(currentIso).getTime();
  if (Number.isNaN(previous) || Number.isNaN(current)) return false;
  return current - previous <= CHAT_GROUPING_WINDOW_MS;
}

/**
 * Does this row continue the run above it, and so draw no time of its own?
 *
 * `previous` is absent for the first row of the transcript, which always opens a run.
 * `previousDrawsTime` is false for a row that carries no time the reader can see, such as an
 * activity marker: the run it interrupts cannot continue under it. `startsDay` is true when a day
 * separator stands above the row, which opens a run the same way a new sender does.
 */
export function continuesSenderRun(
  previous: SenderRunRow | undefined,
  current: SenderRunRow,
  options: { previousDrawsTime: boolean; startsDay: boolean },
): boolean {
  if (previous === undefined || !options.previousDrawsTime || options.startsDay) return false;
  if (previous.author !== current.author) return false;
  return withinGroupingWindow(previous.createdAt, current.createdAt);
}

/** The sender a run of rows breaks on. */
export function senderRunRow(row: ConversationRow): SenderRunRow {
  return { author: row.kind === "user" ? "you" : row.kind === "agent" ? "agent" : row.kind, createdAt: row.at };
}

/** A row that renders only an action marker, with no bubble of its own. */
export function markerRow(row: ConversationRow): boolean {
  return row.kind === "sent" || row.kind === "received" || row.kind === "notice";
}

/**
 * Does this row draw a time of its own? A marker carries the marker's own time, and steps, an
 * approval and an artifact draw a card instead of a message row, so none can hold a run open.
 */
export function rowDrawsTime(row: ConversationRow): boolean {
  return row.kind === "user" || row.kind === "agent";
}
