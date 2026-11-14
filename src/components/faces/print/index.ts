import type { FaceFrame, FaceRenderer } from "../types";
import { drawBrows, drawCheeks, drawEyes, geometry } from "./features";
import { drawBackAccessory, drawFrontAccessory, drawHead } from "./head";
import { printCtx, type PrintCtx } from "./ink";
import { drawMarks, drawSmear, drawWord } from "./marks";
import { drawMouth } from "./mouth";

const LAYOUT = {
  tiny: { x: 46, y: 56, r: 34 },
  small: { x: 48, y: 57, r: 29 },
  large: { x: 49, y: 58, r: 28 },
} as const;

function headMotion(p: PrintCtx) {
  const { expr, traits, shown } = p.f;
  const wave = Math.sin((p.ft * expr.bobHz + traits.phase) * Math.PI * 2);
  const hop = shown === "needs_you" || shown === "responded";
  const bob = hop ? -Math.abs(wave) * expr.bob : wave * expr.bob * 0.6;
  const lean = traits.hash % 2 === 0 ? 1 : -1;
  return { dy: bob + expr.droop * 4, tilt: traits.tilt + expr.droop * 0.12 * lean };
}

/** Exactly one full 12fps frame, the first after the mood changed. */
function isSmearFrame(f: FaceFrame) {
  return f.prevMood !== f.mood && Math.floor(f.t * 12) === Math.floor((f.t - f.moodT) * 12) + 1;
}

function draw(ctx: CanvasRenderingContext2D, f: FaceFrame) {
  const p = printCtx(ctx, f);
  const base = LAYOUT[p.lod];
  const motion = headMotion(p);
  const head = { x: base.x, y: base.y + motion.dy, r: base.r };
  const smear = isSmearFrame(f);
  const dir = f.traits.hash % 3 === 0 ? -1 : 1;

  ctx.save();
  if (smear) {
    ctx.translate(head.x + dir * 3, head.y);
    ctx.scale(1.12, 0.9);
    ctx.translate(-head.x, -head.y);
  }
  ctx.save();
  ctx.translate(head.x, head.y);
  ctx.rotate(motion.tilt);
  drawBackAccessory(p, head.r);
  drawHead(p, head.r);
  const g = geometry(p, head.r);
  drawCheeks(p, g);
  drawEyes(p, g);
  drawBrows(p, g);
  drawMouth(p, g);
  drawFrontAccessory(p, head.r);
  ctx.restore();
  drawMarks(p, head);
  ctx.restore();

  drawWord(p);
  if (smear) drawSmear(p, head, dir);
}

export const printRenderer: FaceRenderer = {
  label: "Print",
  fps: 12,
  technique: "Canvas 2D. Paper die-cut, offset cyan and magenta plates, ink lip, halftone dots as one path, boiling outline on twos.",
  draw,
};
