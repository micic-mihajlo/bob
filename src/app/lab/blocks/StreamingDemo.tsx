"use client";

import { RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { StreamingText } from "@/components/blocks/StreamingText";
import { STREAM_TEXT } from "./sample-reply";

/** Chunk sizes and gaps that look like a model: mostly small, uneven, with one large burst. */
const CHUNKS = [6, 3, 9, 4, 12, 2, 7, 5, 10, 3, 140, 4, 8, 6, 11, 3, 9, 5, 7];
const GAPS_MS = [60, 35, 90, 45, 120, 30, 70, 55];

interface Run {
  id: number;
  received: number;
  step: number;
}

export function StreamingDemo() {
  const [run, setRun] = useState<Run>({ id: 0, received: 0, step: 0 });
  const streaming = run.received < STREAM_TEXT.length;

  useEffect(() => {
    if (!streaming) return;
    const size = CHUNKS[run.step % CHUNKS.length] ?? 5;
    const timer = setTimeout(
      () => setRun({ ...run, received: Math.min(STREAM_TEXT.length, run.received + size), step: run.step + 1 }),
      GAPS_MS[run.step % GAPS_MS.length] ?? 50,
    );
    return () => clearTimeout(timer);
  }, [run, streaming]);

  return (
    <section className="lab-turn" aria-labelledby="lab-stream-title">
      <header className="lab-turn-header">
        <h2 id="lab-stream-title" className="lab-turn-title">
          Streaming text
        </h2>
        <span className="lab-muted" role="status">
          {streaming ? `Receiving · ${run.received}/${STREAM_TEXT.length} characters` : "Done"}
        </span>
        <button type="button" className="blk-btn" data-style="neutral" onClick={() => setRun((current) => ({ id: current.id + 1, received: 0, step: 0 }))}>
          <RotateCcw className="icon" size={14} aria-hidden="true" />
          Replay streaming
        </button>
      </header>
      <StreamingText key={run.id} text={STREAM_TEXT.slice(0, run.received)} streaming={streaming} />
    </section>
  );
}
