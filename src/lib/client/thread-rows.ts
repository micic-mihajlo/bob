import type { AgentId, MessageId, ThreadItem, TurnId } from "@/lib/types";

type Item<K extends ThreadItem["kind"]> = Extract<ThreadItem, { kind: K }>;

export type StepItem = Item<"step">;
export type OutgoingItem = Item<"message_out">;

/** One recipient of one sent message. A message to three agents is three of these. */
export interface SentEntry {
  key: string;
  messageId: MessageId;
  agentId: AgentId;
  text: string;
  expectsReply: boolean;
  at: string;
}

/** What the thread renders. Raw items are folded so a turn reads as a few lines, not a log. */
export type ThreadRow =
  | { kind: "user"; id: string; item: Item<"user_text"> }
  | { kind: "text"; id: string; item: Item<"agent_text"> }
  | { kind: "steps"; id: string; steps: readonly StepItem[] }
  | { kind: "sent"; id: string; turnId: TurnId; entries: readonly SentEntry[] }
  | { kind: "received"; id: string; item: Item<"message_in"> }
  | { kind: "approval"; id: string; item: Item<"approval"> }
  | { kind: "notice"; id: string; item: Item<"notice"> };

function entriesOf(item: OutgoingItem): SentEntry[] {
  return item.to.map((agentId) => ({
    key: `${item.messageId}:${agentId}`,
    messageId: item.messageId,
    agentId,
    text: item.text,
    expectsReply: item.expectsReply,
    at: item.at,
  }));
}

function appendSteps(rows: readonly ThreadRow[], step: StepItem): ThreadRow[] {
  const last = rows.at(-1);
  if (last?.kind === "steps") return [...rows.slice(0, -1), { ...last, steps: [...last.steps, step] }];
  return [...rows, { kind: "steps", id: `steps-${step.id}`, steps: [step] }];
}

/**
 * Messages sent in one turn fold into one block, even when tool steps sit between them. The steps
 * stay in the thread, after the block.
 */
function appendSent(rows: readonly ThreadRow[], item: OutgoingItem): ThreadRow[] {
  const last = rows.at(-1);
  const beforeLast = rows.at(-2);
  if (last?.kind === "sent" && last.turnId === item.turnId) {
    return [...rows.slice(0, -1), { ...last, entries: [...last.entries, ...entriesOf(item)] }];
  }
  if (last?.kind === "steps" && beforeLast?.kind === "sent" && beforeLast.turnId === item.turnId) {
    const merged: ThreadRow = { ...beforeLast, entries: [...beforeLast.entries, ...entriesOf(item)] };
    return [...rows.slice(0, -2), merged, last];
  }
  return [...rows, { kind: "sent", id: `sent-${item.id}`, turnId: item.turnId, entries: entriesOf(item) }];
}

function timeOf(iso: string): number {
  const time = Date.parse(iso);
  return Number.isNaN(time) ? 0 : time;
}

/** Whether a step belongs to the turn running now. The activity has no turn id, so time decides. */
function isLive(step: StepItem, liveSince: number | null): boolean {
  return liveSince !== null && timeOf(step.at) >= liveSince;
}

/**
 * `liveSince` is the start of the turn that is running now. Its steps show under the activity line
 * instead of in the thread, so they are left out here.
 */
export function buildThreadRows(items: readonly ThreadItem[], liveSince: string | null): ThreadRow[] {
  const since = liveSince === null ? null : timeOf(liveSince);
  return items.reduce<ThreadRow[]>((rows, item) => {
    switch (item.kind) {
      case "user_text":
        return [...rows, { kind: "user", id: item.id, item }];
      case "agent_text":
        return [...rows, { kind: "text", id: item.id, item }];
      case "step":
        return isLive(item, since) ? rows : appendSteps(rows, item);
      case "message_out":
        return appendSent(rows, item);
      case "message_in":
        return [...rows, { kind: "received", id: item.id, item }];
      case "approval":
        return [...rows, { kind: "approval", id: item.id, item }];
      case "notice":
        return [...rows, { kind: "notice", id: item.id, item }];
    }
  }, []);
}

export function liveSteps(items: readonly ThreadItem[], since: string): StepItem[] {
  const start = timeOf(since);
  return items.filter((item): item is StepItem => item.kind === "step" && timeOf(item.at) >= start);
}

export function elapsedSince(iso: string, now: number): number {
  return Math.max(0, now - timeOf(iso));
}
