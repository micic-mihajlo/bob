import { existsSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { newId, nowIso } from "../ids";
import { agentById } from "../state";
import { getConfig, getState, update } from "../store";
import { ensureWorkspaceDeps } from "../workspace";
import { threadWorkspace } from "../thread-workspace";
import { gatePassed, verificationLine, type Proof, type Verification } from "../verification";
import { contractPathOf, mutantsFor, readContract, runMutants, runProof, runProperties, workingTree, writeHarness } from "../verify/run";
import { done, fail, type ToolContext } from "./context";
import { define } from "./define";

const KEEP = 100;

const record = (v: Verification) => update((s) => ({ ...s, verifications: [...(s.verifications ?? []), v].slice(-KEEP) }));

const setProof = (id: string, proof: Proof) =>
  update((s) => (s.verifications?.some((v) => v.id === id) ? { ...s, verifications: s.verifications.map((v) => (v.id === id ? { ...v, proof } : v)) } : s));

function findingsOf(v: Verification) {
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
    .filter((m) => !m.killed)
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
  const passed = props.result.ok && mutation.ok;
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
  const findings = findingsOf(v);
  const line = verificationLine(v);
  const reviewer = agent?.crewRole === "review";
  const next = gatePassed(v)
    ? reviewer
      ? "The gate passes on this tree. Go on with your review."
      : "The gate passes on this tree. Open or update your pull request with open_pull_request now, without changing anything first."
    : reviewer
      ? "The gate fails. Call record_review with verdict request_changes and these findings; they go to the build thread."
      : "The gate fails. Fix the code, or add the property that kills each surviving mutant, then call verify_change again.";
  return done({ verificationId: v.id, tree: tree.slice(0, 7), passed: gatePassed(v), line, seconds: v.seconds, ...(findings.length ? { findings } : {}), next });
}

export const VERIFY_TOOLS = [
  define({
    name: "verify_change",
    description: `Check your change against its contract before you open or update a pull request. Reads verify/<your work order id>.json, then: tier 1 checks the contract names the acceptance check and its properties; tier 2 runs every fast-check property in the properties file 300 times with a seed Bob picks, and a failure comes back as a counterexample; tier 3 mutates the changed lines (flipped comparisons, off-by-one numbers, dropped calls) and runs the tests and properties against each mutant, and a mutant that survives is a finding; tier 4, when the contract names a Lean model, builds it with lake, checks every theorem for sorry and its axioms, and compares its cases with the TypeScript, after this call returns. The person can approve a merge only when tiers 1 to 3 pass on the pull request's exact head.`,
    schema: z.object({}),
    sets: ["build", "review"],
    label: () => "Verifying the change",
    doneLabel: (_i, r) => (typeof r.line === "string" ? `${r.passed ? "Verified" : "Verification failed"}: ${r.line}` : undefined),
    execute: (_i, ctx) => verifyChange(ctx),
  }),
];
