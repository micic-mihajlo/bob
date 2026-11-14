/** Seeded PRNG (mulberry32), so every failing scenario can be replayed from its seed. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = <T>(rand: () => number, xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];

/** A random non-empty subset, in order. */
export function subset<T>(rand: () => number, xs: readonly T[]): T[] {
  const chosen = xs.filter(() => rand() < 0.4);
  return chosen.length > 0 ? chosen : [pick(rand, xs)];
}

export const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);
