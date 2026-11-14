import type { State } from "../state";
import { findPullRequest, isPullRequest, type PullRequestArtifact } from "../threads";
import type { CrewRole } from "../types";
import { changeFor } from "./script-changes";
import { call, resultOf, summarize, type Plan } from "./script-plan";
import type { TurnContext } from "./types";

const goalOf = (brief: string) => /^Goal:[ \t]*(.+)$/m.exec(brief)?.[1]?.replace(/\.$/, "") ?? summarize(brief);

const formatted = (status: string, result: string, evidence: string) => `Status: ${status}\nResult: ${result}\nEvidence: ${evidence}`;

function buildPlan(ctx: TurnContext, brief: string): Plan {
  const change = changeFor(brief);
  const goal = goalOf(brief);
  const files = change.files(goal);
  return {
    steps: [
      () => [call("list_files", {}), call("read_file", { path: "src/invoices.ts" })],
      () => files.map((f) => call("write_file", f)),
      () => [call("git", { args: ["add", "--all"] }), call("git", { args: ["commit", "-m", change.commit] })],
      () => [call("git", { args: ["diff", "main", "--stat"] })],
      () => [call("open_pull_request", change.pullRequest)],
      (done) => {
        const pr = resultOf(done, "open_pull_request");
        if (!pr) return [];
        const result = `Opened pull request #${pr.number} (id ${pr.pullRequestId}) on branch ${pr.branch}: ${change.pullRequest.title}.`;
        return [call("report", { text: formatted("done", result, `${files.map((f) => f.path).join(", ")}; read the diff against main`) })];
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
  const finding = changeFor(pr.title).finding;
  const { branch, number } = pr.pullRequest;
  return {
    steps: [
      () => [call("git", { args: ["fetch", "origin"] })],
      () => [call("git", { args: ["diff", `origin/main...origin/${branch}`] })],
      () => [call("record_review", { pullRequestId: pr.id, verdict: "approve", findings: [finding], summary: "Read the diff and the tests. Correct and safe to merge; one low finding." })],
    ],
    reply: (done) =>
      resultOf(done, "record_review")
        ? formatted("done", `Approved #${number} with one low finding: ${finding.comment}`, `review ${String(resultOf(done, "record_review")?.reviewId)}, git diff origin/main...origin/${branch}`)
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
        return [call("record_artifact", { title: `Findings: ${question}`, detail: `The project holds ${files.length} files: ${files.join(", ")}. The invoice logic lives in src/invoices.ts and formatting in src/format.ts.` })];
      },
    ],
    reply: (done) => formatted("done", `Wrote up what the code says about: ${question}.`, `note ${String(resultOf(done, "record_artifact")?.artifactId ?? "none")}`),
  };
}

const PLANS: Record<CrewRole, (ctx: TurnContext, brief: string) => Plan> = { build: buildPlan, review: reviewPlan, research: researchPlan };

export function crewPlan(ctx: TurnContext, role: CrewRole): Plan {
  const person = ctx.inbound.find((i) => i.rule === "person");
  if (person) return { steps: [], reply: () => `I am ${ctx.agent.code}, working on "${ctx.agent.title}". I report to the captain when it is done.` };
  const brief = ctx.inbound.find((i) => i.rule === "request");
  if (brief && ctx.initial.artifacts.some((a) => a.agentId === ctx.agent.id)) {
    return { steps: [], reply: () => formatted("partial", "Read the new message. My earlier result stands; nothing changed.", "none") };
  }
  if (brief) return PLANS[role](ctx, brief.text);
  return { steps: [], reply: () => "Noted." };
}
