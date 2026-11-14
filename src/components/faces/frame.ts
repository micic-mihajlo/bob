import { blinkAt, expressionAt, restingGaze } from "./expression";
import type { FaceFrame, FaceRenderer, Mood, Traits, Vec } from "./types";

export type MoodMark = { readonly mood: Mood; readonly prev: Mood; readonly since: number };

export type FaceInput = {
  readonly size: number;
  readonly hue: number;
  readonly traits: Traits;
  readonly mark: MoodMark;
};

const LOOK_RADIUS = 320;
/** The moment a still (reduced-motion) face is drawn at: past the entrance, inside responded's smile. */
const STILL_MOOD_T = 0.8;

/** Unit gaze toward the pointer when it is within reach, else null. */
export function pointerGaze(element: Element, pointer: Vec | null, size: number): Vec | null {
  if (!pointer) return null;
  const rect = element.getBoundingClientRect();
  const dx = pointer.x - (rect.left + rect.width / 2);
  const dy = pointer.y - (rect.top + rect.height / 2);
  const dist = Math.hypot(dx, dy);
  if (dist > LOOK_RADIUS) return null;
  const reach = Math.min(1, dist / Math.max(size, 40));
  return dist < 0.001 ? { x: 0, y: 0 } : { x: (dx / dist) * reach, y: (dy / dist) * reach };
}

/** Time-based easing so 12fps and 30fps eyes settle at the same speed. */
export function easeLook(from: Vec, to: Vec, dt: number): Vec {
  const k = 1 - Math.exp(-Math.max(0, dt) * 14);
  return { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
}

export function liveFrame(input: FaceInput, now: number, look: Vec): FaceFrame {
  const t = now / 1000;
  const moodT = (now - input.mark.since) / 1000;
  const { expr, shown } = expressionAt(input.mark.mood, input.mark.prev, moodT);
  return {
    size: input.size,
    unit: 100 / input.size,
    t,
    traits: input.traits,
    hue: input.hue,
    mood: input.mark.mood,
    prevMood: input.mark.prev,
    moodT,
    expr,
    shown,
    look,
    blink: blinkAt(input.traits.hash, t),
  };
}

export function stillFrame(input: FaceInput): FaceFrame {
  const mood = input.mark.mood;
  const { expr, shown } = expressionAt(mood, mood, STILL_MOOD_T);
  return {
    size: input.size,
    unit: 100 / input.size,
    t: 0,
    traits: input.traits,
    hue: input.hue,
    mood,
    prevMood: mood,
    moodT: STILL_MOOD_T,
    expr,
    shown,
    look: expr.gaze,
    blink: 0,
  };
}

export function gazeTarget(frame: FaceFrame, toPointer: Vec | null): Vec {
  return toPointer ?? restingGaze(frame.shown, frame.expr, frame.traits.hash, frame.t);
}

export function paint(ctx: CanvasRenderingContext2D, renderer: FaceRenderer, frame: FaceFrame, pixels: number) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, pixels, pixels);
  ctx.setTransform(pixels / 100, 0, 0, pixels / 100, 0, 0);
  ctx.save();
  renderer.draw(ctx, frame);
  ctx.restore();
}
