import type { State } from "./state";
import { findPullRequest } from "./threads";
import type { Agent, AgentId, ThreadItem } from "./types";

/** The test a build thread writes first, named after its work order, that encodes the work order's acceptance check. */
export const acceptanceTestPath = (workOrderId: string) => `src/acceptance/${workOrderId}.test.ts`;

export const isAcceptanceTest = (path: string) => /(^|\/)acceptance\/[^/]+\.test\.[cm]?[jt]sx?$/.test(path);

/** The "Acceptance: ..." line a brief carries, if any. */
export const acceptanceIn = (text: string): string | null => /^.*?Acceptance:[ \t]*(.+?)\.?$/m.exec(text)?.[1] ?? null;

function workOrderOf(s: State, agent: Agent, brief: string): string | null {
  if (agent.workOrderId) return agent.workOrderId;
  const ref = /\bart_[a-z0-9]+\b/.exec(brief)?.[0] ?? /#(\d+)/.exec(brief)?.[0];
  const pr = ref ? findPullRequest(s, ref) : undefined;
  return s.agents.find((a) => a.id === pr?.agentId)?.workOrderId ?? null;
}

/**
 * A build or review brief ends with the work order's acceptance test: the build writes it first and shows it
 * red then green, the review confirms it encodes the check.
 */
export function briefWithAcceptance(s: State, agent: Agent, brief: string): string {
  if (agent.kind !== "crew" || (agent.crewRole !== "build" && agent.crewRole !== "review")) return brief;
  const workOrderId = workOrderOf(s, agent, brief);
  const check = acceptanceIn(brief) ?? s.roadmap.goal?.acceptance ?? null;
  if (!workOrderId || !check) return brief;
  const path = acceptanceTestPath(workOrderId);
  if (acceptancePathIn(brief) === path) return brief;
  const line =
    agent.crewRole === "build"
      ? `Acceptance test: ${path}. Write it first, on its own, so it asserts: ${check}. Run that file alone, without a pipe (npx vitest run ${path}), and show it failing, then implement, then run the whole suite (npm test) and show it passing.`
      : `Acceptance test: ${path} should assert: ${check}. Confirm it does. If it is missing or checks something else, record a finding with category tests.`;
  return `${brief.trim()}\n${line}`;
}

/** The acceptance test path a brief names. */
export const acceptancePathIn = (brief: string): string | null => /^Acceptance test: (\S+?)\.?(?:\s|$)/m.exec(brief)?.[1] ?? null;

/** Failed tests in a test runner's output: vitest, jest and node:test summaries. */
export function failedTests(output: string): number | null {
  const n = /Tests:?\s+(\d+) failed/.exec(output) ?? /Test Files\s+(\d+) failed/.exec(output) ?? /^# fail (\d+)/m.exec(output);
  return n ? Number(n[1]) : null;
}

export const isTestCommand = (command: string) => /\b(test|vitest|jest|mocha|pytest)\b/.test(command);

/** What a finished test run's step reads: "Tests passed", or "Tests failed (1)". */
export function testRunLabel(passed: boolean, output: string): string {
  if (passed) return "Tests passed";
  const n = failedTests(output);
  return n ? `Tests failed (${n})` : "Tests failed";
}

export interface AcceptanceRun {
  command: string;
  failed: number | null;
  at: string;
}

export interface AcceptanceRecord {
  path: string;
  /** The first failing test run in the thread before the run that passed. */
  red: AcceptanceRun | null;
  /** The last passing test run in the thread. */
  green: AcceptanceRun | null;
}

type Step = Extract<ThreadItem, { kind: "step" }>;

function runOf(step: Step): AcceptanceRun | null {
  if (step.tool !== "run" || !step.outcome) return null;
  const command = /^\$ (.+?)(?: {3}\(.*\))?$/m.exec(step.detail ?? "")?.[1] ?? "";
  if (!isTestCommand(command)) return null;
  return { command, failed: step.outcome === "failed" ? failedTests(step.detail ?? "") : 0, at: step.at };
}

/** The red and green runs of a build thread's acceptance test, read from its steps. */
export function acceptanceOf(s: State, agentId: AgentId): AcceptanceRecord | null {
  const workOrderId = s.agents.find((a) => a.id === agentId)?.workOrderId;
  if (!workOrderId) return null;
  const runs = (s.threads[agentId] ?? []).flatMap((i) => (i.kind === "step" ? [{ ok: i.outcome === "ok", run: runOf(i) }] : [])).filter((x) => x.run !== null);
  const greenAt = runs.findLastIndex((x) => x.ok);
  const redAt = runs.findIndex((x, i) => !x.ok && (greenAt < 0 || i < greenAt));
  return { path: acceptanceTestPath(workOrderId), red: runs[redAt]?.run ?? null, green: runs[greenAt]?.run ?? null };
}

/** The trace block's line: the acceptance test file and its red and green runs. */
export function acceptanceLine(record: AcceptanceRecord | null, files: readonly string[]): string | null {
  if (!record) return null;
  if (!files.includes(record.path)) return `- Acceptance test: \`${record.path}\` is not in this pull request`;
  const red = record.red ? `red (\`${record.red.command}\`, ${record.red.failed ?? "some"} failed)` : "never seen failing";
  const green = record.green ? `green (\`${record.green.command}\`)` : "not seen passing";
  return `- Acceptance test: \`${record.path}\`: ${red} → ${green}`;
}
