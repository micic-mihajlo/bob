"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";

const COPIED_MS = 1500;

type CopyState = "idle" | "copied" | "failed";

const LABEL: Record<CopyState, string> = { idle: "Copy", copied: "Copied", failed: "Copy failed" };

interface CopyButtonProps {
  /** Read at click time, so a large text is only built when someone copies it. */
  text: () => string;
  label?: string;
}

export function CopyButton({ text, label = "Copy" }: CopyButtonProps) {
  const [state, setState] = useState<CopyState>("idle");

  useEffect(() => {
    if (state === "idle") return;
    const timer = setTimeout(() => setState("idle"), COPIED_MS);
    return () => clearTimeout(timer);
  }, [state]);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(text());
      setState("copied");
    } catch {
      setState("failed");
    }
  }

  return (
    <button type="button" className="blk-icon-btn" onClick={() => void copy()} aria-label={state === "idle" ? label : LABEL[state]}>
      {state === "copied" ? <Check className="icon" size={12} aria-hidden="true" /> : <Copy className="icon" size={12} aria-hidden="true" />}
      <span aria-live="polite">{state === "idle" ? label : LABEL[state]}</span>
    </button>
  );
}
