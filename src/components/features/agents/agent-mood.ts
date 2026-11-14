import type { AgentId, Snapshot } from "@/lib/types";

/** What an agent's face expresses. */
export type AvatarMood = "idle" | "working" | "waiting" | "failed" | "responded";

/** The face one agent wears, from the most urgent signal the snapshot carries for it. */
export function agentMood(snapshot: Snapshot, agentId: AgentId): AvatarMood {
  const status = snapshot.threadStatus?.[agentId];
  if (status === "failed") return "failed";
  const activity = snapshot.activity[agentId];
  if (activity?.state === "needs_you" || status === "needs_you") return "waiting";
  if (activity?.state === "working" || status === "working") return "working";
  return "idle";
}
