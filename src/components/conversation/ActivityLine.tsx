"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Avatar } from "@/components/common/Avatar";
import { RollingNumber } from "@/components/common/RollingNumber";
import { formatElapsed } from "@/lib/client/format";
import { elapsedSince, type StepItem } from "@/lib/client/thread-rows";
import { useNow } from "@/lib/client/use-now";
import type { Agent } from "@/lib/types";
import { StepList } from "./StepList";

export const WORKING_LABELS = [
  "Getting into it",
  "Mulling it over",
  "Double-checking",
  "Lining things up",
  "Reading the thread",
  "Putting it together",
  "Weighing the options",
] as const;

const LABEL_MS = 3200;
const ELAPSED_AFTER_MS = 5000;

export function ActivityLine({ agent, since, steps }: { agent: Agent; since: string; steps: readonly StepItem[] }) {
  const [open, setOpen] = useState(false);
  const [labelIndex, setLabelIndex] = useState(0);
  const panelId = useId();
  const now = useNow(true);
  const elapsed = elapsedSince(since, now);

  useEffect(() => {
    const timer = setInterval(() => setLabelIndex((index) => (index + 1) % WORKING_LABELS.length), LABEL_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="activity">
      <div className="activity-line">
        <Avatar agent={agent} size={32} />
        <span key={labelIndex} className="activity-label shine">
          {WORKING_LABELS[labelIndex]}
        </span>
        {elapsed >= ELAPSED_AFTER_MS ? (
          <span className="activity-elapsed" aria-hidden="true">
            <RollingNumber value={Math.floor(elapsed / 1000)} text={formatElapsed(elapsed)} />
          </span>
        ) : null}
        <button
          type="button"
          className="icon-button icon-button-xs"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={open ? "Collapse the steps" : `Show steps (${steps.length})`}
          onClick={() => setOpen((value) => !value)}
        >
          <ChevronDown className="icon chevron" size={12} aria-hidden="true" />
        </button>
      </div>
      <div id={panelId} className="reveal" data-open={open ? "" : undefined} inert={!open}>
        <div className="reveal-inner">
          <div className="activity-steps">
            <StepList steps={steps} live />
          </div>
        </div>
      </div>
    </div>
  );
}
