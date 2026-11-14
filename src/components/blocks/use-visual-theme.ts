"use client";

import { useMemo, useSyncExternalStore } from "react";
import { VISUAL_CHART_HUES, VISUAL_THEME_TOKENS, type VisualTheme } from "@/lib/blocks/visual-document";

const subscribe = () => () => {};

/** A string, so the snapshot compares equal across renders while the tokens stay the same. */
function readTheme(): string {
  const style = getComputedStyle(document.documentElement);
  const read = (token: string) => style.getPropertyValue(token).trim();
  const tokens = VISUAL_THEME_TOKENS.map(([name, token]) => [name, read(token)] as const).filter(([, value]) => value !== "");
  const lightness = read("--agent-lightness") || "0.72";
  const chroma = read("--agent-chroma") || "0.13";
  const charts = VISUAL_CHART_HUES.map((hue, index) => [`--chart-${index + 1}`, `oklch(${lightness} ${chroma} ${hue})`] as const);
  return JSON.stringify(Object.fromEntries([...tokens, ...charts]));
}

/** The app's theme as variables for a visual page, or null on the server. */
export function useVisualTheme(): VisualTheme | null {
  const snapshot = useSyncExternalStore(subscribe, readTheme, () => null);
  return useMemo(() => (snapshot === null ? null : (JSON.parse(snapshot) as VisualTheme)), [snapshot]);
}
