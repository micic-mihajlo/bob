import type { Agent, AgentActivity, AgentId, ThreadStatus, ThreadView, WaitingOn } from "@/lib/types";
import { displayName } from "./crew";
import { formatClock } from "./format";
import { lastSpokenLine } from "./selectors";

/** The one mark a sidebar row shows. Waiting on the person outranks everything, unread comes last. */
export type AgentIndicator =
  | { kind: "needs_you" }
  | { kind: "working" }
  | { kind: "waiting" }
  | { kind: "unread"; count: number }
  | { kind: "none" };

export function indicatorFor(activity: AgentActivity | undefined, thread: ThreadView | undefined): AgentIndicator {
  switch (activity?.state) {
    case "needs_you":
      return { kind: "needs_you" };
    case "working":
      return { kind: "working" };
    case "waiting":
      return { kind: "waiting" };
    default:
      return (thread?.unread ?? 0) > 0 ? { kind: "unread", count: thread?.unread ?? 0 } : { kind: "none" };
  }
}

function namesOf(ids: readonly AgentId[], agents: ReadonlyMap<AgentId, Agent>): string {
  const names = ids.map((id) => {
    const agent = agents.get(id);
    return agent ? displayName(agent) : "a teammate";
  });
  if (names.length <= 2) return names.join(" and ");
  return `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`;
}

export function statusLine(
  agent: Agent,
  activity: AgentActivity | undefined,
  thread: ThreadView | undefined,
  agents: ReadonlyMap<AgentId, Agent>,
): string {
  switch (activity?.state) {
    case "needs_you":
      return activity.reason;
    case "working":
      return activity.step ?? "Working";
    case "waiting":
      return `Waiting on ${namesOf(activity.onAgentIds, agents)}`;
    default:
      return lastSpokenLine(thread) ?? (agent.kind === "captain" ? "Say what you want built" : agent.title);
  }
}

/** A crew thread's line also says when it closed or stopped on an error, which activity alone cannot. */
export function threadLine(
  agent: Agent,
  status: ThreadStatus,
  activity: AgentActivity | undefined,
  thread: ThreadView | undefined,
  agents: ReadonlyMap<AgentId, Agent>,
): string {
  if (status === "closed") return agent.closedAt ? `Closed at ${formatClock(agent.closedAt)}` : "Closed";
  if (status === "failed") return "Stopped on an error";
  return statusLine(agent, activity, thread, agents);
}

export type ReplyState = WaitingOn["state"] | "informed";

/** The state of one recipient of a sent message. With no waiting row, a message that wanted no reply was a heads-up. */
export function replyStateOf(
  waitingOn: readonly WaitingOn[],
  messageId: string,
  agentId: AgentId,
  expectsReply: boolean,
): ReplyState {
  const row = waitingOn.find((entry) => entry.messageId === messageId && entry.agentId === agentId);
  if (row) return row.state;
  return expectsReply ? "replied" : "informed";
}

export const REPLY_STATE_LABEL: Record<ReplyState, string> = {
  asked: "Asked",
  working: "Working",
  replied: "Replied",
  failed: "Failed",
  informed: "Informed",
};

export function isSettled(state: ReplyState): boolean {
  return state === "replied" || state === "failed" || state === "informed";
}
