import type { State } from "../state";
import { isPullRequest, type PullRequestArtifact } from "../threads";
import type { Agent, Artifact, ReviewData } from "../types";
import { intakeTexts, pushbackRounds } from "./intake";
import { changeFor } from "./script-changes";
import { inspectRequest, type IntentDraft } from "./script-intake";
import { call, resultOf, succeeded, type Plan } from "./script-plan";
import type { CallRecord, InboundItem, TurnContext } from "./types";

/** The work order set_roadmap made for this request: the first title is always the new one. */
const newOrder = (done: CallRecord[]) => (resultOf(done, "set_roadmap")?.workOrders as { id: string; title: string }[] | undefined)?.[0];

function buildBrief(intent: IntentDraft, texts: string[], workTitle: string): string {
  return [
    `Goal: ${workTitle}.`,
    `Context: the person wrote ${texts.map((t) => JSON.stringify(t)).join(" then ")}. User: ${intent.user}. Acceptance: ${intent.acceptance}.`,
    ...(intent.assumptions.length > 0 ? [`Assumed: ${intent.assumptions.join("; ")}.`] : []),
    "Area: the invoices module under src/, next to src/invoices.ts and src/format.ts.",
    "You can rely on: the Invoice type in src/invoices.ts and the project's test setup.",
    "Out of scope: the UI and any change to existing behaviour.",
    "Done means: committed on your branch, diff read, a test next to the code, a pull request open, and a report with Status / Result / Evidence.",
  ].join("\n");
}

function requestPlan(ctx: TurnContext): Plan {
  const road = ctx.initial.roadmap;
  const items = ctx.initial.threads[ctx.agent.id] ?? [];
  const texts = intakeTexts(items);
  const change = changeFor(texts.join("\n"));
  const decision = inspectRequest(texts, pushbackRounds(items), change);
  if (decision.kind === "ask") return { steps: [], reply: () => decision.reply };
  const { intent } = decision;
  const workTitle = intent.title;
  const fresh = road.stage === 1;
  return {
    steps: [
      () => [
        call("set_goal", { title: intent.title, user: intent.user, behaviour: intent.behaviour, acceptance: intent.acceptance, assumptions: intent.assumptions }),
        ...(fresh ? [call("advance_stage", {})] : []),
      ],
      () => [call("set_roadmap", { workOrderTitles: [workTitle, ...(road.backlog ?? []).map((w) => w.title).filter((t) => t !== workTitle)] })],
      (done) => {
        const order = newOrder(done);
        if (!order) return [];
        const keep = road.today.filter((w) => w.status !== "done").map((w) => w.id);
        const today = call("set_today", { workOrderIds: [...keep, order.id].slice(-3) });
        return fresh || road.stage === 2 ? [today, call("advance_stage", {})] : [today];
      },
      (done) => {
        const order = newOrder(done);
        return order ? [call("start_thread", { role: "build", title: workTitle, brief: buildBrief(intent, texts, workTitle), workOrderId: order.id })] : [];
      },
    ],
    reply: (done) => {
      const started = resultOf(done, "start_thread");
      if (!started) return `I planned "${workTitle}", but could not start a thread for it. ${String(done.find((c) => c.name === "start_thread")?.result.error ?? "")}`.trim();
      const assumed = intent.assumptions.length > 0 ? ` Going with: ${intent.assumptions.join("; ")}.` : "";
      const doneWhen = intent.assumptions.some((a) => a.startsWith("Acceptance")) ? "" : ` Done when ${lowerFirst(intent.acceptance)}.`;
      return `${started.code} is building "${workTitle}" on ${started.branch}.${doneWhen}${assumed}`;
    },
  };
}

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1).replace(/\.$/, "");

interface Facts {
  pr?: PullRequestArtifact;
  review?: Artifact & { review: ReviewData };
  asked: boolean;
  builder?: Agent;
  reviewer?: Agent;
}

function factsOf(s: State): Facts {
  const pr = [...s.artifacts].reverse().find((a): a is PullRequestArtifact => isPullRequest(a) && !a.pullRequest.merged);
  if (!pr) return { asked: false };
  const review = [...s.artifacts].reverse().find((a): a is Artifact & { review: ReviewData } => a.review?.pullRequestId === pr.id);
  const builder = s.agents.find((a) => a.id === pr.agentId && !a.closedAt);
  const reviewer = s.agents.find((a) => a.crewRole === "review" && !a.closedAt && a.workOrderId === (builder?.workOrderId ?? null));
  return { pr, review, asked: s.approvals.some((a) => a.pullRequestId === pr.id), builder, reviewer };
}

const prLine = (pr: PullRequestArtifact) => `#${pr.pullRequest.number} (id ${pr.id}) "${pr.title}" on branch ${pr.pullRequest.branch}`;
const filesLine = (pr: PullRequestArtifact) => pr.pullRequest.files.map((f) => `${f.path} (+${f.additions} -${f.deletions})`).join(", ");

