import { oklch } from "../palette";
import type { FaceFrame, FaceRenderer } from "../types";
import { bodyPath, faceAnchor, poseFor, type Pose } from "./body";

function fillBody(ctx: CanvasRenderingContext2D, f: FaceFrame, pose: Pose) {
  const v = f.expr.vivid;
  const g = ctx.createRadialGradient(pose.cx - pose.r * 0.38, pose.cy - pose.r * 0.5, pose.r * 0.05, pose.cx, pose.cy, pose.r * 1.35);
  g.addColorStop(0, oklch(0.94, 0.06 * v, f.hue));
  g.addColorStop(0.42, oklch(0.76, 0.15 * v, f.hue));
  g.addColorStop(1, oklch(0.5, 0.16 * v, f.hue + 18));
  bodyPath(ctx, f, pose);
  ctx.fillStyle = g;
  ctx.fill();
}

function drawEyes(ctx: CanvasRenderingContext2D, f: FaceFrame, at: { x: number; y: number }, s: number) {
  const dark = oklch(0.2, 0.04, f.hue);
  const gap = (f.size <= 28 ? 12 : f.traits.eyeGap * 0.85) * s;
  const open = f.expr.eyeOpen * (1 - f.blink);
  const lw = Math.max(2.6, 1.3 * f.unit);
  ctx.lineCap = "round";
  for (const side of [-1, 1]) {
    const x = at.x + side * gap + f.look.x * 3 * s;
    const y = at.y + f.look.y * 2.4 * s;
    if (f.expr.happy > 0.5 || open < 0.2) {
      ctx.beginPath();
      const up = f.expr.happy > 0.5 ? -1 : 1;
      ctx.moveTo(x - 4 * s, y);
      ctx.quadraticCurveTo(x, y + up * 4 * s, x + 4 * s, y);
      ctx.strokeStyle = dark;
      ctx.lineWidth = lw;
      ctx.stroke();
      continue;
    }
    const rx = Math.max(1.1 * f.unit, 3.6 * s * f.expr.pupil);
    const ry = Math.max(1.1 * f.unit, 5.4 * s * open * (1 - f.expr.lid * 0.5));
    ctx.beginPath();
    ctx.ellipse(x, y + f.expr.lid * 2 * s, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = dark;
    ctx.fill();
    if (f.size > 28) {
      ctx.beginPath();
      ctx.arc(x - rx * 0.3, y - ry * 0.35, rx * 0.34, 0, Math.PI * 2);
      ctx.fillStyle = "rgb(255 255 255 / 0.92)";
      ctx.fill();
    }
  }
}

function drawMouth(ctx: CanvasRenderingContext2D, f: FaceFrame, at: { x: number; y: number }, s: number) {
  const dark = oklch(0.2, 0.04, f.hue);
  const y = at.y + 11 * s;
  const w = 5.5 * s * f.expr.mouthWidth;
  if (f.expr.mouthOpen > 0.3) {
    ctx.beginPath();
    if (f.expr.mouthWidth < 0.6) ctx.ellipse(at.x, y + 1.5 * s, Math.max(w, 2.8 * s), 3.6 * s, 0, 0, Math.PI * 2);
    else {
      ctx.moveTo(at.x - w, y);
      ctx.quadraticCurveTo(at.x, y + 10 * s * f.expr.mouthOpen, at.x + w, y);
      ctx.closePath();
    }
    ctx.fillStyle = dark;
    ctx.fill();
    return;
  }
  const c = f.expr.mouthCurve;
  ctx.beginPath();
  ctx.moveTo(at.x - w, y - c * 1.5 * s);
  ctx.quadraticCurveTo(at.x, y + c * 5 * s, at.x + w, y - c * 1.5 * s);
  ctx.strokeStyle = dark;
  ctx.lineWidth = Math.max(2.4, 1.2 * f.unit);
  ctx.stroke();
}

function drawSignals(ctx: CanvasRenderingContext2D, f: FaceFrame, pose: Pose) {
  const accent = oklch(0.86, 0.15, f.hue + 150);
  const dot = Math.max(2.4, 1.1 * f.unit);
  if (f.shown === "needs_you") {
    const k = (f.t * 1.1) % 1;
    ctx.beginPath();
    ctx.arc(pose.cx, pose.cy, pose.r * (1.02 + k * 0.4), 0, Math.PI * 2);
    ctx.strokeStyle = oklch(0.88, 0.17, 90, 1 - k);
    ctx.lineWidth = Math.max(2.5, 1.4 * f.unit);
    ctx.stroke();
  } else if (f.shown === "working") {
    ctx.fillStyle = accent;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = f.t * 4.5 + (i * Math.PI * 2) / 3;
      ctx.moveTo(pose.cx + Math.cos(a) * pose.r * 1.22 + dot, pose.cy + Math.sin(a) * pose.r * 0.5 - pose.r * 0.55);
      ctx.arc(pose.cx + Math.cos(a) * pose.r * 1.22, pose.cy + Math.sin(a) * pose.r * 0.5 - pose.r * 0.55, dot, 0, Math.PI * 2);
    }
    ctx.fill();
  } else if (f.shown === "waiting") {
    for (let i = 0; i < 3; i++) {
      const alpha = 0.25 + 0.75 * Math.max(0, Math.sin(f.t * 3 - i * 0.8));
      ctx.beginPath();
      ctx.arc(pose.cx + (i - 1) * 9, 9, dot, 0, Math.PI * 2);
      ctx.fillStyle = `rgb(255 255 255 / ${alpha.toFixed(2)})`;
      ctx.fill();
    }
  } else if (f.shown === "failed") {
    const drip = (f.t * 0.6) % 1;
    ctx.beginPath();
    ctx.ellipse(pose.cx + pose.r * 0.85, pose.cy + drip * pose.r * 0.9, 2.6 + drip * 1.2, 3.4 + drip * 2, 0, 0, Math.PI * 2);
    ctx.fillStyle = oklch(0.6, 0.08, f.hue, 1 - drip);
    ctx.fill();
  } else if (f.shown === "responded") {
    ctx.fillStyle = oklch(0.92, 0.14, 95, Math.max(0, 1 - f.moodT / 2));
    for (const [dx, dy, phase] of [[1.1, -0.9, 0], [-1.15, -0.6, 1.5]]) {
      const s = (3 + 2.5 * Math.abs(Math.sin(f.t * 5 + phase))) * (f.size <= 28 ? 1.4 : 1);
      const x = pose.cx + dx * pose.r;
      const y = pose.cy + dy * pose.r;
      ctx.beginPath();
      ctx.moveTo(x, y - s * 1.6);
      ctx.quadraticCurveTo(x, y, x + s * 1.6, y);
      ctx.quadraticCurveTo(x, y, x, y + s * 1.6);
      ctx.quadraticCurveTo(x, y, x - s * 1.6, y);
      ctx.quadraticCurveTo(x, y, x, y - s * 1.6);
      ctx.fill();
    }
  }
}

