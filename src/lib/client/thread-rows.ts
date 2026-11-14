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
  | { kind: "notice"; id: string; item: Item<"notice"> }
  | { kind: "pull_request"; id: string; artifactId: string };

/** The turn running now. Its steps show under the activity line instead of in the thread. */
export interface LiveTurn {
  since: string;
  turnId?: TurnId;
}

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

export function timeOf(iso: string): number {
  const time = Date.parse(iso);
  return Number.isNaN(time) ? 0 : time;
}

/** Whether a step belongs to the turn running now. Without a turn id from the server, time decides. */
function isLive(step: StepItem, live: LiveTurn | null): boolean {
  if (live === null) return false;
  return live.turnId ? step.turnId === live.turnId : timeOf(step.at) >= timeOf(live.since);
}

/** The live turn's steps are left out here; the activity line shows them. */
export function buildThreadRows(items: readonly ThreadItem[], live: LiveTurn | null): ThreadRow[] {
  return items.reduce<ThreadRow[]>((rows, item) => {
    switch (item.kind) {
      case "user_text":
        return [...rows, { kind: "user", id: item.id, item }];
      case "agent_text":
        return [...rows, { kind: "text", id: item.id, item }];
      case "step":
        return isLive(item, live) ? rows : appendSteps(rows, item);
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

export function liveSteps(items: readonly ThreadItem[], live: LiveTurn): StepItem[] {
  return items.filter((item): item is StepItem => item.kind === "step" && isLive(item, live));
}

export function elapsedSince(iso: string, now: number): number {
  return Math.max(0, now - timeOf(iso));
}
