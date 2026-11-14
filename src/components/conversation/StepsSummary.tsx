"use client";

import { ChevronRight } from "lucide-react";
import { useId, useState } from "react";
import { formatElapsed, pluralize } from "@/lib/client/format";
import type { StepItem } from "@/lib/client/thread-rows";
import { StepList } from "./StepList";

function spanOf(steps: readonly StepItem[]): number {
  const first = steps[0];
  const last = steps.at(-1);
  if (!first || !last) return 0;
  return Math.max(0, Date.parse(last.at) - Date.parse(first.at));
}

export function StepsSummary({ steps }: { steps: readonly StepItem[] }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const duration = spanOf(steps);

  return (
    <div className="entry entry-steps">
      <button
        type="button"
        className="steps-summary"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="steps-summary-title">Ran {pluralize(steps.length, "step")}</span>
        {duration >= 1000 ? <span className="steps-summary-time">{formatElapsed(duration)}</span> : null}
        <ChevronRight className="icon steps-summary-chevron" size={12} aria-hidden="true" />
      </button>
      <div id={panelId} className="reveal" data-open={open ? "" : undefined} inert={!open}>
        <div className="reveal-inner">
          <div className="steps-summary-panel">
            <StepList steps={steps} live={false} />
          </div>
        </div>
      </div>
    </div>
  );
}
