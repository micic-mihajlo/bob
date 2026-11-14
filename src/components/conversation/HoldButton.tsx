"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/** How long a plain click waits for its confirming second click. */
const CONFIRM_WINDOW_MS = 4000;

interface HoldButtonProps {
  holdMs: number;
  disabled?: boolean;
  onConfirm: () => void;
  children: ReactNode;
  /** The label while it waits for a second click. */
  confirmLabel: ReactNode;
}

/** A plain click only arms it: taps and screen readers send clicks, and a stray one must not approve. */
export function HoldButton({ holdMs, disabled, onConfirm, children, confirmLabel }: HoldButtonProps) {
  const [holding, setHolding] = useState(false);
  const [armed, setArmed] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completed = useRef(false);

  function cancel(): void {
    if (holdTimer.current !== null) clearTimeout(holdTimer.current);
    holdTimer.current = null;
    setHolding(false);
  }

  function start(): void {
    if (disabled || holdTimer.current !== null) return;
    completed.current = false;
    setHolding(true);
    holdTimer.current = setTimeout(() => {
      holdTimer.current = null;
      completed.current = true;
      setHolding(false);
      onConfirm();
    }, holdMs);
  }

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), CONFIRM_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [armed]);

  useEffect(() => () => {
    if (holdTimer.current !== null) clearTimeout(holdTimer.current);
  }, []);

  function handleClick(): void {
    if (completed.current) {
      completed.current = false;
      return;
    }
    cancel();
    if (disabled) return;
    if (armed) {
      setArmed(false);
      onConfirm();
    } else {
      setArmed(true);
    }
  }

  return (
    <button
      type="button"
      className="btn btn-primary hold-button"
      data-holding={holding ? "" : undefined}
      data-armed={armed ? "" : undefined}
      disabled={disabled}
      style={{ "--hold-duration": `${holdMs}ms` } as CSSProperties}
      onPointerDown={(event) => {
        if (event.button === 0) start();
      }}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onBlur={() => {
        cancel();
        setArmed(false);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        if (!event.repeat) start();
      }}
      onKeyUp={(event) => {
        if (event.key === "Enter" || event.key === " ") cancel();
      }}
      onClick={handleClick}
    >
      <span className="hold-fill" aria-hidden="true" />
      <span className="hold-label">{armed ? confirmLabel : children}</span>
    </button>
  );
}
