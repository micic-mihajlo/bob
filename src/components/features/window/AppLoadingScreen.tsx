"use client";

import "./app-loading-screen.css";
import { useEffect, useRef, useState, type AnimationEvent, type CSSProperties } from "react";
import { AgentAvatar } from "@/components/features/agents/AgentAvatar";

/*
 * One clock drives the whole screen, so each run shows the same frames. Each frame is a function of
 * the elapsed time: the status line. The CSS animations start at the same time as the clock:
 * `--app-loading-at` moves them back to the clock's time when the screen mounts.
 */
const CREW_FPS = 30;
const WAVE_S = 1.6;
const HOP_STAGGER_S = 0.14;
const LOOP_S = WAVE_S * 3;
const STATUS_EVERY_S = LOOP_S / 2;
const QUICK_EXIT_S = 0.6;
const EXIT_LIMIT_MS = 2500;
const EXIT_ANIMATION = "app-loading-exit";

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
const SNORE_MARKS = [0, 1, 2];

const HANDOFF_MS = 1000;
const sharedClock = { start: 0, screens: 0, lastUnmount: Number.NEGATIVE_INFINITY };

/** The clock time in seconds for a screen that mounts now. A new run starts when no screen is shown. */
function clockTime(now: number): number {
  if (sharedClock.screens === 0 && now - sharedClock.lastUnmount > HANDOFF_MS) sharedClock.start = now;
  return (now - sharedClock.start) / 1000;
}

function snapToFrame(seconds: number): number {
  return Math.floor(seconds * CREW_FPS) / CREW_FPS;
}

export interface AppLoadingScreenProps {
  /** The app is ready: the crew jumps out and the screen fades. Remove the screen in `onExited`. */
  ready?: boolean;
  onExited?: () => void;
  /** The reason the first snapshot could not load. The whole crew falls asleep beside it. */
  error?: string | null;
}

/**
 * The loading screen while the first snapshot loads: three faces hop in a wave, a fourth sleeps and
 * snores, and a joke status line changes below. When the app is ready the crew jumps out and the
 * screen fades.
 */
export function AppLoadingScreen({ ready = false, onExited, error = null }: AppLoadingScreenProps) {
  const [mountedAt] = useState(() => snapToFrame(clockTime(performance.now())));
  const [clock, setClock] = useState(mountedAt);
  const root = useRef<HTMLElement>(null);
  const exited = useRef(false);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onExitedRef = useRef(onExited);
  onExitedRef.current = onExited;
  const stopped = ready || error !== null;
  const status = STATUS_LINES[Math.floor(clock / STATUS_EVERY_S) % STATUS_LINES.length] ?? STATUS_LINES[0];
  const phase = !ready ? "loading" : clock < QUICK_EXIT_S ? "fade" : "exit";

  const finishExit = () => {
    if (exited.current) return;
    exited.current = true;
    clearTimeout(exitTimer.current);
    onExitedRef.current?.();
  };

  useEffect(() => {
    sharedClock.screens += 1;
    return () => {
      sharedClock.screens -= 1;
      sharedClock.lastUnmount = performance.now();
    };
  }, []);

  useEffect(() => {
    if (stopped) return;
    let frameRequest = 0;
    const start = performance.now();
    const tick = (now: number) => {
      frameRequest = requestAnimationFrame(tick);
      setClock(snapToFrame(mountedAt + Math.max(0, now - start) / 1000));
    };
    frameRequest = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRequest);
  }, [stopped, mountedAt]);

  useEffect(() => {
    if (!ready) return;
    exitTimer.current ??= setTimeout(finishExit, EXIT_LIMIT_MS);
    if (root.current && !getComputedStyle(root.current).animationName.includes(EXIT_ANIMATION)) queueMicrotask(finishExit);
    return () => clearTimeout(exitTimer.current);
  }, [ready]);

  const handleAnimationEnd = (event: AnimationEvent<HTMLElement>) => {
    if (event.animationName === EXIT_ANIMATION && event.target === event.currentTarget) finishExit();
  };

  return (
    <main
      ref={root}
      className="app-loading"
      style={{ "--app-loading-wave": `${WAVE_S}s`, "--app-loading-stagger": `${HOP_STAGGER_S}s`, "--app-loading-at": `${mountedAt}s` } as CSSProperties}
      data-phase={phase}
      data-error={error === null ? undefined : "true"}
      role={error === null ? "status" : "alert"}
      aria-live="polite"
      aria-busy={ready ? "false" : "true"}
      onAnimationEnd={handleAnimationEnd}
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
              {SNORE_MARKS.map((mark) => (
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
        <p className="app-loading-status">
          <span key={error === null ? status : "error"} className="app-loading-line">
            {error === null ? status : "Could not load Bob"}
          </span>
        </p>
        {error === null ? null : <p className="server-connection-detail">{error}</p>}
      </div>
    </main>
  );
}
