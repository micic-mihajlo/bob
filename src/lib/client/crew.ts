import type { Agent, AgentId, Snapshot, ThreadStatus } from "@/lib/types";

/**
 * The captain is `kind: "captain"`. Until the server sets kinds, the orchestrator plays the part, so
 * a snapshot without the new fields still has one pinned row.
 */
export function findCaptain(agents: readonly Agent[]): Agent | undefined {
  return agents.find((agent) => agent.kind === "captain") ?? agents.find((agent) => agent.kind === undefined && agent.role === "orchestrator");
}

export function isCrew(agent: Agent | undefined): boolean {
  return agent?.kind === "crew";
}

/** The handle shown in markers, status lines and chips: a crew thread's code, anyone else's name. */
export function displayName(agent: Pick<Agent, "code" | "name">): string {
  return agent.code ?? agent.name;
}

export function threadStatusOf(snapshot: Snapshot, agent: Agent): ThreadStatus {
  const given = snapshot.threadStatus?.[agent.id];
  if (given) return given;
  if (agent.closedAt) return "closed";
  const state = snapshot.activity[agent.id]?.state;
  return state === "needs_you" || state === "working" || state === "waiting" ? state : "idle";
}

export const THREAD_STATUS_LABEL: Record<ThreadStatus, string> = {
  working: "Working",
  waiting: "Waiting",
  needs_you: "Needs you",
  failed: "Failed",
  idle: "Idle",
  closed: "Closed",
};

export type CrewGroupId = "working" | "waiting" | "idle" | "closed";

/** Six statuses, four groups: a thread that needs the person or failed is waiting on someone to act. */
const GROUP_OF: Record<ThreadStatus, CrewGroupId> = {
  working: "working",
  waiting: "waiting",
  needs_you: "waiting",
  failed: "waiting",
  idle: "idle",
  closed: "closed",
};

export const CREW_GROUPS: ReadonlyArray<{ id: CrewGroupId; label: string }> = [
  { id: "working", label: "Working" },
  { id: "waiting", label: "Waiting" },
  { id: "idle", label: "Idle" },
  { id: "closed", label: "Closed" },
];

export interface SidebarModel {
  captain: Agent | undefined;
  crew: Readonly<Record<CrewGroupId, readonly Agent[]>>;
  /** Agents a person made, which are neither the captain nor crew. */
  standing: readonly Agent[];
}

function newestFirst(a: Agent, b: Agent): number {
  return Date.parse(b.closedAt ?? b.createdAt) - Date.parse(a.closedAt ?? a.createdAt);
}

export function sidebarModel(snapshot: Snapshot): SidebarModel {
  const captain = findCaptain(snapshot.agents);
  const crew = snapshot.agents.filter(isCrew).sort(newestFirst);
  const inGroup = (id: CrewGroupId) => crew.filter((agent) => GROUP_OF[threadStatusOf(snapshot, agent)] === id);
  return {
    captain,
    crew: { working: inGroup("working"), waiting: inGroup("waiting"), idle: inGroup("idle"), closed: inGroup("closed") },
    standing: snapshot.agents.filter((agent) => agent.id !== captain?.id && !isCrew(agent)),
  };
}

/** Every crew thread, live ones first in group order, closed ones last. */
export function crewInOrder(snapshot: Snapshot): Agent[] {
  const { crew } = sidebarModel(snapshot);
  return CREW_GROUPS.flatMap((group) => crew[group.id]);
}

export function nameOf(agents: ReadonlyMap<AgentId, Agent>, id: AgentId): string {
  const agent = agents.get(id);
  return agent ? displayName(agent) : "a former teammate";
}
