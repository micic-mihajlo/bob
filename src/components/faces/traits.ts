import { createRandom, hashString, pick } from "./seed";
import { ACCESSORIES, EYE_KINDS, HEAD_SHAPES, MOUTH_KINDS, type Traits } from "./types";

export function traitsFor(seed: string): Traits {
  const hash = hashString(seed);
  const rand = createRandom(hash);
  const between = (lo: number, hi: number) => lo + rand() * (hi - lo);
  return {
    hash,
    head: pick(rand, HEAD_SHAPES),
    eyes: pick(rand, EYE_KINDS),
    mouth: pick(rand, MOUTH_KINDS),
    accessory: pick(rand, ACCESSORIES),
    eyeGap: between(11.5, 16),
    eyeY: between(-3, 3),
    eyeScale: between(0.88, 1.15),
    tilt: between(-0.07, 0.07),
    phase: rand(),
    brows: rand() < 0.55,
    cheeks: rand() < 0.6,
    freckles: rand() < 0.3,
  };
}
