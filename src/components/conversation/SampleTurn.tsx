"use client";

import { MessageSquare, Search, Wrench } from "lucide-react";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/common/Avatar";
import { useReducedMotion } from "@/lib/client/reduced-motion";
import type { Agent } from "@/lib/types";

const STEP_MS = 900;
const HOLD_TICKS = 3;

const SAMPLES = {
  orchestrator: {
    prompt: "What is everyone doing?",
    steps: [
      { icon: Search, text: "Reading the roadmap" },
      { icon: MessageSquare, text: "Asking the team" },
      { icon: Wrench, text: "Writing the update" },
    ],
  },
  teammate: {
    prompt: "Take the next work order.",
    steps: [
      { icon: Search, text: "Reading the work order" },
      { icon: Wrench, text: "Making the change" },
      { icon: MessageSquare, text: "Asking for a review" },
    ],
  },
} as const;

/** Decoration only, so it stays hidden from assistive technology and out of the tab order. */
export function SampleTurn({ agent }: { agent: Agent }) {
  const still = useReducedMotion();
  const sample = SAMPLES[agent.role];
  const turnLength = 2 + sample.steps.length + HOLD_TICKS + 1;
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (still) return;
    const timer = setInterval(() => setTick((value) => value + 1), STEP_MS);
    return () => clearInterval(timer);
  }, [still]);

  const phase = still ? 1 + sample.steps.length : tick % turnLength;
  const showing = Math.floor(tick / turnLength);
  const shownSteps = sample.steps.slice(0, Math.max(0, phase - 1));
  const leaving = !still && phase === turnLength - 1;

  return (
    <div className="sample-turn" aria-hidden="true" inert>
      {phase > 0 ? (
        <div key={showing} className="sample-showing" data-leaving={leaving ? "" : undefined}>
          <div className="entry entry-user">
            <div className="bubble bubble-user">{sample.prompt}</div>
          </div>
          {shownSteps.length > 0 ? (
            <div className="activity">
              <div className="activity-line">
                <Avatar agent={agent} size={32} />
                <span className="activity-label shine">Getting into it</span>
              </div>
              <div className="activity-steps">
                <ol className="step-list">
                  {shownSteps.map((step) => (
                    <li key={step.text} className="step-row">
                      <step.icon className="icon step-icon" size={12} aria-hidden="true" />
                      <span>{step.text}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
