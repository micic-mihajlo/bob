"use client";

import { useSyncExternalStore, type CSSProperties, type KeyboardEvent } from "react";

const THEMES = ["ink", "newsprint", "classic"] as const;
type Theme = (typeof THEMES)[number];
const LABEL: Record<Theme, string> = { ink: "Ink", newsprint: "Newsprint", classic: "Classic" };

function subscribe(onChange: () => void) {
  window.addEventListener("bob-theme", onChange);
  return () => window.removeEventListener("bob-theme", onChange);
}

function currentTheme(): Theme {
  const theme = document.documentElement.dataset.theme;
  return theme === "newsprint" || theme === "ink" ? theme : "classic";
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  if (theme === "classic") delete root.dataset.print;
  else root.dataset.print = "";
  try {
    localStorage.setItem("bob-theme", theme);
    localStorage.setItem("bob-theme-picked", "1");
  } catch {}
  window.dispatchEvent(new Event("bob-theme"));
}

const MOVE: Record<string, (index: number) => number> = {
  ArrowRight: (index) => index + 1,
  ArrowDown: (index) => index + 1,
  ArrowLeft: (index) => index - 1,
  ArrowUp: (index) => index - 1,
  Home: () => 0,
  End: () => THEMES.length - 1,
};

/** The look, as three paper samples: ink (dark print), newsprint (light print) and the classic look. Arrow keys move between them. Classic is the default. The root layout restores a pick before the first paint, and reads an ink stored before picks were marked as classic. */
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, currentTheme, () => null);
  if (theme === null) return null;
  const index = THEMES.indexOf(theme);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const move = MOVE[event.key];
    if (move === undefined) return;
    event.preventDefault();
    const target = THEMES[(move(index) + THEMES.length) % THEMES.length];
    applyTheme(target);
    event.currentTarget.querySelector<HTMLButtonElement>(`[data-option="${target}"]`)?.focus();
  }

  return (
    <div role="radiogroup" aria-label="Theme" className="theme-switch" style={{ "--theme-index": index } as CSSProperties} onKeyDown={onKeyDown}>
      <span className="theme-switch__thumb" aria-hidden="true" />
      {THEMES.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={option === theme}
          aria-label={LABEL[option]}
          title={LABEL[option]}
          tabIndex={option === theme ? 0 : -1}
          className="theme-switch__option"
          data-option={option}
          onClick={() => applyTheme(option)}
        >
          <span className="theme-switch__swatch" aria-hidden="true">
            Aa
          </span>
        </button>
      ))}
    </div>
  );
}
