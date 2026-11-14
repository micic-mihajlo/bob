"use client";

import { useSyncExternalStore } from "react";
import { buttonClass } from "@/components/ui/classes";

const THEMES = ["ink", "newsprint", "classic"] as const;
type Theme = (typeof THEMES)[number];
const LABEL: Record<Theme, string> = { ink: "Ink", newsprint: "Newsprint", classic: "Classic" };

function subscribe(onChange: () => void) {
  window.addEventListener("bob-theme", onChange);
  return () => window.removeEventListener("bob-theme", onChange);
}

function currentTheme(): Theme {
  const theme = document.documentElement.dataset.theme;
  return theme === "newsprint" || theme === "classic" ? theme : "ink";
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  if (theme === "classic") delete root.dataset.print;
  else root.dataset.print = "";
  try {
    localStorage.setItem("bob-theme", theme);
  } catch {}
  window.dispatchEvent(new Event("bob-theme"));
}

/** Cycles the look: ink (dark print), newsprint (light print), then the classic look. The root layout restores the choice before the first paint. */
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, currentTheme, () => null);
  if (theme === null) return null;
  const next = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
  return (
    <button
      type="button"
      className={buttonClass({ variant: "ghost", size: "xs", className: "sidebar-theme-toggle" })}
      title={`Theme: ${LABEL[theme]}. Switch to ${LABEL[next]}`}
      aria-label={`Theme: ${LABEL[theme]}. Switch to ${LABEL[next]}`}
      onClick={() => applyTheme(next)}
    >
      {LABEL[theme]}
    </button>
  );
}
