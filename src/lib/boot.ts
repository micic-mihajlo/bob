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
 * Tools that read, or set the same result when called twice. A turn cut off after only these runs again from
 * its message. After anything else (starting a thread, messages, reports, approvals, reviews, merges, the
 * roadmap) it still runs again, but its notice names what already happened, so it picks up from the state
 * instead of repeating it. Unknown tools count as unsafe.
 */
export const REPLAY_SAFE_TOOLS: ReadonlySet<string> = new Set([
  "list_files",
  "read_files",
  "write_files",
  "edit_files",
  "run",
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

function noticeFor(steps: Step[], unsafe: Step[], replay: boolean, failed: boolean): string {
  const done = steps.length > 0 ? ` after: ${listed(steps)}` : "";
  if (failed) return `The server restarted while this turn was running${done}. It was already cut off once, so it was not run again.`;
  if (!replay) return `The server restarted while this turn was running${done}. It had already answered, so it was not run again.`;
  if (steps.length === 0) return "The server restarted before this turn did anything. Its message is back in the queue.";
  if (unsafe.length === 0) return `The server restarted while this turn was running,${done}. None of that changes anything when done twice, so its message is back in the queue and the turn runs again from it.`;
  return `The server restarted while this turn was running,${done}. Its message is back in the queue, and the turn picks up from where things stand: ${listed(unsafe)} already happened and must not happen twice.`;
}

/**
 * A cut-off turn runs again from its messages, once: an answered delivery is complete, a delivery already
 * requeued by an earlier restart fails and boot answers its asker. The notice tells the new turn what the
 * cut-off one already did.
 */
function closeOrphan(s: State, t: Turn): State {
  const steps = stepsOf(s, t);
  const unsafe = steps.filter((i) => !REPLAY_SAFE_TOOLS.has(i.tool));
  let next = patchTurn(s, t.id, { status: "interrupted", endedAt: nowIso() });
  let replayed = false;
  let failed = false;
  for (const d of next.deliveries.filter((x) => x.turnId === t.id)) {
    if (d.answered) {
      next = patchDelivery(next, d.id, { status: "completed" });
      continue;
    }
    const replay = !next.requeuedDeliveryIds.includes(d.id);
    replayed = replayed || replay;
    failed = failed || !replay;
    next = replay
      ? { ...patchDelivery(next, d.id, { status: "queued", turnId: null }), requeuedDeliveryIds: [...next.requeuedDeliveryIds, d.id] }
      : patchDelivery(next, d.id, { status: "failed" });
  }
  if (!replayed) next = { ...next, actedTurnIds: next.actedTurnIds.includes(t.id) ? next.actedTurnIds : [...next.actedTurnIds, t.id] };
  return addNotice(next, t.agentId, "warning", noticeFor(steps, unsafe, replayed, failed));
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
