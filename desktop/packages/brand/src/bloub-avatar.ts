import type { AvatarHue } from "@bob/contracts/ipc";

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
  return hsl(hue, 42, 56);
}

/**
 * The agent's color beside text: its name, its marks in a chat. Every agent wears Bob's face, so the
 * color follows the face hue, and an agent with no hue has Bob's violet. The seed no longer picks it.
 */
export function avatarHeadColor(_seed: string, hue: AvatarHue | null): string {
  if (hue === null) return "#e4e4e4";
  let low = 20;
  let high = 80;
  for (let step = 0; step < 12; step += 1) {
    const lightness = (low + high) / 2;
    if (luminance(hsl(hue, 55, lightness)) < 0.2) low = lightness;
    else high = lightness;
  }
  return hsl(hue, 55, low);
}

/** The seeds the avatar picker offers: the current one first, then a fresh batch for this agent. */
export function avatarCandidateSeeds(agentId: string, currentSeed: string, batch: number): string[] {
  return [currentSeed, ...Array.from({ length: 11 }, (_, index) => `${agentId}:avatar:${batch}:${index + 1}`)];
}

function luminance(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16);
  const linear = (channel: number) => {
    const unit = channel / 255;
    return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear((value >> 16) & 255) + 0.7152 * linear((value >> 8) & 255) + 0.0722 * linear(value & 255);
}

function hsl(hue: number, saturation: number, lightness: number): string {
  const s = saturation / 100;
  const l = lightness / 100;
  const k = (n: number) => (n + hue / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number) =>
    Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))))
      .toString(16)
      .padStart(2, "0");
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}
