import { stillFrame } from "./frame";
import { traitsFor } from "./traits";
import { MOODS, type FaceRenderer, type FaceSize } from "./types";

const DRAW_OPS = new Set(["fill", "stroke", "fillText", "strokeText", "fillRect", "strokeRect", "drawImage"]);

export type DrawCost = { readonly size: FaceSize; readonly mean: number; readonly max: number };

/** Counts canvas draw calls one frame of each mood makes, by drawing through a counting proxy. */
export function measureDrawCalls(renderer: FaceRenderer, size: FaceSize, seeds: readonly string[]): DrawCost {
  const canvas = document.createElement("canvas");
  canvas.width = size * 2;
  canvas.height = size * 2;
  const real = canvas.getContext("2d");
  if (!real) return { size, mean: 0, max: 0 };
  const counts: number[] = [];
  for (const seed of seeds) {
    for (const mood of MOODS) {
      let calls = 0;
      const counting = new Proxy(real, {
        get(target, prop) {
          const value = Reflect.get(target, prop, target);
          if (typeof value !== "function") return value;
          return (...args: unknown[]) => {
            if (typeof prop === "string" && DRAW_OPS.has(prop)) calls++;
            return value.apply(target, args);
          };
        },
        set(target, prop, value) {
          return Reflect.set(target, prop, value, target);
        },
      });
      const frame = stillFrame({ size, hue: 200, traits: traitsFor(seed), mark: { mood, prev: mood, since: 0 } });
      real.setTransform((size * 2) / 100, 0, 0, (size * 2) / 100, 0, 0);
      real.save();
      renderer.draw(counting, { ...frame, t: 1.37 });
      real.restore();
      counts.push(calls);
    }
  }
  const mean = counts.reduce((sum, n) => sum + n, 0) / Math.max(1, counts.length);
  return { size, mean: Math.round(mean), max: Math.max(...counts) };
}
