import type { Roadmap, StageGate, WorkOrder, WorkOrderStatus } from "@/lib/types";

export type StepPhase = "done" | "current" | "next";

export interface RoadmapStep {
  gate: StageGate;
  phase: StepPhase;
}

/** The stage the work is in: the gate of the roadmap's stage, else the first one not done. */
export function currentStep(roadmap: Roadmap): number {
  const byStage = roadmap.gates.findIndex((gate) => gate.stage === roadmap.stage);
  return byStage >= 0 ? byStage : roadmap.gates.findIndex((gate) => !gate.done);
}

/** One step per gate, in the roadmap panel's three phases. */
export function roadmapSteps(roadmap: Roadmap): RoadmapStep[] {
  const current = currentStep(roadmap);
  return roadmap.gates.map((gate, index) => ({
    gate,
    phase: gate.done ? "done" : index === current ? "current" : "next",
  }));
}

/** How far the goal is: finished work orders over every planned one. */
export function workOrderProgress(roadmap: Roadmap): { done: number; total: number } {
  const orders: WorkOrder[] = [...roadmap.today, ...(roadmap.backlog ?? [])];
  return { done: orders.filter((order) => order.status === "done").length, total: orders.length };
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
