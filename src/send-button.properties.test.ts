import { readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, it } from "vitest";
import { expect } from "vitest";

const tokens = readFileSync("src/components/theme/tokens.css", "utf8");
const css = readFileSync("src/components/features/conversation/styles/composer.css", "utf8");
const hex = (name: string) => tokens.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`))![1];

const lum = (h: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);

describe("send button colours", () => {
  it("label contrast is readable on the orange and its hover, for any state", () => {
    fc.assert(
      fc.property(fc.constantFrom("--bob-send", "--bob-send-hover"), (name) => {
        expect(ratio(hex(name), hex("--bob-send-text"))).toBeGreaterThanOrEqual(4.5);
      }),
    );
  });

  it("every send-button state is painted from a send token, never a literal colour", () => {
    fc.assert(
      fc.property(fc.constantFrom("", ":hover:not(:disabled)", ":disabled"), (state) => {
        const blocks = [...css.matchAll(/([^{}]*\.composer-send[^{}]*)\{([^}]*)\}/g)].filter((m) => (state ? m[1].includes(state) : !m[1].includes(":")));
        expect(blocks.length).toBeGreaterThan(0);
        for (const m of blocks) expect(m[2]).toMatch(/var\(--bob-send/);
      }),
    );
  });
});
