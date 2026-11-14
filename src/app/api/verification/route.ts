import { readFile } from "node:fs/promises";
import path from "node:path";
import { connection } from "next/server";
import { json } from "@/lib/http";
import { sourceHash } from "../../../../formal/source-hash.mjs";

type CheckStatus = "passed" | "stale" | "unchecked";

interface CatalogEntry {
  name: string;
  rule: string;
  /** proof: a rule Bob keeps. gap: a proved counterexample, a rule Bob does not keep yet. */
  kind: "proof" | "gap";
  statement: string;
  mirrors: string;
}

interface LastCheck {
  ok: boolean;
  lean: string;
  sourceHash: string;
  conformance?: string;
  theorems: { name: string; axioms: string[] }[];
}

export interface VerificationReport {
  /** passed: the recorded check matches the current Lean sources. stale: they changed since. unchecked: never run. */
  status: CheckStatus;
  lean: string | null;
  conformance: string | null;
  command: string;
  theorems: (CatalogEntry & { status: CheckStatus; axioms: string[] | null })[];
}

/** The theorems in formal/, in plain English, with the outcome of the last pnpm verify. */
export async function GET(): Promise<Response> {
  await connection();
  const dir = path.join(process.cwd(), "formal");
  const catalog: { theorems: CatalogEntry[] } = JSON.parse(await readFile(path.join(dir, "theorems.json"), "utf8"));
  const check: LastCheck | null = await readFile(path.join(dir, "last-check.json"), "utf8").then(JSON.parse, () => null);
  const status: CheckStatus = !check?.ok ? "unchecked" : check.sourceHash === sourceHash(dir) ? "passed" : "stale";
  const report: VerificationReport = {
    status,
    lean: check?.lean ?? null,
    conformance: check?.conformance ?? null,
    command: "pnpm verify",
    theorems: catalog.theorems.map((t) => {
      const checked = check?.theorems.find((x) => x.name === t.name);
      return { ...t, status: checked ? status : "unchecked", axioms: checked?.axioms ?? null };
    }),
  };
  return json(report);
}
