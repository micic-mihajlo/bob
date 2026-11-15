import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Every stylesheet that sets tokens on :root, in the order index.css loads them.
const sheets = ["tokens.css", "print-tokens.css", "print-texture.css"].map((f) => readFileSync(`src/components/theme/${f}`, "utf8").replace(/\/\*[\s\S]*?\*\//g, ""));
const rules = sheets.flatMap((css) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim(), body: m[2] })));

const themes = ["ink", "newsprint", "classic"] as const;
const names = ["--bob-send", "--bob-send-hover", "--bob-send-text"] as const;
const expected: Record<(typeof names)[number], string> = { "--bob-send": "#f97316", "--bob-send-hover": "#ea580c", "--bob-send-text": "#120a02" };

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

describe("the send button tokens, resolved per theme", () => {
  for (const theme of themes) {
    for (const name of names) {
      it(`${name} is ${expected[name]} in ${theme}`, () => {
        expect(resolve(name, theme)).toBe(expected[name]);
      });
    }
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
