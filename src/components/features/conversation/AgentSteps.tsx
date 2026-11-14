"use client";

import { Check, ChevronRight, Puzzle, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/classes";
import { stepsSummary, unrecoveredFailures, type TurnSteps } from "@/lib/client/conversation-rows";
import { formatElapsed } from "@/lib/client/format";
import { prefersReducedMotion } from "@/lib/client/reduced-motion";
import type { StepItem } from "@/lib/client/thread-rows";

/** How tall the list grows before it scrolls, and before a live list glides to its newest step. */
const STEPS_MAX_HEIGHT = 220;

/**
 * The steps of a turn, in order. While the turn runs, `live` marks the newest step and the list
 * glides so that step stays at the bottom edge; after the turn the list scrolls.
 */
export function AgentStepList({
  steps,
  live,
  id,
  focus,
}: {
  steps: readonly StepItem[];
  live: boolean;
  id?: string;
  /** The step to scroll to and light up. A new object each time scrolls to it again. */
  focus?: { id: string } | null | undefined;
}) {
  const content = useRef<HTMLOListElement>(null);
  const [contentHeight, setContentHeight] = useState(0);
  useEffect(() => {
    const element = content.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setContentHeight(element.offsetHeight));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!focus) return;
    const step = content.current?.querySelector(`[data-step-id="${CSS.escape(focus.id)}"]`);
    step?.scrollIntoView({ block: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, [focus]);
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
      // A list that scrolls needs a keyboard stop of its own.
      tabIndex={scrolls ? 0 : undefined}
    >
      <ol ref={content} className="agent-steps-list" style={{ transform: `translateY(${offset}px)` }}>
        {steps.map((step, index) => (
          <AgentStepRow key={step.id} step={step} newest={live && index === steps.length - 1} focused={focus?.id === step.id} />
        ))}
      </ol>
    </section>
  );
}

/**
 * One tool call: a pass or fail mark once it finishes, and its time. A call that produced output,
 * such as a command, opens to show it.
 */
function AgentStepRow({ step, newest, focused }: { step: StepItem; newest: boolean; focused: boolean }) {
  const outputId = useId();
  const [open, setOpen] = useState(false);
  const head = (
    <>
      <StepIcon outcome={step.outcome} />
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
    <li
      className="agent-step"
      data-kind="progress"
      data-step-id={step.id}
      data-focused={focused ? "" : undefined}
      data-tool={step.tool}
      data-outcome={step.outcome}
      data-open={open ? "" : undefined}
    >
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

/** A running call has the reference's progress glyph; a finished one shows whether it passed. */
function StepIcon({ outcome }: { outcome: StepItem["outcome"] }) {
  if (outcome === "failed") return <X className="agent-step-icon" aria-label="Failed" />;
  if (outcome === "ok") return <Check className="agent-step-icon" aria-label="Passed" />;
  return <Puzzle className="agent-step-icon" aria-hidden="true" />;
}

/**
 * The steps of a finished turn, above its answer: a closed summary row that opens the list. The row
 * looks like the header of the subagents above it. `defaultOpen` opens the list at first; an open
 * list closes from the row.
 */
export function AgentStepsDisclosure({ turn, defaultOpen = false }: { turn: TurnSteps; defaultOpen?: boolean }) {
  const panelId = useId();
  const [choice, setChoice] = useState<boolean>();
  const open = choice ?? defaultOpen;
  const failed = unrecoveredFailures(turn.steps);
  return (
    <div className="agent-steps" data-open={open ? "" : undefined}>
      <Button
        type="button"
        variant="ghost"
        className="agent-steps-header"
        aria-expanded={open ? "true" : "false"}
        aria-controls={open ? panelId : undefined}
        onClick={() => setChoice(!open)}
      >
        <span className="agent-steps-summary">{stepsSummary(turn.steps)}</span>
        {failed > 0 ? <Badge className="agent-steps-failed">{failed} failed</Badge> : null}
        {/* Whole seconds, rounded as a trace rounds the turn. */}
        <span className="agent-steps-duration">{formatElapsed(Math.round(turn.durationMs / 1_000) * 1_000)}</span>
        <ChevronRight className="agent-steps-chevron" aria-hidden="true" />
      </Button>
      {/* A long chat has a row for each turn, so a closed row builds no list. */}
      {open ? (
        <div className="agent-steps-panel">
          <AgentStepList id={panelId} steps={turn.steps} live={false} />
        </div>
      ) : null}
    </div>
  );
}
