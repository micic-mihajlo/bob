"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";

const COPIED_MS = 1400;

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button type="button" className="icon-button icon-button-xs copy-button" aria-label={copied ? "Copied" : label} title={copied ? "Copied" : label} onClick={() => void copy()}>
      {copied ? <Check className="icon" size={12} aria-hidden="true" /> : <Copy className="icon" size={12} aria-hidden="true" />}
    </button>
  );
}
