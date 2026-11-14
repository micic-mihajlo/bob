import type { Mood } from "@/components/faces/types";

export const INITIAL_SEEDS = ["agent-bob", "agent-ada", "agent-pip", "agent-juno", "agent-rex", "agent-mo"] as const;

const SYLLABLES = ["ka", "lo", "mi", "ru", "ze", "po", "ta", "ne", "vi", "so", "bu", "da"];

/** Called only from event handlers; prerendered output uses INITIAL_SEEDS. */
export function randomSeeds(count: number): string[] {
  return Array.from({ length: count }, () => {
    const a = SYLLABLES[Math.floor(Math.random() * SYLLABLES.length)];
    const b = SYLLABLES[Math.floor(Math.random() * SYLLABLES.length)];
    return `agent-${a}${b}-${Math.floor(Math.random() * 1000)}`;
  });
}

/** Spreads a team around the chosen base hue so neighbours stay distinct. */
export function hueFor(base: number, index: number): number {
  return Math.round(base + index * 61) % 360;
}

export type TeamMember = { readonly name: string; readonly mood: Mood; readonly line: string };

export const TEAM: readonly TeamMember[] = [
  { name: "Bob", mood: "working", line: "Drafting the release notes" },
  { name: "Ada", mood: "needs_you", line: "Which invoice template should I use?" },
  { name: "Pip", mood: "waiting", line: "Waiting on Bob and Ada" },
  { name: "Juno", mood: "responded", line: "Sent the summary to Rex" },
  { name: "Rex", mood: "failed", line: "Couldn't reach the billing API" },
];

export const MOOD_LABEL: Record<Mood, string> = {
  idle: "Idle",
  working: "Working",
  waiting: "Waiting",
  needs_you: "Needs you",
  failed: "Failed",
  responded: "Responded",
};
