import { noise } from "../seed";
import type { FaceFrame, Traits } from "../types";

const ASPECT: Record<Traits["head"], { x: number; y: number }> = {
  round: { x: 1, y: 1 },
  squircle: { x: 1.04, y: 0.96 },
  tall: { x: 0.86, y: 1.08 },
  wide: { x: 1.14, y: 0.88 },
  egg: { x: 0.95, y: 1.03 },
};

export type Pose = {
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
  /** Horizontal scale; vertical is its inverse so volume reads as conserved. */
  readonly sx: number;
  readonly sy: number;
  readonly floor: number;
};

/** Damped spring response to a mood change, solved in closed form so it needs no stored velocity. */
function springKick(moodT: number): number {
  return 0.14 * Math.exp(-6.5 * moodT) * Math.cos(19 * moodT);
}

function moodMotion(f: FaceFrame): { k: number; lift: number } {
  const t = f.t + f.traits.phase * 3;
  switch (f.shown) {
    case "working": {
      const bounce = Math.abs(Math.sin(Math.PI * 2.6 * t));
      return { k: 0.09 * (1 - bounce) ** 3 - 0.04 * bounce, lift: bounce * 4 };
    }
    case "waiting":
      return { k: 0.035 * Math.sin(Math.PI * 2 * 0.32 * t), lift: 0 };
    case "needs_you": {
      const hop = Math.abs(Math.sin(Math.PI * 1.7 * t));
      return { k: 0.14 * (1 - hop) ** 4 - 0.07 * hop, lift: hop * 9 };
    }
    case "failed":
      return { k: 0.13 + 0.015 * Math.sin(t * 1.4), lift: 0 };
    case "responded": {
      const decay = Math.exp(-f.moodT * 1.3);
      const hop = Math.abs(Math.sin(Math.PI * 2.1 * f.moodT));
      return { k: (0.12 * (1 - hop) ** 4 - 0.06 * hop) * decay, lift: hop * 11 * decay };
    }
    case "idle":
      return { k: 0.025 * Math.sin(Math.PI * 2 * 0.45 * t), lift: 0 };
  }
}

export function poseFor(f: FaceFrame): Pose {
  const motion = moodMotion(f);
  const k = motion.k + springKick(f.moodT);
  const r = f.size <= 28 ? 40 : 35;
  const floor = f.size <= 28 ? 94 : 90;
  return { cx: 50, cy: floor - r - motion.lift, r, sx: 1 + k, sy: 1 / (1 + k), floor };
}

/** Body outline: an ellipse perturbed by two seeded harmonics and a slow living wobble. */
export function bodyPath(ctx: CanvasRenderingContext2D, f: FaceFrame, pose: Pose) {
  const aspect = ASPECT[f.traits.head];
  const h = f.traits.hash;
  const a2 = 0.02 + noise(h, 1) * 0.05;
  const a3 = 0.015 + noise(h, 2) * 0.04;
  const p2 = noise(h, 3) * Math.PI * 2;
  const p3 = noise(h, 4) * Math.PI * 2;
  const live = f.shown === "working" ? 0.025 : 0.012;
  const steps = f.size <= 28 ? 28 : 48;
  const bottom = pose.cy + pose.r * aspect.y;
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const wob = 1 + a2 * Math.cos(2 * a + p2) + a3 * Math.cos(3 * a + p3) + live * Math.sin(4 * a + f.t * 3);
    const egg = f.traits.head === "egg" ? 1 + 0.1 * Math.sin(a) : 1;
    const x = Math.cos(a) * pose.r * aspect.x * wob * egg;
    const y = Math.sin(a) * pose.r * aspect.y * wob;
    const px = pose.cx + x * pose.sx;
    const py = bottom - (pose.r * aspect.y - y) * pose.sy;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/** Where the face sits inside the squashed body. */
export function faceAnchor(pose: Pose, f: FaceFrame) {
  const aspect = ASPECT[f.traits.head];
  const bottom = pose.cy + pose.r * aspect.y;
  return { x: pose.cx, y: bottom - pose.r * aspect.y * pose.sy * 1.05, sx: pose.sx, sy: pose.sy };
}
