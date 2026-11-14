import { liveAsks } from "./asks";
import { openAsk } from "./brain/intake";
import { ordersOf, tracksOf } from "./roadmap";
import { requestAsk } from "./threads";
import { messageById, runningTurn, type State } from "./state";
import { addNotice } from "./state-ops";
import type { Agent, AgentId, NeedsYouItem, RunStatus, ThreadState, Turn } from "./types";

const latestTurn = (s: State, agentId: AgentId): Turn | undefined =>
  s.turns.filter((t) => t.agentId === agentId).reduce<Turn | undefined>((last, t) => (!last || t.startedAt >= last.startedAt ? t : last), undefined);

const fromPerson = (s: State, turn: Turn) =>
  turn.messageIds.some((id) => {
    const m = messageById(s, id);
    return m?.from.kind === "user" && !m.approvalId;
  });

const finalText = (s: State, turn: Turn): string | null => {
  const texts = (s.threads[turn.agentId] ?? []).filter((i) => i.kind === "agent_text" && i.turnId === turn.id);
  const last = texts[texts.length - 1];
  return last?.kind === "agent_text" ? last.text : null;
};

/**
 * A question to the person: the agent's latest turn ended with one, and the person has not written since.
 * A crew thread's final text answers the person only when the turn handled what the person typed;
 * otherwise it goes to the captain. The captain always speaks to the person.
 */
function openQuestion(s: State, agent: Agent): NeedsYouItem | null {
  const turn = latestTurn(s, agent.id);
  if (!turn || turn.status !== "completed" || runningTurn(s, agent.id)) return null;
  if (turn.messageIds.some((id) => messageById(s, id)?.inboxId)) return null;
  if (agent.kind !== "captain" && !fromPerson(s, turn)) return null;
  const text = finalText(s, turn)?.trim();
  if (!text || !/\?\s*$/m.test(text)) return null;
  const answered = s.messages.some((m) => m.from.kind === "user" && m.to.includes(agent.id) && m.at > (turn.endedAt ?? turn.startedAt));
  if (answered) return null;
  return { id: `question:${turn.id}`, agentId: agent.id, kind: "question", title: `${agent.name} asks you something`, detail: text, at: turn.endedAt ?? turn.startedAt };
}

function failure(s: State, agent: Agent): NeedsYouItem | null {
  const turn = latestTurn(s, agent.id);
  if (!turn || turn.status !== "failed" || agent.closedAt) return null;
  const notices = (s.threads[agent.id] ?? []).filter((i) => i.kind === "notice" && i.tone === "warning");
  const last = notices[notices.length - 1];
  const detail = last?.kind === "notice" ? last.text : "Its last turn failed.";
  return { id: `failed:${turn.id}`, agentId: agent.id, kind: "failed", title: `${agent.name} failed`, detail, at: turn.endedAt ?? turn.startedAt };
}

/** Pending approvals, open questions and failed threads, newest first. */
/**
 * Requests the captain recorded (they have a track) that hold no work order once its turn on them ended, while it
 * is not waiting on the person's answer about them. They are named in the captain's thread, in its next turn and in
 * DIGEST.md, so no request is dropped without a word.
 */
export function unplannedRequests(s: State): { requestId: string; ask: string }[] {
  const captain = s.agents.find((a) => a.kind === "captain");
  if (!captain) return [];
  const running = runningTurn(s, captain.id);
  const asking = openAsk(s, captain.id)?.requestId;
  return tracksOf(s.roadmap)
    .filter((t) => t.stage <= SPEC_STAGE && t.requestId !== asking)
    .filter((t) => !running?.messageIds.some((id) => messageById(s, id)?.requestId === t.requestId))
    .filter((t) => {
      const { today, backlog } = ordersOf(s.roadmap, t.requestId);
      return today.length + backlog.length === 0;
    })
    .map((t) => ({ requestId: t.requestId, ask: requestAsk(s, t.requestId) ?? t.goal?.title ?? t.requestId }));
}

const SPEC_STAGE = 2;

const unplannedNotice = (ask: string) => `Not planned yet: "${ask}" has no work order.`;

/** Names each unplanned request once in the captain's thread, when the captain's turn ends. */
export function withUnplannedNotices(s: State, captainId: AgentId): State {
  const shown = new Set((s.threads[captainId] ?? []).flatMap((i) => (i.kind === "notice" ? [i.text] : [])));
  return unplannedRequests(s)
    .map((r) => unplannedNotice(r.ask))
    .filter((text) => !shown.has(text))
    .reduce((acc, text) => addNotice(acc, captainId, "warning", text), s);
}

/** Vague asks the captain found in the inbox, each waiting on the person's answer. */
function inboxQuestions(s: State): NeedsYouItem[] {
  const captain = s.agents.find((a) => a.kind === "captain");
  if (!captain) return [];
  return (s.inbox ?? []).flatMap((item) =>
    item.candidates
      .filter((c) => c.verdict === "vague")
      .map((c) => ({ id: `inbox:${item.id}:${c.id}`, agentId: captain.id, kind: "question" as const, title: `Unclear ask from ${item.source}`, detail: `"${c.quote}" ${c.question ?? ""}`.trim(), at: item.at })),
  );
}

export function needsYou(s: State): NeedsYouItem[] {
  const approvals: NeedsYouItem[] = s.approvals
    .filter((a) => a.status === "pending")
    .map((a) => ({ id: `approval:${a.id}`, agentId: a.agentId, kind: "approval", title: a.title, detail: a.detail, approvalId: a.id, at: a.at }));
  const open = s.agents.filter((a) => !a.closedAt);
  const others = open.flatMap((a) => [openQuestion(s, a), failure(s, a)]).filter((x): x is NeedsYouItem => x !== null);
  return [...approvals, ...others, ...inboxQuestions(s)].sort((a, b) => b.at.localeCompare(a.at));
}

function runStatusOf(s: State, agent: Agent, mine: NeedsYouItem[]): RunStatus {
  if (runningTurn(s, agent.id)) return "working";
  if (mine.some((n) => n.kind === "failed")) return "failed";
  const queued = s.deliveries.some((d) => d.recipientAgentId === agent.id && d.status === "queued");
  if (queued || liveAsks(s, agent.id).length > 0 || mine.length > 0) return "waiting";
  return "idle";
}

/** Exactly one status, and separately whether the person is needed and whether the thread is closed. */
export function threadStateOf(s: State, agent: Agent, needs: NeedsYouItem[]): ThreadState {
  const closed = !!agent.closedAt;
  const mine = closed ? [] : needs.filter((n) => n.agentId === agent.id);
  return { status: closed ? "idle" : runStatusOf(s, agent, mine), needsYou: mine.some((n) => n.kind !== "failed"), closed };
}
