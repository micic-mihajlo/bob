import { noise } from "../seed";
import { INK, PAPER } from "../palette";
import { CYAN, inked, inkStroke, YELLOW, type PrintCtx } from "./ink";

type Head = { readonly x: number; readonly y: number; readonly r: number };

export function drawMarks(p: PrintCtx, head: Head) {
  switch (p.f.shown) {
    case "working":
      return actionLines(p, head);
    case "waiting":
      return ellipsis(p, head);
    case "needs_you":
      return alert(p, head);
    case "failed":
      return sweat(p, head);
    case "responded":
      return sparkles(p, head);
    default:
      return;
  }
}

/** Short vibration strokes either side of the head, flipping sides on twos. */
function actionLines(p: PrintCtx, h: Head) {
  const { ctx } = p;
  const flip = Math.floor(p.frameNo / 2) % 2 === 0 ? 1 : -1;
  const count = p.lod === "tiny" ? 2 : 3;
  for (const side of [flip, -flip]) {
    const len = side === flip ? 1 : 0.6;
    for (let i = 0; i < count; i++) {
      const y = h.y - h.r * 0.45 + i * h.r * 0.42;
      const x = h.x + side * (h.r * 1.22 + i * 1.5);
      inkStroke(p, () => {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + side * h.r * 0.22 * len, y - h.r * 0.08);
      }, 0.85);
    }
  }
  if (p.lod === "large") {
    const pop = p.frameNo % 6;
    const sx = h.x + h.r * (0.75 + noise(p.f.traits.hash, Math.floor(p.frameNo / 6)) * 0.25);
    star(p, sx, h.y - h.r * 1.0 - pop * 1.2, 3 + pop * 0.8, YELLOW);
  }
}

function ellipsis(p: PrintCtx, h: Head) {
  const { ctx } = p;
  const shown = 1 + (Math.floor(p.ft / 0.45) % 3);
  const bx = p.lod === "tiny" ? 76 : h.x + h.r * 0.95;
  const by = p.lod === "tiny" ? 16 : h.y - h.r * 1.0;
  const big = p.lod === "tiny" ? 1.35 : 1;
  if (p.lod === "tiny") {
    inked(p, () => {
      ctx.beginPath();
      ctx.roundRect(bx - h.r * 0.5, by - h.r * 0.22, h.r * 1.0, h.r * 0.44, h.r * 0.22);
    }, { fill: PAPER, salt: 31 });
  } else {
    inked(p, () => {
      ctx.beginPath();
      ctx.ellipse(bx, by, h.r * 0.6, h.r * 0.36, 0, 0, Math.PI * 2);
      ctx.moveTo(bx - h.r * 0.38, by + h.r * 0.26);
      ctx.lineTo(bx - h.r * 0.55, by + h.r * 0.55);
      ctx.lineTo(bx - h.r * 0.12, by + h.r * 0.33);
    }, { fill: PAPER, paper: true, salt: 31 });
  }
  ctx.fillStyle = INK;
  for (let i = 0; i < 3; i++) {
    const dot = Math.max(2.2, 0.8 * p.f.unit) * big;
    if (p.lod !== "tiny" && i >= shown) continue;
    ctx.beginPath();
    ctx.arc(bx + (i - 1) * h.r * 0.28 * big, by, dot, 0, Math.PI * 2);
    ctx.fill();
  }
}

function burstPath(ctx: CanvasRenderingContext2D, x: number, y: number, outer: number, inner: number, spikes: number, spin: number) {
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const a = spin + (i / (spikes * 2)) * Math.PI * 2;
    const rad = i % 2 === 0 ? outer : inner;
    ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  ctx.closePath();
}

