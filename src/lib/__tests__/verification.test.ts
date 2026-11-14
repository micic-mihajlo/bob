import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { State } from "../state";
import { getConfig, getState, update } from "../store";
import { toolsFor } from "../tools";
import { markEquivalent } from "../tools/verify";
import type { Agent, Artifact } from "../types";
import type { PullRequestArtifact } from "../threads";
import { verificationLine, verificationRefusal, verificationStatus, type EquivalentMutant, type Verification } from "../verification";
import { changedLines, mutantsOf } from "../verify/mutants";
import { runProof } from "../verify/run";
import { freshTeam } from "./helpers";
import type { Workspace } from "../workspace";

const CSV = `export function csvCell(value: string): string {
  return /[",\\n]/.test(value) ? \`"\${value.replace(/"/g, '""')}"\` : value;
}

export const label = "a < b && c";
export const cents = (n: number) => (n / 100).toFixed(2);
`;

const all = (src: string) => new Set(src.split("\n").map((_, i) => i + 1));

describe("mutants", () => {
  it("drops the quote escaping inside a template expression, and never touches strings or regular expressions", () => {
    const mutants = mutantsOf("src/csv.ts", CSV, all(CSV));
    expect(mutants.find((m) => m.operator === "dropped .replace()")?.after).toBe('return /[",\\n]/.test(value) ? \`"\${value}"\` : value;');
    expect(mutants.some((m) => m.line === 5)).toBe(false);
    expect(mutants.filter((m) => m.line === 6).map((m) => m.operator).sort()).toEqual(["dropped .toFixed()", "off-by-one number", "off-by-one number", "swapped arithmetic"]);
  });

  it("mutates only the lines the diff changed", () => {
    expect([...changedLines("@@ -0,0 +1,3 @@\n+a\n+b\n+c\n@@ -10 +12 @@\n-x\n+y\n")]).toEqual([1, 2, 3, 12]);
    expect(mutantsOf("src/csv.ts", CSV, new Set([6])).every((m) => m.line === 6)).toBe(true);
  });
});

const prOf = (files: string[], tree = "tree1"): PullRequestArtifact =>
  ({ id: "art_1", kind: "pull_request", agentId: "inv-1", pullRequest: { number: 3, branch: "b", headSha: "abc", files: files.map((p) => ({ path: p, additions: 1, deletions: 0 })), patch: "", merged: false, tree } }) as unknown as PullRequestArtifact;

const verification = (over: Partial<Verification> = {}): Verification => ({
  id: "ver_1",
  agentId: "inv-1",
  tree: "tree1",
  at: "2026-11-14T00:00:00Z",
  seconds: 4,
  contract: { path: "verify/wo_1.json", ok: true, acceptance: "one row per invoice", properties: 4 },
  properties: { file: "src/csv.properties.test.ts", ok: true, seed: 7, runs: [1, 2, 3, 4].map((n) => ({ name: `p${n}`, runs: 300, failed: false, counterexample: null, seed: 7, path: null, message: null })) },
  mutation: { ok: true, mutants: Array.from({ length: 8 }, (_, i) => ({ file: "src/csv.ts", line: i + 1, operator: "x", before: "a", after: "b", killed: true })) },
  proof: { status: "proved", theorems: ["Csv.unescape_escape"], axioms: ["propext"], cases: 6, seconds: 0.8 },
  ...over,
});

const stateWith = (verifications: Verification[], equivalentMutants: EquivalentMutant[] = []) =>
  ({ agents: [{ id: "inv-1", code: "INV-1" }], verifications, equivalentMutants }) as unknown as State;

const SURVIVOR = { file: "src/invoices.ts", line: 3, operator: "flipped comparison", before: "return a.id < b.id ? -1 : 1;", after: "return a.id <= b.id ? -1 : 1;", killed: false };
const withSurvivor = () => verification({ mutation: { ok: false, mutants: [...verification().mutation.mutants.slice(0, 5), SURVIVOR] } });
const waiver: EquivalentMutant = { pullRequestId: "art_1", file: SURVIVOR.file, before: SURVIVOR.before, after: SURVIVOR.after, reason: "ids are unique, so a and b are never equal", by: "inv-2", at: "2026-11-14T00:00:00Z" };

