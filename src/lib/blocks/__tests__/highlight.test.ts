import { describe, expect, it } from "vitest";
import { highlight, splitLines } from "../highlight";

const SAMPLES: Record<string, string> = {
  ts: 'export async function toCsv(rows: Row[]): Promise<string> {\n  // escape "quotes"\n  const n = 0x1f + 1_000n;\n  return `${rows.length}\n` + \'it\\\'s\'; /* open',
  json: '{\n  "name": "bob",\n  "ok": true,\n  "n": -1.5e3,\n  "s": "unterminated',
  bash: 'export PATH="$HOME/bin:${PATH}" # comment\npnpm --filter web test -- --run\necho "#not comment" \'single',
  python: '@cache\ndef rows(path: str) -> list:\n    """doc\n    string"""\n    return [r for r in open(path) if r]  # done\nx = f"{1}" + \'open',
  diff: "diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-old\n+new\n context\n",
  unknown: "anything\n goes",
};

function randomText(seed: number, length: number): string {
  const alphabet = 'ab1 _$"\'`/*#@\\\n{}()[]-+:.,\t😀é';
  let state = seed;
  return Array.from({ length }, () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return Array.from(alphabet)[state % Array.from(alphabet).length];
  }).join("");
}

describe("highlight", () => {
  for (const [lang, code] of Object.entries(SAMPLES)) {
    it(`keeps every character of ${lang}`, () => {
      const tokens = highlight(code, lang);
      expect(tokens.map((token) => token.text).join("")).toBe(code);
      expect(tokens.every((token) => token.text.length > 0)).toBe(true);
    });
  }

  it("keeps every character of random input in every language", () => {
    for (const lang of ["ts", "json", "bash", "python", "diff"]) {
      for (let seed = 1; seed <= 40; seed += 1) {
        const code = randomText(seed, 200);
        expect(highlight(code, lang).map((token) => token.text).join("")).toBe(code);
      }
    }
  });

  it("colours the obvious tokens", () => {
    const kinds = highlight('const a = "x"; // hi', "ts").filter((token) => token.kind !== "plain");
    expect(kinds.map((token) => [token.kind, token.text])).toEqual([
      ["keyword", "const"],
      ["string", '"x"'],
      ["comment", "// hi"],
    ]);
  });

  it("splits tokens by line without losing text", () => {
    const code = SAMPLES.python ?? "";
    const lines = splitLines(highlight(code, "python"));
    expect(lines.map((line) => line.map((token) => token.text).join("")).join("\n")).toBe(code);
    expect(splitLines(highlight("a\n", "ts"))).toHaveLength(1);
  });
});
