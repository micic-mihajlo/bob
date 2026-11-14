"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { prefersReducedMotion } from "@/lib/client/reduced-motion";
import type { Agent } from "@/lib/types";
import { avatarBreathe, avatarMoodIsBusy, type AvatarMood } from "./agent-mood";
import { builderPixels, BUILDER_PALETTE, type BuilderState } from "./builder-sprite";
import { asciiFaceFrame, asciiFaceIdentity, asciiFaceSettled, drawAsciiFace, easeAsciiFaceFrame, type AsciiFaceFrame } from "./ascii-face";

/**
 * When an avatar animates: `hover` and `idle` rest until a pointer or keyboard focus reaches the control
 * it sits in, `always` runs. A busy mood (working) moves regardless.
 */
export type AvatarMotion = "hover" | "always" | "idle";

export interface AgentAvatarProps {
  agent: (Pick<Agent, "id" | "hue"> & { kind?: Agent["kind"] }) | undefined;
  mood?: AvatarMood;
  motion?: AvatarMotion;
  /** The head turns toward the pointer. Use it only where few avatars show. */
  followPointer?: boolean;
  className?: string;
  style?: CSSProperties;
}

// Cap the head at 30fps: at 24-40px the eye cannot see the difference, and the CPU can.
const AVATAR_FPS = 30;
// The print themes draw the head on twos, at 12fps, like a hand-drawn cartoon.
const PRINT_FPS = 12;
const HOVER_GROUP = "[data-avatar-hover], button, a, [role='button'], [role='link'], [role='menuitem']";
const GAZE_DISTANCE = 320;

const BUILDER_STATE: Record<AvatarMood, BuilderState> = {
  idle: "idle",
  working: "working",
  waiting: "needs-you",
  failed: "error",
  responded: "idle",
  connecting: "working",
  asleep: "idle",
};

/** One frame of the builder as runs of same-coloured pixels, one rect per run. */
function BuilderFrame({ state, frame }: { state: BuilderState; frame: 0 | 1 }) {
  return builderPixels(state, "small", frame).flatMap((row, y) => {
    const runs = [];
    for (let x = 0; x < row.length;) {
      let end = x + 1;
      while (end < row.length && row[end] === row[x]) end += 1;
      if (row[x] !== ".") runs.push(<rect key={`${x}-${y}`} x={x} y={y} width={end - x} height={1} fill={BUILDER_PALETTE[row[x]]} />);
      x = end;
    }
    return runs;
  });
}

/** The captain is Bob himself: the pixel builder in a hard hat. Working swings the hammer, waiting raises a hand, failed shows X eyes. */
function BuilderAvatar({ mood, className, style }: { mood: AvatarMood; className?: string; style?: CSSProperties }) {
  const state = BUILDER_STATE[mood];
  return (
    <span className={`agent-avatar agent-avatar-builder ${className ?? ""}`} style={style} data-avatar="builder" data-mood={mood} aria-hidden="true">
      <svg viewBox="0 0 16 16" shapeRendering="crispEdges">
        {state === "working" ? (
          <>
            <g data-frame="0">
              <BuilderFrame state={state} frame={0} />
            </g>
            <g data-frame="1">
              <BuilderFrame state={state} frame={1} />
            </g>
          </>
        ) : (
          <BuilderFrame state={state} frame={0} />
        )}
      </svg>
    </span>
  );
}

/** The agent's face: the builder for the captain, an animated ASCII head for the crew. Size it with CSS on the element. */
export function AgentAvatar(props: AgentAvatarProps) {
  if (props.agent?.kind === "captain") return <BuilderAvatar mood={props.mood ?? "idle"} className={props.className} style={props.style} />;
  return <AsciiAvatar {...props} />;
}

