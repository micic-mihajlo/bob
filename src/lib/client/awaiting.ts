import type { ThreadItem } from "@/lib/types";

/** A message the person just sent: how many items the thread held before it, and when it went (client clock). */
export interface Awaiting {
  count: number;
  at: number;
}

/** Past this, an agent that has not moved is not "about to answer"; the pending state gives up rather than spin forever. */
export const AWAITING_MS = 20_000;

/**
 * Whether the person's message still waits for the agent's first sign of life: nothing but their own
 * message has landed since they sent it. The moment a step, a reply or a notice lands, the real
 * activity line takes over.
 */
export function stillAwaiting(awaiting: Awaiting | undefined, items: readonly ThreadItem[], now: number): boolean {
  if (!awaiting || now - awaiting.at > AWAITING_MS) return false;
  return items.slice(awaiting.count).every((item) => item.kind === "user_text");
}
