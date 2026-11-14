import { describe, expect, it } from "vitest";
import {
  advanceStage,
  completeWorkOrder,
  emptyRoadmap,
  setGoal,
  setRoadmap,
  setToday,
  unmetCriteria,
  updateWorkOrder,
  type RoadmapResult,
} from "@/lib/roadmap";
import { MAX_TODAY, STAGES } from "@/lib/stages";
import type { Roadmap, WorkOrderStatus } from "@/lib/types";
import { pick, SEEDS, seeded } from "./random";

/** BobFormal.Roadmap.STAGE_COUNT and MAX_TODAY */
const STAGE_COUNT = 5;
const MODEL_MAX_TODAY = 3;

/** BobFormal.Roadmap.gateHolds */
function gateHolds(r: Roadmap): boolean {
  const today = r.today;
  switch (r.stage) {
    case 1:
      return !!r.goal?.user && !!r.goal.behaviour && !!r.goal.acceptance;
    case 2:
      return today.some((w) => w.status !== "done");
    case 3:
      return today.length > 0 && today.every((w) => w.status === "done" || w.artifactId !== null);
    case 4:
      return today.length > 0 && today.every((w) => w.status === "done");
    default:
      return true;
  }
}

const STATUSES: WorkOrderStatus[] = ["open", "running", "review", "done", "stale"];

function randomOp(r: Roadmap, rand: () => number): { name: string; result: RoadmapResult } {
  const pool = [...r.today, ...(r.backlog ?? [])];
  const choice = Math.floor(rand() * 7);
  if (choice === 0) {
    const testable = rand() < 0.6 ? { user: "Accountants", behaviour: "Export invoices as CSV", acceptance: "One row per invoice" } : { acceptance: rand() < 0.5 ? "" : null };
    return { name: "setGoal", result: setGoal(r, { title: rand() < 0.2 ? " " : "Invoices export as CSV", ...testable }) };
  }
  if (choice === 1) return { name: "setRoadmap", result: setRoadmap(r, ["Export", "Docs", "Tests", "Polish"].filter(() => rand() < 0.7)) };
  if (choice === 2) {
    const ids = pool.filter(() => rand() < 0.5).map((w) => w.id);
    return { name: "setToday", result: setToday(r, ids) };
  }
  if (choice === 3 && r.today.length > 0) {
    const id = pick(rand, r.today).id;
    return { name: "updateWorkOrder", result: updateWorkOrder(r, id, { status: pick(rand, STATUSES), artifactId: rand() < 0.5 ? "art_x" : null }) };
  }
  if (choice === 4 && r.today.length > 0) {
    return { name: "completeWorkOrder", result: completeWorkOrder(r, pick(rand, r.today).id, rand() < 0.7 ? "art_pr" : null) };
  }
  return { name: "advanceStage", result: advanceStage(r) };
}

const upTo = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe("roadmap conforms to BobFormal.Roadmap", () => {
  it("has the stages and limits the model has", () => {
    expect(STAGES.length).toBe(STAGE_COUNT);
    expect(MAX_TODAY).toBe(MODEL_MAX_TODAY);
  });

  it.each(SEEDS)("random roadmap history %i: gates match the model, advances need them, no stage is skipped", (seed) => {
    const rand = seeded(seed);
    let r = emptyRoadmap();
    const left: number[] = [];
    for (let step = 0; step < 200; step++) {
      expect(gateHolds(r)).toBe(unmetCriteria(r).length === 0);
      const { name, result } = randomOp(r, rand);
      const next = result.ok ? result.roadmap : r;
      if (next.stage !== r.stage) {
        expect(name).toBe("advanceStage");
        expect(next.stage).toBe(r.stage + 1);
        expect(gateHolds(r)).toBe(true);
        left.push(r.stage);
      }
      if (name === "advanceStage" && r.stage < STAGE_COUNT && gateHolds(r)) expect(next.stage).toBe(r.stage + 1);
      r = next;
      expect(r.stage).toBeGreaterThanOrEqual(1);
      expect(r.stage).toBeLessThanOrEqual(STAGE_COUNT);
      expect(r.today.length).toBeLessThanOrEqual(MAX_TODAY);
      expect(left).toEqual(upTo(r.stage - 1));
      expect(r.gates.map((g) => g.done)).toEqual(upTo(STAGE_COUNT).map((i) => i < r.stage));
    }
  });
});
