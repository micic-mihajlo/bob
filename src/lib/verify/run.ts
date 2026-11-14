import { existsSync } from "node:fs";
import { cp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { isVerifiedSource, LEAN_SKIPPED_HERE, type MutantRun, type Proof, type PropertyRun } from "../verification";
import { agentIdentity } from "../workspace/layout";
import { runGit } from "../workspace/run-git";
import { runCommand } from "../workspace/shell";
import type { Workspace } from "../workspace/types";
import { changedLines, mutantsOf, type Mutant } from "./mutants";

const RUNS = 300;
const PARALLEL = 4;
const MAX_MUTANTS = 24;
const STANDARD_AXIOMS = new Set(["propext", "Classical.choice", "Quot.sound"]);

export const contractSchema = z.object({
  acceptance: z.string().min(1),
  propertiesFile: z.string().min(1),
  properties: z.array(z.object({ name: z.string().min(1), criterion: z.string().min(1) })).min(1),
  lean: z
    .object({
      file: z.string().min(1),
      theorems: z.array(z.string().min(1)).min(1),
      conformance: z
        .object({ lean: z.string().min(1), module: z.string().min(1), export: z.string().min(1), inputs: z.array(z.string()).min(1).max(50) })
        .optional(),
    })
    .optional(),
});
export type Contract = z.infer<typeof contractSchema>;

const quote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
const gitIn = (ws: Workspace, args: string[]) => runGit({ cwd: ws.root, args, home: ws.project.home, identity: agentIdentity(ws.agentId), timeoutMs: 30_000 });

/** The tree open_pull_request would commit right now: every change staged, as git add --all does. */
export async function workingTree(ws: Workspace): Promise<string | null> {
  if ((await gitIn(ws, ["add", "--all"])).exitCode !== 0) return null;
  const tree = await gitIn(ws, ["write-tree"]);
  return tree.exitCode === 0 ? tree.stdout.trim() : null;
}

export async function treeOfCommit(ws: Workspace, sha: string): Promise<string | null> {
  const tree = await gitIn(ws, ["rev-parse", `${sha}^{tree}`]);
  return tree.exitCode === 0 ? tree.stdout.trim() : null;
}

async function mergeBase(ws: Workspace): Promise<string> {
  const base = await gitIn(ws, ["merge-base", "HEAD", "origin/main"]);
  return base.exitCode === 0 ? base.stdout.trim() : "HEAD";
}

/** verify/<work order id>.json, or the one contract the branch adds under verify/ when a reviewer runs it. */
export async function contractPathOf(ws: Workspace, workOrderId: string | null): Promise<string> {
  const expected = `verify/${workOrderId ?? "contract"}.json`;
  if (existsSync(path.join(ws.root, expected))) return expected;
  const changed = await gitIn(ws, ["diff", "--name-only", await mergeBase(ws)]);
  const found = changed.stdout.split("\n").filter((f) => /^verify\/[^/]+\.json$/.test(f) && existsSync(path.join(ws.root, f)));
  return found.length === 1 ? found[0] : expected;
}

const PROPERTIES_FILE = /\.properties\.test\.[cm]?[jt]sx?$/;

/** The it() and test() names in a properties file, in order. */
export const propertyNames = (src: string): string[] => [...src.matchAll(/\b(?:it|test)\(\s*(["'`])((?:\\.|(?!\1).)*)\1/g)].map((m) => m[2]);

/**
 * When the thread wrote a properties file but no contract, the contract is written for it: the work order's
 * acceptance check, that file, and one entry per it() in it. Returns the properties file used, or null.
 */
export async function writeContractFor(ws: Workspace, file: string, acceptance: string): Promise<string | null> {
  await gitIn(ws, ["add", "--all"]);
  const changed = await gitIn(ws, ["diff", "--name-only", "--diff-filter=AM", await mergeBase(ws)]);
  const candidates = changed.stdout.split("\n").filter((f) => PROPERTIES_FILE.test(f));
  if (candidates.length === 0) return null;
  const propertiesFile = candidates[0];
  const names = propertyNames(await readFile(path.join(ws.root, propertiesFile), "utf8").catch(() => ""));
  if (names.length === 0) return null;
  const contract: Contract = { acceptance, propertiesFile, properties: names.map((name) => ({ name, criterion: acceptance })) };
  await mkdir(path.dirname(path.join(ws.root, file)), { recursive: true });
  await writeFile(path.join(ws.root, file), JSON.stringify(contract, null, 2) + "\n");
  return propertiesFile;
}

export async function readContract(ws: Workspace, file: string): Promise<{ ok: true; contract: Contract } | { ok: false; error: string }> {
  const text = await readFile(path.join(ws.root, file), "utf8").catch(() => null);
  if (text === null) return { ok: false, error: `${file} is missing` };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: `${file} is not JSON: ${(e as Error).message}` };
  }
  const parsed = contractSchema.safeParse(json);
  if (!parsed.success) return { ok: false, error: `${file}: ${parsed.error.issues.map((i) => `${i.path.join(".") || "root"} ${i.message}`).join("; ")}` };
  if (!existsSync(path.join(ws.root, parsed.data.propertiesFile))) return { ok: false, error: `the properties file ${parsed.data.propertiesFile} is missing` };
  return { ok: true, contract: parsed.data };
}

/**
 * The vitest setup every run loads: fast-check seeded and sized by Bob, and a reporter that records each
 * property's runs and counterexample. With BOB_VERIFY_OUT set it also writes the TypeScript side of the
 * Lean conformance cases.
 */
function harness(seed: number, ws: Workspace, contract: Contract): string {
  const conformance = contract.lean?.conformance;
  const conf = conformance ? { module: path.join(ws.root, conformance.module), name: conformance.export, inputs: conformance.inputs } : null;
  return `import fc from "fast-check";
import { appendFileSync } from "node:fs";
import { expect } from "vitest";
const OUT = process.env.BOB_VERIFY_OUT;
const write = (line) => OUT && appendFileSync(OUT, JSON.stringify(line) + "\\n");
fc.configureGlobal({
  seed: ${seed},
  numRuns: ${RUNS},
  reporter(d) {
    write({ kind: "run", name: expect.getState().currentTestName ?? "", runs: d.numRuns, failed: d.failed, counterexample: d.failed && d.counterexample ? fc.stringify(d.counterexample) : null, seed: d.seed, path: d.counterexamplePath ?? null, message: d.failed ? fc.defaultReportMessage(d)?.slice(0, 600) ?? null : null });
    if (d.failed) throw new Error(fc.defaultReportMessage(d));
  },
});
const conf = ${JSON.stringify(conf)};
if (OUT && conf) {
  try {
    const m = await import(conf.module);
    write({ kind: "conformance", outputs: conf.inputs.map((i) => String(m[conf.name](i))) });
  } catch (e) {
    write({ kind: "conformance", error: String(e) });
  }
}
`;
}

interface Harness {
  dir: string;
  config: string;
  out: string;
  seed: number;
}

export async function writeHarness(ws: Workspace, contract: Contract, seed: number): Promise<Harness> {
  const dir = path.join(ws.root, ".git", "bob-verify");
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const setup = path.join(dir, "setup.mjs");
  const config = path.join(dir, "vitest.config.mjs");
  await writeFile(setup, harness(seed, ws, contract));
  await writeFile(config, `export default { test: { setupFiles: [${JSON.stringify(setup)}] } };\n`);
  return { dir, config, out: path.join(dir, "out.jsonl"), seed };
}

const vitest = (ws: Workspace) => quote(path.join(ws.root, "node_modules", ".bin", "vitest"));

/** Tier 2: the properties file alone, every property seeded and run ${RUNS} times. */
export async function runProperties(ws: Workspace, contract: Contract, h: Harness) {
  const command = `BOB_VERIFY_OUT=${quote(h.out)} ${vitest(ws)} run ${quote(contract.propertiesFile)} --config ${quote(h.config)} --root .`;
  const out = await runCommand(ws, command, 180_000);
  const lines = (await readFile(h.out, "utf8").catch(() => ""))
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
  const runs: PropertyRun[] = lines
    .filter((l) => l.kind === "run")
    .map((l) => ({ name: String(l.name), runs: Number(l.runs), failed: !!l.failed, counterexample: (l.counterexample as string) ?? null, seed: Number(l.seed), path: (l.path as string) ?? null, message: (l.message as string) ?? null }));
  const conf = lines.find((l) => l.kind === "conformance");
  const tsOutputs = Array.isArray(conf?.outputs) ? (conf.outputs as string[]) : null;
  const missing = contract.properties.filter((p) => !runs.some((r) => r.name === p.name || r.name.endsWith(` ${p.name}`)));
  const tail = out.ok ? out.output.trim().split("\n").slice(-12).join("\n") : out.error;
  let error: string | undefined;
  if (!out.ok || out.exitCode !== 0) error = runs.some((r) => r.failed) ? undefined : `vitest failed: ${tail}`;
  else if (missing.length) error = `never ran fc.assert for ${missing.map((p) => `"${p.name}"`).join(", ")}; name each property's test exactly as the contract does`;
  const ok = !error && !runs.some((r) => r.failed) && out.ok && out.exitCode === 0;
  return { result: { file: contract.propertiesFile, ok, seed: h.seed, runs, ...(error ? { error } : {}) }, tsOutputs, conformanceError: typeof conf?.error === "string" ? conf.error : null };
}

/** The mutants of every changed source line since the branch left main, uncommitted work included. */
export async function mutantsFor(ws: Workspace): Promise<Mutant[]> {
  const from = await mergeBase(ws);
  const names = await gitIn(ws, ["diff", "--name-only", "--diff-filter=AM", from]);
  const files = names.stdout.split("\n").map((f) => f.trim()).filter(isVerifiedSource);
  const all: Mutant[] = [];
  for (const file of files) {
    const diff = await gitIn(ws, ["diff", "-U0", from, "--", file]);
    const src = await readFile(path.join(ws.root, file), "utf8").catch(() => null);
    if (src !== null) all.push(...mutantsOf(file, src, changedLines(diff.stdout)));
  }
  return all.slice(0, MAX_MUTANTS);
}

/** A copy of the workspace's files beside its home, node_modules linked, for one mutant at a time. */
async function copyOf(ws: Workspace, dir: string, files: string[]): Promise<void> {
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  for (const f of files) await cp(path.join(ws.root, f), path.join(dir, f), { recursive: true }).catch(() => undefined);
  await symlink(path.join(ws.root, "node_modules"), path.join(dir, "node_modules"), "dir").catch(() => undefined);
}

const TEST_FILE = /\.test\.[cm]?[jt]sx?$/;
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\bvi\.mock\(\s*|^\s*import\s+)(["'])([^"']+)\1/gm;
const stem = (f: string) => f.replace(/\.[cm]?[jt]sx?$/, "").replace(/\/index$/, "");

/** The test files that import or vi.mock the module directly, resolved relative to the test file, or @/ as src/. */
async function directTests(ws: Workspace, files: string[], module: string): Promise<string[]> {
  const hits = await Promise.all(
    files.filter((f) => TEST_FILE.test(f)).map(async (t) => {
      const src = await readFile(path.join(ws.root, t), "utf8").catch(() => "");
      return [...src.matchAll(SPECIFIER)].some(([, , spec]) => {
        const target = spec.startsWith("@/") ? path.posix.join("src", spec.slice(2)) : spec.startsWith(".") ? path.posix.join(path.posix.dirname(t), spec) : null;
        return target !== null && stem(target) === stem(module);
      })
        ? t
        : null;
    }),
  );
  return hits.filter((t): t is string => t !== null);
}

/**
 * Tier 3: every mutant must fail the properties or a test file that imports its module directly, run in a
 * throwaway copy, four at a time. A mutant none of them catches survives.
 */
export async function runMutants(ws: Workspace, mutants: Mutant[], h: Harness, propertiesFile: string): Promise<{ ok: boolean; mutants: MutantRun[]; error?: string }> {
  if (mutants.length === 0) return { ok: true, mutants: [] };
  const listed = await gitIn(ws, ["ls-files", "--cached", "--others", "--exclude-standard"]);
  const files = listed.stdout.split("\n").filter((f) => f && existsSync(path.join(ws.root, f)));
  const root = path.join(ws.project.home, ".bob-verify", ws.agentId);
  const copies = Array.from({ length: Math.min(PARALLEL, mutants.length) }, (_, i) => path.join(root, `m${i}`));
  await Promise.all(copies.map((c) => copyOf(ws, c, files)));
  const sources = [...new Set(mutants.map((m) => m.file))];
  const testsOf = new Map(await Promise.all(sources.map(async (f) => [f, await directTests(ws, files, f)] as const)));
  const suite = (copy: string, of: string[]) =>
    `cd ${quote(copy)} && ${vitest(ws)} run ${[...new Set([propertiesFile, ...of.flatMap((f) => testsOf.get(f) ?? [])])].map(quote).join(" ")} --config ${quote(h.config)} --root . --bail=1`;
  const baseline = await runCommand(ws, suite(copies[0], sources), 180_000);
  if (!baseline.ok || baseline.exitCode !== 0) {
    const tail = baseline.ok ? baseline.output.trim().split("\n").slice(-10).join("\n") : baseline.error;
    return { ok: false, mutants: [], error: `the tests fail before any mutation: ${tail}` };
  }
  const results: MutantRun[] = new Array(mutants.length);
  let next = 0;
  await Promise.all(
    copies.map(async (copy) => {
      while (next < mutants.length) {
        const i = next++;
        const m = mutants[i];
        const target = path.join(copy, m.file);
        const original = await readFile(target, "utf8");
        await writeFile(target, m.source);
        const out = await runCommand(ws, suite(copy, [m.file]), 60_000);
        await writeFile(target, original);
        results[i] = { file: m.file, line: m.line, operator: m.operator, before: m.before, after: m.after, killed: !out.ok || out.exitCode !== 0 };
      }
    }),
  );
  await rm(root, { recursive: true, force: true });
  return { ok: results.every((r) => r.killed), mutants: results };
}

/** elan's home from ELAN_HOME or ~/.elan, never from where a lake on the PATH links to. */
export const elanHome = (): string => process.env.ELAN_HOME || path.join(os.homedir(), ".elan");

/** lake from BOB_LAKE, elan's home, or the PATH. */
export function findLake(): string | null {
  const candidates = [process.env.BOB_LAKE, path.join(elanHome(), "bin", "lake"), ...(process.env.PATH ?? "").split(path.delimiter).map((d) => path.join(d, "lake"))];
  return candidates.find((c): c is string => !!c && existsSync(c)) ?? null;
}

/** A theorem's declaration as the Lean file states it, up to its proof, on one line. */
export function theoremStatement(model: string, theorem: string): string {
  const name = theorem.split(".").pop() ?? theorem;
  const found = new RegExp(`(?:theorem|lemma)\\s+${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b([\\s\\S]*?):=`).exec(model);
  return found ? `theorem ${name}${found[1].replace(/\s+/g, " ").trimEnd()}` : `theorem ${name}`;
}

/** True when elan or the machine stopped lake before Lean read the model: an unwritable home, no toolchain, no network. */
export function leanCantRun(output: string): boolean {
  if (/Contract\.lean:\d+:\d+: error/.test(output)) return false;
  return /settings file|could not (write|create|download)|toolchain .*not installed|no default toolchain|permission denied|read-only file system|EACCES|EROFS|ENOSPC|command not found/i.test(output);
}

/** The Lean model built with lake, every theorem free of sorry and checked for its axioms, and its cases run against the TypeScript. */
export async function runProof(ws: Workspace, contract: Contract, tsOutputs: string[] | null, conformanceError: string | null): Promise<Proof> {
  const lean = contract.lean;
  if (!lean) return { status: "skipped", reason: "no Lean model in the contract" };
  const lake = findLake();
  if (!lake) return { status: "skipped", reason: "Lean not installed" };
  const started = Date.now();
  const model = await readFile(path.join(ws.root, lean.file), "utf8").catch(() => null);
  if (model === null) return { status: "not_proved", reason: `${lean.file} is missing` };
  const dir = path.join(ws.project.home, ".bob-verify", `${ws.agentId}-lean`);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const toolchain = await readFile(path.join(process.cwd(), "formal", "lean-toolchain"), "utf8").catch(() => null);
  if (toolchain) await writeFile(path.join(dir, "lean-toolchain"), toolchain);
  await writeFile(path.join(dir, "lakefile.lean"), "import Lake\nopen Lake DSL\npackage bobverify\n@[default_target] lean_lib Contract\n");
  const conf = lean.conformance;
  const checks = [
    ...lean.theorems.map((t) => `#print axioms ${t}`),
    ...(conf ? conf.inputs.map((i) => `#eval IO.println ("BOBCASE " ++ (${conf.lean} ${JSON.stringify(i)}).quote)`) : []),
  ];
  await writeFile(path.join(dir, "Contract.lean"), `${model}\n\n${checks.join("\n")}\n`);
  const out = await runCommand(ws, `cd ${quote(dir)} && ELAN_HOME=${quote(elanHome())} ${quote(lake)} build 2>&1`, 300_000);
  await rm(dir, { recursive: true, force: true });
  if (!out.ok) return { status: "skipped", reason: LEAN_SKIPPED_HERE };
  const text = out.output;
  if (out.timedOut) return { status: "not_proved", reason: "lake build ran out of time" };
  if (out.exitCode !== 0 && leanCantRun(text)) return { status: "skipped", reason: LEAN_SKIPPED_HERE };
  if (out.exitCode !== 0) return { status: "not_proved", reason: (/error:? .*$/m.exec(text)?.[0] ?? "lake build failed").slice(0, 200) };
  if (/declaration uses [`']sorry|sorryAx/.test(text)) return { status: "not_proved", reason: "a proof uses sorry" };
  const axioms = new Set<string>();
  for (const t of lean.theorems) {
    const name = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`'${name}' does not depend on any axioms`).test(text)) continue;
    const listed = new RegExp(`'${name}' depends on axioms: \\[([^\\]]*)\\]`).exec(text);
    if (!listed) return { status: "not_proved", reason: `no axiom report for ${t}` };
    for (const a of listed[1].split(",").map((x) => x.trim()).filter(Boolean)) {
      if (!STANDARD_AXIOMS.has(a)) return { status: "not_proved", reason: `${t} relies on the axiom ${a}` };
      axioms.add(a);
    }
  }
  if (conf) {
    if (conformanceError || !tsOutputs) return { status: "not_proved", reason: `the TypeScript side of the cases did not run: ${conformanceError ?? "no output"}` };
    const leanOutputs = [...text.matchAll(/BOBCASE (".*")\s*$/gm)].map((m) => {
      try {
        return String(JSON.parse(m[1]));
      } catch {
        return null;
      }
    });
    for (let i = 0; i < conf.inputs.length; i++) {
      if (leanOutputs[i] !== tsOutputs[i]) {
        return { status: "not_proved", reason: `the Lean model and the TypeScript disagree on ${JSON.stringify(conf.inputs[i])}: Lean ${JSON.stringify(leanOutputs[i])}, TypeScript ${JSON.stringify(tsOutputs[i])}` };
      }
    }
  }
  return { status: "proved", theorems: lean.theorems, axioms: [...axioms], cases: conf?.inputs.length ?? 0, seconds: Math.round((Date.now() - started) / 100) / 10, statements: lean.theorems.map((t) => theoremStatement(model, t)) };
}
