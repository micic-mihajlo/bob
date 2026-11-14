"use client";

import { useEffect, useId, useRef, useState } from "react";

/** macOS hides scroll bars, so an explicit toggle is the only cue that the preview is truncated. */
export function ConfirmPreview({ text }: { text: string }) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);

  useEffect(() => {
    const element = box.current;
    if (!element || expanded) return;
    const measure = () => setClamped(element.scrollHeight > element.clientHeight + 1);
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    for (const child of Array.from(element.children)) observer.observe(child);
    return () => observer.disconnect();
  }, [expanded, text]);

  return (
    <>
      <div ref={box} id={id} className="blk-preview" data-expanded={expanded ? "" : undefined} tabIndex={0} role="region" aria-label="Preview">
        <pre className="blk-preview-text">{text}</pre>
      </div>
      {clamped || expanded ? (
        <button type="button" className="blk-btn blk-preview-toggle" data-style="quiet" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(!expanded)}>
          {expanded ? "Show less" : "Show full"}
        </button>
      ) : null}
    </>
  );
}
