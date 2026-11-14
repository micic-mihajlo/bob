import type { State } from "../state";
import type { AgentId, Message, ThreadItem } from "../types";

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

/**
 * The ask a person's next message to the captain answers: the first thing they typed in an intake the
 * captain answered with a question. Null when no question is open, so a new message starts a new request.
 */
export function openAsk(s: State, captainId: AgentId): Message | null {
  const items = s.threads[captainId] ?? [];
  if (pushbackRounds(items) === 0) return null;
  const since = [...items].reverse().find((i) => i.kind === "step" && i.tool === "set_goal")?.at ?? "";
  return (
    s.messages.find((m) => m.from.kind === "user" && m.to.includes(captainId) && !m.approvalId && !m.continues && m.at > since) ?? null
  );
}

/** The captain's last question before a person's answer, for the why trace. */
export function questionBefore(s: State, captainId: AgentId, answer: Message): string | null {
  const items = s.threads[captainId] ?? [];
  const shown = items.map((i) => i.kind === "user_text" && i.text === answer.text).lastIndexOf(true);
  const asked = items.slice(0, shown < 0 ? items.length : shown).filter((i) => i.kind === "agent_text" && i.text.includes("?"));
  const last = asked[asked.length - 1];
  return last?.kind === "agent_text" ? last.text : null;
}