/** The agent's animated ASCII head, drawn on a canvas. */
function AsciiAvatar({ agent, mood = "idle", motion = "hover", followPointer = false, className, style }: AgentAvatarProps) {
  const element = useRef<HTMLSpanElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [interacting, setInteracting] = useState(false);
  const seed = agent?.id ?? "";
  const hue = agent?.hue ?? null;
  const live = useRef({ identity: asciiFaceIdentity(seed, hue), mood, moving: false });
  const look = useRef<{ x: number; y: number } | null>(null);
  const wake = useRef<() => void>(() => {});

  useEffect(() => {
    const host = element.current;
    if (!host) return;
    const group = host.closest<HTMLElement>(`${HOVER_GROUP}, [tabindex]`);
    const target = group?.matches(HOVER_GROUP) ? group : host;
    const start = () => setInteracting(true);
    const stop = () => setInteracting(false);
    const startFocus = (event: FocusEvent) => {
      if (event.target instanceof Element && event.target.matches(":focus-visible")) start();
    };
    const stopFocus = (event: FocusEvent) => {
      if (!(event.relatedTarget instanceof Node) || !target.contains(event.relatedTarget)) stop();
    };
    target.addEventListener("pointerenter", start);
    target.addEventListener("pointerleave", stop);
    target.addEventListener("focusin", startFocus);
    target.addEventListener("focusout", stopFocus);

    const context = canvas.current?.getContext("2d") ?? null;
    const reduced = prefersReducedMotion();
    let size = 0;
    let visible = true;
    let handle = 0;
    let previousFrameAt = 0;
    let drawnAt = -Infinity;
    let time = 0;
    let current: AsciiFaceFrame | null = null;
    const goalFor = (animated: boolean) => asciiFaceFrame(live.current.mood, time + live.current.identity.phase, animated, 0, look.current);
    const draw = (frame: AsciiFaceFrame) => {
      const surface = canvas.current;
      if (!context || !surface || size === 0) return;
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const pixels = Math.round(size * ratio);
      if (surface.width !== pixels) {
        surface.width = pixels;
        surface.height = pixels;
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      drawAsciiFace(context, size, live.current.identity, frame);
    };
    const step = (now: number) => {
      handle = 0;
      const dt = previousFrameAt ? Math.min((now - previousFrameAt) / 1000, 0.064) : 0;
      previousFrameAt = now;
      time += dt;
      const goal = goalFor(live.current.moving);
      current = current ? easeAsciiFaceFrame(current, goal, dt) : goal;
      const fps = document.documentElement.hasAttribute("data-print") ? PRINT_FPS : AVATAR_FPS;
      if (now - drawnAt >= 1000 / fps) {
        drawnAt = now;
        draw(current);
      }
      if (live.current.moving || !asciiFaceSettled(current, goal)) handle = requestAnimationFrame(step);
      else draw(current);
    };
    wake.current = () => {
      if (reduced || !visible) {
        current = goalFor(false);
        draw(current);
        return;
      }
      if (handle) return;
      previousFrameAt = 0;
      handle = requestAnimationFrame(step);
    };
    const resize = new ResizeObserver(([entry]) => {
      size = (entry?.contentRect.width ?? 0) * 1.5;
      draw(current ?? goalFor(false));
    });
    resize.observe(host);
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
      if (!visible && handle) {
        cancelAnimationFrame(handle);
        handle = 0;
      }
      wake.current();
    });
    observer.observe(host);
    wake.current();

    return () => {
      target.removeEventListener("pointerenter", start);
      target.removeEventListener("pointerleave", stop);
      target.removeEventListener("focusin", startFocus);
      target.removeEventListener("focusout", stopFocus);
      resize.disconnect();
      observer.disconnect();
      if (handle) cancelAnimationFrame(handle);
      wake.current = () => {};
    };
  }, []);

  useEffect(() => {
    live.current = {
      identity: asciiFaceIdentity(seed, hue),
      mood,
      moving: avatarMoodIsBusy(mood) || motion === "always" || followPointer || interacting,
    };
    wake.current();
  }, [seed, hue, mood, motion, followPointer, interacting]);

  useEffect(() => {
    if (!followPointer || prefersReducedMotion()) return;
    const turn = (event: PointerEvent) => {
      const host = element.current;
      if (!host || event.pointerType === "touch") return;
      const box = host.getBoundingClientRect();
      look.current = {
        x: Math.max(-1, Math.min(1, (event.clientX - (box.left + box.width / 2)) / GAZE_DISTANCE)),
        y: Math.max(-1, Math.min(1, (event.clientY - (box.top + box.height / 2)) / GAZE_DISTANCE)),
      };
    };
    window.addEventListener("pointermove", turn, { passive: true });
    return () => {
      window.removeEventListener("pointermove", turn);
      look.current = null;
    };
  }, [followPointer]);

  const breathe = avatarBreathe(mood);
  const breatheStyle = breathe > 0 ? ({ "--agent-avatar-breathe": String(breathe) } as CSSProperties) : undefined;

  return (
    <span
      ref={element}
      className={`agent-avatar agent-avatar-motion-${motion} ${className ?? ""} agent-avatar-bob`}
      style={{ ...style, ...breatheStyle }}
      data-avatar="generated"
      data-mood={mood}
      data-breathe={breathe > 0 ? String(breathe) : undefined}
      data-interacting={interacting ? "" : undefined}
      aria-hidden="true"
    >
      <canvas ref={canvas} className="agent-avatar-ascii" />
    </span>
  );
}
