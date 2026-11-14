"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { cx } from "@/components/ui/classes";

export const LEFT_PANEL_STORAGE_KEY = "bob:left-panel-width";
export const LEFT_PANEL_COLLAPSED_STORAGE_KEY = "bob:left-panel-collapsed";
export const LEFT_PANEL_DEFAULT = 280;
export const LEFT_PANEL_MIN = 128;
export const LEFT_PANEL_MAX = 400;
export const LEFT_PANEL_COMPACT = 88;
export const LEFT_PANEL_COLLAPSE_THRESHOLD = 110;
export const LEFT_PANEL_EXPAND_THRESHOLD = 118;

interface LeftPanelResizerProps {
  value: number;
  /** Whether the sidebar is drawn compact. */
  compact: boolean;
  onResize: (value: number) => void;
  onResizeEnd: (value: number) => void;
  onCompactChange: (compact: boolean) => void;
}

/**
 * The drag handle between the left column and the conversation. The one place that turns a width
 * into the compact state: below the collapse threshold the column snaps to its faces, and it
 * expands again above the expand threshold.
 */
export function LeftPanelResizer({ value, compact, onResize, onResizeEnd, onCompactChange }: LeftPanelResizerProps) {
  const [resizing, setResizing] = useState(false);
  const cleanup = useRef<(() => void) | null>(null);
  const clamp = (next: number) => Math.round(Math.min(LEFT_PANEL_MAX, Math.max(LEFT_PANEL_MIN, next)));
  const displayedValue = compact ? LEFT_PANEL_COMPACT : value;
  const resolve = (next: number) => {
    if (compact) {
      return next < LEFT_PANEL_EXPAND_THRESHOLD ? { compact: true, value: LEFT_PANEL_COMPACT } : { compact: false, value: clamp(Math.max(LEFT_PANEL_MIN, next)) };
    }
    return next < LEFT_PANEL_COLLAPSE_THRESHOLD ? { compact: true, value: LEFT_PANEL_COMPACT } : { compact: false, value: clamp(next) };
  };
  const resize = (next: number) => {
    const resolved = resolve(next);
    if (resolved.compact !== compact) onCompactChange(resolved.compact);
    if (!resolved.compact) onResize(resolved.value);
    return resolved;
  };
  const commit = (next: number) => {
    const resolved = resize(next);
    if (!resolved.compact) onResizeEnd(resolved.value);
  };
  const withoutTransition = (action: () => void) => {
    document.documentElement.classList.add("panel-resizing");
    action();
    requestAnimationFrame(() => document.documentElement.classList.remove("panel-resizing"));
  };

  useEffect(() => {
    const enforceBounds = () => {
      const next = clamp(value);
      if (next !== value) commit(next);
    };
    window.addEventListener("resize", enforceBounds);
    return () => window.removeEventListener("resize", enforceBounds);
  });
  useEffect(() => () => cleanup.current?.(), []);

  const beginDrag = (event: PointerEvent<HTMLHRElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    const pointerId = event.pointerId;
    handle.setPointerCapture?.(pointerId);
    const startX = event.clientX;
    const startValue = displayedValue;
    let latest = startValue;
    setResizing(true);
    document.documentElement.classList.add("panel-resizing");
    const move = (moveEvent: globalThis.PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      latest = startValue + moveEvent.clientX - startX;
      resize(latest);
    };
    const finish = (finishEvent?: globalThis.PointerEvent) => {
      if (finishEvent && finishEvent.pointerId !== pointerId) return;
      if (finishEvent) latest = startValue + finishEvent.clientX - startX;
      commit(latest);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", cancel);
      document.documentElement.classList.remove("panel-resizing");
      setResizing(false);
      cleanup.current = null;
      if (handle.hasPointerCapture?.(pointerId)) handle.releasePointerCapture(pointerId);
    };
    const cancel = () => finish();
    cleanup.current?.();
    cleanup.current = cancel;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", cancel);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLHRElement>) => {
    let next: number | undefined;
    if (event.key === "Home") {
      event.preventDefault();
      event.stopPropagation();
      withoutTransition(() => onCompactChange(true));
      return;
    }
    if (event.key === "End") next = LEFT_PANEL_MAX;
    else if (event.key === "ArrowRight" && compact) next = LEFT_PANEL_MIN;
    else if (event.key === "ArrowLeft" && value <= LEFT_PANEL_MIN) {
      event.preventDefault();
      event.stopPropagation();
      withoutTransition(() => onCompactChange(true));
      return;
    } else if (event.key === "ArrowLeft") next = value - 12;
    else if (event.key === "ArrowRight") next = value + 12;
    if (next === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    const target = next;
    withoutTransition(() => commit(target));
  };

  return (
    <hr
      tabIndex={0}
      className={cx("panel-resizer no-drag left-panel-resizer", resizing && "panel-resizer-active")}
      aria-label="Resize left sidebar"
      aria-controls="agent-sidebar"
      aria-orientation="vertical"
      aria-valuemin={LEFT_PANEL_COMPACT}
      aria-valuemax={LEFT_PANEL_MAX}
      aria-valuenow={displayedValue}
      aria-valuetext={compact ? `Compact (${LEFT_PANEL_COMPACT}px)` : `${value}px`}
      onPointerDown={beginDrag}
      onKeyDown={onKeyDown}
      onDoubleClick={(event) => {
        event.preventDefault();
        commit(LEFT_PANEL_DEFAULT);
      }}
    />
  );
}
