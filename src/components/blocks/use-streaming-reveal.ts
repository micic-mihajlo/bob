"use client";

import { useEffect, useRef, useState } from "react";
import { nextReveal, REVEAL_TIMING, type RevealChunk } from "@/lib/blocks/reveal";

export interface StreamingReveal {
  shown: number;
  trail: readonly RevealChunk[];
}

interface RevealState extends StreamingReveal {
  budget: number;
}

const START: RevealState = { shown: 0, budget: 0, trail: [] };

/**
 * Reveals `text` word by word as it grows. Key the caller per message: the reveal assumes the text
 * only ever grows.
 */
export function useStreamingReveal(text: string, streaming: boolean, enabled: boolean): StreamingReveal {
  const latest = useRef({ text, streaming });
  const [state, setState] = useState<RevealState>(START);

  useEffect(() => {
    latest.current = { text, streaming };
  }, [text, streaming]);

  const behind = state.shown < text.length;

  useEffect(() => {
    if (!enabled || !behind) return;
    const timer = setInterval(() => {
      const current = latest.current;
      const now = performance.now();
      setState((previous) => {
        const from = Math.min(previous.shown, current.text.length);
        const step = nextReveal({ shown: from, target: current.text, streaming: current.streaming, budget: previous.budget });
        if (step.shown === from) return step.budget === previous.budget ? previous : { ...previous, budget: step.budget };
        const fresh = previous.trail.filter((chunk) => now - chunk.revealedAt < REVEAL_TIMING.fadeMs);
        return { shown: step.shown, budget: step.budget, trail: [...fresh, { start: from, end: step.shown, revealedAt: now }] };
      });
    }, REVEAL_TIMING.stepMs);
    return () => clearInterval(timer);
  }, [enabled, behind]);

  return enabled ? state : { shown: text.length, trail: [] };
}
