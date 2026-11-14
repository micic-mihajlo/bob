import { STAGES } from "../stages";
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
  const shown = intakeTexts(items);
  const texts = shown.length > 0 ? shown : ctx.inbound.filter((i) => i.rule === "person").map((i) => i.text);
  const change = changeFor(texts.join("\n"));
  const decision = inspectRequest(texts, pushbackRounds(items), change);
  if (decision.kind === "ask") return { steps: [], reply: () => decision.reply };
  const { intent } = decision;
  const workTitle = intent.title;
  const s = ctx.initial;
  // A turn the server cut off may have planned and started this already: pick up from the state.
  const building = s.agents.find((a) => a.crewRole === "build" && !a.closedAt && s.messages.some((m) => m.requestId === ctx.requestId && m.from.kind === "agent" && m.from.agentId === ctx.agent.id && m.to.includes(a.id)));
  if (building) return { steps: [], reply: () => `${building.code} is building "${building.title}" on ${building.branch}.` };
  const planned = road.today.find((w) => w.title === workTitle && w.status !== "done");
  const fresh = road.stage === 1;
  const orderOf = (done: CallRecord[]) => planned ?? newOrder(done);
  return {
    steps: [
      () => [
        call("set_goal", { title: intent.title, user: intent.user, behaviour: intent.behaviour, acceptance: intent.acceptance, assumptions: intent.assumptions }),
        ...(fresh ? [call("advance_stage", {})] : []),
      ],
      () => (planned ? [] : [call("set_roadmap", { workOrderTitles: [workTitle, ...(road.backlog ?? []).map((w) => w.title).filter((t) => t !== workTitle)] })]),
      (done) => {
        const order = newOrder(done);
        if (planned) return road.stage === 2 ? [call("advance_stage", {})] : [];
        if (!order) return [];
        const keep = road.today.filter((w) => w.status !== "done").map((w) => w.id);
        const today = call("set_today", { workOrderIds: [...keep, order.id].slice(-3) });
        return fresh || road.stage === 2 ? [today, call("advance_stage", {})] : [today];
      },
      (done) => {
        const order = orderOf(done);
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
  pr: PullRequestArtifact;
  review?: Artifact & { review: ReviewData };
  asked: boolean;
  builder?: Agent;
  reviewer?: Agent;
}

/** Every open pull request, oldest first, with what is known about it. Two requests in flight are two of these. */
function factsOf(s: State): Facts[] {
  return s.artifacts
    .filter((a): a is PullRequestArtifact => isPullRequest(a) && !a.pullRequest.merged)
    .map((pr) => {
      const review = [...s.artifacts].reverse().find((a): a is Artifact & { review: ReviewData } => a.review?.pullRequestId === pr.id);
      const builder = s.agents.find((a) => a.id === pr.agentId && !a.closedAt);
      const reviewer = s.agents.find((a) => a.crewRole === "review" && !a.closedAt && a.workOrderId === (builder?.workOrderId ?? null));
      const head = pr.pullRequest.headSha;
      const asked = s.approvals.some((a) => a.pullRequestId === pr.id && (a.status === "pending" || !a.headSha || a.headSha === head));
      return { pr, review, asked, builder, reviewer };
    });
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

/** `ends`: the plan calls request_approval, which ends the turn, so it runs last in a combined turn. */
type Rule = { when: (f: Facts) => boolean; plan: (f: Facts) => Plan; ends?: true };

const REPORT_RULES: Rule[] = [
  {
    when: (f) => f.review?.review.verdict === "approve" && (!f.review.review.headSha || f.review.review.headSha === f.pr.pullRequest.headSha) && !f.asked,
    ends: true,
    plan: ({ pr: p, review }) => {
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
    when: (f) => !f.review && !f.reviewer,
    plan: ({ pr: p, builder }) => {
      const title = `Review #${p.pullRequest.number}`;
      const started = (done: CallRecord[]) => done.find((c) => c.name === "start_thread" && (c.input as { title?: string }).title === title && !("error" in c.result))?.result.code;
      return {
        steps: [() => [call("start_thread", { role: "review", title, brief: reviewBrief(p), ...(builder?.workOrderId ? { workOrderId: builder.workOrderId } : {}) })]],
        reply: (done) => `${builder?.code ?? "The build thread"} opened #${p.pullRequest.number}. ${String(started(done) ?? "A review thread")} is reviewing it.`,
      };
    },
  },
];

/** A thread the restart cut off mid-work gets its brief again, to finish from what its workspace holds. */
function restartPlan(ctx: TurnContext): Plan | null {
  const s = ctx.initial;
  const cut = ctx.inbound.find((i) => i.from.kind === "agent" && /^Status: blocked/m.test(i.text) && /server restarted/i.test(i.text));
  const from = cut?.from.kind === "agent" ? cut.from.agentId : null;
  const thread = from ? s.agents.find((a) => a.id === from && a.kind === "crew" && !a.closedAt) : undefined;
  const brief = thread && s.messages.find((m) => m.from.kind === "agent" && m.from.agentId === ctx.agent.id && m.to.includes(thread.id));
  if (!thread || !brief) return null;
  const text = `The server restarted while you were working. Check what your workspace and branch already have, then finish this brief and report.\n\n${brief.text}`;
  return { steps: [() => [call("message_thread", { threadId: thread.id, text })]], reply: () => `The server restarted while ${thread.code} was working. I sent it its brief again to finish.` };
}

function reportPlan(ctx: TurnContext): Plan {
  const restarted = restartPlan(ctx);
  if (restarted) return restarted;
  const matched = factsOf(ctx.initial).flatMap((f) => {
    const rule = REPORT_RULES.find((r) => r.when(f));
    return rule ? [{ plan: rule.plan(f), ends: !!rule.ends }] : [];
  });
  if (matched.length > 0) {
    const ending = matched.filter((m) => m.ends).map((m) => m.plan);
    const rest = matched.filter((m) => !m.ends).map((m) => m.plan);
    return {
      steps: [
        ...rest.flatMap((p) => p.steps),
        (done) => {
          const calls = ending.flatMap((p) => p.steps.flatMap((step) => step(done)));
          const asks = calls.filter((c) => c.name !== "advance_stage");
          return calls.length > asks.length && ctx.initial.roadmap.stageTitle === "Build" ? [call("advance_stage", {}), ...asks] : asks;
        },
      ],
      reply: (done) => [...rest, ...ending].map((p) => p.reply(done)).join(" "),
    };
  }
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
  const already = pr.pullRequest.merged;
  const merged = (done: CallRecord[]) => already || succeeded(done, "merge_pull_request");
  const refusal = (done: CallRecord[]) => String(done.find((c) => c.name === "merge_pull_request")?.result.error ?? "");
  const headMoved = (done: CallRecord[]) => /changed after the person approved it/.test(refusal(done));
  const fresh = s.artifacts.find((a): a is PullRequestArtifact => a.id === pr.id && isPullRequest(a)) ?? pr;
  const again = () =>
    call("request_approval", {
      title: `Merge #${pr.pullRequest.number} again: ${pr.title}`,
      detail: `#${pr.pullRequest.number} changed after you approved it: its head is now ${fresh.pullRequest.headSha.slice(0, 7)}. Merges ${prLine(fresh)} into main. Files: ${filesLine(fresh)}.`,
      pullRequestId: pr.id,
    });
  return {
    steps: [
      () => (already ? [] : [call("merge_pull_request", { pullRequestId: pr.id })]),
      (done) => (headMoved(done) ? [again()] : []),
      (done) => (merged(done) ? threads.map((t) => call("close_thread", { threadId: t.id })) : []),
      (done) => (merged(done) && s.roadmap.stage < STAGES.length ? [call("advance_stage", {})] : []),
      (done) => (merged(done) && followUps.some((f) => !(s.roadmap.backlog ?? []).some((w) => w.title === f)) ? [call("set_roadmap", { workOrderTitles: [...backlog, ...followUps] })] : []),
    ],
    reply: (done) =>
      merged(done)
        ? `Merged #${pr.pullRequest.number} "${pr.title}" into main and closed its threads.${followUps.length > 0 ? ` ${followUps.length} follow-up${followUps.length > 1 ? "s" : ""} from the review went to the backlog.` : ""}`
        : headMoved(done)
          ? `#${pr.pullRequest.number} changed after you approved it, so I did not merge it. Approve the new head and I will merge.`
          : `I could not merge #${pr.pullRequest.number}: ${refusal(done) || "unknown error"}`,
  };
}

/** A report that lands in the same turn as the person's decision is handled after it, not dropped. */
function withReports(ctx: TurnContext, plan: Plan): Plan {
  if (!ctx.inbound.some((i) => i.from.kind === "agent")) return plan;
  const reports = reportPlan(ctx);
  if (reports.steps.length === 0) return plan;
  return { steps: [...plan.steps, ...reports.steps], reply: (done) => `${plan.reply(done)} ${reports.reply(done)}` };
}

export function captainPlan(ctx: TurnContext): Plan {
  const decision = ctx.inbound.find((i) => i.rule === "decision" && i.decision)?.decision;
  if (decision) return withReports(ctx, decisionPlan(ctx, decision));
  const ask = ctx.inbound.find((i) => i.rule === "person");
  if (ask) return requestPlan(ctx);
  return reportPlan(ctx);
}
