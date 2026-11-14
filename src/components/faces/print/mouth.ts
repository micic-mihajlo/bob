import type { FaceGeometry } from "./features";
import { inked, inkStroke, type PrintCtx } from "./ink";

const MOUTH_DARK = "#4a0f1c";
const TONGUE = "#ff6f8e";
const TEETH = "#fffcf2";

export function drawMouth(p: PrintCtx, g: FaceGeometry) {
  const { f } = p;
  const kindScale = f.traits.mouth === "small" ? 0.7 : f.traits.mouth === "grin" ? 1.15 : 1;
  const w = 7.5 * g.s * f.expr.mouthWidth * kindScale * (p.lod === "tiny" ? 1.2 : 1);
  if (f.shown === "working") return concentrating(p, g, w);
  if (f.shown === "failed" && f.expr.mouthCurve < -0.4) return wobble(p, g, w);
  if (f.expr.mouthWidth < 0.6 && f.expr.mouthOpen > 0.3) return roundMouth(p, g, w);
  if (f.expr.mouthOpen > 0.3) return openMouth(p, g, w);
  if (f.traits.mouth === "cat" && f.expr.mouthCurve > 0.2 && p.lod !== "tiny") return catMouth(p, g, w);
  const c = f.expr.mouthCurve * (f.traits.mouth === "line" ? 0.6 : 1);
  inkStroke(p, () => {
    p.ctx.beginPath();
    p.ctx.moveTo(-w, g.mouthY - c * 2.5 * g.s);
    p.ctx.quadraticCurveTo(0, g.mouthY + c * 6.5 * g.s, w, g.mouthY - c * 2.5 * g.s);
  });
}

function openMouth(p: PrintCtx, g: FaceGeometry, w: number) {
  const { ctx, f } = p;
  const depth = (6 + f.expr.mouthOpen * 9) * g.s;
  const lift = f.expr.mouthCurve * 2.5 * g.s;
  const shape = () => {
    ctx.beginPath();
    ctx.moveTo(-w, g.mouthY - lift);
    ctx.quadraticCurveTo(0, g.mouthY + lift * 0.6, w, g.mouthY - lift);
    ctx.quadraticCurveTo(0, g.mouthY + depth, -w, g.mouthY - lift);
    ctx.closePath();
  };
  inked(p, shape, {
    fill: MOUTH_DARK,
    salt: 21,
    shade: () => {
      if (p.lod === "tiny") return;
      ctx.beginPath();
      ctx.ellipse(0, g.mouthY + depth * 0.62, w * 0.55, depth * 0.32, 0, 0, Math.PI * 2);
      ctx.fillStyle = TONGUE;
      ctx.fill();
      if (f.traits.mouth === "grin" || f.traits.mouth === "smile") {
        ctx.fillStyle = TEETH;
        ctx.fillRect(-w, g.mouthY - lift - 2, w * 2, 2 + 2.6 * g.s);
      }
    },
  });
}

function roundMouth(p: PrintCtx, g: FaceGeometry, w: number) {
  const { ctx, f } = p;
  const pulse = p.frameNo % 6 < 3 ? 1 : 0.85;
  inked(p, () => {
    ctx.beginPath();
    ctx.ellipse(0, g.mouthY + 1.5 * g.s, Math.max(w, 3.6 * g.s), (3.5 + f.expr.mouthOpen * 4) * g.s * pulse, 0, 0, Math.PI * 2);
  }, { fill: MOUTH_DARK, salt: 22 });
}

function catMouth(p: PrintCtx, g: FaceGeometry, w: number) {
  const half = w * 0.55;
  inkStroke(p, () => {
    const { ctx } = p;
    ctx.beginPath();
    ctx.moveTo(-w, g.mouthY - 1.5 * g.s);
    ctx.quadraticCurveTo(-half, g.mouthY + 4.5 * g.s, 0, g.mouthY);
    ctx.quadraticCurveTo(half, g.mouthY + 4.5 * g.s, w, g.mouthY - 1.5 * g.s);
  });
}

function wobble(p: PrintCtx, g: FaceGeometry, w: number) {
  const steps = p.lod === "tiny" ? 2 : 4;
  inkStroke(p, () => {
    const { ctx } = p;
    ctx.beginPath();
    ctx.moveTo(-w, g.mouthY + 3 * g.s);
    for (let i = 1; i <= steps; i++) {
      const x = -w + (2 * w * i) / steps;
      const y = g.mouthY + (i % 2 === 0 ? 3 : 0.4) * g.s - Math.sin((i / steps) * Math.PI) * 1.5 * g.s;
      ctx.lineTo(x, y);
    }
  });
}

/** Working mouth: pushed to one side with the tip of a tongue out, the face of someone mid-task. */
function concentrating(p: PrintCtx, g: FaceGeometry, w: number) {
  const { ctx } = p;
  const side = p.f.traits.hash % 2 === 0 ? 1 : -1;
  const shift = side * 3 * g.s;
  const chew = p.frameNo % 4 < 2 ? 0 : 0.8 * g.s;
  if (p.lod !== "tiny") {
    inked(p, () => {
      ctx.beginPath();
      ctx.ellipse(shift + side * w * 0.75, g.mouthY + 2 * g.s + chew, 2.6 * g.s, 3 * g.s, side * 0.4, 0, Math.PI * 2);
    }, { fill: TONGUE, salt: 23 });
  }
  inkStroke(p, () => {
    ctx.beginPath();
    ctx.moveTo(shift - w, g.mouthY + 0.5 * g.s - chew * 0.5);
    ctx.quadraticCurveTo(shift, g.mouthY - 1.5 * g.s * side + chew, shift + w, g.mouthY + 0.5 * g.s);
  });
}
