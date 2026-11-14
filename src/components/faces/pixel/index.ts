import { oklch } from "../palette";
import type { FaceFrame, FaceRenderer } from "../types";
import { buildSprite, GRID, Px } from "./sprite";

function paletteFor(f: FaceFrame): Record<Exclude<Px, 0>, string> {
  const v = f.expr.vivid;
  return {
    [Px.Outline]: oklch(0.3, 0.07 * v, f.hue),
    [Px.Body]: oklch(0.75, 0.15 * v, f.hue),
    [Px.Shade]: oklch(0.58, 0.15 * v, f.hue + 10),
    [Px.Light]: oklch(0.9, 0.08 * v, f.hue),
    [Px.White]: "#fbfbf4",
    [Px.Dark]: "#15121a",
    [Px.Yellow]: "#ffd21f",
    [Px.Blush]: oklch(0.72, 0.17, 10),
    [Px.Accessory]: oklch(0.72, 0.17, f.hue + 150),
    [Px.Cyan]: "#5ad1ff",
    [Px.Red]: "#e8455d",
  };
}

/** Snaps every cell edge to whole device pixels so the sprite stays crisp at any face size. */
function draw(ctx: CanvasRenderingContext2D, f: FaceFrame) {
  const sprite = buildSprite(f);
  const palette = paletteFor(f);
  const device = 100 * ctx.getTransform().a;
  const step = device / GRID;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const paths = new Map<number, Path2D>();
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const c = sprite[y * GRID + x];
      if (c === Px.Empty) continue;
      const path = paths.get(c) ?? new Path2D();
      const x0 = Math.round(x * step);
      const y0 = Math.round(y * step);
      path.rect(x0, y0, Math.round((x + 1) * step) - x0, Math.round((y + 1) * step) - y0);
      paths.set(c, path);
    }
  }
  for (const [c, path] of paths) {
    ctx.fillStyle = palette[c as Exclude<Px, 0>];
    ctx.fill(path);
  }
}

export const pixelRenderer: FaceRenderer = {
  label: "Pixel",
  fps: 30,
  technique: "Canvas 2D. A pure function builds a 16x16 palette-indexed sprite per frame (2 or 3 frame loop per mood); cells batch into one path per colour.",
  draw,
};
