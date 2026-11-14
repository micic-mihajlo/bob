// biome-ignore lint/correctness/noUndeclaredDependencies: aliased to the web app's own file in electron.vite.config.ts.
import { asciiFaceFrame, asciiFaceIdentity, drawAsciiFace } from "@bob/web-ascii-face";

/** The avatar box the image fills, in css pixels, drawn at twice that for sharp edges. */
const BOX = 48;
const RATIO = 2;
/** Pixels at least this opaque are the head or the hat; the halo is fainter. */
const SOLID_ALPHA = 160;
/** Room left around the head and hat, as a share of their size. */
const PADDING = 0.04;
const urls = new Map<string, string>();

/**
 * A Blob's face exactly as Bob's web app draws it: the same ASCII head, seeded by the thread id, in the
 * thread's own hue and hard hat, from the web app's own source. The web draws the head on a canvas half
 * as large again as the avatar and lets the hat rise past the avatar's box. An image is clipped to its
 * box, so this keeps the square around the head and its hat, leaving out only the faint halo.
 */
export function blobAvatarUrl(threadId: string, hue: number): string {
  const key = `${threadId}:${hue}`;
  const cached = urls.get(key);
  if (cached) return cached;
  const size = BOX * 1.5 * RATIO;
  const head = document.createElement("canvas");
  head.width = head.height = size;
  const context = head.getContext("2d");
  if (!context) return "";
  context.setTransform(RATIO, 0, 0, RATIO, 0, 0);
  const identity = asciiFaceIdentity(threadId, hue);
  drawAsciiFace(context, BOX * 1.5, identity, asciiFaceFrame("idle", identity.phase, false, 0, null), true);
  const { data } = context.getImageData(0, 0, size, size);
  let top = size;
  let bottom = 0;
  let left = size;
  let right = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if ((data[(y * size + x) * 4 + 3] ?? 0) < SOLID_ALPHA) continue;
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
      left = Math.min(left, x);
      right = Math.max(right, x);
    }
  }
  if (bottom < top) return "";
  const side = Math.max(bottom - top, right - left) * (1 + PADDING * 2);
  const x = (left + right - side) / 2;
  const y = (top + bottom - side) / 2;
  const avatar = document.createElement("canvas");
  avatar.width = avatar.height = BOX * RATIO;
  avatar.getContext("2d")?.drawImage(head, x, y, side, side, 0, 0, BOX * RATIO, BOX * RATIO);
  const url = avatar.toDataURL("image/png");
  urls.set(key, url);
  return url;
}
