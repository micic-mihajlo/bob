"use client";

import { FileText, Map as MapIcon, MessageSquare, Search, Terminal, UserPlus, Wrench, type LucideIcon } from "lucide-react";
import { useLayoutEffect, useRef } from "react";
import type { StepItem } from "@/lib/client/thread-rows";

const TOOL_ICONS: ReadonlyArray<readonly [RegExp, LucideIcon]> = [
  [/message|reply|send/i, MessageSquare],
  [/agent|teammate|hire/i, UserPlus],
  [/roadmap|stage|goal|today|work_order/i, MapIcon],
  [/bash|shell|run|command/i, Terminal],
  [/file|read|write|edit/i, FileText],
  [/search|find|list/i, Search],
];

function iconFor(tool: string): LucideIcon {
  return TOOL_ICONS.find(([pattern]) => pattern.test(tool))?.[1] ?? Wrench;
}

export function StepList({ steps, live }: { steps: readonly StepItem[]; live: boolean }) {
  const viewport = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (live && viewport.current) viewport.current.scrollTop = viewport.current.scrollHeight;
  }, [live, steps.length]);

  if (steps.length === 0) {
    return <p className="step-empty">Getting started</p>;
  }

  return (
    <div className="step-viewport" ref={viewport} data-live={live ? "" : undefined} tabIndex={live ? undefined : 0}>
      <ol className="step-list">
        {steps.map((step, index) => {
          const Icon = iconFor(step.tool);
          const newest = live && index === steps.length - 1;
          return (
            <li key={step.id} className="step-row" data-newest={newest ? "" : undefined}>
              <Icon className="icon step-icon" size={12} aria-hidden="true" />
              <span className={newest ? "shine" : undefined}>{step.label}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
