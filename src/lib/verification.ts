import { brainKind } from "./brain";
import { agentById, type State } from "./state";
import { getConfig } from "./store";
import type { PullRequestArtifact } from "./threads";
import type { AgentId } from "./types";

/**
 * What verify_change found for one tree of a thread's workspace. Four tiers: the contract file, seeded
 * fast-check properties, mutants of the changed lines, and a best-effort Lean proof. A pull request is
 * covered when its head's tree is the tree verified. The gate needs tiers 1 to 3; the proof is shown.
 */
export interface PropertyRun {
  /** The test that ran the property, as vitest names it. */
  name: string;
  runs: number;
  failed: boolean;
  counterexample: string | null;
  seed: number;
  /** fast-check's replay path for the counterexample. */
  path: string | null;
  message: string | null;
}

export interface MutantRun {
  file: string;
  line: number;
  operator: string;
  before: string;
  after: string;
  killed: boolean;
}

export type Proof =
  | { status: "proved"; theorems: string[]; axioms: string[]; cases: number; seconds: number }
  | { status: "not_proved"; reason: string }
  | { status: "skipped"; reason: string }
  | { status: "running" };

export interface Verification {
  id: string;
  agentId: AgentId;
  /** The git tree of the workspace when it ran: exactly what open_pull_request commits if nothing changes after. */
  tree: string;
  at: string;
  seconds: number;
  contract: { path: string; ok: boolean; acceptance: string | null; properties: number; error?: string };
  properties: { file: string | null; ok: boolean; seed: number; runs: PropertyRun[]; error?: string };
  mutation: { ok: boolean; mutants: MutantRun[]; error?: string };
  proof: Proof;
}

/**
 * A surviving mutant a reviewer judged equivalent: no input tells it apart from the original line. Matched
 * by file and both lines, so it carries over to a new head as long as the line is unchanged.
 */
export interface EquivalentMutant {
  pullRequestId: string;
  file: string;
  before: string;
  after: string;
  reason: string;
  by: AgentId;
  at: string;
}

export const isEquivalent = (waivers: readonly EquivalentMutant[], m: MutantRun): boolean =>
  !m.killed && waivers.some((w) => w.file === m.file && w.before === m.before && w.after === m.after);

/** Tiers 1 to 3: the contract reads, every property holds, and every mutant is killed or marked equivalent. */
export const gatePassed = (v: Verification, waivers: readonly EquivalentMutant[] = []): boolean =>
  v.contract.ok && v.properties.ok && !v.mutation.error && v.mutation.mutants.every((m) => m.killed || isEquivalent(waivers, m));

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** The skip reason when Lean is set up but cannot run here; the line shows it as is. */
export const LEAN_SKIPPED_HERE = "Lean proof skipped on this machine";

export function proofLine(p: Proof): string {
  if (p.status === "proved") return "proved in Lean";
  if (p.status === "running") return "Lean proof running";
  if (p.status === "skipped") return p.reason === LEAN_SKIPPED_HERE ? p.reason : `Lean skipped: ${p.reason}`;
  return `not proved in Lean: ${p.reason}`;
}

/** One compact line, as the trace block and the approval card show it. */
export function verificationLine(v: Verification, waivers: readonly EquivalentMutant[] = []): string {
  if (!v.contract.ok) return `no contract: ${v.contract.error ?? "unreadable"}`;
  const runs = v.properties.runs;
  const parts = [plural(runs.length, "property", "properties"), plural(runs.reduce((n, r) => n + r.runs, 0), "case", "cases")];
  const failed = runs.find((r) => r.failed);
  if (failed) parts.push(`counterexample to "${failed.name}": ${failed.counterexample ?? "see the run"}`);
  else if (!v.properties.ok) parts.push(`properties failed: ${v.properties.error ?? "see the run"}`);
  const equivalent = v.mutation.mutants.filter((m) => isEquivalent(waivers, m)).length;
  const total = v.mutation.mutants.length - equivalent;
  const killed = v.mutation.mutants.filter((m) => m.killed).length;
  if (v.mutation.error) parts.push(`mutants not run: ${v.mutation.error}`);
  else parts.push(v.mutation.mutants.length ? `${killed}/${total} mutants killed${equivalent ? ` · ${equivalent} equivalent` : ""}` : "no mutants on the changed lines");
  parts.push(proofLine(v.proof));
  return parts.join(" · ");
}

const SOURCE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

/** Code the gate verifies: source files, not tests, type declarations, configs or the verify/ folder. */
export const isVerifiedSource = (file: string): boolean => SOURCE.test(file) && !/\.(test|spec)\.|\.d\.ts$|(^|\/)verify\/|\.config\./.test(file);

/**
 * Source changes need a verification. The properties run on the project's installed dependencies, so the
 * gate is off when Bob does not install them (installDeps, off under tests) or with BOB_VERIFY=off.
 */
export const needsVerification = (pr: PullRequestArtifact): boolean =>
  getConfig().installDeps && process.env.BOB_VERIFY !== "off" && pr.pullRequest.files.some((f) => isVerifiedSource(f.path));

/**
 * The gate refuses approval and merge with the scripted brain. With a live model it is advisory: it still runs
 * and its line shows on the trace and the card, but it never refuses. BOB_VERIFY=block makes it block live too.
 */
export const gateBlocks = (): boolean => process.env.BOB_VERIFY === "block" || brainKind() === "script";

/** The newest verification of this pull request's head tree. */
export function verificationOf(s: State, pr: PullRequestArtifact): Verification | undefined {
  const tree = pr.pullRequest.tree;
  return tree ? (s.verifications ?? []).findLast((v) => v.tree === tree) : undefined;
}

/** What the pull request's verification shows: its line, or why there is none. */
export function verificationStatus(s: State, pr: PullRequestArtifact): string {
  if (!needsVerification(pr)) return "not needed, no source changes";
  const v = verificationOf(s, pr);
  const waivers = s.equivalentMutants ?? [];
  const line = v ? verificationLine(v, waivers) : "not run on this head";
  return gateBlocks() || (v && gatePassed(v, waivers)) ? line : `advisory, ${line}`;
}

/** Refuses an approval or a merge until tiers 1 to 3 pass on the pull request's head. */
export function verificationRefusal(s: State, pr: PullRequestArtifact): string | null {
  if (!needsVerification(pr) || !gateBlocks()) return null;
  const v = verificationOf(s, pr);
  const n = `#${pr.pullRequest.number}`;
  const owner = agentById(s, pr.agentId)?.code ?? "its build thread";
  if (!v) return `${n} has no verification of its head. Ask ${owner} to call verify_change until it passes and update the pull request, then ask the person.`;
  const waivers = s.equivalentMutants ?? [];
  if (!gatePassed(v, waivers)) {
    const survivors = v.properties.ok && !v.mutation.error ? " If no input can tell a surviving mutant from the original, its reviewer can mark it with mark_equivalent_mutant." : "";
    return `${n} fails verification: ${verificationLine(v, waivers)}. ${owner} has the findings; ask the person after verify_change passes on a new head.${survivors}`;
  }
  return null;
}
