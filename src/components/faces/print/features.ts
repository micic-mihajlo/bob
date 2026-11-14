import { INK, oklch } from "../palette";
import { halftone, inkStroke, MAGENTA, type PrintCtx } from "./ink";

const WHITE = "#fffcf2";

export type FaceGeometry = { readonly s: number; readonly eyeY: number; readonly gap: number; readonly mouthY: number };

export function geometry(p: PrintCtx, r: number): FaceGeometry {
  const s = (r / 31) * p.f.traits.eyeScale;
  const tiny = p.lod === "tiny";
  return {
    s,
    eyeY: -3 + p.f.traits.eyeY + p.f.expr.droop * 2,
    gap: (tiny ? 13 : p.f.traits.eyeGap) * (r / 31),
    mouthY: 12.5 * (r / 31) + p.f.expr.droop * 1.5,
  };
}

function solidEyes(p: PrintCtx) {
  return p.lod === "tiny" || p.f.traits.eyes === "dot" || p.f.traits.eyes === "bead";
}

export function drawEyes(p: PrintCtx, g: FaceGeometry) {
  const { f } = p;
  const open = Math.max(0, f.expr.eyeOpen * (1 - f.blink));
  for (const side of [-1, 1]) {
    const x = side * g.gap;
    if (f.expr.happy > 0.5) happyEye(p, x, g);
    else if (open < 0.2) closedEye(p, x, g);
    else if (solidEyes(p)) solidEye(p, x, g, open);
    else scleraEye(p, x, g, open);
  }
}

function happyEye(p: PrintCtx, x: number, g: FaceGeometry) {
  inkStroke(p, () => {
    p.ctx.beginPath();
    p.ctx.moveTo(x - 5.5 * g.s, g.eyeY + 2.5 * g.s);
    p.ctx.quadraticCurveTo(x, g.eyeY - 6 * g.s, x + 5.5 * g.s, g.eyeY + 2.5 * g.s);
  }, 1.1);
}

function closedEye(p: PrintCtx, x: number, g: FaceGeometry) {
  inkStroke(p, () => {
    p.ctx.beginPath();
    p.ctx.moveTo(x - 5 * g.s, g.eyeY);
    p.ctx.quadraticCurveTo(x, g.eyeY + 3 * g.s, x + 5 * g.s, g.eyeY);
  });
}

function solidEye(p: PrintCtx, x: number, g: FaceGeometry, open: number) {
  const { ctx, f } = p;
  const bead = f.traits.eyes === "bead" && p.lod !== "tiny";
  const min = 1.15 * f.unit;
  const rx = Math.max(min, (bead ? 3.2 : 4) * g.s * Math.min(1.25, f.expr.pupil));
  const ry = Math.max(min * Math.min(1, open), (bead ? 3.2 : 5.6) * g.s * open);
  const cx = x + f.look.x * 2.6 * g.s;
  const cy = g.eyeY + f.look.y * 2.2 * g.s + f.expr.lid * 2 * g.s;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry * (1 - f.expr.lid * 0.45), 0, 0, Math.PI * 2);
  ctx.fillStyle = INK;
  ctx.fill();
  if (p.lod === "large" || f.expr.pupil > 1.1) {
    ctx.beginPath();
    ctx.arc(cx - rx * 0.35, cy - ry * 0.4, Math.max(rx * 0.32, 0.6 * f.unit), 0, Math.PI * 2);
    ctx.fillStyle = WHITE;
    ctx.fill();
  }
}

function scleraEye(p: PrintCtx, x: number, g: FaceGeometry, open: number) {
  const { ctx, f } = p;
  const ring = f.traits.eyes === "ring";
  const rx = (ring ? 7 : 6.2) * g.s * Math.min(1.12, Math.max(0.9, f.expr.eyeOpen));
  const ry = (ring ? 7 : 7.8) * g.s * Math.min(1.15, open);
  const lid = Math.max(f.expr.lid, f.traits.eyes === "sleepy" ? 0.38 : 0);
  const sclera = () => {
    ctx.beginPath();
    ctx.ellipse(x, g.eyeY, rx, ry, 0, 0, Math.PI * 2);
  };
  sclera();
  ctx.fillStyle = WHITE;
  ctx.fill();
  ctx.save();
  ctx.clip();
  const pr = 3.4 * g.s * f.expr.pupil;
  const px = x + f.look.x * (rx - pr * 0.8);
  const py = g.eyeY + f.look.y * (ry - pr * 0.8) + lid * ry * 0.4;
  ctx.beginPath();
  ctx.arc(px, py, pr, 0, Math.PI * 2);
  ctx.fillStyle = INK;
  ctx.fill();
  if (p.lod === "large") {
    ctx.beginPath();
    ctx.arc(px - pr * 0.35, py - pr * 0.4, pr * 0.32, 0, Math.PI * 2);
    ctx.fillStyle = WHITE;
    ctx.fill();
  }
  if (lid > 0.02) {
    ctx.fillStyle = oklch(0.66, 0.16 * f.expr.vivid, f.hue);
    ctx.fillRect(x - rx - 1, g.eyeY - ry - 1, rx * 2 + 2, ry * 2 * lid + 1);
    inkStroke(p, () => {
      ctx.beginPath();
      ctx.moveTo(x - rx, g.eyeY - ry + ry * 2 * lid);
      ctx.lineTo(x + rx, g.eyeY - ry + ry * 2 * lid);
    }, 0.8);
  }
  ctx.restore();
  inkStroke(p, sclera, 0.8);
}

export function drawBrows(p: PrintCtx, g: FaceGeometry) {
  const { ctx, f } = p;
  const strong = Math.abs(f.expr.brow) > 0.5 || f.expr.browLift > 0.6;
  if (!f.traits.brows && !strong) return;
  if (p.lod === "tiny" && !strong) return;
  const y = g.eyeY - 10.5 * g.s - f.expr.browLift * 3.5 * g.s;
  for (const side of [-1, 1]) {
    inkStroke(p, () => {
      ctx.beginPath();
      ctx.moveTo(side * (g.gap - 5 * g.s), y + f.expr.brow * 2.8 * g.s);
      ctx.lineTo(side * (g.gap + 5.5 * g.s), y - f.expr.brow * 1.2 * g.s);
    }, 1.15);
  }
}

export function drawCheeks(p: PrintCtx, g: FaceGeometry) {
  const { f } = p;
  if (p.lod === "tiny") return;
  const blush = f.traits.cheeks || f.shown === "responded" || f.shown === "needs_you";
  if (blush) {
    for (const side of [-1, 1]) {
      const cx = side * (g.gap + 3.5 * g.s);
      const cy = g.eyeY + 10 * g.s;
      const rad = 6 * g.s;
      halftone(p, { x: cx - rad, y: cy - rad, w: rad * 2, h: rad * 2 }, MAGENTA, (x, y) => 0.75 - Math.hypot(x - cx, y - cy) / rad);
    }
  }
  if (f.traits.freckles && p.lod === "large") {
    p.ctx.fillStyle = INK;
    for (const side of [-1, 1]) {
      for (const [dx, dy] of [[0, 0], [3, 1.6], [-2.6, 2]]) {
        p.ctx.beginPath();
        p.ctx.arc(side * (g.gap + dx * g.s), g.eyeY + (8 + dy) * g.s, 0.75 * g.s, 0, Math.PI * 2);
        p.ctx.fill();
      }
    }
  }
}
