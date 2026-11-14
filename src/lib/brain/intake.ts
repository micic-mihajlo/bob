import type { ThreadItem } from "../types";

/** Rounds of questions the captain may ask about one request before it goes on with stated assumptions. */
export const MAX_PUSHBACK_ROUNDS = 2;

/** The captain's thread since it last recorded an intent with set_goal: the current intake. */
function sinceLastIntent(items: ThreadItem[]): ThreadItem[] {
  const last = items.map((i) => i.kind === "step" && i.tool === "set_goal").lastIndexOf(true);
  return items.slice(last + 1);
}

/** What the person typed during the current intake, oldest first. */
export function intakeTexts(items: ThreadItem[]): string[] {
  return sinceLastIntent(items).flatMap((i) => (i.kind === "user_text" ? [i.text] : []));
}

/**
 * Rounds of questions asked during the current intake: turns that ended with a question and called no
 * tool. Counted from the thread itself, so a restart or a model change cannot reset it.
 */
export function pushbackRounds(items: ThreadItem[]): number {
  const recent = sinceLastIntent(items);
  const acted = new Set(recent.flatMap((i) => (i.kind === "step" ? [i.turnId] : [])));
  return recent.filter((i) => i.kind === "agent_text" && !acted.has(i.turnId) && i.text.trim().includes("?")).length;
}
