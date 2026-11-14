import { noise } from "./seed";
import type { Expression, Mood, Vec } from "./types";

const CENTER: Vec = { x: 0, y: 0 };

export const EXPRESSIONS: Record<Mood, Expression> = {
  idle: {
    eyeOpen: 1, pupil: 1, lid: 0.08, happy: 0, mouthCurve: 0.35, mouthOpen: 0, mouthWidth: 1,
    brow: 0, browLift: 0, droop: 0, bob: 1.2, bobHz: 0.35, gaze: CENTER, vivid: 1,
  },
  working: {
    eyeOpen: 0.82, pupil: 0.9, lid: 0.22, happy: 0, mouthCurve: 0, mouthOpen: 0.15, mouthWidth: 0.7,
    brow: 0.8, browLift: -0.2, droop: 0, bob: 1.6, bobHz: 2.4, gaze: { x: 0, y: 0.35 }, vivid: 1.05,
  },
  waiting: {
    eyeOpen: 0.9, pupil: 0.95, lid: 0.35, happy: 0, mouthCurve: 0.05, mouthOpen: 0, mouthWidth: 0.6,
    brow: -0.15, browLift: 0.15, droop: 0, bob: 1.4, bobHz: 0.22, gaze: { x: 0.55, y: -0.55 }, vivid: 0.95,
  },
  needs_you: {
    eyeOpen: 1.2, pupil: 1.25, lid: 0, happy: 0, mouthCurve: 0, mouthOpen: 0.55, mouthWidth: 0.45,
    brow: -0.35, browLift: 0.9, droop: 0, bob: 2.6, bobHz: 1.6, gaze: CENTER, vivid: 1.1,
  },
  failed: {
    eyeOpen: 0.6, pupil: 0.8, lid: 0.5, happy: 0, mouthCurve: -0.75, mouthOpen: 0.1, mouthWidth: 0.8,
    brow: -1, browLift: 0.2, droop: 1, bob: 0.5, bobHz: 0.15, gaze: { x: -0.2, y: 0.8 }, vivid: 0.45,
  },
  responded: {
    eyeOpen: 0.2, pupil: 1, lid: 0, happy: 1, mouthCurve: 1, mouthOpen: 0.7, mouthWidth: 1.15,
    brow: 0, browLift: 0.5, droop: 0, bob: 3, bobHz: 1.3, gaze: CENTER, vivid: 1.1,
  },
};

const BLEND_SECONDS = 0.28;
/** How long "responded" holds its smile before settling back to idle. */
export const RESPONDED_HOLD = 2.4;
const SETTLE_SECONDS = 0.7;

function mix(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}

function blend(a: Expression, b: Expression, k: number): Expression {
  if (k >= 1) return b;
  if (k <= 0) return a;
  return {
    eyeOpen: mix(a.eyeOpen, b.eyeOpen, k),
    pupil: mix(a.pupil, b.pupil, k),
    lid: mix(a.lid, b.lid, k),
    happy: mix(a.happy, b.happy, k),
    mouthCurve: mix(a.mouthCurve, b.mouthCurve, k),
    mouthOpen: mix(a.mouthOpen, b.mouthOpen, k),
    mouthWidth: mix(a.mouthWidth, b.mouthWidth, k),
    brow: mix(a.brow, b.brow, k),
    browLift: mix(a.browLift, b.browLift, k),
    droop: mix(a.droop, b.droop, k),
    bob: mix(a.bob, b.bob, k),
    bobHz: mix(a.bobHz, b.bobHz, k),
    gaze: { x: mix(a.gaze.x, b.gaze.x, k), y: mix(a.gaze.y, b.gaze.y, k) },
    vivid: mix(a.vivid, b.vivid, k),
  };
}

const easeOut = (k: number) => 1 - (1 - k) * (1 - k);

/** Expression for a mood `moodT` seconds after it began, eased out of the previous mood. */
export function expressionAt(mood: Mood, prevMood: Mood, moodT: number): { expr: Expression; shown: Mood } {
  const entering = easeOut(Math.min(1, Math.max(0, moodT / BLEND_SECONDS)));
  const expr = blend(EXPRESSIONS[prevMood], EXPRESSIONS[mood], entering);
  if (mood !== "responded" || moodT < RESPONDED_HOLD) return { expr, shown: mood };
  const settle = easeOut(Math.min(1, (moodT - RESPONDED_HOLD) / SETTLE_SECONDS));
  return { expr: blend(expr, EXPRESSIONS.idle, settle), shown: settle < 0.5 ? "responded" : "idle" };
}

const BLINK_SLOT = 0.9;
const BLINK_LENGTH = 0.16;

function blinkInSlot(hash: number, slot: number, t: number): number {
  const roll = noise(hash, slot, 7);
  if (roll > 0.26) return 0;
  const start = slot * BLINK_SLOT + noise(hash, slot, 11) * (BLINK_SLOT - BLINK_LENGTH);
  const double = roll < 0.05 ? [start, start + 0.28] : [start];
  return Math.max(
    ...double.map((s) => {
      const k = (t - s) / BLINK_LENGTH;
      return k < 0 || k > 1 ? 0 : 1 - Math.abs(k * 2 - 1);
    }),
  );
}

/** Eye closedness 0..1 at time t. Each 0.9s slot rolls for a blink, so intervals are irregular but replayable. */
export function blinkAt(hash: number, t: number): number {
  const slot = Math.floor(t / BLINK_SLOT);
  return Math.max(blinkInSlot(hash, slot, t), blinkInSlot(hash, slot - 1, t));
}

/** Where the eyes rest when the cursor is far away. Working eyes dart between lines of work. */
export function restingGaze(shown: Mood, expr: Expression, hash: number, t: number): Vec {
  if (shown !== "working") return expr.gaze;
  const beat = Math.floor(t / 0.45);
  return { x: (noise(hash, beat, 3) - 0.5) * 1.6, y: expr.gaze.y + (noise(hash, beat, 5) - 0.5) * 0.4 };
}
