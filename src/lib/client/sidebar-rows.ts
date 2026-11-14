import type { Agent, AgentId, Snapshot } from "@/lib/types";
import { CREW_GROUPS, sidebarModel, threadStatusOf } from "./crew";
import { needsYouItems } from "./needs-you";

/** What a row in "Needs you" waits on. It picks the badge, the chip and the hint. */
export type SidebarWaitReason = "question" | "approval" | "failed";

/** The one mark a row's avatar carries, as the reference sidebar draws it. */
export type SidebarAgentState =
  | { kind: "working" }
  | { kind: "waiting"; reason: SidebarWaitReason; detail: string }
  | { kind: "unread"; count: number }
  | { kind: "failed" };

export interface SidebarSectionModel {
  id: string;
  /** Null for the unheaded first section, which holds the captain. */
  name: string | null;
  agents: readonly Agent[];
  collapsedByDefault: boolean;
}

export interface SidebarListModel {
  waiting: readonly { agent: Agent; reason: SidebarWaitReason; detail: string }[];
  sections: readonly SidebarSectionModel[];
  states: Readonly<Record<AgentId, SidebarAgentState>>;
  /** A thread's subagents, drawn nested under its row and never on their own. */
  subagents: Readonly<Record<AgentId, readonly Agent[]>>;
}

/**
 * The sidebar as the reference draws it: "Needs you" first, then the captain, then crew threads by
 * status, then standing agents. A thread that needs the person sits only in "Needs you".
 */
export function sidebarList(snapshot: Snapshot): SidebarListModel {
  const { captain, crew, standing } = sidebarModel(snapshot);
  const agents = new Map(snapshot.agents.map((agent) => [agent.id, agent] as const));
  const waiting: { agent: Agent; reason: SidebarWaitReason; detail: string }[] = [];
  for (const item of needsYouItems(snapshot)) {
    const agent = agents.get(item.agentId);
    if (!agent || agent.kind === "subagent" || waiting.some((entry) => entry.agent.id === agent.id)) continue;
    waiting.push({ agent, reason: item.kind, detail: item.title || item.detail });
  }
  const waitingIds = new Set(waiting.map((entry) => entry.agent.id));
  const outside = (list: readonly Agent[]) => list.filter((agent) => !waitingIds.has(agent.id));

  const sections: SidebarSectionModel[] = [
    { id: "captain", name: null, agents: outside(captain ? [captain] : []), collapsedByDefault: false },
    ...CREW_GROUPS.map((group) => ({
      id: group.id,
      name: group.label,
      agents: outside(crew[group.id]),
      collapsedByDefault: group.id === "closed",
    })),
    { id: "agents", name: "Agents", agents: outside(standing), collapsedByDefault: false },
  ].filter((section) => section.agents.length > 0);

  const states: Record<AgentId, SidebarAgentState> = {};
  for (const agent of snapshot.agents) {
    const wait = waiting.find((entry) => entry.agent.id === agent.id);
    const unread = snapshot.threads[agent.id]?.unread ?? 0;
    if (wait) states[agent.id] = { kind: "waiting", reason: wait.reason, detail: wait.detail };
    else if (threadStatusOf(snapshot, agent) === "failed") states[agent.id] = { kind: "failed" };
    else if (snapshot.activity[agent.id]?.state === "working") states[agent.id] = { kind: "working" };
    else if (unread > 0) states[agent.id] = { kind: "unread", count: unread };
  }

  const subagents: Record<AgentId, Agent[]> = {};
  for (const agent of snapshot.agents) {
    if (agent.kind === "subagent" && agent.parentAgentId) (subagents[agent.parentAgentId] ??= []).push(agent);
  }

  return { waiting, sections, states, subagents };
}

/** The time slot of a row: the clock today, the date before. */
export function sidebarMessageTime(value: string | undefined, now = new Date()): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  if (date.toDateString() === now.toDateString()) {
    return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
  }
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}