describe("the verification gate", () => {
  const installDeps = getConfig().installDeps;
  afterEach(() => {
    getConfig().installDeps = installDeps;
  });

  it("reads as one line, with the proof shown honestly", () => {
    expect(verificationLine(verification())).toBe("4 properties · 1,200 cases · 8/8 mutants killed · proved in Lean");
    expect(verificationLine(verification({ proof: { status: "skipped", reason: "Lean not installed" } }))).toBe("4 properties · 1,200 cases · 8/8 mutants killed · Lean skipped: Lean not installed");
    expect(verificationLine(verification({ proof: { status: "not_proved", reason: "a proof uses sorry" } }))).toMatch(/· not proved in Lean: a proof uses sorry$/);
    const survivor = verification({ mutation: { ok: false, mutants: [...verification().mutation.mutants.slice(1), { file: "src/csv.ts", line: 2, operator: "dropped .replace()", before: "a", after: "b", killed: false }] } });
    expect(verificationLine(survivor)).toContain("7/8 mutants killed");
    const counterexample = verification({ properties: { ...verification().properties, ok: false, runs: [{ name: "round trip", runs: 12, failed: true, counterexample: '["\\""]', seed: 7, path: "11:0", message: null }] } });
    expect(verificationLine(counterexample)).toContain('counterexample to "round trip": ["\\""]');
  });

  it("refuses until tiers 1 to 3 pass on the pull request's exact tree, and lets a change with no source through", () => {
    getConfig().installDeps = true;
    const pr = prOf(["src/csv.ts", "src/csv.test.ts"]);
    expect(verificationRefusal(stateWith([]), pr)).toMatch(/^#3 has no verification of its head\. Ask INV-1 to call verify_change/);
    expect(verificationRefusal(stateWith([verification({ tree: "other" })]), pr)).toMatch(/no verification of its head/);
    const failing = verification({ mutation: { ok: false, mutants: [{ file: "src/csv.ts", line: 2, operator: "dropped .replace()", before: "a", after: "b", killed: false }] } });
    expect(verificationRefusal(stateWith([failing]), pr)).toMatch(/^#3 fails verification: 4 properties · 1,200 cases · 0\/1 mutants killed/);
    expect(verificationRefusal(stateWith([failing, verification()]), pr)).toBeNull();
    expect(verificationRefusal(stateWith([verification({ proof: { status: "not_proved", reason: "a proof uses sorry" } })]), pr)).toBeNull();
    expect(verificationRefusal(stateWith([]), prOf(["docs/note.md", "src/a.test.ts"]))).toBeNull();
    expect(verificationStatus(stateWith([]), prOf(["docs/note.md"]))).toBe("not needed, no source changes");
  });

  it("is off when Bob does not install the project's dependencies", () => {
    getConfig().installDeps = false;
    expect(verificationRefusal(stateWith([]), prOf(["src/csv.ts"]))).toBeNull();
  });
});

describe("equivalent mutants", () => {
  const installDeps = getConfig().installDeps;
  afterEach(() => {
    getConfig().installDeps = installDeps;
  });

  it("count as equivalent, not killed, and let the gate pass once a reviewer marks them", () => {
    getConfig().installDeps = true;
    const pr = prOf(["src/invoices.ts"]);
    expect(verificationLine(withSurvivor())).toBe("4 properties · 1,200 cases · 5/6 mutants killed · proved in Lean");
    expect(verificationLine(withSurvivor(), [waiver])).toBe("4 properties · 1,200 cases · 5/5 mutants killed · 1 equivalent · proved in Lean");
    expect(verificationRefusal(stateWith([withSurvivor()]), pr)).toMatch(/fails verification: .*5\/6 mutants killed.*mark_equivalent_mutant/);
    expect(verificationRefusal(stateWith([withSurvivor()], [waiver]), pr)).toBeNull();
    expect(verificationRefusal(stateWith([withSurvivor()], [{ ...waiver, after: "return a.id > b.id ? -1 : 1;" }]), pr)).not.toBeNull();
  });

  it("can be marked by a review thread only, with a one-line reason, for a mutant that really survived", () => {
    const role = (crewRole: "build" | "review") => toolsFor({ id: "x", kind: "crew", crewRole } as Agent).map((t) => t.name);
    expect(role("review")).toContain("mark_equivalent_mutant");
    expect(role("build")).not.toContain("mark_equivalent_mutant");
    expect(role("build")).toContain("verify_change");

    freshTeam();
    update((st) => ({ ...st, artifacts: [...st.artifacts, { ...prOf(["src/invoices.ts"]), title: "Sort invoices", detail: "", status: "open", requestId: "req_test", turnId: "turn_test", at: "2026-11-14T00:00:00Z" } as unknown as Artifact], verifications: [withSurvivor()] }));
    const ctx = { agentId: "inv-2", turnId: "turn_test", requestId: "req_test", causedBy: null };
    expect(String(markEquivalent({ pullRequestId: "#3", file: "src/invoices.ts", line: 9, reason: "never equal keys here" }, ctx).result.error)).toMatch(/No surviving mutant of #3 at src\/invoices\.ts:9\. Survivors: src\/invoices\.ts:3/);
    const marked = markEquivalent({ pullRequestId: "#3", file: "src/invoices.ts", line: 3, reason: waiver.reason }, ctx);
    expect(marked.result).toMatchObject({ passed: true, line: "4 properties · 1,200 cases · 5/5 mutants killed · 1 equivalent · proved in Lean" });
    expect(getState().equivalentMutants).toEqual([expect.objectContaining({ file: "src/invoices.ts", after: SURVIVOR.after, reason: waiver.reason, by: "inv-2" })]);
    expect(String(markEquivalent({ pullRequestId: "#3", file: "src/invoices.ts", line: 3, reason: "again, same one" }, ctx).result.error)).toMatch(/Survivors: none/);
  });
});

describe("the Lean tier", () => {
  it("says Lean is not installed instead of failing when there is no lake", async () => {
    const env = { HOME: process.env.HOME, PATH: process.env.PATH, BOB_LAKE: process.env.BOB_LAKE };
    process.env.HOME = mkdtempSync(path.join(os.tmpdir(), "bob-nolean-"));
    process.env.PATH = "/usr/bin:/bin";
    delete process.env.BOB_LAKE;
    try {
      const contract = { acceptance: "x", propertiesFile: "p.test.ts", properties: [{ name: "p", criterion: "x" }], lean: { file: "verify/M.lean", theorems: ["M.t"] } };
      expect(await runProof({} as Workspace, contract, null, null)).toEqual({ status: "skipped", reason: "Lean not installed" });
    } finally {
      for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });
});
