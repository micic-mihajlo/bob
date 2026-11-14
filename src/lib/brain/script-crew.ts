import { acceptanceIn, acceptancePathIn, acceptanceTestPath } from "../acceptance";
import type { State } from "../state";
import { findPullRequest, isPullRequest, type PullRequestArtifact } from "../threads";
import type { CrewRole } from "../types";
import { changeFor } from "./script-changes";
import { call, resultOf, summarize, type Plan } from "./script-plan";
import type { CallRecord, TurnContext } from "./types";

const goalOf = (brief: string) => /^Goal:[ \t]*(.+)$/m.exec(brief)?.[1]?.replace(/\.$/, "") ?? summarize(brief);

const formatted = (status: string, result: string, evidence: string) => `Status: ${status}\nResult: ${result}\nEvidence: ${evidence}`;

const TEST_COMMAND = "npm test";
const runTests = () => call("run", { command: TEST_COMMAND });

/** What the last test run showed, for the Evidence line. */
function testsLine(done: CallRecord[]): string {
  const run = [...done].reverse().find((c) => c.name === "run");
  if (!run) return "tests not run";
  if ("error" in run.result) return `${TEST_COMMAND} could not run: ${String(run.result.error)}`;
  return run.result.passed ? `${TEST_COMMAND} passed` : `${TEST_COMMAND} failed (${String(run.result.note ?? "non-zero exit")})`;
}

/** What each verify_change run found, for the Evidence line. */
function verifyLine(done: CallRecord[]): string | null {
  const runs = done.filter((c) => c.name === "verify_change" && typeof c.result.line === "string").map((c) => c.result);
  if (runs.length === 0) return null;
  const [first, last] = [runs[0], runs[runs.length - 1]];
  const caught = Array.isArray(first.findings) ? String((first.findings[0] as { comment?: string } | undefined)?.comment ?? "") : "";
  if (runs.length === 1 || first === last) return `verify_change: ${String(first.line)}`;
  return `verify_change first: ${String(first.line)}${caught ? ` (${caught})` : ""}; after adding the property that kills it: ${String(last.line)}`;
}

/**
 * Acceptance test first: write it, show it red on its own, then implement and show the whole suite green.
 * A change to source code then writes its contract and properties and runs verify_change; the first draft
 * of the properties lets a mutant live, and the second kills it, before the pull request opens.
 */
function buildPlan(ctx: TurnContext, brief: string): Plan {
  const change = changeFor(brief);
  const goal = goalOf(brief);
  const acceptance = acceptancePathIn(brief) ?? acceptanceTestPath(ctx.agent.workOrderId ?? ctx.agent.id);
  const files = [{ path: acceptance, content: change.acceptance(goal) }, ...change.files(goal)];
  const verification = change.verification;
  const contract = `verify/${ctx.agent.workOrderId ?? "contract"}.json`;
  const criteria = acceptanceIn(brief) ?? goal;
  return {
    steps: [
      () => [call("read_files", { paths: ["src/index.ts"] })],
      () => [call("write_files", { files: files.slice(0, 1) })],
      () => [call("run", { command: `npx vitest run ${acceptance}` })],
      () => [call("write_files", { files: files.slice(1) })],
      () => [runTests()],
      ...(verification
        ? [
            () => [call("write_files", { files: verification.files(contract, criteria) })],
            () => [call("verify_change", {})],
            (done: CallRecord[]) => (resultOf(done, "verify_change")?.passed === false ? [call("write_files", { files: verification.fix(contract, criteria) })] : []),
            (done: CallRecord[]) => (done.filter((c) => c.name === "verify_change").length === 1 && resultOf(done, "verify_change")?.passed === false ? [call("verify_change", {})] : []),
          ]
        : []),
      () => [call("open_pull_request", { ...change.pullRequest, commitMessage: change.commit })],
      (done) => {
        const pr = resultOf(done, "open_pull_request");
        if (!pr) return [];
        const result = `Opened pull request #${pr.number} (id ${pr.pullRequestId}) on branch ${pr.branch}: ${change.pullRequest.title}.`;
        const red = done.find((c) => c.name === "run" && "passed" in c.result && c.result.passed === false);
        const first = red ? `${acceptance} failed on its own first; ` : "";
        const verified = verifyLine(done);
        return [call("report", { text: formatted("done", result, `${files.map((f) => f.path).join(", ")}; ${first}${testsLine(done)}; ${verified ? `${verified}; ` : ""}read the diff against main`) })];
      },
    ],
    reply: (done) => {
      const pr = resultOf(done, "open_pull_request");
      return pr ? `Opened #${pr.number} on ${pr.branch} and reported to the captain.` : formatted("blocked", "Could not open the pull request.", "none") + "\nUnblock: check the workspace and try again.";
    },
  };
}

