import { describe, expect, it } from "vitest";
import { nextReveal } from "../reveal";

const TEXT =
  "The export now **escapes** quotes, keeps `\\n` inside cells, and streams https://example.com/a/really/long/url/that/is/one/word rows.\n\n- one\n- two";

function chunks(text: string, seed: number): string[] {
  let state = seed;
  let at = 0;
  let parts: string[] = [];
  while (at < text.length) {
    state = (state * 48271) % 2147483647;
    const size = 1 + (state % 9);
    parts = [...parts, text.slice(at, at + size)];
    at += size;
  }
  return parts;
}

/** Feeds the text in random chunks and returns every prefix the reveal showed. */
function simulate(seed: number): { shown: string[]; final: string } {
  let received = "";
  let shown = 0;
  let budget = 0;
  let seen: string[] = [];
  const parts = chunks(TEXT, seed);
  for (const [index, part] of parts.entries()) {
    received += part;
    const step = nextReveal({ shown, target: received, streaming: index < parts.length - 1, budget });
    shown = step.shown;
    budget = step.budget;
    seen = [...seen, received.slice(0, shown)];
  }
  for (let tick = 0; tick < 1000 && shown < received.length; tick += 1) {
    const step = nextReveal({ shown, target: received, streaming: false, budget });
    shown = step.shown;
    budget = step.budget;
    seen = [...seen, received.slice(0, shown)];
  }
  return { shown: seen, final: received.slice(0, shown) };
}

describe("nextReveal", () => {
  it("never shows half a word while streaming", () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const { shown } = simulate(seed);
      for (const prefix of shown) {
        const atBoundary = prefix === "" || /\s$/.test(prefix) || prefix === TEXT;
        expect(atBoundary, JSON.stringify(prefix)).toBe(true);
      }
    }
  });

  it("only moves forward and finishes with the whole text", () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const { shown, final } = simulate(seed);
      expect(final).toBe(TEXT);
      expect(shown.every((prefix, index) => index === 0 || prefix.length >= (shown[index - 1]?.length ?? 0))).toBe(true);
    }
  });

  it("catches up faster when far behind", () => {
    const small = nextReveal({ shown: 0, target: "a b c d e f g h i j k l m n o p ".repeat(2), streaming: true, budget: 0 });
    const large = nextReveal({ shown: 0, target: "a b c d e f g h i j k l m n o p ".repeat(40), streaming: true, budget: 0 });
    expect(large.shown).toBeGreaterThan(small.shown * 5);
  });

  it("holds a last word with no space after it until the stream ends", () => {
    expect(nextReveal({ shown: 0, target: "partial", streaming: true, budget: 100 }).shown).toBe(0);
    expect(nextReveal({ shown: 0, target: "partial", streaming: false, budget: 0 }).shown).toBe(7);
  });
});
