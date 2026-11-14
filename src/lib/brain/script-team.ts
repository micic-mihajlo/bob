import { call, findTeammate, latestArtifact, requestIdsOf, resultLine, resultOf, summarize, type Plan } from "./script-plan";
import type { CallRecord, InboundItem, TurnContext } from "./types";

/** Requests that touch data leaving the app or access to it. Coder asks Reviewer directly for these. */
const RISKY = /\b(export|import|csv|payments?|auth|login|passwords?|delete|security)\b/i;
const REVIEWER = /review|check/i;

type Specialty = "builder" | "reviewer" | "researcher" | "generic";

const SPECIALTIES: { pattern: RegExp; specialty: Specialty }[] = [
  { pattern: /build|cod/i, specialty: "builder" },
  { pattern: /review/i, specialty: "reviewer" },
  { pattern: /research|look/i, specialty: "researcher" },
];

const specialtyOf = (ctx: TurnContext): Specialty =>
  SPECIALTIES.find((s) => s.pattern.test(`${ctx.agent.name} ${ctx.agent.title}`))?.specialty ?? "generic";

/** The task line of a brief, or the first sentence of a plain request. */
const taskOf = (text: string) => summarize(/^Task:[ \t]*(.+)$/m.exec(text)?.[1] ?? text);

const artifactId = (done: CallRecord[]) => (resultOf(done, "record_artifact")?.artifactId as string | undefined) ?? "none";

function builderPlan(ctx: TurnContext, text: string): Plan {
  const task = taskOf(text);
  const reviewer = RISKY.test(text) ? findTeammate(ctx.initial.agents, REVIEWER, ctx.agent.id) : undefined;
  return {
    steps: [
      () => [call("record_artifact", { kind: "pull_request", title: task, detail: `Implements: ${task}. Adds a unit test for the new path and keeps existing behaviour unchanged.` })],
      (done) =>
        reviewer && resultOf(done, "record_artifact")
          ? [call("send_message", { recipientAgentIds: [reviewer.id], expectsReply: true, text: `Please review pull request ${artifactId(done)} ("${task}") before I report back. It changes how data leaves the app, so check what is exported and who can trigger it. Done means: a review artifact and an answer in Status / Result / Evidence form.` })]
          : [],
    ],
    reply: (done) =>
      reviewer
        ? `Status: partial\nResult: Opened pull request "${task}" and asked ${reviewer.name} to check it before I report back.\nEvidence: pull request ${artifactId(done)}`
        : `Status: done\nResult: Opened pull request "${task}".\nEvidence: pull request ${artifactId(done)} with a unit test for the new path`,
  };
}

function builderFollowUp(ctx: TurnContext): Plan {
  const pr = latestArtifact(ctx.initial, requestIdsOf(ctx.initial, ctx.inbound), "pull_request");
  const review = latestArtifact(ctx.initial, requestIdsOf(ctx.initial, ctx.inbound), "review");
  const verdict = ctx.inbound.map((i) => resultLine(i.text)).join(" ");
  return {
    steps: [],
    reply: () =>
      `Status: done\nResult: Pull request "${pr?.title ?? "the change"}" is open and reviewed. ${verdict}\nEvidence: pull request ${pr?.id ?? "none"}, review ${review?.id ?? "none"}`,
  };
}

function reviewerPlan(ctx: TurnContext, text: string): Plan {
  const pr = latestArtifact(ctx.initial, requestIdsOf(ctx.initial, ctx.inbound), "pull_request");
  const subject = pr ? `"${pr.title}"` : taskOf(text);
  return {
    steps: [() => [call("record_artifact", { kind: "review", title: `Review of ${subject}`, detail: "Read the change and its test. No blocking issues. The new path is covered and existing behaviour is untouched.", status: "approved" })]],
    reply: (done) => `Status: done\nResult: Approved ${subject}. No blocking issues.\nEvidence: review ${artifactId(done)}${pr ? `, pull request ${pr.id}` : ""}`,
  };
}

function notePlan(ctx: TurnContext, text: string, angle: string): Plan {
  const task = taskOf(text);
  return {
    steps: [() => [call("record_artifact", { kind: "note", title: `${angle}: ${task}`, detail: `${ctx.agent.name} looked into "${task}" and wrote down the approach, the open questions and the risks.` })]],
    reply: (done) => `Status: done\nResult: Wrote up ${angle.toLowerCase()} for "${task}".\nEvidence: note ${artifactId(done)}`,
  };
}

const quiet = (text: string): Plan => ({ steps: [], reply: () => text });

const PLANS: Record<Specialty, (ctx: TurnContext, text: string) => Plan> = {
  builder: builderPlan,
  reviewer: reviewerPlan,
  researcher: (ctx, text) => notePlan(ctx, text, "Findings"),
  generic: (ctx, text) => notePlan(ctx, text, "Notes"),
};

export function teammatePlan(ctx: TurnContext): Plan {
  const work = ctx.inbound.find((i: InboundItem) => i.rule === "person" || i.rule === "request" || i.rule === "decision");
  if (work) return PLANS[specialtyOf(ctx)](ctx, work.text);
  if (ctx.inbound.some((i) => i.rule === "reply") && specialtyOf(ctx) === "builder") return builderFollowUp(ctx);
  if (ctx.inbound.some((i) => i.rule === "reply")) return quiet(ctx.inbound.map((i) => resultLine(i.text)).join(" "));
  return quiet("Noted. I will use this in my work.");
}
