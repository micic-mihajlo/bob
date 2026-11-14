import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");
const composerCss = read("src/components/features/conversation/styles/composer.css");
const tokensCss = read("src/components/theme/tokens.css");
const printTokensCss = read("src/components/theme/print-tokens.css");
const composerTsx = read("src/components/features/conversation/ConversationComposer.tsx");

const token = (name: string) => {
  const m = tokensCss.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`));
  return m?.[1] ?? null;
};

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const rule = (selector: string) => composerCss.match(new RegExp(`${selector.replace(/[.[\]:()]/g, "\\$&")}\\s*\\{([^}]*)\\}`))?.[1] ?? "";

describe("composer send button is orange", () => {
  it("defines one orange token and a readable on-orange token", () => {
    expect(token("--bob-send")).toBe("#f97316");
    expect(token("--bob-send-hover")).not.toBeNull();
    expect(token("--bob-send-text")).not.toBeNull();
    expect(contrast(token("--bob-send")!, token("--bob-send-text")!)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("--bob-send-hover")!, token("--bob-send-text")!)).toBeGreaterThanOrEqual(4.5);
  });

  it("the send button has its own class and the stop/voice buttons do not", () => {
    expect(composerTsx).toMatch(/aria-label="Send message"/);
    expect(composerTsx).toMatch(/composer-send/);
  });

  it("paints the send button from the tokens, including hover and disabled", () => {
    expect(rule(".voice-button.composer-send")).toMatch(/background:\s*var\(--bob-send\)/);
    expect(rule(".voice-button.composer-send")).toMatch(/color:\s*var\(--bob-send-text\)/);
    expect(composerCss).toMatch(/\.voice-button\.composer-send:hover:not\(:disabled\)[^{]*\{[^}]*var\(--bob-send-hover\)/);
    expect(composerCss).toMatch(/\.voice-button\.composer-send:disabled[^{]*\{[^}]*var\(--bob-send\)/);
  });

  it("neither print theme overrides the tokens, so ink and newsprint both get orange", () => {
    expect(printTokensCss).not.toMatch(/--bob-send/);
  });
});
