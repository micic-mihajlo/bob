import { agentById, type State } from "./state";
import type { Agent, AgentId } from "./types";

export const isSubagent = (a: Agent | undefined): boolean => a?.kind === "subagent";
export const subagentsOf = (s: State, parentId: AgentId): Agent[] => s.agents.filter((a) => a.kind === "subagent" && a.parentAgentId === parentId);

/** Whose clone a thread's tools use: a subagent in "same" mode works in its parent's. */
export function workspaceOwner(s: State, agentId: AgentId): AgentId {
  const agent = agentById(s, agentId);
  return agent?.kind === "subagent" && agent.workspaceMode === "same" && agent.parentAgentId ? agent.parentAgentId : agentId;
}

/** A crew thread and its own subagents may message each other; nobody else reaches a subagent. */
export function subagentRule(s: State, fromId: AgentId, to: AgentId[]): "allowed" | "refused" | "none" {
  const sender = agentById(s, fromId);
  const pairs = to.map((id) => agentById(s, id));
  const touches = isSubagent(sender) || pairs.some(isSubagent);
  if (!touches) return "none";
  const ok = pairs.every((r) => (isSubagent(sender) ? r?.id === sender?.parentAgentId : r?.parentAgentId === fromId));
  return ok ? "allowed" : "refused";
}
