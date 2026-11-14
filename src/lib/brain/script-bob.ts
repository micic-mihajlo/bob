import { liveAsks } from "../asks";
import { agentName, messageById } from "../state";
import type { WorkOrder } from "../types";
import {
  call,
  findTeammate,
  latestArtifact,
  requestIdsOf,
  resultLine,
  resultOf,
  succeeded,
  summarize,
  type AgentRow,
  type Plan,
} from "./script-plan";
import type { CallRecord, InboundItem, TurnContext } from "./types";

const BUILDER = /build|cod/i;
const RESEARCHER = /research|look/i;
const REVIEWER = /review|check/i;
const ASKS_RESEARCH = /\b(how|find)\b/i;

/** Roles the request can name that the seeded team lacks, with the teammate Bob creates for each. */
const MISSING_ROLES = [
  { word: /\bsecurity\b/i, name: "Security", title: "Checks for security risks", description: "You look for security risks in a change: data exposure, access checks, unsafe input. Record findings as a note artifact." },
  { word: /\bdesign\b/i, name: "Designer", title: "Shapes the interface", description: "You design how a feature looks and behaves for the person using it. Record the design as a note artifact." },
  { word: /\bdocs?\b|\bdocumentation\b/i, name: "Writer", title: "Writes the docs", description: "You write clear, short documentation for a change. Record the draft as a note artifact." },
];

function brief(goal: string, task: string, original: string, workOrderId: string | null, doneMeans: string): string {
  return [
    `Goal: ${goal}`,
    `Task: ${task}`,
    `Context: the person wrote ${JSON.stringify(original)}.${workOrderId ? ` Work order ${workOrderId}.` : ""}`,
    `Done means: ${doneMeans} Answer in Status / Result / Evidence form.`,
  ].join("\n");
}

function newWorkOrder(done: CallRecord[]): { id: string; title: string } | undefined {
  const orders = resultOf(done, "set_roadmap")?.workOrders as { id: string; title: string }[] | undefined;
  return orders?.[0];
}

function assignments(ctx: TurnContext, text: string, goal: string, done: CallRecord[]) {
  const team = (resultOf(done, "list_agents")?.agents as AgentRow[] | undefined) ?? [];
  const order = newWorkOrder(done);
  const task = order?.title ?? summarize(text);
  const missing = MISSING_ROLES.find((r) => r.word.test(text) && !team.some((a) => r.word.test(`${a.name} ${a.title}`)));
  const coder = findTeammate(team, BUILDER, ctx.agent.id);
  const researcher = ASKS_RESEARCH.test(text) ? findTeammate(team, RESEARCHER, ctx.agent.id) : undefined;
  const send = (to: string, body: string, workOrderId?: string) =>
    call("send_message", { recipientAgentIds: [to], text: body, expectsReply: true, ...(workOrderId ? { workOrderId } : {}) });
  return [
    ...(missing
      ? [call("create_agent", { name: missing.name, title: missing.title, description: missing.description, initialMessage: brief(goal, `Check ${task} from your angle.`, text, null, "a note artifact with what you found.") })]
      : []),
    ...(coder ? [send(coder.id, brief(goal, task, text, order?.id ?? null, "a pull request recorded with record_artifact."), order?.id)] : []),
    ...(researcher ? [send(researcher.id, brief(goal, `Find out how to approach: ${task}`, text, null, "a note artifact with sources."))] : []),
  ];
}

function requestPlan(ctx: TurnContext, text: string): Plan {
  const road = ctx.initial.roadmap;
  const title = summarize(text);
  const goal = road.goal?.title ?? title;
  return {
    steps: [
      () => [...(road.goal ? [] : [call("set_goal", { title: goal })]), ...(road.stage === 1 ? [call("advance_stage", {})] : [])],
      () => [call("set_roadmap", { workOrderTitles: [title] })],
      (done) => {
        const order = newWorkOrder(done);
        if (!order) return [];
        const keep = road.today.filter((w) => w.status !== "done").map((w) => w.id);
        const today = call("set_today", { workOrderIds: [...keep, order.id].slice(-3) });
        return road.stage <= 2 ? [today, call("advance_stage", {})] : [today];
      },
      () => [call("list_agents", {})],
      (done) => assignments(ctx, text, goal, done),
    ],
    reply: (done) => requestReply(ctx, title, done),
  };
}

