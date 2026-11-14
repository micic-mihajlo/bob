import { noise } from "../seed";
import { INK, PAPER } from "../palette";
import type { FaceFrame } from "../types";

export const CYAN = "#12b5ea";
export const MAGENTA = "#f0287f";
export const YELLOW = "#ffd21f";

export type Lod = "tiny" | "small" | "large";

export type PrintCtx = {
  readonly ctx: CanvasRenderingContext2D;
  readonly f: FaceFrame;
  readonly lod: Lod;
  /** The 12fps stepped time every print motion uses. */
  readonly ft: number;
  readonly frameNo: number;
  /** Ink weight in face units, never thinner than ~1.3 CSS px. */
  readonly ink: number;
};

export function printCtx(ctx: CanvasRenderingContext2D, f: FaceFrame): PrintCtx {
  const frameNo = Math.floor(f.t * 12);
  const lod: Lod = f.size <= 28 ? "tiny" : f.size <= 48 ? "small" : "large";
  return { ctx, f, lod, ft: frameNo / 12, frameNo, ink: Math.max(3, 1.35 * f.unit) };
}

/** Line boil: the ink layer shifts a hair every second frame ("on twos"), like redrawn cels. */
export function boil(p: PrintCtx, salt: number): { x: number; y: number; a: number } {
  const beat = Math.floor(p.frameNo / 2);
  const amp = Math.min(1.1, 0.4 * p.f.unit);
  return {
    x: (noise(p.f.traits.hash, beat, salt) - 0.5) * amp * 2,
    y: (noise(p.f.traits.hash, beat, salt + 1) - 0.5) * amp * 2,
    a: (noise(p.f.traits.hash, beat, salt + 2) - 0.5) * 0.02,
  };
}

type InkedOptions = {
  readonly fill: string;
  /** Paper die-cut halo so black ink survives on a dark page. */
  readonly paper?: boolean;
  readonly ghost?: boolean;
  /** Painted after the flat fill, clipped to the shape (halftone shading). */
  readonly shade?: () => void;
  readonly salt?: number;
};

/** One printed shape: paper halo, misregistered cyan and magenta plates, heavy ink lip, flat fill, boiling outline. */
export function inked(p: PrintCtx, build: () => void, opts: InkedOptions) {
  const { ctx, ink } = p;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  if (opts.paper) {
    build();
    ctx.fillStyle = PAPER;
    ctx.strokeStyle = PAPER;
    ctx.lineWidth = ink * 2 + Math.max(4, 2.2 * p.f.unit);
    ctx.stroke();
    ctx.fill();
  }
  if (opts.ghost) {
    const g = Math.max(2.4, 0.9 * p.f.unit);
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.translate(-g, g * 0.6);
    build();
    ctx.fillStyle = CYAN;
    ctx.fill();
    ctx.translate(g * 2, -g * 1.2);
    build();
    ctx.fillStyle = MAGENTA;
    ctx.fill();
    ctx.restore();
  }
  ctx.save();
  ctx.translate(ink * 0.32, ink * 0.42);
  build();
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.restore();

  build();
  ctx.fillStyle = opts.fill;
  ctx.fill();
  if (opts.shade) {
    ctx.save();
    ctx.clip();
    opts.shade();
    ctx.restore();
  }

  const j = boil(p, opts.salt ?? 1);
  ctx.save();
  ctx.translate(j.x, j.y);
  ctx.rotate(j.a);
  build();
  ctx.strokeStyle = INK;
  ctx.lineWidth = ink;
  ctx.stroke();
  ctx.restore();
}

/**
 * Halftone dots on a 45° screen. `amount` maps a point to 0..1 ink coverage, so dots grow into the shadow
 * the way a printed tint does. One path, one fill.
 */
export function halftone(
  p: PrintCtx,
  box: { x: number; y: number; w: number; h: number },
  color: string,
  amount: (x: number, y: number) => number,
) {
  const { ctx } = p;
  const pitch = Math.max(p.lod === "tiny" ? 2.4 * p.f.unit : 2.2 * p.f.unit, 3.2);
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const reach = Math.hypot(box.w, box.h) / 2;
  ctx.beginPath();
  for (let u = -reach; u <= reach; u += pitch) {
    for (let v = -reach; v <= reach; v += pitch) {
      const x = cx + (u - v) * Math.SQRT1_2;
      const y = cy + (u + v) * Math.SQRT1_2;
      if (x < box.x || x > box.x + box.w || y < box.y || y > box.y + box.h) continue;
      const k = amount(x, y);
      if (k < 0.06) continue;
      const r = pitch * 0.62 * Math.sqrt(Math.min(1, k));
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
  }
  ctx.fillStyle = color;
  ctx.fill();
}

export function inkStroke(p: PrintCtx, build: () => void, weight = 1) {
  const { ctx } = p;
  build();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = INK;
  ctx.lineWidth = p.ink * weight;
  ctx.stroke();
}
