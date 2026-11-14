#!/usr/bin/env node
/**
 * pnpm verify: checks the Lean proofs in formal/ and the conformance tests that tie them to the code.
 * Without Lean it skips the proofs with a note and still runs the conformance tests.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const formal = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(formal);
const catalog = JSON.parse(readFileSync(path.join(formal, "theorems.json"), "utf8"));
const INSTALL = "curl -sSfL https://raw.githubusercontent.com/leanprover/elan/master/elan-init.sh | sh -s -- -y --default-toolchain none";

const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { cwd: formal, encoding: "utf8", ...opts });
const fail = (message) => {
  console.error(`verify: ${message}`);
  process.exit(1);
};

function findLake() {
  const candidates = [process.env.LAKE, "lake", path.join(os.homedir(), ".elan", "bin", "lake")].filter(Boolean);
  return candidates.find((c) => run(c, ["--version"]).status === 0) ?? null;
}

/** Hash of every Lean source and the catalog, so a stale check is detectable. */
export function sourceHash() {
  const dir = path.join(formal, "BobFormal");
  const files = ["BobFormal.lean", "lakefile.toml", "lean-toolchain", "theorems.json", ...readdirSync(dir).sort().map((f) => path.join("BobFormal", f))];
  const hash = createHash("sha256");
  for (const f of files) hash.update(f).update(readFileSync(path.join(formal, f)));
  return hash.digest("hex");
}

function checkProofs(lake) {
  const dir = path.join(formal, "BobFormal");
  for (const f of readdirSync(dir)) {
    const text = readFileSync(path.join(dir, f), "utf8");
    if (/\b(sorry|admit)\b/.test(text)) fail(`${f} contains sorry or admit.`);
  }
  console.log("verify: lake build");
  if (run(lake, ["build"], { stdio: "inherit" }).status !== 0) fail("lake build failed.");

  const auditDir = path.join(formal, ".lake", "audit");
  mkdirSync(auditDir, { recursive: true });
  const audit = path.join(auditDir, "Audit.lean");
  writeFileSync(audit, ["import BobFormal", ...catalog.theorems.map((t) => `#print axioms ${t.name}`)].join("\n") + "\n");
  const out = run(lake, ["env", "lean", audit]);
  if (out.status !== 0) fail(`axiom audit failed:\n${out.stdout}${out.stderr}`);
  const theorems = catalog.theorems.map((t) => {
    const line = out.stdout.split("\n").find((l) => l.startsWith(`'${t.name}'`)) ?? "";
    const axioms = line.includes("does not depend on any axioms") ? [] : (/\[(.*)\]/.exec(line)?.[1] ?? "").split(",").map((a) => a.trim()).filter(Boolean);
    if (!line) fail(`no axiom report for ${t.name}`);
    if (axioms.includes("sorryAx")) fail(`${t.name} depends on sorry.`);
    return { name: t.name, axioms };
  });
  const lean = run(lake, ["env", "lean", "--version"]).stdout.trim();
  console.log(`verify: ${theorems.length} theorems checked, none uses sorry (${lean}).`);
  return { ok: true, lean, sourceHash: sourceHash(), theorems };
}

const lake = findLake();
const record = lake ? checkProofs(lake) : null;
if (!record) console.log(`verify: skipping the Lean proofs because lake is not installed. Install Lean with:\n  ${INSTALL}\nthen run pnpm verify again.`);

console.log("verify: conformance tests");
const tests = spawnSync("pnpm", ["exec", "vitest", "run", "formal"], { cwd: repo, stdio: "inherit" });
if (tests.status !== 0) fail("conformance tests failed.");
if (record) writeFileSync(path.join(formal, "last-check.json"), JSON.stringify({ ...record, conformance: "passed" }, null, 2) + "\n");
