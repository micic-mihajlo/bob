import { noise } from "../seed";
import type { FaceFrame, Traits } from "../types";

export type Tone = "shell" | "fill" | "code" | "spill" | "alert" | "eye" | "mouth" | "accessory";

export type Glyph = { readonly ch: string; readonly tone: Tone; readonly x: number; readonly y: number; readonly scale: number };

const CODE = "{}[]()<>;=+*/01#$%&|";
const FILL = [" ", ".", ":", "·"];

export function gridSize(size: number): number {
  return size <= 28 ? 7 : size <= 48 ? 9 : 13;
}

function inside(shape: Traits["head"], u: number, v: number): boolean {
  switch (shape) {
    case "round":
      return u * u + v * v < 0.8;
    case "tall":
      return (u / 0.7) ** 2 + (v / 0.92) ** 2 < 1;
    case "wide":
      return (u / 0.94) ** 2 + (v / 0.74) ** 2 < 1;
    case "squircle":
      return u ** 4 + v ** 4 < 0.6;
    case "egg":
      return (u / (0.74 + 0.16 * v)) ** 2 + (v / 0.9) ** 2 < 1;
  }
}

function edgeChar(u: number, v: number): string {
  if (Math.abs(u) > Math.abs(v) * 2.2) return "|";
  if (Math.abs(v) > Math.abs(u) * 2.2) return v < 0 ? "-" : "_";
  return (u < 0) === (v < 0) ? "/" : "\\";
}

/** 0..1 share of cells showing code: ramps in while working, then each cell settles at its own moment. */
function scrambleLevel(f: FaceFrame): number {
  if (f.shown === "working") return Math.min(1, f.moodT / 0.35) * 0.62;
  if (f.prevMood === "working" && f.moodT < 0.9) return 0.62 * (1 - f.moodT / 0.9);
  return f.shown === "idle" ? 0.03 : 0;
}

export function glyphCells(f: FaceFrame): Glyph[] {
  const n = gridSize(f.size);
  const cell = 100 / n;
  const hash = f.traits.hash;
  const tick = Math.floor(f.t * 15);
  const level = scrambleLevel(f);
  const out: Glyph[] = [];
  const at = (c: number, r: number) => inside(f.traits.head, (((c + 0.5) / n) * 2 - 1) / 0.9, (((r + 0.5) / n) * 2 - 1.08) / 0.9);
  const sag = f.expr.droop;
  const ripple = f.shown === "responded" ? Math.max(0, 1 - f.moodT / 1.4) : 0;

  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const u = ((c + 0.5) / n) * 2 - 1;
      const v = ((r + 0.5) / n) * 2 - 1.08;
      const x = (c + 0.5) * cell;
      const y = (r + 0.5) * cell + sag * Math.max(0, v + 0.3) * cell * 0.5 - ripple * Math.sin(f.moodT * 14 - c * 0.9) * cell * 0.25;
      const id = r * n + c;
      const hit = at(c, r);
      if (!hit) {
        if (level > 0.3 && noise(hash, id, tick) < 0.06) out.push({ ch: CODE[Math.floor(noise(hash, id, tick + 1) * CODE.length)], tone: "spill", x, y, scale: 0.8 });
        continue;
      }
      const edge = !at(c - 1, r) || !at(c + 1, r) || !at(c, r - 1) || !at(c, r + 1);
      if (noise(hash, id, tick) < level) {
        out.push({ ch: CODE[Math.floor(noise(hash, id, tick + 2) * CODE.length)], tone: "code", x, y, scale: 1 });
      } else if (edge) {
        out.push({ ch: edgeChar(u, v), tone: f.shown === "needs_you" && Math.floor(f.t * 3) % 2 === 0 ? "alert" : "shell", x, y, scale: 1 });
      } else {
        const ch = FILL[Math.floor(noise(hash, id) * FILL.length)];
        if (ch !== " ") out.push({ ch, tone: "fill", x, y, scale: 1 });
      }
    }
  }
  return [...out, ...features(f, cell)];
}

function eyeChars(f: FaceFrame): [string, string] {
  if (f.expr.happy > 0.5) return ["^", "^"];
  if (f.shown === "failed") return [">", "<"];
  if (f.expr.eyeOpen * (1 - f.blink) < 0.25) return ["-", "-"];
  if (f.shown === "needs_you") return ["O", "O"];
  const byKind = { dot: "•", oval: "o", ring: "0", sleepy: "=", bead: "•" } as const;
  const ch = f.shown === "waiting" ? "°" : byKind[f.traits.eyes];
  return [ch, ch];
}

function mouthChar(f: FaceFrame): string {
  switch (f.shown) {
    case "working":
      return ["=", "-", "≈", "-"][Math.floor(f.t * 6) % 4];
    case "waiting":
      return Math.floor(f.t * 1.6) % 2 === 0 ? "_" : " ";
    case "needs_you":
      return "o";
    case "failed":
      return "~";
    case "responded":
      return "▽";
    case "idle":
      return { line: "_", smile: "‿", cat: "ω", small: ".", grin: "▽" }[f.traits.mouth];
  }
}

const ACCESSORY = { none: "", antenna: "i", tuft: "\\|/", sprout: "Y", bandage: "+", headband: "=", bolt: "ϟ" } as const;

function features(f: FaceFrame, cell: number): Glyph[] {
  const tiny = f.size <= 28;
  const gap = tiny ? 16 : f.traits.eyeGap * 1.05;
  const eyeY = 45 + f.traits.eyeY * 0.6 + f.expr.droop * 6;
  const lx = f.look.x * cell * 0.4;
  const ly = f.look.y * cell * 0.35;
  const [left, right] = eyeChars(f);
  const eyeScale = tiny ? 2 : 1.55;
  const out: Glyph[] = [
    { ch: left, tone: "eye", x: 50 - gap + lx, y: eyeY + ly, scale: eyeScale },
    { ch: right, tone: "eye", x: 50 + gap + lx, y: eyeY + ly, scale: eyeScale },
    { ch: mouthChar(f), tone: "mouth", x: 50 + lx * 0.4, y: 66 + f.expr.droop * 7, scale: tiny ? 1.9 : 1.5 },
  ];
  const acc = ACCESSORY[f.traits.accessory];
  if (acc && !tiny) out.push({ ch: acc, tone: "accessory", x: acc === "+" ? 50 + gap + cell : 50, y: acc === "+" ? 58 : cell * 0.5, scale: 1.1 });
  if (f.shown === "needs_you" && Math.floor(f.t * 3) % 2 === 0) out.push({ ch: "!", tone: "alert", x: 100 - cell * 0.9, y: cell * 1.2, scale: tiny ? 2 : 1.6 });
  if (f.shown === "waiting" && !tiny) out.push({ ch: ".".repeat(1 + (Math.floor(f.t / 0.45) % 3)), tone: "accessory", x: 100 - cell * 1.4, y: cell * 0.9, scale: 1.2 });
  return out;
}
