"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/** How long a plain click waits for its confirming second click. */
const ARMED_MS = 4000;

interface HoldButtonProps {
  holdMs: number;
  variant: "danger" | "primary" | "neutral";
  disabled?: boolean;
  describedBy?: string;
  onConfirm: () => void;
  /** The label while it waits for a second click. */
  armedLabel: ReactNode;
  children: ReactNode;
}

/** Assistive tech can only click, never hold, so two clicks are an equal path to confirm. */
export function HoldButton({ holdMs, variant, disabled, describedBy, onConfirm, armedLabel, children }: HoldButtonProps) {
  const [holding, setHolding] = useState(false);
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Releasing after a completed hold also fires click; this swallows it.
  const completed = useRef(false);

  function cancel(): void {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  }

  function start(): void {
    if (disabled || timer.current !== null) return;
    completed.current = false;
    setHolding(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      completed.current = true;
      setHolding(false);
      onConfirm();
    }, holdMs);
  }

  useEffect(() => {
    if (!armed) return;
    const reset = setTimeout(() => setArmed(false), ARMED_MS);
    return () => clearTimeout(reset);
  }, [armed]);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  function tap(): void {
    if (disabled) return;
    if (armed) {
      setArmed(false);
      onConfirm();
    } else {
      setArmed(true);
    }
  }

  function handleClick(): void {
    if (completed.current) {
      completed.current = false;
      return;
    }
    cancel();
    tap();
  }

  return (
    <button
      type="button"
      className="blk-btn blk-hold"
      data-style={variant}
      data-holding={holding ? "" : undefined}
      data-armed={armed ? "" : undefined}
      disabled={disabled}
      aria-describedby={describedBy}
      style={{ "--blk-hold-duration": `${holdMs}ms` } as CSSProperties}
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
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        // Key down starts a hold and blocks the native click, so a short press is the keyboard's click.
        const short = timer.current !== null;
        cancel();
        if (completed.current) completed.current = false;
        else if (short) tap();
      }}
      onClick={handleClick}
    >
      <span className="blk-hold-fill" aria-hidden="true" />
      <span className="blk-hold-label" aria-live="polite">
        {armed ? armedLabel : children}
      </span>
    </button>
  );
}
