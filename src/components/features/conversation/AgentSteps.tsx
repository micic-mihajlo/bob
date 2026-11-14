"use client";

import { ChevronRight, Puzzle } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/classes";
import type { TurnSteps } from "@/lib/client/conversation-rows";
import { formatElapsed, pluralize } from "@/lib/client/format";
import type { StepItem } from "@/lib/client/thread-rows";

/** How tall the list grows before it scrolls, and before a live list glides to its newest step. */
const STEPS_MAX_HEIGHT = 220;

/**
 * The steps of a turn, in order. While the turn runs, `live` marks the newest step and the list
 * glides so that step stays at the bottom edge; after the turn the list scrolls.
 */
export function AgentStepList({ steps, live, id }: { steps: readonly StepItem[]; live: boolean; id?: string }) {
  const content = useRef<HTMLOListElement>(null);
  const [contentHeight, setContentHeight] = useState(0);
  useEffect(() => {
    const element = content.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setContentHeight(element.offsetHeight));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const capped = contentHeight > STEPS_MAX_HEIGHT;
  const scrolls = !live && capped;
  const offset = live && capped ? STEPS_MAX_HEIGHT - contentHeight : 0;
  return (
    <section
      id={id}
      className="agent-steps-viewport"
      aria-label="Agent steps"
      data-capped={capped ? "" : undefined}
      data-scrolls={scrolls ? "" : undefined}
      tabIndex={scrolls ? 0 : undefined}
    >
      <ol ref={content} className="agent-steps-list" style={{ transform: `translateY(${offset}px)` }}>
        {steps.map((step, index) => (
          <li key={step.id} className="agent-step" data-kind="progress" data-step-id={step.id} data-tool={step.tool}>
            <Puzzle className="agent-step-icon" aria-hidden="true" />
            <span className={cx("agent-step-text", live && index === steps.length - 1 && "agent-activity-label")}>{step.label}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** The steps of a finished turn, above its answer: a closed summary row that opens the list. */
export function AgentStepsDisclosure({ turn }: { turn: TurnSteps }) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  return (
    <div className="agent-steps" data-open={open ? "" : undefined}>
      <Button
        variant="ghost"
        className="agent-steps-header"
        aria-expanded={open ? "true" : "false"}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="agent-steps-summary">{pluralize(turn.steps.length, "step")}</span>
        {turn.durationMs >= 1000 ? <span className="agent-steps-duration">{formatElapsed(Math.round(turn.durationMs / 1000) * 1000)}</span> : null}
        <ChevronRight className="agent-steps-chevron" aria-hidden="true" />
      </Button>
      {open ? (
        <div className="agent-steps-panel">
          <AgentStepList id={panelId} steps={turn.steps} live={false} />
        </div>
      ) : null}
    </div>
  );
}
