import type { Agent, AgentId, ThreadItem } from "@/lib/types";

/**
 * Which sent messages started a crew thread, keyed like a sent entry ("messageId:agentId"). No thread
 * item marks a start, so it is the first message this thread sent to a crew thread it created, or,
 * for the captain, to any crew thread.
 */
export function startedKeys(items: readonly ThreadItem[], self: Agent, isCaptain: boolean, agents: ReadonlyMap<AgentId, Agent>): ReadonlySet<string> {
  const firsts = items.reduce<ReadonlyMap<AgentId, string>>((found, item) => {
    if (item.kind !== "message_out") return found;
    const fresh = item.to.filter((id) => !found.has(id) && agents.get(id)?.kind === "crew");
    return new Map([...found, ...fresh.map((id) => [id, `${item.messageId}:${id}`] as const)]);
  }, new Map());
  const started = [...firsts].filter(([id]) => {
    const target = agents.get(id);
    return isCaptain || (target?.createdBy.kind === "agent" && target.createdBy.agentId === self.id);
  });
  return new Set(started.map(([, key]) => key));
}
