import type { Vec } from "./types";

export type Tick = (now: number, pointer: Vec | null) => void;

type Subscriber = {
  readonly fps: number;
  readonly tick: Tick;
  visible: boolean;
  lastFrame: number;
};

export type ClockStats = {
  readonly faces: number;
  readonly visible: number;
  readonly painted: number;
  /** Mean milliseconds spent in face ticks per animation frame, over the last second. */
  readonly msPerFrame: number;
  readonly running: boolean;
};

const MAX_FPS = 30;

const subscribers = new Map<Element, Subscriber>();
let observer: IntersectionObserver | null = null;
let frameId = 0;
let pointer: Vec | null = null;
let window1s = { frames: 0, ms: 0, painted: 0, startedAt: 0 };
let stats: ClockStats = { faces: 0, visible: 0, painted: 0, msPerFrame: 0, running: false };

function shouldRun(): boolean {
  if (document.visibilityState !== "visible") return false;
  for (const sub of subscribers.values()) if (sub.visible) return true;
  return false;
}

function loop(now: number) {
  frameId = 0;
  const started = performance.now();
  let painted = 0;
  let visible = 0;
  for (const sub of subscribers.values()) {
    if (!sub.visible) continue;
    visible++;
    const frame = Math.floor((now / 1000) * Math.min(sub.fps, MAX_FPS));
    if (frame === sub.lastFrame) continue;
    sub.lastFrame = frame;
    sub.tick(now, pointer);
    painted++;
  }
  record(now, performance.now() - started, painted, visible);
  schedule();
}

function record(now: number, ms: number, painted: number, visible: number) {
  window1s = { frames: window1s.frames + 1, ms: window1s.ms + ms, painted: window1s.painted + painted, startedAt: window1s.startedAt || now };
  if (now - window1s.startedAt < 1000) return;
  stats = {
    faces: subscribers.size,
    visible,
    painted: window1s.painted,
    msPerFrame: window1s.ms / window1s.frames,
    running: true,
  };
  window1s = { frames: 0, ms: 0, painted: 0, startedAt: now };
}

function schedule() {
  if (frameId || !shouldRun()) {
    if (!frameId) stats = { ...stats, faces: subscribers.size, running: false };
    return;
  }
  frameId = requestAnimationFrame(loop);
}

function onPointerMove(event: PointerEvent) {
  pointer = { x: event.clientX, y: event.clientY };
}

function onPointerOut(event: PointerEvent) {
  if (!event.relatedTarget) pointer = null;
}

function onVisibility() {
  schedule();
}

function start() {
  observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const sub = subscribers.get(entry.target);
      if (sub) sub.visible = entry.isIntersecting;
    }
    schedule();
  });
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  document.addEventListener("pointerout", onPointerOut);
  document.addEventListener("visibilitychange", onVisibility);
}

function stop() {
  observer?.disconnect();
  observer = null;
  if (frameId) cancelAnimationFrame(frameId);
  frameId = 0;
  window.removeEventListener("pointermove", onPointerMove);
  document.removeEventListener("pointerout", onPointerOut);
  document.removeEventListener("visibilitychange", onVisibility);
  stats = { faces: 0, visible: 0, painted: 0, msPerFrame: 0, running: false };
}

/** Joins the one shared animation loop. Ticks only while `element` is on screen and the tab is visible. */
export function subscribe(element: Element, fps: number, tick: Tick): () => void {
  if (!observer) start();
  subscribers.set(element, { fps, tick, visible: false, lastFrame: -1 });
  observer?.observe(element);
  return () => {
    observer?.unobserve(element);
    subscribers.delete(element);
    if (subscribers.size === 0) stop();
  };
}

export function clockStats(): ClockStats {
  return stats;
}
