"use client";

import { REVEAL_TIMING, splitTrail } from "@/lib/blocks/reveal";
import type { CSSProperties } from "react";
import { useReducedMotion } from "./use-reduced-motion";
import { useStreamingReveal } from "./use-streaming-reveal";
import "./styles";

interface StreamingTextProps {
  /** The text received so far. It may only grow; key the component per message. */
  text: string;
  /** More text may still arrive. */
  streaming: boolean;
  className?: string;
}

/**
 * Reveals growing text a whole word at a time, each step fading in on its own. Each chunk is a
 * keyed span that mounts once, so its fade runs once however often the text re-renders.
 */
export function StreamingText({ text, streaming, className }: StreamingTextProps) {
  const reduced = useReducedMotion();
  const { shown, trail } = useStreamingReveal(text, streaming, !reduced);
  const { prefix, chunks } = splitTrail(text, shown, trail);
  const style = { "--blk-stream-fade": `${REVEAL_TIMING.fadeMs}ms` } as CSSProperties;

  return (
    <div className={className ?? "blk-stream"} style={style} aria-busy={streaming || shown < text.length}>
      {prefix}
      {chunks.map((chunk) => (
        <span key={chunk.key} className="blk-stream-chunk">
          {chunk.text}
        </span>
      ))}
    </div>
  );
}
