import { z } from "zod";
import { briefWithAcceptance } from "../acceptance";
import { branchName, MAX_BUSY_THREADS, nextThreadCode, ROLE_TEMPLATES, threadHue } from "../crew";
import { nowIso } from "../ids";
import { knowledgeSection, recallForBrief, reviewHistory, warmKnowledge } from "../graph/knowledge";
import { inboxItem, isInboxRequest } from "../inbox";
import { send } from "../mailbox";
import { updateWorkOrder } from "../roadmap";
import { agentById, captainOf, isClosed, runningTurn, type State } from "../state";
import { getState, transact, update } from "../store";
import { checkoutBranch, prewarmProject, stampThread, threadWorkspace } from "../thread-workspace";
import { busyThreads, closeThreadState, closeWhenIdle, findPullRequest, findThread, isBusy, isPullRequest, openThreads, requestAsk, threadRequestId } from "../threads";
import { isThreadModel, unknownModel } from "../models";
import { THREAD_MODELS, type Agent, type CrewRole } from "../types";
import { done, fail, type ToolContext, type ToolOutput } from "./context";
import { recordOutgoing } from "./messaging";
import { causeIn, planningRequest } from "./planning";

export const startThreadSchema = z.object({
  role: z.enum(["build", "review", "research"]).describe("build changes code on its own branch; review checks one pull request; research answers a question from the code."),
  title: z.string().min(1).max(80).describe("What the thread does, in a few words, such as \"Rate-limit the login route\"."),
  brief: z.string().min(1).describe("The thread's first message. It sees nothing else, so it must stand alone."),
  workOrderId: z.string().optional().describe("The work order in today this thread serves."),
  model: z.string().optional().describe(`The model the thread runs on, one of ${THREAD_MODELS.join(", ")}. Leave it out for the default.`),
});
type StartInput = z.infer<typeof startThreadSchema>;

function startRefusal(s: State, input: StartInput, requestId: string): string | null {
  if (isInboxRequest(s, requestId)) {
    return "This turn is triaging an inbox item, and nothing from the inbox starts on its own. Leave its asks in the backlog with triage_inbox; the person promotes the work they want built.";
  }
  if (input.model && !isThreadModel(input.model)) return unknownModel(input.model);
  if (input.workOrderId) {
    if (!s.roadmap.today.some((w) => w.id === input.workOrderId)) {
      return `Work order ${input.workOrderId} is not in today. Schedule it with set_today, or leave workOrderId out.`;
    }
    const twin = openThreads(s).find((a) => a.crewRole === input.role && a.workOrderId === input.workOrderId);
    if (twin) {
      return `${twin.code} is already the open ${input.role} thread for this work order. Message it with message_thread, or close it with close_thread before starting another.`;
    }
  }
  const busy = busyThreads(s);
  if (busy.length >= MAX_BUSY_THREADS) {
    return `${busy.length} threads are already working (${busy.map((a) => a.code).join(", ")}), the most at once. End your turn and wait for one to report, or close one you no longer need with close_thread, then start this one.`;
  }
  return null;
}

function newThread(s: State, input: StartInput, captainId: string): Agent {
  const template = ROLE_TEMPLATES[input.role as CrewRole];
  const code = nextThreadCode(s);
  const order = s.roadmap.today.find((w) => w.id === input.workOrderId);
  return {
    id: code.toLowerCase(),
    name: code,
    title: input.title.trim(),
    description: template.instructions,
    role: "teammate",
    kind: "crew",
    code,
    crewRole: template.role,
    workOrderId: input.workOrderId ?? null,
    branch: template.ownBranch ? branchName(code, order?.title ?? input.title) : null,
    closedAt: null,
    hue: threadHue(template.role, code),
    model: input.model ?? template.model,
    createdAt: nowIso(),
    createdBy: { kind: "agent", agentId: captainId },
  };
}

const addThread = (s: State, agent: Agent): State => ({
  ...s,
  agents: [...s.agents, agent],
  threads: { ...s.threads, [agent.id]: [] },
  readMarks: { ...s.readMarks, [agent.id]: 0 },
});

async function prepareWorkspace(s: State, agent: Agent): Promise<string | null> {
  try {
    const ws = await threadWorkspace(s.project, agent.id);
    prewarmProject(ws);
    if (!agent.branch) return null;
    const checkedOut = await checkoutBranch(ws, agent.branch);
    return checkedOut.ok ? null : checkedOut.error;
  } catch (error) {
    return error instanceof Error ? error.message : "unknown error";
  }
}

function assignBuild(s: State, agent: Agent): State {
  if (agent.crewRole !== "build" || !agent.workOrderId) return s;
  const moved = updateWorkOrder(s.roadmap, agent.workOrderId, { ownerAgentId: agent.id, status: "running" });
  return moved.ok ? { ...s, roadmap: moved.roadmap } : s;
}

