import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Every stylesheet that sets tokens on :root, in the order index.css loads them.
const sheets = ["tokens.css", "print-tokens.css", "print-texture.css"].map((f) => readFileSync(`src/components/theme/${f}`, "utf8").replace(/\/\*[\s\S]*?\*\//g, ""));
const rules = sheets.flatMap((css) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim(), body: m[2] })));

const themes = ["ink", "newsprint", "classic"] as const;
const names = ["--bob-send", "--bob-send-hover", "--bob-send-text"] as const;
const expected: Record<(typeof names)[number], string> = { "--bob-send": "#2563eb", "--bob-send-hover": "#1d4ed8", "--bob-send-text": "#ffffff" };

// A token's value in a theme: the plain :root value, overridden by any :root[data-theme="<theme>"] block.
const resolve = (name: string, theme: string): string | null => {
  let value: string | null = null;
  for (const specific of [false, true]) {
    for (const r of rules) {
      const applies = specific ? r.selector === `:root[data-theme="${theme}"]` : r.selector === ":root";
      if (!applies) continue;
      const m = r.body.match(new RegExp(`${name}:\\s*([^;]+);`));
      if (m) value = m[1].trim();
    }
  }
  const ref = value?.match(/^var\((--[\w-]+)\)$/);
  return ref ? resolve(ref[1], theme) : value;
};

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe("the send button tokens are blue, resolved per theme", () => {
  for (const theme of themes) {
    for (const name of names) {
      it(`${name} is ${expected[name]} in ${theme}`, () => {
        expect(resolve(name, theme)).toBe(expected[name]);
      });
    }
    it(`label contrast on base and hover is at least 4.5:1 in ${theme}`, () => {
      const text = resolve("--bob-send-text", theme)!;
      expect(contrast(resolve("--bob-send", theme)!, text)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(resolve("--bob-send-hover", theme)!, text)).toBeGreaterThanOrEqual(4.5);
    });
  }

  it("no theme block sets a send token of its own", () => {
    const themed = rules.filter((r) => /\[data-theme/.test(r.selector) && /--bob-send/.test(r.body));
    expect(themed.map((r) => r.selector)).toEqual([]);
  });

  it("knows the three themes: ink and newsprint have blocks, classic has none", () => {
    const selectors = rules.map((r) => r.selector);
    expect(selectors).toContain(':root[data-theme="ink"]');
    expect(selectors).toContain(':root[data-theme="newsprint"]');
    expect(selectors).not.toContain(':root[data-theme="classic"]');
  });
});
