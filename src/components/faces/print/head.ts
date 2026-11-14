import { oklch, PAPER } from "../palette";
import type { Traits } from "../types";
import { halftone, inked, inkStroke, YELLOW, type PrintCtx } from "./ink";

/** Adds the head outline, centred on the origin, to the current path. */
export function headPath(ctx: CanvasRenderingContext2D, shape: Traits["head"], r: number) {
  ctx.beginPath();
  switch (shape) {
    case "round":
      ctx.ellipse(0, 0, r * 1.02, r, 0, 0, Math.PI * 2);
      return;
    case "squircle":
      ctx.roundRect(-r * 1.02, -r * 0.94, r * 2.04, r * 1.9, r * 0.6);
      return;
    case "tall":
      ctx.ellipse(0, 0, r * 0.88, r * 1.06, 0, 0, Math.PI * 2);
      return;
    case "wide":
      ctx.ellipse(0, r * 0.05, r * 1.15, r * 0.9, 0, 0, Math.PI * 2);
      return;
    case "egg":
      ctx.moveTo(0, -r * 1.04);
      ctx.bezierCurveTo(r * 0.72, -r * 1.04, r * 1.08, -r * 0.18, r * 1.04, r * 0.36);
      ctx.bezierCurveTo(r * 1.0, r * 0.86, r * 0.5, r * 1.0, 0, r * 1.0);
      ctx.bezierCurveTo(-r * 0.5, r * 1.0, -r * 1.0, r * 0.86, -r * 1.04, r * 0.36);
      ctx.bezierCurveTo(-r * 1.08, -r * 0.18, -r * 0.72, -r * 1.04, 0, -r * 1.04);
      ctx.closePath();
  }
}

export function headTop(shape: Traits["head"], r: number): number {
  return shape === "wide" ? -r * 0.85 : shape === "tall" ? -r * 1.06 : -r * 1.0;
}

export function drawHead(p: PrintCtx, r: number) {
  const { ctx, f } = p;
  const vivid = f.expr.vivid;
  const light = { x: -r * 0.42, y: -r * 0.5 };
  inked(p, () => headPath(ctx, f.traits.head, r), {
    fill: oklch(0.76, 0.16 * vivid, f.hue),
    paper: true,
    ghost: true,
    salt: 3,
    shade: () => {
      halftone(p, { x: -r * 1.2, y: -r * 1.2, w: r * 2.4, h: r * 2.4 }, oklch(0.48, 0.15 * vivid, f.hue + 12), (x, y) =>
        (Math.hypot(x - light.x, y - light.y) - r * 1.02) / (r * 0.8),
      );
      if (p.lod === "large") {
        ctx.beginPath();
        ctx.ellipse(-r * 0.5, -r * 0.55, r * 0.17, r * 0.09, -0.6, 0, Math.PI * 2);
        ctx.fillStyle = PAPER;
        ctx.fill();
      }
    },
  });
}

/** Accessories that grow from behind the head (drawn before it). */
export function drawBackAccessory(p: PrintCtx, r: number) {
  const { ctx, f } = p;
  const top = headTop(f.traits.head, r);
  const sway = Math.sin(p.ft * (f.shown === "working" ? 9 : 2.2) + f.traits.phase * 6) * (f.shown === "working" ? 4 : 2);
  const deep = oklch(0.55, 0.16 * f.expr.vivid, f.hue + 30);
  switch (f.traits.accessory) {
    case "antenna": {
      const tip = { x: r * 0.18 + sway, y: top - r * 0.5 + f.expr.droop * 6 };
      inkStroke(p, () => {
        ctx.beginPath();
        ctx.moveTo(0, top + 4);
        ctx.quadraticCurveTo(r * 0.05, top - r * 0.2, tip.x, tip.y);
      });
      inked(p, () => {
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, r * 0.17, 0, Math.PI * 2);
      }, { fill: f.shown === "needs_you" && p.frameNo % 4 < 2 ? YELLOW : deep, paper: true, salt: 5 });
      return;
    }
    case "tuft":
      inked(p, () => {
        ctx.beginPath();
        ctx.moveTo(-r * 0.4, top + 6);
        ctx.lineTo(-r * 0.28 + sway * 0.3, top - r * 0.38);
        ctx.lineTo(-r * 0.08, top + 2);
        ctx.lineTo(r * 0.06 + sway * 0.5, top - r * 0.5);
        ctx.lineTo(r * 0.2, top + 2);
        ctx.lineTo(r * 0.4 + sway * 0.4, top - r * 0.3);
        ctx.lineTo(r * 0.45, top + 8);
        ctx.closePath();
      }, { fill: deep, paper: true, salt: 6 });
      return;
    case "sprout":
      inkStroke(p, () => {
        ctx.beginPath();
        ctx.moveTo(0, top + 3);
        ctx.lineTo(sway * 0.4, top - r * 0.3);
      });
      for (const side of [-1, 1]) {
        inked(p, () => {
          ctx.beginPath();
          ctx.ellipse(side * r * 0.2 + sway * 0.4, top - r * 0.34, r * 0.2, r * 0.1, side * -0.5, 0, Math.PI * 2);
        }, { fill: oklch(0.72, 0.17, 140), paper: true, salt: 7 + side });
      }
      return;
    default:
      return;
  }
}

/** Accessories worn on the face (drawn after it). */
export function drawFrontAccessory(p: PrintCtx, r: number) {
  const { ctx, f } = p;
  if (p.lod === "tiny") return;
  switch (f.traits.accessory) {
    case "bandage":
      inked(p, () => {
        ctx.beginPath();
        ctx.roundRect(r * 0.3, -r * 0.78, r * 0.5, r * 0.2, r * 0.08);
      }, { fill: PAPER, salt: 9 });
      return;
    case "headband":
      inked(p, () => {
        ctx.beginPath();
        ctx.moveTo(-r * 0.98, -r * 0.42);
        ctx.quadraticCurveTo(0, -r * 0.62, r * 0.98, -r * 0.42);
        ctx.lineTo(r * 0.95, -r * 0.24);
        ctx.quadraticCurveTo(0, -r * 0.44, -r * 0.95, -r * 0.24);
        ctx.closePath();
      }, { fill: oklch(0.62, 0.2, f.hue + 160), salt: 10 });
      return;
    case "bolt":
      inked(p, () => {
        ctx.beginPath();
        ctx.moveTo(-r * 0.62, -r * 0.82);
        ctx.lineTo(-r * 0.42, -r * 0.82);
        ctx.lineTo(-r * 0.5, -r * 0.66);
        ctx.lineTo(-r * 0.36, -r * 0.66);
        ctx.lineTo(-r * 0.62, -r * 0.4);
        ctx.lineTo(-r * 0.56, -r * 0.6);
        ctx.lineTo(-r * 0.7, -r * 0.6);
        ctx.closePath();
      }, { fill: YELLOW, salt: 11 });
      return;
    default:
      return;
  }
}
