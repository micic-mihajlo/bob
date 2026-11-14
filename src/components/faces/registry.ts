import { blobRenderer } from "./blob";
import { glyphRenderer } from "./glyph";
import { pixelRenderer } from "./pixel";
import { printRenderer } from "./print";
import type { FaceRenderer } from "./types";

export const RENDERERS = {
  print: printRenderer,
  glyph: glyphRenderer,
  blob: blobRenderer,
  pixel: pixelRenderer,
} as const satisfies Record<string, FaceRenderer>;

export type FaceStyle = keyof typeof RENDERERS;

export const FACE_STYLES = Object.keys(RENDERERS) as FaceStyle[];
