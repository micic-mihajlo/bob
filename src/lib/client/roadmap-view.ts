import type { Goal, RequestId, Roadmap, StageGate, WorkOrder, WorkOrderStatus } from "@/lib/types";

export type StepPhase = "done" | "current" | "next";

export interface RoadmapStep {
  gate: StageGate;
  phase: StepPhase;
}

/** One request's part of the roadmap: its goal, its stages, and its own work orders. */
export interface TrackView {
  key: string;
  /** The sentence the person typed, when the snapshot has it. */
  ask: string | null;
  goal: Goal | null;
  stage: number;
  stageTitle: string;
  gates: StageGate[];
  /** Its work orders scheduled for today. */
  today: WorkOrder[];
  /** Its work orders not yet scheduled. */
  backlog: WorkOrder[];
}

/**
 * The tracks to show, one per request still moving (or the one that finished last when every request
 * is finished), and the backlog no shown track owns. A roadmap saved before tracks shows as one track.
 */
export function trackViews(roadmap: Roadmap): { tracks: TrackView[]; backlog: WorkOrder[] } {
  const backlog = roadmap.backlog ?? [];
  const tracks = roadmap.tracks ?? [];
  if (tracks.length === 0) {
    const { goal, stage, stageTitle, gates, today } = roadmap;
    return { tracks: [{ key: "roadmap", ask: null, goal, stage, stageTitle, gates, today, backlog }], backlog: [] };
  }
  const active = tracks.filter((track) => track.stage < roadmap.totalStages);
  const shown = active.length > 0 ? active : [tracks.reduce((last, track) => (track.updatedAt >= last.updatedAt ? track : last))];
  const owns = (requestId: RequestId) => (order: WorkOrder) => order.requestId === requestId;
  return {
    tracks: shown.map((track) => ({
      key: track.requestId,
      ask: track.ask ?? null,
      goal: track.goal,
      stage: track.stage,
      stageTitle: track.stageTitle,
      gates: track.gates,
      today: roadmap.today.filter(owns(track.requestId)),
      backlog: backlog.filter(owns(track.requestId)),
    })),
    backlog: backlog.filter((order) => !shown.some((track) => order.requestId === track.requestId)),
  };
}

/** The stage the work is in: the gate of the track's stage, else the first one not done. */
export function currentStep(track: Pick<TrackView, "stage" | "gates">): number {
  const byStage = track.gates.findIndex((gate) => gate.stage === track.stage);
  return byStage >= 0 ? byStage : track.gates.findIndex((gate) => !gate.done);
}

/** One step per gate, in the roadmap panel's three phases. */
export function roadmapSteps(track: Pick<TrackView, "stage" | "gates">): RoadmapStep[] {
  const current = currentStep(track);
  return track.gates.map((gate, index) => ({
    gate,
    phase: gate.done ? "done" : index === current ? "current" : "next",
  }));
}

/** How far a track is: its finished work orders over every one it planned. */
export function workOrderProgress(track: { today: readonly WorkOrder[]; backlog?: readonly WorkOrder[] }): { done: number; total: number } {
  const orders = [...track.today, ...(track.backlog ?? [])];
  return { done: orders.filter((order) => order.status === "done").length, total: orders.length };
}

/**
 * A track's progress line. Once it reaches the last stage, the open work left in its backlog is follow-ups for the
 * next request, so it is counted apart instead of holding the bar short of done.
 */
export function trackProgress(track: TrackView, lastStage: number): { done: number; total: number; followUps: number } {
  if (track.stage < lastStage) return { ...workOrderProgress(track), followUps: 0 };
  return { ...workOrderProgress({ today: track.today }), followUps: track.backlog.filter((order) => order.status !== "done").length };
}

/** "For an accountant": the goal's user after "For", with a leading article in lower case. */
export function forUserLine(user: string): string {
  return `For ${user.replace(/^(A|An|The)\b/, (article) => article.toLowerCase())}`;
}

export function hasPlan(roadmap: Roadmap): boolean {
  return roadmap.goal !== null || roadmap.today.length > 0 || roadmap.gates.length > 0 || (roadmap.backlog?.length ?? 0) > 0;
}

export const WORK_ORDER_STATUS_LABEL: Readonly<Record<WorkOrderStatus, string>> = {
  open: "Open",
  running: "Running",
  review: "In review",
  done: "Done",
  stale: "Stale",
};
