import type { FaceFrame, Mood, Traits } from "../types";

export const GRID = 16;

export const Px = {
  Empty: 0,
  Outline: 1,
  Body: 2,
  Shade: 3,
  Light: 4,
  White: 5,
  Dark: 6,
  Yellow: 7,
  Blush: 8,
  Accessory: 9,
  Cyan: 10,
  Red: 11,
} as const;
export type Px = (typeof Px)[keyof typeof Px];

/** Frames and loop rate per mood: each mood is a 2 or 3 frame cycle, like a handheld sprite sheet. */
const LOOPS: Record<Mood, { frames: number; fps: number; lift: readonly number[] }> = {
  idle: { frames: 2, fps: 1.6, lift: [0, -1] },
  working: { frames: 3, fps: 7, lift: [0, -1, 0] },
  waiting: { frames: 3, fps: 1.4, lift: [0, 0, 0] },
  needs_you: { frames: 2, fps: 4, lift: [0, -1] },
  failed: { frames: 2, fps: 1, lift: [1, 1] },
  responded: { frames: 3, fps: 6, lift: [0, -2, -1] },
};

function inHead(shape: Traits["head"], x: number, y: number): boolean {
  const u = x - 7.5;
  const v = y - 9.5;
  switch (shape) {
    case "round":
      return u * u + v * v < 46;
    case "tall":
      return (u / 5.8) ** 2 + (v / 6.8) ** 2 < 1;
    case "wide":
      return (u / 7.4) ** 2 + (v / 5.8) ** 2 < 1;
    case "squircle":
      return u ** 4 / 1700 + v ** 4 / 1500 < 1;
    case "egg":
      return (u / (6.2 + v * 0.18)) ** 2 + (v / 6.6) ** 2 < 1;
  }
}

export function spriteFrame(f: FaceFrame): number {
  const loop = LOOPS[f.shown];
  return Math.floor(f.t * loop.fps) % loop.frames;
}

export function buildSprite(f: FaceFrame): Uint8Array {
  const frame = spriteFrame(f);
  const dy = LOOPS[f.shown].lift[frame];
  const px = new Uint8Array(GRID * GRID);
  const set = (x: number, y: number, c: Px) => {
    if (x >= 0 && x < GRID && y >= 0 && y < GRID) px[y * GRID + x] = c;
  };
  const head = (x: number, y: number) => inHead(f.traits.head, x, y - dy);
  let top = GRID;
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      if (!head(x, y)) continue;
      top = Math.min(top, y);
      const edge = !head(x - 1, y) || !head(x + 1, y) || !head(x, y - 1) || !head(x, y + 1);
      const rim = !head(x + 1, y + 1) || !head(x + 2, y + 1);
      set(x, y, edge ? Px.Outline : rim ? Px.Shade : Px.Body);
    }
  }
  set(4, top + 2, Px.Light);
  set(5, top + 2, Px.Light);
  set(4, top + 3, Px.Light);
  drawAccessory(f, set, top);
  drawFace(f, set, dy, frame);
  drawMark(f, set, frame);
  return px;
}

type Set = (x: number, y: number, c: Px) => void;

