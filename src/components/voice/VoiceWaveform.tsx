"use client";

import { useLayoutEffect, useRef } from "react";
import { cx } from "@/components/ui/classes";
import { useReducedMotion } from "@/lib/client/reduced-motion";

/** Loudness as a row of dots that scrolls left as new readings arrive; speech stretches the dots into bars. */
export function VoiceWaveform({ levels, className }: { levels: readonly number[]; className?: string }) {
  const track = useRef<HTMLSpanElement>(null);
  const lastUpdate = useRef(0);
  const reduced = useReducedMotion();
  useLayoutEffect(() => {
    const now = performance.now();
    const interval = now - lastUpdate.current;
    lastUpdate.current = now;
    const [first, second] = track.current?.children ?? [];
    if (!track.current || !(first instanceof HTMLElement) || !(second instanceof HTMLElement)) return;
    if (interval > 500 || reduced) return;
    const step = second.offsetLeft - first.offsetLeft;
    track.current.animate([{ transform: `translateX(${step}px)` }, { transform: "none" }], { duration: interval });
  }, [levels, reduced]);
  return (
    <span className={cx("voice-waveform", className)} aria-hidden="true">
      <span ref={track} className="voice-waveform-track">
        {levels.map((level, index) => (
          <span key={index} className="voice-waveform-dot" style={{ ["--voice-level" as string]: String(level) }} />
        ))}
      </span>
    </span>
  );
}
