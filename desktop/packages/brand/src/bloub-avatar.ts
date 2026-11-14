import type { AvatarHue } from "@bob/contracts/ipc";
import { bobFaceAccent, bobFaceColors } from "./bob-face-shape";

export const AVATAR_HUE_OPTIONS: ReadonlyArray<{
  hue: AvatarHue;
  label: string;
}> = [
  { hue: 0, label: "Red" },
  { hue: 30, label: "Orange" },
  { hue: 55, label: "Yellow" },
  { hue: 100, label: "Lime" },
  { hue: 150, label: "Green" },
  { hue: 185, label: "Cyan" },
  { hue: 215, label: "Blue" },
  { hue: 245, label: "Indigo" },
  { hue: 280, label: "Violet" },
  { hue: 320, label: "Magenta" },
];

// Hues 100 and 280 stay valid for stored agents, but draw the same color as 150 and 245.
export const AVATAR_HUE_CHOICES = AVATAR_HUE_OPTIONS.filter((option) => option.hue !== 100 && option.hue !== 280);

/** The swatch of a hue in the avatar color picker: the face color an agent of that hue wears. */
export function avatarHueSwatch(hue: AvatarHue): string {
  return bobFaceColors(hue).mid;
}

/**
 * The agent's color beside text: its name, its marks in a chat. Every agent wears Bob's face, so the
 * color follows the face hue, and an agent with no hue has Bob's violet. The seed no longer picks it.
 */
export function avatarHeadColor(_seed: string, hue: AvatarHue | null): string {
  return bobFaceAccent(hue);
}

/** The seeds the avatar picker offers: the current one first, then a fresh batch for this agent. */
export function avatarCandidateSeeds(agentId: string, currentSeed: string, batch: number): string[] {
  return [currentSeed, ...Array.from({ length: 11 }, (_, index) => `${agentId}:avatar:${batch}:${index + 1}`)];
}
