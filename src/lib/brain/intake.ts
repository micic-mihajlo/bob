import { trackOf } from "../roadmap";
import type { State } from "../state";
import type { AgentId, InboxCandidate, InboxItem, Message, ThreadItem } from "../types";

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
 * The ask a person's next message to the captain answers: the newest thing they typed that the captain answered
 * with a question and has not recorded as an intent yet. Null when no question is open, so a new message starts a
 * new request. A request the person started while a question was open does not close that question.
 */
/** The newest inbox ask still waiting on the person's answer, with the inbox item it came from. */
export function openInboxQuestion(s: State): { item: InboxItem; candidate: InboxCandidate } | null {
  for (const item of [...(s.inbox ?? [])].reverse()) {
    const candidate = item.candidates.findLast((c) => c.verdict === "vague");
    if (candidate) return { item, candidate };
  }
  return null;
}

/**
 * The person's decision the captain asked about: its latest turn handled a denied merge card and ended on a
 * question, and the person has not written since. The answer joins that request.
 */
export function openFollowUp(s: State, captainId: AgentId): Message | null {
  const turn = s.turns.filter((t) => t.agentId === captainId).at(-1);
  if (!turn || turn.status !== "completed") return null;
  const denial = turn.messageIds.map((id) => s.messages.find((m) => m.id === id)).find((m) => !!m?.approvalId && s.approvals.find((a) => a.id === m.approvalId)?.status === "denied");
  if (!denial) return null;
  const final = (s.threads[captainId] ?? []).filter((i) => i.kind === "agent_text" && i.turnId === turn.id).at(-1);
  if (final?.kind !== "agent_text" || !final.text.includes("?")) return null;
  const since = turn.endedAt ?? turn.startedAt;
  return s.messages.some((m) => m.from.kind === "user" && m.to.includes(captainId) && m.at > since) ? null : denial;
}

export function openAsk(s: State, captainId: AgentId): Message | null {
  const items = s.threads[captainId] ?? [];
  const acted = new Set(items.flatMap((i) => (i.kind === "step" ? [i.turnId] : [])));
  const questionTurns = new Set(items.flatMap((i) => (i.kind === "agent_text" && i.text.includes("?") && !acted.has(i.turnId) ? [i.turnId] : [])));
  const requestOf = (id: string) => s.messages.find((m) => m.id === id)?.requestId;
  const asks = s.messages.filter((m) => m.from.kind === "user" && m.to.includes(captainId) && !m.approvalId && !m.inboxId && !m.continues);
  return (
    [...asks].reverse().find((ask) => {
      if (trackOf(s.roadmap, ask.requestId)?.goal) return false;
      const asked = s.turns.map((t, i) => [t, i] as const).filter(([t]) => questionTurns.has(t.id) && t.messageIds.some((id) => requestOf(id) === ask.requestId)).at(-1);
      if (!asked) return false;
      const seen = new Set(s.turns.slice(0, asked[1] + 1).flatMap((t) => t.messageIds));
      return !s.messages.some((m) => m.continues === ask.id && !seen.has(m.id));
    }) ?? null
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