/** Starburst with a "!" that flickers on 12fps fours, plus emanata lines around the head. */
function alert(p: PrintCtx, h: Head) {
  const { ctx } = p;
  const on = p.frameNo % 6 < 4;
  const tiny = p.lod === "tiny";
  const bx = tiny ? 78 : h.x + h.r * 0.98;
  const by = tiny ? 22 : h.y - h.r * 0.98;
  const outer = (tiny ? 21 : h.r * 0.52) * (on ? 1.08 : 0.94);
  inked(p, () => burstPath(ctx, bx, by, outer, outer * 0.62, tiny ? 7 : 9, p.frameNo * 0.08), {
    fill: YELLOW,
    paper: true,
    salt: 41,
  });
  ctx.fillStyle = INK;
  const bar = outer * 0.2;
  ctx.beginPath();
  ctx.roundRect(bx - bar / 2, by - outer * 0.48, bar, outer * 0.6, bar / 2);
  ctx.arc(bx, by + outer * 0.36, bar * 0.62, 0, Math.PI * 2);
  ctx.fill();
  if (tiny) return;
  for (const a of [-2.5, -2.05, 2.75]) {
    const r1 = h.r * 1.18;
    const r2 = h.r * (on ? 1.42 : 1.36);
    inkStroke(p, () => {
      ctx.beginPath();
      ctx.moveTo(h.x + Math.cos(a) * r1, h.y + Math.sin(a) * r1);
      ctx.lineTo(h.x + Math.cos(a) * r2, h.y + Math.sin(a) * r2);
    }, 0.8);
  }
}

function sweat(p: PrintCtx, h: Head) {
  const { ctx } = p;
  const slide = (p.ft * 6) % 8;
  const x = h.x + h.r * 0.8;
  const y = h.y - h.r * 0.72 + slide;
  const s = p.lod === "tiny" ? 1.5 : 1;
  inked(p, () => {
    ctx.beginPath();
    ctx.moveTo(x, y - 7 * s);
    ctx.quadraticCurveTo(x + 5 * s, y + 1 * s, x, y + 4 * s);
    ctx.quadraticCurveTo(x - 5 * s, y + 1 * s, x, y - 7 * s);
    ctx.closePath();
  }, { fill: CYAN, paper: true, salt: 51 });
  if (p.lod !== "large") return;
  const cx = h.x - h.r * 0.2;
  const cy = h.y - h.r * 1.28;
  inkStroke(p, () => {
    ctx.beginPath();
    for (let i = 0; i <= 18; i++) {
      const a = (i / 18) * Math.PI * 4 + p.frameNo * 0.3;
      const rad = 3 + (i / 18) * 5;
      ctx.lineTo(cx + Math.cos(a) * rad * 1.5 + i * 0.6, cy + Math.sin(a) * rad * 0.5);
    }
  }, 0.55);
}

function star(p: PrintCtx, x: number, y: number, size: number, fill: string) {
  inked(p, () => {
    const { ctx } = p;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      const rad = i % 2 === 0 ? size : size * 0.36;
      ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
    }
    ctx.closePath();
  }, { fill, salt: 61 });
}

function sparkles(p: PrintCtx, h: Head) {
  const age = p.f.moodT;
  const grow = Math.min(1, age * 4);
  const spots: [number, number, number][] =
    p.lod === "tiny" ? [[0.95, -0.95, 9]] : [[1.0, -0.95, 7], [-1.05, -0.7, 5], [1.12, 0.2, 4]];
  spots.forEach(([dx, dy, size], i) => {
    const twinkle = (p.frameNo + i * 2) % 6 < 3 ? 1 : 0.7;
    star(p, h.x + dx * h.r, h.y + dy * h.r, size * grow * twinkle * (p.lod === "large" ? 1.2 : 1), YELLOW);
  });
}

/** Comic sound word, only at sizes where it can be read. */
export function drawWord(p: PrintCtx) {
  if (p.lod !== "large") return;
  const word = { needs_you: "HEY!", failed: "OOF", responded: "YAY!", working: "", waiting: "", idle: "" }[p.f.shown];
  if (!word) return;
  const { ctx } = p;
  ctx.save();
  ctx.translate(16, 17);
  ctx.rotate(-0.22);
  ctx.font = "italic 900 15px Impact, 'Arial Black', 'Helvetica Neue', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.strokeStyle = PAPER;
  ctx.lineWidth = 7;
  ctx.strokeText(word, 0, 0);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.strokeText(word, 0, 0);
  ctx.fillStyle = p.f.shown === "failed" ? CYAN : YELLOW;
  ctx.fillText(word, 0, 0);
  ctx.restore();
}

/** Speed streaks for the one smeared frame after a mood change. */
export function drawSmear(p: PrintCtx, head: Head, dir: number) {
  for (let i = 0; i < 3; i++) {
    const y = head.y - head.r * 0.5 + i * head.r * 0.5;
    inkStroke(p, () => {
      p.ctx.beginPath();
      p.ctx.moveTo(head.x - dir * head.r * 1.1, y);
      p.ctx.lineTo(head.x - dir * head.r * 1.6, y);
    }, 0.7);
  }
}