function pullRequestIn(s: State, brief: string): PullRequestArtifact | undefined {
  const ref = /\bart_[a-z0-9]+\b/.exec(brief)?.[0] ?? /#(\d+)/.exec(brief)?.[0];
  const named = ref ? findPullRequest(s, ref) : undefined;
  return named ?? [...s.artifacts].reverse().find((a): a is PullRequestArtifact => isPullRequest(a) && !a.pullRequest.merged);
}

function reviewPlan(ctx: TurnContext, brief: string): Plan {
  const pr = pullRequestIn(ctx.initial, brief);
  if (!pr) return { steps: [], reply: () => `${formatted("blocked", "The brief names no pull request I can find.", "none")}\nUnblock: send the pull request number and branch.` };
  const acceptance = acceptancePathIn(brief);
  const missing = acceptance !== null && !pr.pullRequest.files.some((f) => f.path === acceptance);
  const low = changeFor(pr.title).finding;
  const finding = missing
    ? { path: acceptance, line: null, category: "tests" as const, severity: "medium" as const, confidence: 0.9, comment: `The acceptance test ${acceptance} is missing, so nothing shows the work order's check holds.` }
    : { ...low, path: acceptance && low.category === "tests" ? acceptance : low.path };
  const verdict = missing ? "request_changes" : "approve";
  const summary = missing ? "Read the diff. The acceptance test is missing." : "Read the diff and the acceptance test, which asserts the work order's check. Correct and safe to merge; one low finding.";
  const { branch, number } = pr.pullRequest;
  return {
    steps: [
      () => [call("git", { args: ["fetch", "origin"] })],
      () => [call("git", { args: ["diff", `origin/main...origin/${branch}`] })],
      () => [call("record_review", { pullRequestId: pr.id, verdict, findings: [finding], summary })],
    ],
    reply: (done) =>
      resultOf(done, "record_review")
        ? formatted("done", missing ? `Requested changes on #${number}: ${finding.comment}` : `Approved #${number} with one low finding: ${finding.comment}`, `review ${String(resultOf(done, "record_review")?.reviewId)}, git diff origin/main...origin/${branch}`)
        : `${formatted("blocked", `Could not record the review of #${number}.`, "none")}\nUnblock: check the pull request id.`,
  };
}

function researchPlan(_ctx: TurnContext, brief: string): Plan {
  const question = summarize(brief);
  return {
    steps: [
      () => [call("list_files", {})],
      (done) => {
        const files = (resultOf(done, "list_files")?.files as string[] | undefined) ?? [];
        return [call("record_artifact", { title: `Findings: ${question}`, detail: `The project holds ${files.length} files: ${files.join(", ")}. The code starts in src/index.ts, with its tests next to it.` })];
      },
    ],
    reply: (done) => formatted("done", `Wrote up what the code says about: ${question}.`, `note ${String(resultOf(done, "record_artifact")?.artifactId ?? "none")}`),
  };
}

const PLANS: Record<CrewRole, (ctx: TurnContext, brief: string) => Plan> = { build: buildPlan, review: reviewPlan, research: researchPlan };

export function crewPlan(ctx: TurnContext, role: CrewRole): Plan {
  const person = ctx.inbound.find((i) => i.rule === "person");
  if (person && !ctx.inbound.some((i) => i.rule === "request")) return { steps: [], reply: () => `I am ${ctx.agent.code}, working on "${ctx.agent.title}". I report to the captain when it is done.` };
  const brief = ctx.inbound.find((i) => i.rule === "request");
  // A reviewer asked again reviews again: the pull request has a new head, and approval needs a review of it.
  if (brief && role === "build" && ctx.initial.artifacts.some((a) => a.agentId === ctx.agent.id)) {
    return { steps: [() => [runTests()]], reply: (done) => formatted("partial", "Read the new message and ran the tests again. My pull request stands as it is.", testsLine(done)) };
  }
  if (brief && role !== "review" && ctx.initial.artifacts.some((a) => a.agentId === ctx.agent.id)) {
    return { steps: [], reply: () => formatted("partial", "Read the new message. My earlier result stands; nothing changed.", "none") };
  }
  if (brief) return PLANS[role](ctx, brief.text);
  return { steps: [], reply: () => "Noted." };
}
