"use client";

import { useEffect, useRef, useState } from "react";

/** How long a value has to hold still before the digits roll to it. */
const SETTLE_MS = 400;

export interface DigitRollOptions {
  /** Overrides the settle window. Milliseconds. */
  settleMs?: number;
  /** Whether the group is on screen. A hidden group updates its digits without rolling them. */
  animate?: boolean;
}

/**
 * A `t-digit-group` that rolls once per settled value.
 *
 * The roll is a CSS animation restarted by re-applying `is-animating`, so a value that changes
 * faster than the animation lasts restarts it before it ends, and every restart puts the digits
 * back to the blurred, half-transparent first frame. Holding the newest value for one settle window
 * gives each roll time to finish, and the caller keeps reporting the live value to assistive
 * technology, which never sees the delay.
 */
export function useDigitRoll(value: number, options: DigitRollOptions = {}) {
  const [displayed, setDisplayed] = useState(value);
  const latest = useRef(value);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const group = useRef<HTMLSpanElement>(null);
  const { settleMs = SETTLE_MS, animate } = options;

  useEffect(() => {
    latest.current = value;
    if (timer.current !== undefined || value === displayed) return;
    // The newest value when the window ends, not a queue of the ones it replaced.
    timer.current = setTimeout(() => {
      timer.current = undefined;
      setDisplayed(latest.current);
    }, settleMs);
  }, [value, displayed, settleMs]);
  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    const element = group.current;
    if (!element || animate === false) return;
    element.classList.remove("is-animating");
    void element.offsetHeight;
    element.classList.add("is-animating");
  }, [displayed, animate]);

  return { displayed, ref: group };
}
