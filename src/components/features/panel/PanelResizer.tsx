"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { cx } from "@/components/ui/classes";

interface PanelResizerProps {
  label: string;
  controls: string;
  direction: "left" | "right";
  value: number;
  defaultValue: number;
  min: number;
  max: number | (() => number);
  onResize: (value: number) => void;
  onResizeEnd?: (value: number) => void;
  className?: string;
}

/** The reference's panel edge: drag, arrow keys, Home and End resize; a double click resets. */
export function PanelResizer({ label, controls, direction, value, defaultValue, min, max, onResize, onResizeEnd, className }: PanelResizerProps) {
  const [resizing, setResizing] = useState(false);
  const cleanup = useRef<(() => void) | null>(null);
  const maximum = () => Math.max(min, typeof max === "function" ? max() : max);
  const clamp = (next: number) => Math.round(Math.min(maximum(), Math.max(min, next)));
  const commit = (next: number) => {
    const clamped = clamp(next);
    onResize(clamped);
    onResizeEnd?.(clamped);
  };
  const withoutTransition = (action: () => void) => {
    document.documentElement.classList.add("panel-resizing");
    action();
    requestAnimationFrame(() => document.documentElement.classList.remove("panel-resizing"));
  };

  useEffect(() => () => cleanup.current?.(), []);

  const beginDrag = (event: PointerEvent<HTMLHRElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    const pointerId = event.pointerId;
    handle.setPointerCapture?.(pointerId);
    const startX = event.clientX;
    const startValue = value;
    let latest = startValue;
    setResizing(true);
    document.documentElement.classList.add("panel-resizing");
    const at = (clientX: number) => startValue + (direction === "left" ? clientX - startX : startX - clientX);
    const move = (moveEvent: globalThis.PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      latest = at(moveEvent.clientX);
      onResize(clamp(latest));
    };
    const finish = (finishEvent?: globalThis.PointerEvent) => {
      if (finishEvent && finishEvent.pointerId !== pointerId) return;
      if (finishEvent) latest = at(finishEvent.clientX);
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
    if (event.key === "Home") next = min;
    else if (event.key === "End") next = maximum();
    else if (event.key === "ArrowLeft") next = value + (direction === "right" ? 12 : -12);
    else if (event.key === "ArrowRight") next = value + (direction === "left" ? 12 : -12);
    if (next === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    const target = next;
    withoutTransition(() => commit(target));
  };

  return (
    <hr
      tabIndex={0}
      className={cx("panel-resizer no-drag", resizing && "panel-resizer-active", className)}
      aria-label={label}
      aria-controls={controls}
      aria-orientation="vertical"
      aria-valuemin={min}
      aria-valuemax={maximum()}
      aria-valuenow={value}
      aria-valuetext={`${value}px`}
      onPointerDown={beginDrag}
      onKeyDown={onKeyDown}
      onDoubleClick={(event) => {
        event.preventDefault();
        commit(defaultValue);
      }}
    />
  );
}
