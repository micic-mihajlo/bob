import path from "node:path";
import { goalOf } from "./roadmap";
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
  const order = [...s.roadmap.today, ...(s.roadmap.backlog ?? [])].find((w) => w.id === workOrderId);
  const check = acceptanceIn(brief) ?? goalOf(s.roadmap, order?.requestId)?.acceptance ?? null;
  if (!workOrderId || !check) return brief;
  const path = acceptanceTestPath(workOrderId);
  if (acceptancePathIn(brief) === path) return brief;
  const line =
    agent.crewRole === "build"
      ? `Acceptance test: ${path}. Write it first, on its own, so it asserts: ${check}. Run that file alone, without a pipe (npx vitest run ${path}), and show it failing, then implement, then run the whole suite (npm test) and show it passing. Once it has run red it is locked: fix the code, not the test.`
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

/** The label of a step that writes a build thread's acceptance test, on either engine. */
export const ACCEPTANCE_WRITE_LABEL = "Writing the acceptance test";
const WRITE_TOOLS = new Set(["write_files", "edit_files"]);

const stepsOf = (s: State, agentId: AgentId): Step[] => (s.threads[agentId] ?? []).filter((i): i is Step => i.kind === "step");

/** The index of the first failing test run after the thread wrote its acceptance test, or -1 while it has not run red. */
function redAt(steps: Step[]): number {
  const wrote = steps.findIndex((i) => i.tool === "write_files" && i.label === ACCEPTANCE_WRITE_LABEL);
  if (wrote < 0) return -1;
  return steps.findIndex((i, n) => n > wrote && i.outcome === "failed" && runOf(i) !== null);
}

function ownAcceptance(s: State, agentId: AgentId): string | null {
  const agent = s.agents.find((a) => a.id === agentId);
  if (agent?.kind !== "crew" || agent.crewRole !== "build" || !agent.workOrderId) return null;
  return acceptanceTestPath(agent.workOrderId);
}

/**
 * Why a build thread may not write `file` now, or null when it may. Its own acceptance test locks once it has
 * run red, so a failing check is fixed in the code; another work order's acceptance test is never its to change.
 */
export function acceptanceLock(s: State, agentId: AgentId, file: string): string | null {
  const own = ownAcceptance(s, agentId);
  const rel = path.normalize(file);
  if (!own || !isAcceptanceTest(rel)) return null;
  if (rel !== own) return `${rel} is another work order's acceptance test, so it is not yours to change. Leave it as it is.`;
  if (redAt(stepsOf(s, agentId)) < 0) return null;
  return `${rel} is locked: it is your acceptance test and it has already run red, so it is the check, not the code. Fix the code until it passes. If you think the test itself is wrong, stop and report blocked, saying why.`;
}

/** The build thread's acceptance test once it is locked, or null. */
export function lockedAcceptance(s: State, agentId: AgentId): string | null {
  const own = ownAcceptance(s, agentId);
  return own && redAt(stepsOf(s, agentId)) >= 0 ? own : null;
}

/** Acceptance files the diff changes that were already there before it, so not this pull request's own new test. */
function changedExistingAcceptance(patch: string): string[] {
  return patch.split(/^diff --git /m).slice(1).flatMap((block) => {
    const names = /^a\/(\S+) b\/(\S+)/.exec(block);
    if (!names || !(isAcceptanceTest(names[1]) || isAcceptanceTest(names[2]))) return [];
    return /^new file mode/m.test(block) ? [] : [names[2]];
  });
}

/**
 * Blocking review findings for a pull request that changes an acceptance test: one already on main, or its own
 * after that test ran red. Either way the test that passes is not the check the work order agreed to.
 */
export function acceptanceTampering(s: State, pr: { agentId: AgentId; pullRequest: { patch: string } }): { path: string; comment: string }[] {
  const found = changedExistingAcceptance(pr.pullRequest.patch).map((file) => ({
    path: file,
    comment: `This pull request changes ${file}, an acceptance test that is already on main. Restore it: an acceptance test only changes with its own work order.`,
  }));
  const own = ownAcceptance(s, pr.agentId);
  const steps = stepsOf(s, pr.agentId);
  const red = redAt(steps);
  const edited = red >= 0 && steps.slice(red + 1).some((i) => WRITE_TOOLS.has(i.tool) && i.outcome === "ok" && (i.label === ACCEPTANCE_WRITE_LABEL || (!!own && i.label.includes(own))));
  if (own && edited) found.push({ path: own, comment: `${own} was edited after it ran red, so the test that passes is not the one that failed. Restore the version that ran red and fix the code instead.` });
  return found;
}
