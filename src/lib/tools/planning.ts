import { z } from "zod";
import { advanceStage, completeWorkOrder, setGoal, setRoadmap, setToday, trackOf, trackView, unmetCriteria, type RoadmapResult, type TrackRef } from "../roadmap";
import { messageById, type State } from "../state";
import { getState, transact } from "../store";
import { requestOrigin } from "../threads";
import type { Roadmap } from "../types";
import { done, fail, type ToolContext, type ToolOutput } from "./context";

/**
 * The request a planning call works on: the newest request the person typed in this turn, else the turn's own.
 * A turn that holds an approval and a new request plans the new request, never the approved one.
 */
export function planningRequest(s: State, ctx: ToolContext): TrackRef {
  const turn = s.turns.find((t) => t.id === ctx.turnId);
  const typed = (turn?.messageIds ?? []).map((id) => messageById(s, id)).filter((m) => m?.from.kind === "user" && !m.approvalId).at(-1);
  const requestId = typed?.requestId ?? ctx.requestId;
  return { requestId, messageId: requestOrigin(s, requestId) };
}

/**
 * What a captain's message for a request is caused by: the newest message of that request in this turn, else the
 * message the person typed to start it. Never a message of another request the turn happens to hold.
 */
export function causeIn(s: State, ctx: ToolContext, requestId: string): string | null {
  const turn = s.turns.find((t) => t.id === ctx.turnId);
  const own = (turn?.messageIds ?? []).filter((id) => messageById(s, id)?.requestId === requestId).at(-1);
  return own ?? requestOrigin(s, requestId) ?? (requestId === ctx.requestId ? ctx.causedBy : null);
}

function applyRoadmap(s: State, transition: (r: Roadmap) => RoadmapResult): { state: State; value: RoadmapResult } {
  const value = transition(s.roadmap);
  return { state: value.ok ? { ...s, roadmap: value.roadmap } : s, value };
}

const change = (transition: (r: Roadmap) => RoadmapResult): RoadmapResult =>
  transact((s) => applyRoadmap(s, transition));

const view = (r: RoadmapResult, requestId: string): ToolOutput => {
  if (!r.ok) return fail(r.error);
  const track = trackView(r.roadmap, requestId);
  return done({
    request: requestId,
    stage: track.stageTitle,
    today: track.today.map((w) => ({ id: w.id, title: w.title, status: w.status })),
    unmetToAdvance: unmetCriteria(r.roadmap, requestId),
  });
};

export const setGoalSchema = z.object({
  title: z.string().min(1).describe("The intent in a few words, such as CSV export for invoices."),
  why: z.string().optional(),
  deadline: z.string().optional(),
  user: z.string().optional().describe("Who needs it, by role: an accountant on the invoices page."),
  behaviour: z.string().optional().describe("What they can do afterwards that they cannot today, and where in the app."),
  acceptance: z.string().optional().describe("One check a test could assert that proves it works."),
  assumptions: z.array(z.string()).optional().describe("Gaps you filled yourself, each stated in one line."),
});
export function setGoalTool(i: z.infer<typeof setGoalSchema>, ctx: ToolContext): ToolOutput {
  const ref = planningRequest(getState(), ctx);
  return view(change((r) => setGoal(r, ref, i)), ref.requestId);
}

export const setRoadmapSchema = z.object({ workOrderTitles: z.array(z.string().min(1)).min(1).max(12) });
export function setRoadmapTool(i: z.infer<typeof setRoadmapSchema>, ctx: ToolContext): ToolOutput {
  const ref = planningRequest(getState(), ctx);
  const r = change((road) => setRoadmap(road, ref, i.workOrderTitles));
  if (!r.ok) return fail(r.error);
  const workOrders = (r.roadmap.backlog ?? []).filter((w) => w.requestId === ref.requestId || w.source).map((w) => ({ id: w.id, title: w.title }));
  return done({ workOrders, next: "Call set_today with up to three of these ids." });
}

export const setTodaySchema = z.object({ workOrderIds: z.array(z.string()) });
export function setTodayTool(i: z.infer<typeof setTodaySchema>, ctx: ToolContext): ToolOutput {
  const ref = planningRequest(getState(), ctx);
  return view(change((r) => setToday(r, ref, i.workOrderIds)), ref.requestId);
}

export const completeSchema = z.object({
  workOrderId: z.string(),
  artifactId: z.string().optional().describe("The artifact that finished it, such as the merged pull request."),
});

function artifactRefusal(s: State, artifactId: string | undefined): string | null {
  if (!artifactId) return null;
  const artifact = s.artifacts.find((a) => a.id === artifactId);
  if (!artifact) return `Unknown artifact ${artifactId}. Use an artifact id from this request.`;
  if (artifact.kind === "pull_request" && !artifact.pullRequest?.merged) {
    return `That pull request is not merged. Merge it with merge_pull_request after the person approves; that also completes the work order.`;
  }
  return null;
}

export function completeWorkOrderTool(i: z.infer<typeof completeSchema>): ToolOutput {
  return transact((s) => {
    const refused = artifactRefusal(s, i.artifactId);
    if (refused) return { state: s, value: fail(refused) };
    const applied = applyRoadmap(s, (road) => completeWorkOrder(road, i.workOrderId, i.artifactId ?? null));
    if (!applied.value.ok) return { state: s, value: fail(applied.value.error) };
    const order = [...s.roadmap.today, ...(s.roadmap.backlog ?? [])].find((w) => w.id === i.workOrderId);
    return { state: applied.state, value: view(applied.value, order?.requestId ?? "") };
  });
}

export const advanceSchema = z.object({
  requestId: z.string().optional().describe("The track to move, by its request id from the live roadmap. Leave it out for this turn's request."),
});
export function advanceStageTool(i: z.infer<typeof advanceSchema>, ctx: ToolContext): ToolOutput {
  const s = getState();
  const requestId = i.requestId && trackOf(s.roadmap, i.requestId) ? i.requestId : planningRequest(s, ctx).requestId;
  return view(change((r) => advanceStage(r, requestId)), requestId);
}
