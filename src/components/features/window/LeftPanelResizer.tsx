"use client";

import type { KeyboardEvent, PointerEvent } from "react";

export const LEFT_PANEL_MIN = 220;
export const LEFT_PANEL_MAX = 400;
export const LEFT_PANEL_DEFAULT = 280;

const clamp = (width: number) => Math.min(LEFT_PANEL_MAX, Math.max(LEFT_PANEL_MIN, Math.round(width)));

/** The rule between the sidebar and the panes. Drag it, or use the arrow keys, to size the sidebar. */
export function LeftPanelResizer({ width, onWidth }: { width: number; onWidth: (width: number) => void }) {
  function startDrag(event: PointerEvent<HTMLHRElement>): void {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    const move = (next: globalThis.PointerEvent) => onWidth(clamp(startWidth + next.clientX - startX));
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      document.body.style.removeProperty("cursor");
    };
    document.body.style.cursor = "col-resize";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }

  function onKeyDown(event: KeyboardEvent<HTMLHRElement>): void {
    if (event.key === "ArrowLeft") onWidth(clamp(width - 16));
    else if (event.key === "ArrowRight") onWidth(clamp(width + 16));
    else return;
    event.preventDefault();
  }

  return (
    <hr
      tabIndex={0}
      aria-orientation="vertical"
      className="panel-resizer no-drag left-panel-resizer"
      aria-label="Resize left sidebar"
      aria-controls="agent-sidebar"
      aria-valuemin={LEFT_PANEL_MIN}
      aria-valuemax={LEFT_PANEL_MAX}
      aria-valuenow={width}
      aria-valuetext={`${width}px`}
      onPointerDown={startDrag}
      onKeyDown={onKeyDown}
    />
  );
}