function requestReply(ctx: TurnContext, title: string, done: CallRecord[]): string {
  const sentTo = done
    .filter((c) => c.name === "send_message" && !("error" in c.result))
    .flatMap((c) => (c.result.to as string[]) ?? []);
  const created = resultOf(done, "create_agent")?.agentId as string | undefined;
  const names = sentTo.map((id) => agentName(ctx.state, id));
  const asked = names.length > 0 ? `I asked ${names.join(" and ")} to take it on.` : "Nobody on the team fits this yet.";
  const added = created ? ` I also added ${agentName(ctx.state, created)} to the team for it.` : "";
  return `I planned "${title}" for today. ${asked}${added} I will report back when they answer.`;
}

function findOrder(today: WorkOrder[], artifactId: string): WorkOrder | undefined {
  return today.find((w) => w.artifactId === artifactId) ?? today.find((w) => w.status !== "done");
}

function decisionPlan(ctx: TurnContext, decision: NonNullable<InboundItem["decision"]>): Plan {
  const s = ctx.initial;
  const approval = s.approvals.find((a) => a.id === decision.approvalId);
  const pr = approval ? latestArtifact(s, new Set([approval.requestId]), "pull_request") : undefined;
  const order = pr ? findOrder(s.roadmap.today, pr.id) : undefined;
  if (decision.status === "denied" || !pr || !order) {
    return { steps: [], reply: () => `Understood. I left "${decision.title}" as it is. Tell me what should change and I will pass it on.` };
  }
  return {
    steps: [() => [call("complete_work_order", { workOrderId: order.id, artifactId: pr.id }), call("advance_stage", {})]],
    reply: (done) =>
      succeeded(done, "complete_work_order")
        ? `Merged "${pr.title}". Work order "${order.title}" is done.`
        : `I could not close "${order.title}". The roadmap refused the change.`,
  };
}

function repliesPlan(ctx: TurnContext): Plan {
  const s = ctx.initial;
  const requests = requestIdsOf(s, ctx.inbound);
  const pr = latestArtifact(s, requests, "pull_request");
  const review = latestArtifact(s, requests, "review");
  const summary = ctx.inbound.map((i) => `${i.from.kind === "agent" ? i.from.name : "Someone"}: ${resultLine(i.text)}`).join(" ");
  const asked = s.approvals.some((a) => pr && a.detail.includes(pr.id));
  if (pr && review && review.at >= pr.at && !asked) {
    const detail = `Pull request ${pr.id} ("${pr.title}") was reviewed in ${review.id}. Approve to merge it and close the work order.`;
    return { steps: [() => [call("request_approval", { title: `Merge "${pr.title}"`, detail })]], reply: () => summary };
  }
  const reviewer = findTeammate(s.agents, REVIEWER, ctx.agent.id);
  const reviewerBusy = liveAsks(s, ctx.agent.id).some((d) => d.recipientAgentId === reviewer?.id);
  if (pr && !review && reviewer && !reviewerBusy) {
    const text = `Please review pull request ${pr.id} ("${pr.title}"): ${pr.detail}\nDone means: a review artifact and an answer in Status / Result / Evidence form.`;
    return {
      steps: [() => [call("send_message", { recipientAgentIds: [reviewer.id], text, expectsReply: true })]],
      reply: () => `${summary} I asked ${reviewer.name} to review the pull request.`,
    };
  }
  return { steps: [], reply: () => summary || "Nothing new from the team." };
}

export function bobPlan(ctx: TurnContext): Plan {
  const decision = ctx.inbound.find((i) => i.rule === "decision" && i.decision)?.decision;
  if (decision) return decisionPlan(ctx, decision);
  const ask = ctx.inbound.find((i) => i.rule === "person" || i.rule === "request");
  if (ask) return requestPlan(ctx, messageById(ctx.initial, ask.messageId)?.text ?? ask.text);
  return repliesPlan(ctx);
}
