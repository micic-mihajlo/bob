"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { AgentAvatar } from "@/components/features/agents/AgentAvatar";
import { Button } from "@/components/ui/Button";
import { timeOf, type StepItem } from "@/lib/client/thread-rows";
import { useNow } from "@/lib/client/use-now";
import type { Agent } from "@/lib/types";
import { AgentStepList } from "./AgentSteps";

/** A step shorter than this shows no time; a counter that appears and goes at once is only noise. */
const ELAPSED_VISIBLE_AFTER_MS = 5_000;

/** The reference's first activity line, for a turn that has no step yet. */
export const DEFAULT_ACTIVITY_LABEL = "Working on it…";

function elapsedLabel(ms: number): string | null {
  if (ms < ELAPSED_VISIBLE_AFTER_MS) return null;
  const total = Math.floor(ms / 1_000);
  if (total < 60) return `${total}s`;
  return `${Math.floor(total / 60)}m ${total % 60}s`;
}

/** The line the conversation shows while an agent works, with its running steps under a chevron. */
export function AgentActivityIndicator({
  agent,
  label,
  since,
  steps,
}: {
  agent: Agent;
  label: string;
  since: string;
  steps: readonly StepItem[];
}) {
  const now = useNow(true);
  const elapsed = now === 0 ? null : elapsedLabel(Math.max(0, now - timeOf(since)));
  return (
    <div className="agent-activity-entry" data-state="active">
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true" aria-label={`${agent.name} is working: ${label}`} />
      <AgentActivityBody steps={steps} live>
        <AgentAvatar agent={agent} mood="working" className="agent-activity-avatar" />
        <span className="agent-activity-label">{label}</span>
        {elapsed ? <span className="agent-activity-elapsed">{elapsed}</span> : null}
      </AgentActivityBody>
    </div>
  );
}

function AgentActivityBody({ steps, live, children }: { steps: readonly StepItem[]; live: boolean; children: ReactNode }) {
  const stepsId = useId();
  const [choice, setChoice] = useState<boolean | null>(null);
  const hasSteps = steps.length > 0;
  const stepsOpen = hasSteps && (choice ?? false);
  return (
    <div className="agent-activity-body">
      <section className="agent-activity-content" aria-label="Current activity">
        {children}
        {hasSteps ? (
          <Button
            variant="ghost"
            size="icon-xs"
            className="agent-steps-toggle"
            aria-expanded={stepsOpen ? "true" : "false"}
            aria-controls={stepsOpen ? stepsId : undefined}
            aria-label={stepsOpen ? "Hide steps" : "Show steps"}
            onClick={() => setChoice(!stepsOpen)}
          >
            <ChevronDown className="agent-steps-chevron" aria-hidden="true" />
          </Button>
        ) : null}
      </section>
      {stepsOpen ? (
        <div className="agent-activity-steps">
          <AgentStepList id={stepsId} steps={steps} live={live} />
        </div>
      ) : null}
    </div>
  );
}
