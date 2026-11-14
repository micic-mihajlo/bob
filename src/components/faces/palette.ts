/** Colours in OKLCH so a face shares the agent's existing hue space (see .avatar in common.css). */
export function oklch(lightness: number, chroma: number, hue: number, alpha = 1): string {
  const h = ((hue % 360) + 360) % 360;
  return alpha >= 1 ? `oklch(${lightness} ${chroma} ${h})` : `oklch(${lightness} ${chroma} ${h} / ${alpha})`;
}

export const INK = "#14100e";
export const PAPER = "#f6eedb";
