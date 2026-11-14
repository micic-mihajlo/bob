import type { AgentId, Snapshot } from "@/lib/types";

/**
 * What an agent is doing, as far as its face is concerned. `connecting` and `asleep` belong to the
 * surface around the avatar (a closed thread sleeps), so callers pass them in.
 */
export type AvatarMood = "idle" | "working" | "waiting" | "failed" | "responded" | "connecting" | "asleep";

/** Amplitude of the breathing scale per mood, as a fraction of the avatar's size. 0 holds still. */
const BREATHE: Readonly<Record<AvatarMood, number>> = {
  idle: 0,
  working: 0.03,
  waiting: 0,
  failed: 0,
  responded: 0,
  connecting: 0,
  asleep: 0,
};

export function avatarBreathe(mood: AvatarMood): number {
  return BREATHE[mood];
}

/** Whether a mood keeps moving on its own, rather than settling into a face. */
export function avatarMoodIsBusy(mood: AvatarMood): boolean {
  return mood === "working" || mood === "connecting";
}

/** The face one agent wears, from the most urgent signal the snapshot carries for it. */
export function agentMood(snapshot: Snapshot, agentId: AgentId): AvatarMood {
  const status = snapshot.threadStatus?.[agentId];
  if (status === "closed") return "asleep";
  if (status === "failed") return "failed";
  const activity = snapshot.activity[agentId];
  if (activity?.state === "needs_you" || status === "needs_you") return "waiting";
  if (activity?.state === "working" || status === "working") return "working";
  return "idle";
}
