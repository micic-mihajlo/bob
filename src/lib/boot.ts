import { nowIso } from "./ids";
import type { State } from "./state";
import { addNotice, patchDelivery, patchTurn } from "./state-ops";
import type { ThreadItem, Turn } from "./types";

export interface SweepResult {
  state: State;
  /** Turns the restart cut off. Their askers still need an answer. */
  orphanTurnIds: string[];
}

/**
 * Tools a cut-off turn may run again after a restart: they read, or they set the same result when called
 * twice. Everything else (starting a thread, messages, reports, approvals, reviews, merges, today's
 * schedule) would happen twice, so a turn that called one is not run again. Unknown tools count as unsafe.
 */
export const REPLAY_SAFE_TOOLS: ReadonlySet<string> = new Set([
  "list_files",
  "read_file",
  "write_file",
  "edit_file",
  "git",
  "open_pull_request",
  "list_threads",
  "list_agents",
  "write_drive",
  "set_goal",
]);

type Step = Extract<ThreadItem, { kind: "step" }>;

const stepsOf = (s: State, t: Turn): Step[] => (s.threads[t.agentId] ?? []).filter((i): i is Step => i.kind === "step" && i.turnId === t.id);

const listed = (steps: Step[]) => steps.map((i) => i.label).join("; ");

function noticeFor(steps: Step[], unsafe: Step[], replay: boolean, acted: boolean): string {
  const done = steps.length > 0 ? ` after: ${listed(steps)}` : "";
  if (replay && steps.length === 0) return "The server restarted before this turn did anything. Its message is back in the queue.";
  if (replay) return `The server restarted while this turn was running,${done}. None of that changes anything when done twice, so its message is back in the queue and the turn runs again from it.`;
  if (unsafe.length > 0) return `The server restarted while this turn was running,${done}. ${listed(unsafe)} must not happen twice, so the turn was not run again.`;
  return acted ? "The server restarted while this turn was running. It had already acted, so it was not run again." : "The server restarted while this turn was running.";
}

/**
 * A cut-off turn runs again from its messages when every step it took is safe to repeat; otherwise its
 * deliveries fail with a notice naming what must not happen twice, and boot answers its askers.
 */
function closeOrphan(s: State, t: Turn): State {
  const acted = s.actedTurnIds.includes(t.id);
  const steps = stepsOf(s, t);
  const unsafe = steps.filter((i) => !REPLAY_SAFE_TOOLS.has(i.tool));
  const safeToRepeat = unsafe.length === 0 && (steps.length > 0 || !acted);
  let next = patchTurn(s, t.id, { status: "interrupted", endedAt: nowIso() });
  let replayed = false;
  for (const d of next.deliveries.filter((x) => x.turnId === t.id)) {
    const replay = safeToRepeat && !next.requeuedDeliveryIds.includes(d.id);
    replayed = replayed || replay;
    next = replay
      ? { ...patchDelivery(next, d.id, { status: "queued", turnId: null }), requeuedDeliveryIds: [...next.requeuedDeliveryIds, d.id] }
      : patchDelivery(next, d.id, { status: "failed" });
  }
  if (!replayed) next = { ...next, actedTurnIds: next.actedTurnIds.includes(t.id) ? next.actedTurnIds : [...next.actedTurnIds, t.id] };
  return addNotice(next, t.agentId, "warning", noticeFor(steps, unsafe, replayed, acted));
}

/**
 * Pure part of the boot sweep: nothing can still be running after a restart. Pending approvals, queued
 * deliveries and the captain's files are kept as saved, so the person can still decide and work resumes.
 */
export function sweepOrphans(s: State): SweepResult {
  const orphans = s.turns.filter((t) => t.status === "running");
  const swept = orphans.reduce(closeOrphan, s);
  // A changed state needs a new rev, or clients holding the old rev would not refetch.
  const state = orphans.length > 0 ? { ...swept, rev: swept.rev + 1 } : swept;
  return { state, orphanTurnIds: orphans.map((t) => t.id) };
}
