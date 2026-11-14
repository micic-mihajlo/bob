"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { AgentAvatar } from "@/components/features/agents/AgentAvatar";
import { Button } from "@/components/ui/Button";
import type { StepItem } from "@/lib/client/thread-rows";
import { useNow } from "@/lib/client/use-now";
import type { Agent } from "@/lib/types";
import { AgentStepList } from "./AgentSteps";

/** The lines the indicator picks from while an agent works and no step names the work. */
export const AGENT_ACTIVITY_LABELS = [
  "Working on it…",
  "Thinking it through…",
  "Connecting the dots…",
  "Checking the details…",
  "Putting the answer together…",
  "Making sense of it…",
  "One step at a time…",
  "Tiny gears are turning…",
  "Consulting the inner council…",
  "Cooking up something useful…",
] as const;

const FACTUAL_ACTIVITY_LABELS = AGENT_ACTIVITY_LABELS.slice(0, 7);
const PLAYFUL_ACTIVITY_LABELS = AGENT_ACTIVITY_LABELS.slice(7);

export type AgentActivityLabel = (typeof AGENT_ACTIVITY_LABELS)[number];

/** The first activity line, for a turn that has no step yet. */
export const DEFAULT_ACTIVITY_LABEL: AgentActivityLabel = AGENT_ACTIVITY_LABELS[0];

/**
 * The line the indicator shows while an agent works.
 *
 * Only the wording is drawn. The face follows the `working` mood like every other avatar in the app.
 */
export function nextAgentActivityLabel(previous?: AgentActivityLabel, random: () => number = Math.random): AgentActivityLabel {
  return pickActivityLabel(previous, random);
}

/**
 * A step shorter than this shows no time. Most steps end sooner, and a counter that appears and
 * goes away at once is only noise.
 */
const ELAPSED_VISIBLE_AFTER_MS = 5_000;

/** "5s" under a minute, "1m 5s" after, as the narrow units of the interface language write them. */
function elapsedLabel(ms: number): string | null {
  if (ms < ELAPSED_VISIBLE_AFTER_MS) return null;
  const total = Math.floor(ms / 1_000);
  const seconds = `${total % 60}s`;
  if (total < 60) return seconds;
  return `${Math.floor(total / 60)}m ${seconds}`;
}

export function AgentActivityIndicator({
  agent,
  detail,
  label,
  phase,
  since,
  steps,
  stepsOpenByDefault,
  waitingFor,
}: {
  agent: Agent | undefined;
  detail?: string | null;
  label: string;
  phase?: "active" | "exiting";
  /**
   * When the current line started, from `Date.now()`. A long step then shows how long it has run,
   * so a working agent reads differently from a stalled one.
   */
  since?: number;
  /** The steps of the running turn. With steps, a chevron opens them under the line. */
  steps?: readonly StepItem[] | undefined;
  /** The steps are open when the turn starts. */
  stepsOpenByDefault?: boolean | undefined;
  /**
   * The provider name, when nothing has come from the provider for a while. The line then says that
   * it waits, with no shine, because a silent provider is not visible work.
   */
  waitingFor?: string | null | undefined;
}) {
  const shown = waitingFor ? `Waiting for ${waitingFor}…` : (detail ?? label);
  const name = agent?.name ?? "Agent";
  const statusLabel = waitingFor ? `${name} is waiting for ${waitingFor}` : `${name} is working: ${shown}`;
  const counting = phase !== "exiting" && since !== undefined;
  const now = useNow(counting);
  const elapsed = counting && now !== 0 ? elapsedLabel(Math.max(0, now - since)) : null;
  return (
    <div className="agent-activity-entry" data-state={phase ?? "active"} data-waiting={waitingFor ? "true" : undefined}>
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true" aria-label={statusLabel} />
      <AgentActivityBody steps={steps} stepsOpenByDefault={stepsOpenByDefault} live={phase !== "exiting"}>
        <AgentAvatar agent={agent} mood={waitingFor ? "connecting" : "working"} className="agent-activity-avatar" />
        <span className="agent-activity-label">{shown}</span>
        {elapsed ? <span className="agent-activity-elapsed">{elapsed}</span> : null}
      </AgentActivityBody>
    </div>
  );
}

/**
 * The activity line, with a chevron that opens the steps of the running work under it. The faces
 * and the label come as children, so every caller has one steps toggle.
 */
export function AgentActivityBody({
  className,
  steps,
  stepsOpenByDefault,
  live,
  children,
}: {
  /** A class for the line besides `agent-activity-content`. */
  className?: string;
  steps?: readonly StepItem[] | undefined;
  /** The steps are open when the work starts. */
  stepsOpenByDefault?: boolean | undefined;
  live: boolean;
  children: ReactNode;
}) {
  const stepsId = useId();
  const [stepsChoice, setStepsChoice] = useState<boolean>();
  const hasSteps = (steps?.length ?? 0) > 0;
  // A new turn starts with no steps, and with the default again.
  if (!hasSteps && stepsChoice !== undefined) setStepsChoice(undefined);
  const stepsOpen = hasSteps && (stepsChoice ?? stepsOpenByDefault === true);
  return (
    <div className="agent-activity-body">
      <section className={className ? `agent-activity-content ${className}` : "agent-activity-content"} aria-label="Current activity">
        {children}
        {hasSteps ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="agent-steps-toggle"
            aria-expanded={stepsOpen ? "true" : "false"}
            aria-controls={stepsOpen ? stepsId : undefined}
            aria-label={stepsOpen ? "Hide steps" : "Show steps"}
            onClick={() => setStepsChoice(!stepsOpen)}
          >
            <ChevronDown className="agent-steps-chevron" aria-hidden="true" />
          </Button>
        ) : null}
      </section>
      {stepsOpen ? (
        <div className="agent-activity-steps">
          <AgentStepList id={stepsId} steps={steps ?? []} live={live} />
        </div>
      ) : null}
    </div>
  );
}

function pickDifferent<T>(items: readonly T[], previous: T | undefined, random: () => number): T {
  const choices = previous === undefined ? items : items.filter((item) => item !== previous);
  const value = random();
  const normalized = Number.isFinite(value) ? Math.min(Math.max(value, 0), 0.999_999) : 0;
  const selected = choices[Math.floor(normalized * choices.length)];
  if (selected === undefined) throw new Error("Agent activity options are empty.");
  return selected;
}

function pickActivityLabel(previous: AgentActivityLabel | undefined, random: () => number): AgentActivityLabel {
  const tone = random();
  const pool = Number.isFinite(tone) && tone >= 0.7 ? PLAYFUL_ACTIVITY_LABELS : FACTUAL_ACTIVITY_LABELS;
  return pickDifferent(pool, previous, random);
}
