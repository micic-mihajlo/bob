/** Timings for the word-by-word reveal of a streaming reply. */
export const REVEAL_TIMING = {
  stepMs: 40,
  fadeMs: 300,
  /** How far behind the received text the shown text may fall before it speeds up. */
  catchUpMs: 400,
  /** The slowest speed, so the last words of a backlog do not crawl. */
  minCharsPerSecond: 120,
} as const;

export interface RevealInput {
  shown: number;
  target: string;
  /** More text may still arrive, so a last word with no space after it may still grow. */
  streaming: boolean;
  /** Characters carried over from the last step: positive is credit, negative is debt. */
  budget: number;
}

export interface RevealStep {
  shown: number;
  budget: number;
}

const WORD = /\s*\S+\s+/y;

/**
 * Advances the shown length by whole words. The budget grows with the backlog, so the shown text
 * stays about `catchUpMs` behind the received text however fast it arrives.
 */
export function nextReveal(input: RevealInput, timing = REVEAL_TIMING): RevealStep {
  const { target, streaming } = input;
  const backlog = target.length - input.shown;
  if (backlog <= 0) return { shown: target.length, budget: 0 };
  const minimum = (timing.minCharsPerSecond * timing.stepMs) / 1000;
  const word = new RegExp(WORD.source, "y");
  let budget = input.budget + (backlog * timing.stepMs) / Math.max(timing.catchUpMs, timing.stepMs) + minimum;
  let shown = input.shown;
  while (budget > 0) {
    word.lastIndex = shown;
    const found = word.exec(target);
    if (!found) {
      // The rest is one word with nothing after it: it waits while it may still grow.
      return streaming ? { shown, budget: Math.min(budget, 0) } : { shown: target.length, budget: 0 };
    }
    shown += found[0].length;
    budget -= found[0].length;
  }
  // A long word, such as a URL, overshoots. Owe at most one minimum step, so the next words do not stall.
  return { shown, budget: Math.max(budget, -minimum) };
}

export interface RevealChunk {
  start: number;
  end: number;
  revealedAt: number;
}

/** The text split into a settled prefix and the chunks still fading in. */
export function splitTrail(
  text: string,
  shown: number,
  trail: readonly RevealChunk[],
): { prefix: string; chunks: { key: number; text: string; revealedAt: number }[] } {
  const fading = trail.filter((chunk) => chunk.end <= shown && chunk.end > chunk.start);
  const settled = fading[0]?.start ?? shown;
  return {
    prefix: text.slice(0, settled),
    chunks: fading.map((chunk) => ({ key: chunk.start, text: text.slice(chunk.start, chunk.end), revealedAt: chunk.revealedAt })),
  };
}
