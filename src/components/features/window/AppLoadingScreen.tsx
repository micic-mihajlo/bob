"use client";

import "./app-loading-screen.css";
import { useEffect, useState, type CSSProperties } from "react";
import { AgentAvatar } from "@/components/features/agents/AgentAvatar";

const WAVE_S = 1.6;
const HOP_STAGGER_S = 0.14;
const STATUS_EVERY_MS = WAVE_S * 1.5 * 1000;

const STATUS_LINES = [
  "Waking up the agents…",
  "Pouring coffee for the agents…",
  "Counting tokens on fingers…",
  "Untangling the prompts…",
  "Asking the sleepy one nicely…",
  "Almost there. Probably.",
];

const HOPPERS = [
  { id: "crew-hopper-one", hue: 215 },
  { id: "crew-hopper-two", hue: 320 },
  { id: "crew-hopper-three", hue: 55 },
];
const SLEEPER = { id: "crew-sleeper", hue: 185 };

// Three small scribbled "z" marks that float up from the sleeper's head, one after the other.
const Z_POINTS = "1.5 1.5 8.5 1.5 1.5 8.5 8.5 8.5";

/**
 * The reference's loading screen while the first snapshot loads: three faces hop in a wave, a fourth
 * sleeps and snores, and a joke status line changes below. On an error the whole crew falls asleep and
 * the error replaces the line.
 */
export function AppLoadingScreen({ error }: { error: string | null }) {
  const [line, setLine] = useState(0);
  useEffect(() => {
    if (error !== null) return;
    const timer = setInterval(() => setLine((index) => (index + 1) % STATUS_LINES.length), STATUS_EVERY_MS);
    return () => clearInterval(timer);
  }, [error]);

  return (
    <main
      className="app-loading"
      style={{ "--app-loading-wave": `${WAVE_S}s`, "--app-loading-stagger": `${HOP_STAGGER_S}s` } as CSSProperties}
      data-phase="loading"
      data-error={error === null ? undefined : "true"}
      role={error === null ? "status" : "alert"}
      aria-live="polite"
      aria-busy={error === null ? "true" : "false"}
    >
      <span className="sr-only">{error === null ? "Loading Bob" : `Could not load Bob. ${error}`}</span>
      <div className="app-loading-stage">
        <div className="app-loading-row" aria-hidden="true">
          {HOPPERS.map((hopper, index) => (
            <div key={hopper.id} className="app-loading-agent" style={{ "--app-loading-index": index } as CSSProperties}>
              <div className="app-loading-body">
                <AgentAvatar agent={hopper} mood={error === null ? "idle" : "asleep"} motion="always" className="app-loading-bot" />
              </div>
            </div>
          ))}
          <div className="app-loading-agent" data-sleeper="true">
            <div className="app-loading-snore">
              {[0, 1, 2].map((mark) => (
                <span key={mark} className="app-loading-z" style={{ "--app-loading-z-index": mark } as CSSProperties}>
                  <svg className="app-loading-z-mark" viewBox="0 0 10 10" aria-hidden="true">
                    <polyline points={Z_POINTS} />
                  </svg>
                </span>
              ))}
            </div>
            <div className="app-loading-body">
              <AgentAvatar agent={SLEEPER} mood="asleep" motion="always" className="app-loading-bot" />
            </div>
          </div>
        </div>
        <p className="app-loading-status" aria-hidden="true">
          {error === null ? (
            <span key={line} className="app-loading-line">
              {STATUS_LINES[line]}
            </span>
          ) : (
            <span className="app-loading-line">Could not load Bob. {error}</span>
          )}
        </p>
      </div>
    </main>
  );
}