function reviewBrief(pr: PullRequestArtifact): string {
  return [
    `Review pull request ${prLine(pr)}.`,
    `Changed files: ${filesLine(pr)}.`,
    `Read it with git fetch origin, then git diff origin/main...origin/${pr.pullRequest.branch}.`,
    "Check: correct output, quoting of odd values, tests that cover the new code, no change to existing behaviour.",
    "Done means: record_review with your verdict and every finding, then a report with Status / Result / Evidence.",
  ].join("\n");
}

type Rule = { when: (f: Facts) => boolean; plan: (f: Facts) => Plan };

const REPORT_RULES: Rule[] = [
  {
    when: (f) => !!f.pr && f.review?.review.verdict === "approve" && !f.asked,
    plan: ({ pr, review }) => {
      const p = pr as PullRequestArtifact;
      const detail = `Merges ${prLine(p)} into main. Files: ${filesLine(p)}. Review: approved with ${review?.review.findings.length ?? 0} finding(s).`;
      return {
        steps: [
          () => [
            call("advance_stage", {}),
            call("request_approval", { title: `Merge #${p.pullRequest.number}: ${p.title}`, detail, pullRequestId: p.id }),
          ],
        ],
        reply: () => `The review approved #${p.pullRequest.number}. ${detail} Approve it and I will merge.`,
      };
    },
  },
  {
    when: (f) => f.review?.review.verdict === "request_changes" && !!f.builder,
    plan: ({ review, builder }) => {
      const findings = (review?.review.findings ?? []).map((x) => `- ${x.path}: ${x.comment}`).join("\n");
      return {
        steps: [() => [call("message_thread", { threadId: builder?.id, text: `The review asked for changes:\n${findings}\nFix them, commit, call open_pull_request again, and report.` })]],
        reply: () => `The review asked for changes. I sent the findings to ${builder?.code}.`,
      };
    },
  },
  {
    when: (f) => !!f.pr && !f.review && !f.reviewer,
    plan: ({ pr, builder }) => {
      const p = pr as PullRequestArtifact;
      return {
        steps: [() => [call("start_thread", { role: "review", title: `Review #${p.pullRequest.number}`, brief: reviewBrief(p), ...(builder?.workOrderId ? { workOrderId: builder.workOrderId } : {}) })]],
        reply: (done) => `${builder?.code ?? "The build thread"} opened #${p.pullRequest.number}. ${resultOf(done, "start_thread")?.code ?? "A review thread"} is reviewing it.`,
      };
    },
  },
];

function reportPlan(ctx: TurnContext): Plan {
  const facts = factsOf(ctx.initial);
  const rule = REPORT_RULES.find((r) => r.when(facts));
  if (rule) return rule.plan(facts);
  const heard = ctx.inbound.map((i) => (i.from.kind === "agent" ? i.from.name : "Someone")).join(", ");
  return { steps: [], reply: () => `Noted the report from ${heard}. Nothing else to start right now.` };
}

function decisionPlan(ctx: TurnContext, decision: NonNullable<InboundItem["decision"]>): Plan {
  const s = ctx.initial;
  const prId = s.approvals.find((a) => a.id === decision.approvalId)?.pullRequestId;
  const pr = s.artifacts.find((a): a is PullRequestArtifact => a.id === prId && isPullRequest(a));
  if (decision.status === "denied" || !pr) {
    return { steps: [], reply: () => `Understood, I left "${decision.title}" unmerged. What should change before I merge it?` };
  }
  const owner = s.agents.find((a) => a.id === pr.agentId);
  const threads = s.agents.filter((a) => a.kind === "crew" && !a.closedAt && (a.id === pr.agentId || (!!owner?.workOrderId && a.workOrderId === owner.workOrderId)));
  const findings = [...s.artifacts].reverse().find((a) => a.review?.pullRequestId === pr.id)?.review?.findings ?? [];
  const followUps = findings.map((f) => `Follow up on #${pr.pullRequest.number}: ${f.comment}`);
  const backlog = (s.roadmap.backlog ?? []).map((w) => w.title).filter((t) => !followUps.includes(t));
  const merged = (done: CallRecord[]) => succeeded(done, "merge_pull_request");
  return {
    steps: [
      () => [call("merge_pull_request", { pullRequestId: pr.id })],
      (done) => (merged(done) ? threads.map((t) => call("close_thread", { threadId: t.id })) : []),
      (done) => (merged(done) ? [call("advance_stage", {})] : []),
      (done) => (merged(done) && followUps.length > 0 ? [call("set_roadmap", { workOrderTitles: [...backlog, ...followUps] })] : []),
    ],
    reply: (done) =>
      merged(done)
        ? `Merged #${pr.pullRequest.number} "${pr.title}" into main and closed its threads.${followUps.length > 0 ? ` ${followUps.length} follow-up${followUps.length > 1 ? "s" : ""} from the review went to the backlog.` : ""}`
        : `I could not merge #${pr.pullRequest.number}: ${String(done.find((c) => c.name === "merge_pull_request")?.result.error ?? "unknown error")}`,
  };
}

export function captainPlan(ctx: TurnContext): Plan {
  const decision = ctx.inbound.find((i) => i.rule === "decision" && i.decision)?.decision;
  if (decision) return decisionPlan(ctx, decision);
  const ask = ctx.inbound.find((i) => i.rule === "person");
  if (ask) return requestPlan(ctx);
  return reportPlan(ctx);
}