function drawFace(f: FaceFrame, set: Set, dy: number, frame: number) {
  const gap = f.traits.eyeGap > 13.5 ? 2 : 1;
  const ey = 9 + Math.round(f.traits.eyeY / 3) + dy + (f.expr.droop > 0.5 ? 1 : 0);
  const lx = f.look.x > 0.4 ? 1 : f.look.x < -0.4 ? -1 : 0;
  const ly = f.look.y > 0.5 ? 1 : f.look.y < -0.5 ? -1 : 0;
  const closed = f.expr.eyeOpen * (1 - f.blink) < 0.25;
  const wide = f.traits.eyes === "oval" || f.traits.eyes === "ring" || f.shown === "needs_you";
  const w = wide ? 2 : 1;
  const left = 6 - gap;
  for (const ex of [left, 16 - left - w]) {
    const x = ex + lx;
    if (f.expr.happy > 0.5) {
      set(ex - 1, ey, Px.Dark);
      set(ex, ey - 1, Px.Dark);
      set(ex + w - 1, ey - 1, Px.Dark);
      set(ex + w, ey, Px.Dark);
    } else if (closed) {
      set(ex, ey, Px.Dark);
      set(ex + 1, ey, Px.Dark);
    } else {
      const lidded = f.expr.lid > 0.3;
      for (let i = 0; i < w; i++) {
        if (!lidded) set(x + i, ey - 1 + ly, Px.Dark);
        set(x + i, ey + ly, Px.Dark);
      }
      if (wide && !lidded) set(x, ey - 1 + ly, Px.White);
    }
  }
  if (f.traits.cheeks || f.shown === "responded") {
    set(left - 1, ey + 2, Px.Blush);
    set(16 - left, ey + 2, Px.Blush);
  }
  drawMouth(f, set, ey + 3, frame);
}

function drawMouth(f: FaceFrame, set: Set, my: number, frame: number) {
  const row = (xs: number[], y: number, c: Px) => xs.forEach((x) => set(x, y, c));
  switch (f.shown) {
    case "working":
      return frame === 1 ? row([7, 8], my, Px.Dark) : row([8], my, Px.Dark);
    case "needs_you":
      row([7, 8], my, Px.Dark);
      return row([7, 8], my + 1, Px.Dark);
    case "failed":
      row([7, 8], my, Px.Dark);
      return row([6, 9], my + 1, Px.Dark);
    case "responded":
      row([6, 7, 8, 9], my, Px.Dark);
      return row([7, 8], my + 1, Px.Red);
    case "waiting":
      return row([7, 8], my, Px.Dark);
    case "idle":
      row([7, 8], my, Px.Dark);
      if (f.traits.mouth !== "line" && f.traits.mouth !== "small") row([6, 9], my - 1, Px.Dark);
  }
}

function drawAccessory(f: FaceFrame, set: Set, top: number) {
  switch (f.traits.accessory) {
    case "antenna":
      set(8, top - 1, Px.Outline);
      set(8, top - 2, Px.Outline);
      set(8, top - 3, f.shown === "needs_you" ? Px.Yellow : Px.Accessory);
      return;
    case "tuft":
      set(6, top - 1, Px.Accessory);
      set(8, top - 1, Px.Accessory);
      set(8, top - 2, Px.Accessory);
      set(10, top - 1, Px.Accessory);
      return;
    case "sprout":
      set(7, top - 1, Px.Outline);
      set(6, top - 2, Px.Accessory);
      set(8, top - 2, Px.Accessory);
      return;
    case "bandage":
      set(10, top + 2, Px.White);
      set(11, top + 2, Px.White);
      return;
    case "headband":
      for (let x = 3; x < 13; x++) set(x, top + 2, Px.Accessory);
      return;
    case "bolt":
      set(3, top + 3, Px.Yellow);
      set(4, top + 4, Px.Yellow);
      return;
    case "none":
      return;
  }
}

function drawMark(f: FaceFrame, set: Set, frame: number) {
  switch (f.shown) {
    case "needs_you":
      if (frame === 0) [0, 1, 2, 4].forEach((y) => set(14, y, Px.Yellow));
      return;
    case "waiting":
      for (let i = 0; i <= frame; i++) set(11 + i * 2, 1, Px.White);
      return;
    case "working":
      set([13, 14, 13][frame], [2, 1, 0][frame], Px.Cyan);
      set([1, 2, 1][frame], [3, 2, 1][frame], Px.Cyan);
      return;
    case "failed":
      set(14, 4 + frame, Px.Cyan);
      set(14, 5 + frame, Px.Cyan);
      return;
    case "responded":
      for (const [x, y] of frame === 1 ? [[13, 1]] : [[13, 0], [12, 1], [14, 1], [13, 2]]) set(x, y, Px.Yellow);
      return;
    case "idle":
      return;
  }
}
