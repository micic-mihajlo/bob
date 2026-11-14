import { z } from "zod";
import { advanceStage, completeWorkOrder, setGoal, setRoadmap, setToday, unmetCriteria, type RoadmapResult } from "../roadmap";
import type { State } from "../state";
import { transact } from "../store";
import type { Roadmap } from "../types";
import { done, fail, type ToolOutput } from "./context";

function applyRoadmap(s: State, transition: (r: Roadmap) => RoadmapResult): { state: State; value: RoadmapResult } {
  const value = transition(s.roadmap);
  return { state: value.ok ? { ...s, roadmap: value.roadmap } : s, value };
}

const change = (transition: (r: Roadmap) => RoadmapResult): RoadmapResult =>
  transact((s) => applyRoadmap(s, transition));

const view = (r: RoadmapResult): ToolOutput =>
  r.ok
    ? done({
        stage: r.roadmap.stageTitle,
        today: r.roadmap.today.map((w) => ({ id: w.id, title: w.title, status: w.status })),
        unmetToAdvance: unmetCriteria(r.roadmap),
      })
    : fail(r.error);

export const setGoalSchema = z.object({
  title: z.string().min(1).describe("The intent in a few words, such as CSV export for invoices."),
  why: z.string().optional(),
  deadline: z.string().optional(),
  user: z.string().optional().describe("Who needs it, by role: an accountant on the invoices page."),
  behaviour: z.string().optional().describe("What they can do afterwards that they cannot today, and where in the app."),
  acceptance: z.string().optional().describe("One check a test could assert that proves it works."),
  assumptions: z.array(z.string()).optional().describe("Gaps you filled yourself, each stated in one line."),
});
export const setGoalTool = (i: z.infer<typeof setGoalSchema>) => view(change((r) => setGoal(r, i)));

export const setRoadmapSchema = z.object({ workOrderTitles: z.array(z.string().min(1)).min(1).max(12) });
export function setRoadmapTool(i: z.infer<typeof setRoadmapSchema>): ToolOutput {
  const r = change((road) => setRoadmap(road, i.workOrderTitles));
  if (!r.ok) return fail(r.error);
  const workOrders = (r.roadmap.backlog ?? []).map((w) => ({ id: w.id, title: w.title }));
  return done({ workOrders, next: "Call set_today with up to three of these ids." });
}

export const setTodaySchema = z.object({ workOrderIds: z.array(z.string()) });
export const setTodayTool = (i: z.infer<typeof setTodaySchema>) => view(change((r) => setToday(r, i.workOrderIds)));

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
    return { state: applied.state, value: view(applied.value) };
  });
}

export const advanceSchema = z.object({});
export const advanceStageTool = () => view(change((r) => advanceStage(r)));