function draw(ctx: CanvasRenderingContext2D, f: FaceFrame) {
  const pose = poseFor(f);
  fillBody(ctx, f, pose);
  const anchor = faceAnchor(pose, f);
  const s = (pose.r / 33) * f.traits.eyeScale;
  const face = { x: anchor.x, y: anchor.y + f.traits.eyeY * 0.5 + f.expr.droop * 4 };
  ctx.save();
  ctx.translate(face.x, face.y);
  ctx.scale(anchor.sx, anchor.sy);
  ctx.translate(-face.x, -face.y);
  if (f.traits.cheeks || f.shown === "responded") {
    ctx.fillStyle = oklch(0.75, 0.14, 15, 0.45);
    ctx.beginPath();
    ctx.ellipse(face.x - 15 * s, face.y + 7 * s, 4.5 * s, 2.8 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(face.x + 15 * s, face.y + 7 * s, 4.5 * s, 2.8 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  drawEyes(ctx, f, face, s);
  drawMouth(ctx, f, face, s);
  ctx.restore();
  drawSignals(ctx, f, pose);
}

export const blobRenderer: FaceRenderer = {
  label: "Blob",
  fps: 30,
  technique: "Canvas 2D. A radial-gradient body from seeded harmonics; squash and stretch from a closed-form damped spring, no stored velocity.",
  draw,
};
