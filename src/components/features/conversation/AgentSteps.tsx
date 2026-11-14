"use client";

import { Check, ChevronRight, Puzzle, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/classes";
import { unrecoveredFailures, type TurnSteps } from "@/lib/client/conversation-rows";
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
          <AgentStepRow key={step.id} step={step} newest={live && index === steps.length - 1} />
        ))}
      </ol>
    </section>
  );
}

/**
 * One tool call: a pass or fail mark once it finishes, and its time. A call that produced output,
 * such as a command, opens to show it.
 */
function AgentStepRow({ step, newest }: { step: StepItem; newest: boolean }) {
  const outputId = useId();
  const [open, setOpen] = useState(false);
  const Mark = step.outcome === "failed" ? X : step.outcome === "ok" ? Check : Puzzle;
  const head = (
    <>
      <Mark
        className="agent-step-icon"
        aria-label={step.outcome === "failed" ? "Failed" : step.outcome === "ok" ? "Passed" : undefined}
        aria-hidden={step.outcome ? undefined : "true"}
      />
      <span className={cx("agent-step-text", newest && "agent-activity-label")}>{step.label}</span>
      {step.outcome === "ok" && step.label === "Tests passed" ? (
        <span className="agent-step-pass" aria-hidden="true">
          Pass
        </span>
      ) : null}
      {step.seconds !== undefined && step.seconds >= 0.1 ? (
        <span className="agent-step-duration">{step.seconds < 10 ? step.seconds.toFixed(1) : Math.round(step.seconds)}s</span>
      ) : null}
    </>
  );
  return (
    <li className="agent-step" data-kind="progress" data-step-id={step.id} data-tool={step.tool} data-outcome={step.outcome} data-open={open ? "" : undefined}>
      {step.detail ? (
        <>
          <button
            type="button"
            className="agent-step-toggle"
            aria-expanded={open ? "true" : "false"}
            aria-controls={open ? outputId : undefined}
            onClick={() => setOpen((value) => !value)}
          >
            {head}
            <ChevronRight className="agent-step-chevron" aria-hidden="true" />
          </button>
          {open ? (
            <pre id={outputId} className="agent-step-output">
              {step.detail}
            </pre>
          ) : null}
        </>
      ) : (
        head
      )}
    </li>
  );
}

/** The steps of a finished turn, above its answer: a closed summary row that opens the list. */
export function AgentStepsDisclosure({ turn }: { turn: TurnSteps }) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const failed = unrecoveredFailures(turn.steps);
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
        {failed > 0 ? <Badge className="agent-steps-failed">{failed} failed</Badge> : null}
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