export async function startThread(input: StartInput, ctx: ToolContext): Promise<ToolOutput> {
  const created = transact<Agent | string>((s) => {
    const refused = startRefusal(s, input, ctx.requestId);
    if (refused) return { state: s, value: refused };
    const agent = newThread(s, input, ctx.agentId);
    return { state: addThread(s, agent), value: agent };
  });
  if (typeof created === "string") return fail(created);
  const problem = await prepareWorkspace(getState(), created);
  if (problem) {
    update((s) => closeThreadState(s, created.id, "the captain after its workspace failed"));
    return fail(`Could not set up ${created.code}'s workspace: ${problem}. Tell the person; do not retry blindly.`);
  }
  const order = getState().roadmap.today.find((w) => w.id === input.workOrderId);
  const requestId = order?.requestId ?? ctx.requestId;
  await stampThread(getState(), created.id, requestId).catch(() => undefined);
  const source = order?.source;
  const origin = source ? inboxItem(getState(), source.inboxId)?.messageId : undefined;
  const brief = briefWithAcceptance(getState(), created, input.brief);
  warmKnowledge(getState().project);
  const reviewed = created.crewRole === "review" ? findPullRequest(getState(), /\bart_[a-z0-9]+\b/.exec(input.brief)?.[0] ?? /#(\d+)/.exec(input.brief)?.[1] ?? "") : undefined;
  const [knowledge, history] = await Promise.all([
    created.crewRole === "research" ? null : recallForBrief(getState(), [order?.title, input.title, input.brief].filter(Boolean).join("\n")),
    reviewed ? reviewHistory(getState(), reviewed.pullRequest.files.map((f) => f.path), reviewed.pullRequest.number) : null,
  ]);
  const sent = send({
    from: { kind: "agent", agentId: ctx.agentId },
    to: [created.id],
    text: [brief.trim(), knowledge && knowledgeSection(knowledge), history].filter(Boolean).join("\n\n"),
    ...(knowledge ? { knowledge } : {}),
    expectsReply: true,
    replyTo: null,
    causedBy: origin ?? causeIn(getState(), ctx, requestId),
    requestId,
    ...(source ? { quote: source.quote } : {}),
  });
  if (!sent.ok) {
    update((s) => closeThreadState(s, created.id, "the captain after its brief was refused"));
    return fail(sent.error.message);
  }
  update((s) => assignBuild(recordOutgoing(s, ctx, sent.message), created));
  const next = "The brief is delivered. End your turn now with one or two sentences to the person. The thread reports back to you as a new turn.";
  return done({ threadId: created.id, code: created.code, branch: created.branch, next }, { wake: [created.id] });
}

export const listThreadsSchema = z.object({});

export function listThreads(): ToolOutput {
  const s = getState();
  const rows = s.agents
    .filter((a) => a.kind === "crew")
    .map((a) => {
      const pr = [...s.artifacts].reverse().find((x) => isPullRequest(x) && x.agentId === a.id && !x.pullRequest.merged);
      const status = isClosed(a) ? "closed" : runningTurn(s, a.id) ? "working" : isBusy(s, a.id) ? "queued" : "idle";
      return {
        threadId: a.id,
        code: a.code,
        role: a.crewRole,
        title: a.title,
        status,
        branch: a.branch ?? null,
        workOrderId: a.workOrderId ?? null,
        openPullRequest: pr && isPullRequest(pr) ? { id: pr.id, number: pr.pullRequest.number, status: pr.status } : null,
      };
    });
  return done({ threads: rows });
}

export const messageThreadSchema = z.object({
  threadId: z.string().min(1).describe("The thread's id or code, such as INV-3."),
  text: z.string().min(1).describe("Must stand alone: the thread sees nothing else of your conversation."),
  expectsReply: z.boolean().optional().describe("Defaults to true: the thread's answer comes back to you as a new turn."),
});

const quoted = (text: string | undefined) => (text ? `"${text.length > 80 ? `${text.slice(0, 79).trimEnd()}…` : text}"` : "another request");

/**
 * A crew thread belongs to the one request it was started for. Work for any other request goes to a new
 * thread, so one pull request never mixes two asks.
 */
function requestRefusal(s: State, thread: Agent, requestId: string): string | null {
  const owner = threadRequestId(s, thread.id);
  if (!owner || owner === requestId) return null;
  return `${thread.name} belongs to the request ${quoted(requestAsk(s, owner))}, and this is the request ${quoted(requestAsk(s, requestId))}. Start a new thread for this request: set_roadmap and set_today for its own work order, then start_thread with that workOrderId.`;
}

export function messageThread(input: z.infer<typeof messageThreadSchema>, ctx: ToolContext): ToolOutput {
  const thread = findThread(getState(), input.threadId);
  if (!thread) return fail(`No thread ${input.threadId}. Call list_threads for valid ids.`);
  if (isClosed(thread)) return fail(`${thread.name} is closed. Start a new thread with start_thread if the work needs one.`);
  const otherRequest = requestRefusal(getState(), thread, planningRequest(getState(), ctx).requestId);
  if (otherRequest) return fail(otherRequest);
  const expectsReply = input.expectsReply ?? true;
  const requestId = threadRequestId(getState(), thread.id) ?? ctx.requestId;
  const sent = send({ from: { kind: "agent", agentId: ctx.agentId }, to: [thread.id], text: input.text, expectsReply, replyTo: null, causedBy: causeIn(getState(), ctx, requestId), requestId });
  if (!sent.ok) return fail(sent.error.message);
  update((s) => recordOutgoing(s, ctx, sent.message));
  const next = expectsReply ? "Sent. End your turn now; the answer comes back to you." : "Sent.";
  return done({ messageId: sent.message.id, to: thread.id, next }, { wake: [thread.id] });
}

export const closeThreadSchema = z.object({ threadId: z.string().min(1).describe("The thread's id or code.") });

export function closeThread(input: z.infer<typeof closeThreadSchema>): ToolOutput {
  return transact((s) => {
    const thread = findThread(s, input.threadId);
    if (!thread || thread.kind !== "crew") return { state: s, value: fail(`No crew thread ${input.threadId}. Call list_threads.`) };
    if (isClosed(thread)) return { state: s, value: done({ threadId: thread.id, alreadyClosed: true }) };
    const next = closeWhenIdle(s, thread.id, captainOf(s)?.name ?? "the captain");
    if (!isClosed(agentById(next, thread.id))) return { state: next, value: done({ threadId: thread.id, closing: true, next: `${thread.name} closes as soon as its running turn ends.` }) };
    return { state: next, value: done({ threadId: thread.id, closed: true }) };
  });
}
