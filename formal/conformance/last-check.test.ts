import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { sourceHash } from "../source-hash.mjs";

const formal = path.resolve(__dirname, "..");
const read = (name: string) => JSON.parse(readFileSync(path.join(formal, name), "utf8"));

describe("the recorded Lean check", () => {
  it("matches the current Lean sources and covers every theorem in the catalog", () => {
    const check = read("last-check.json");
    expect(check.ok).toBe(true);
    expect(check.sourceHash, "Lean sources changed: run pnpm verify and commit formal/last-check.json").toBe(sourceHash(formal));
    const recorded = check.theorems.map((t: { name: string }) => t.name);
    expect(recorded).toEqual(read("theorems.json").theorems.map((t: { name: string }) => t.name));
    for (const t of check.theorems) expect(t.axioms).not.toContain("sorryAx");
  });
});
