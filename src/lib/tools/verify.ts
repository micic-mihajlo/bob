import { existsSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { newId, nowIso } from "../ids";
import { agentById } from "../state";
import { getConfig, getState, transact, update } from "../store";
import { findPullRequest } from "../threads";
import { ensureWorkspaceDeps } from "../workspace";
import { threadWorkspace } from "../thread-workspace";
import { gatePassed, isEquivalent, verificationLine, verificationOf, type EquivalentMutant, type Proof, type Verification } from "../verification";
import { contractPathOf, mutantsFor, readContract, runMutants, runProof, runProperties, workingTree, writeHarness } from "../verify/run";
import { done, fail, type ToolContext } from "./context";
import { define } from "./define";

const KEEP = 100;

const record = (v: Verification) => update((s) => ({ ...s, verifications: [...(s.verifications ?? []), v].slice(-KEEP) }));

const setProof = (id: string, proof: Proof) =>
  update((s) => (s.verifications?.some((v) => v.id === id) ? { ...s, verifications: s.verifications.map((v) => (v.id === id ? { ...v, proof } : v)) } : s));

function findingsOf(v: Verification, waivers: readonly EquivalentMutant[]) {
  const properties = v.properties.runs
    .filter((r) => r.failed)
    .map((r) => ({
      path: v.properties.file ?? v.contract.path,
      line: null,
      category: "bug" as const,
      severity: "high" as const,
      confidence: 1,
      comment: `Property "${r.name}" fails for ${r.counterexample ?? "a generated input"} (seed ${r.seed}${r.path ? `, path ${r.path}` : ""}). Fix the code, or the property if it is wrong.`,
    }));
  const survivors = v.mutation.mutants
    .filter((m) => !m.killed && !isEquivalent(waivers, m))
    .map((m) => ({
      path: m.file,
      line: m.line,
      category: "tests" as const,
      severity: "medium" as const,
      confidence: 1,
      comment: `A mutant survived (${m.operator}): \`${m.after}\` passes every test and property, so nothing checks what \`${m.before}\` does. Add a property that tells them apart.`,
    }));
  return [...properties, ...survivors];
}

/** Tiers 1 to 3 now; the Lean proof runs after, and its result lands on the same record when it finishes. */
async function verifyChange(ctx: ToolContext) {
  const started = Date.now();
  const s = getState();
  const agent = agentById(s, ctx.agentId);
  const ws = await threadWorkspace(s.project, ctx.agentId);
  if (getConfig().installDeps) await ensureWorkspaceDeps(ws);
  if (!existsSync(path.join(ws.root, "node_modules", ".bin", "vitest"))) return fail("vitest is not installed in this workspace, so nothing can run the properties. Add vitest and fast-check to the project's devDependencies.");
  const tree = await workingTree(ws);
  if (!tree) return fail("Could not read the workspace's tree with git. Check git status and try again.");
  const base = { id: newId("ver"), agentId: ctx.agentId, tree, at: nowIso() };
  const contractPath = await contractPathOf(ws, agent?.workOrderId ?? null);
  const read = await readContract(ws, contractPath);
  if (!read.ok) {
    const v: Verification = {
      ...base,
      seconds: Math.round((Date.now() - started) / 100) / 10,
      contract: { path: contractPath, ok: false, acceptance: null, properties: 0, error: read.error },
      properties: { file: null, ok: false, seed: 0, runs: [] },
      mutation: { ok: false, mutants: [], error: "no contract" },
      proof: { status: "skipped", reason: "no contract" },
    };
    record(v);
    return fail(
      `Tier 1 failed: ${read.error}. Write ${contractPath} as JSON: {"acceptance": the work order's acceptance check, "propertiesFile": a vitest file such as src/<module>.properties.test.ts, "properties": [{"name": the test's exact name, "criterion": the part of the acceptance it checks}], "lean": optional {"file", "theorems", "conformance": {"lean", "module", "export", "inputs"}}}. Each property is one it() that calls fc.assert(fc.property(...)) from fast-check, with no seed or numRuns of its own. Then call verify_change again.`,
    );
  }
  const contract = read.contract;
  const harness = await writeHarness(ws, contract, parseInt(tree.slice(0, 8), 16) % 2_147_483_647);
  const props = await runProperties(ws, contract, harness);
  const mutation = props.result.ok ? await runMutants(ws, await mutantsFor(ws), harness) : { ok: false, mutants: [], error: "a property fails first" };
  const waivers = getState().equivalentMutants ?? [];
  const passed = props.result.ok && !mutation.error && mutation.mutants.every((m) => m.killed || isEquivalent(waivers, m));
  const v: Verification = {
    ...base,
    seconds: Math.round((Date.now() - started) / 100) / 10,
    contract: { path: contractPath, ok: true, acceptance: contract.acceptance, properties: contract.properties.length },
    properties: props.result,
    mutation,
    proof: passed ? (contract.lean ? { status: "running" } : { status: "skipped", reason: "no Lean model in the contract" }) : { status: "skipped", reason: "tiers 1 to 3 fail" },
  };
  record(v);
  if (passed && contract.lean) {
    void runProof(ws, contract, props.tsOutputs, props.conformanceError)
      .catch((e: unknown): Proof => ({ status: "not_proved", reason: `the Lean run failed: ${String(e).slice(0, 160)}` }))
      .then((proof) => setProof(v.id, proof));
  }
  const findings = findingsOf(v, waivers);
  const line = verificationLine(v, waivers);
  const survivorsOnly = props.result.ok && !mutation.error;
  const reviewer = agent?.crewRole === "review";
  const next = passed
    ? reviewer
      ? "The gate passes on this tree. Go on with your review."
      : "The gate passes on this tree. Open or update your pull request with open_pull_request now, without changing anything first."
    : reviewer
      ? `The gate fails.${survivorsOnly ? " If no input at all can tell a surviving mutant from the original line, call mark_equivalent_mutant with a one-line reason for it." : ""} For everything else, call record_review with verdict request_changes and these findings; they go to the build thread.`
      : `The gate fails. Fix the code, or add the property that kills each surviving mutant, then call verify_change again.${survivorsOnly ? " If you are sure no input tells a survivor apart from the original, say so in your report: only the reviewer can mark a mutant equivalent." : ""}`;
  return done({ verificationId: v.id, tree: tree.slice(0, 7), passed, line, seconds: v.seconds, ...(findings.length ? { findings } : {}), next });
}

export const markEquivalentSchema = z.object({
  pullRequestId: z.string().min(1).describe('The pull request\'s id, or its number as "#3".'),
  file: z.string().min(1).describe("The surviving mutant's file, as the finding names it."),
  line: z.number().int().min(1).describe("The surviving mutant's line."),
  mutant: z.string().optional().describe("The mutated line as the finding quotes it, when several mutants survive on that line."),
  reason: z
    .string()
    .min(10)
    .max(200)
    .refine((r) => !r.includes("\n"), "one line")
    .describe("One line on why no input can tell the mutant from the original, such as \"both sort orders agree because the keys are unique\"."),
});

/** A reviewer's waiver for one surviving mutant of the pull request's verified head. */
export function markEquivalent(input: z.infer<typeof markEquivalentSchema>, ctx: ToolContext) {
  return transact((s) => {
    const pr = findPullRequest(s, input.pullRequestId);
    if (!pr) return { state: s, value: fail(`No pull request ${input.pullRequestId}. Use its id or number.`) };
    const v = verificationOf(s, pr);
    if (!v) return { state: s, value: fail(`#${pr.pullRequest.number} has no verification of its head. Call verify_change first.`) };
    const waivers = s.equivalentMutants ?? [];
    const survivors = v.mutation.mutants.filter((m) => !m.killed && !isEquivalent(waivers, m));
    const wanted = input.mutant?.trim();
    const matches = survivors.filter((m) => m.file === input.file && m.line === input.line && (!wanted || m.after === wanted || m.after.includes(wanted)));
    const listed = survivors.map((m) => `${m.file}:${m.line} \`${m.after}\``).join("; ") || "none";
    if (matches.length === 0) return { state: s, value: fail(`No surviving mutant of #${pr.pullRequest.number} at ${input.file}:${input.line}. Survivors: ${listed}.`) };
    if (matches.length > 1) return { state: s, value: fail(`${matches.length} mutants survive at ${input.file}:${input.line}; pass mutant with the mutated line you mean: ${matches.map((m) => `\`${m.after}\``).join(", ")}.`) };
    const m = matches[0];
    const waiver: EquivalentMutant = { pullRequestId: pr.id, file: m.file, before: m.before, after: m.after, reason: input.reason.trim(), by: ctx.agentId, at: nowIso() };
    const all = [...waivers, waiver];
    const passed = gatePassed(v, all);
    const next = passed ? "Recorded. The gate now passes on this head; go on with your review." : "Recorded. Other findings still fail the gate; request changes for them.";
    return { state: { ...s, equivalentMutants: all }, value: done({ marked: `${m.file}:${m.line}`, line: verificationLine(v, all), passed, next }) };
  });
}

export const VERIFY_TOOLS = [
  define({
    name: "verify_change",
    description: `Check your change against its contract before you open or update a pull request. Reads verify/<your work order id>.json, shaped exactly {"acceptance": "<the work order's acceptance check>", "propertiesFile": "src/<module>.properties.test.ts", "properties": [{"name": "<the it() name>", "criterion": "<the part of the acceptance it checks>"}]}; the properties file is a vitest file where each property is one it() calling fc.assert(fc.property(...)) from fast-check, with no seed or numRuns. Then: tier 1 checks the contract names the acceptance check and its properties; tier 2 runs every fast-check property in the properties file 300 times with a seed Bob picks, and a failure comes back as a counterexample; tier 3 mutates the changed lines (flipped comparisons, off-by-one numbers, dropped calls) and runs the tests and properties against each mutant, and a mutant that survives is a finding; tier 4, when the contract names a Lean model, builds it with lake, checks every theorem for sorry and its axioms, and compares its cases with the TypeScript, after this call returns. The person can approve a merge only when tiers 1 to 3 pass on the pull request's exact head.`,
    schema: z.object({}),
    sets: ["build", "review"],
    label: () => "Verifying the change",
    doneLabel: (_i, r) => (typeof r.line === "string" ? `${r.passed ? "Verified" : "Verification failed"}: ${r.line}` : undefined),
    execute: (_i, ctx) => verifyChange(ctx),
  }),
  define({
    name: "mark_equivalent_mutant",
    description:
      "Mark one surviving mutant of a pull request's verification as equivalent: the mutated line behaves exactly like the original for every input, so no test or property can kill it. Give a one-line reason. Only for true equivalence; a mutant a property could tell apart is a finding for the build thread. The approval card counts it as equivalent, not killed.",
    schema: markEquivalentSchema,
    sets: ["review"],
    label: (i) => `Marking a mutant at ${i.file}:${i.line} equivalent`,
    doneLabel: (_i, r) => (typeof r.line === "string" ? `Marked equivalent: ${r.line}` : undefined),
    execute: markEquivalent,
  }),
];
