import { oklch } from "../palette";
import type { FaceFrame, FaceRenderer } from "../types";
import { glyphCells, gridSize, type Glyph, type Tone } from "./grid";

const FONT = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace";

function toneColor(tone: Tone, f: FaceFrame): string {
  const v = f.expr.vivid;
  switch (tone) {
    case "shell":
      return oklch(0.84, 0.15 * v, f.hue);
    case "fill":
      return oklch(0.6, 0.11 * v, f.hue);
    case "code":
      return oklch(0.86, 0.15, f.hue + 140);
    case "spill":
      return oklch(0.7, 0.12, f.hue + 140, 0.55);
    case "alert":
      return "#ffd21f";
    case "eye":
    case "mouth":
      return "#f7f7f2";
    case "accessory":
      return oklch(0.85, 0.12, f.hue + 40);
  }
}

function draw(ctx: CanvasRenderingContext2D, f: FaceFrame) {
  const cell = 100 / gridSize(f.size);
  ctx.beginPath();
  ctx.roundRect(1, 1, 98, 98, 24);
  ctx.fillStyle = oklch(0.17, 0.02 * f.expr.vivid, f.hue);
  ctx.fill();
  ctx.strokeStyle = oklch(0.42, 0.08 * f.expr.vivid, f.hue);
  ctx.lineWidth = Math.max(1.5, f.unit);
  ctx.stroke();

  const groups = new Map<string, Glyph[]>();
  for (const g of glyphCells(f)) {
    const key = `${g.tone}|${g.scale}`;
    groups.set(key, [...(groups.get(key) ?? []), g]);
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const [key, glyphs] of groups) {
    const [tone, scale] = key.split("|");
    const weight = tone === "fill" || tone === "spill" ? 500 : 800;
    ctx.font = `${weight} ${(cell * 1.08 * Number(scale)).toFixed(2)}px ${FONT}`;
    ctx.fillStyle = toneColor(tone as Tone, f);
    for (const g of glyphs) ctx.fillText(g.ch, g.x, g.y);
  }
}

export const glyphRenderer: FaceRenderer = {
  label: "Glyph",
  fps: 30,
  technique: "Canvas 2D text. A 7, 9 or 13 cell character grid masked to the head shape; cells scramble to code while working and settle cell by cell.",
  draw,
};
