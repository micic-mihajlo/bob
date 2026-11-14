import { nowIso } from "./ids";
import type { State } from "./state";
import { addNotice, patchDelivery, patchTurn } from "./state-ops";
import type { Turn } from "./types";

export interface SweepResult {
  state: State;
  /** Turns the restart cut off. Their askers still need an answer. */
  orphanTurnIds: string[];
}

function closeOrphan(s: State, t: Turn): State {
  const acted = s.actedTurnIds.includes(t.id);
  let next = patchTurn(s, t.id, { status: "interrupted", endedAt: nowIso() });
  for (const d of next.deliveries.filter((x) => x.turnId === t.id)) {
    const replay = !acted && !next.requeuedDeliveryIds.includes(d.id);
    next = replay
      ? {
          ...patchDelivery(next, d.id, { status: "queued", turnId: null }),
          requeuedDeliveryIds: [...next.requeuedDeliveryIds, d.id],
        }
      : patchDelivery(next, d.id, { status: "failed" });
  }
  const text = acted
    ? "The server restarted while this turn was running. It had already acted, so it was not run again."
    : "The server restarted before this turn did anything. Its message is back in the queue.";
  return addNotice(next, t.agentId, "warning", text);
}

/**
 * Pure part of the boot sweep: nothing can still be running after a restart. Pending approvals are left
 * alone so the person can still decide them.
 */
export function sweepOrphans(s: State): SweepResult {
  const orphans = s.turns.filter((t) => t.status === "running");
  const swept = orphans.reduce(closeOrphan, s);
  // A changed state needs a new rev, or clients holding the old rev would not refetch.
  const state = orphans.length > 0 ? { ...swept, rev: swept.rev + 1 } : swept;
  return { state, orphanTurnIds: orphans.map((t) => t.id) };
}
