import { describe, expect, it } from "vitest";
import {
  advanceStage,
  completeWorkOrder,
  emptyRoadmap,
  setGoal,
  setRoadmap,
  setToday,
  trackView,
  unmetCriteria,
  updateWorkOrder,
  type RoadmapResult,
  type TrackRef,
} from "@/lib/roadmap";
import { MAX_TODAY, STAGES } from "@/lib/stages";
import type { Roadmap, WorkOrderStatus } from "@/lib/types";
import { pick, SEEDS, seeded } from "./random";

/** BobFormal.Roadmap.STAGE_COUNT and MAX_TODAY */
const STAGE_COUNT = 5;
const MODEL_MAX_TODAY = 3;

/** BobFormal.Roadmap.gateHolds, on one request's track. */
function gateHolds(t: Roadmap): boolean {
  const today = t.today;
  switch (t.stage) {
    case 1:
      return !!t.goal?.user && !!t.goal.behaviour && !!t.goal.acceptance;
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
const REQUESTS: TrackRef[] = ["req_a", "req_b", "req_c"].map((requestId) => ({ requestId, messageId: `msg_${requestId}` }));

/** One random roadmap call and the request whose track it works on (BobFormal.Roadmap.Op.req). */
function randomOp(r: Roadmap, rand: () => number): { name: string; req: string; result: RoadmapResult } {
  const ref = pick(rand, REQUESTS);
  const req = ref.requestId;
  const own = trackView(r, req);
  const choice = Math.floor(rand() * 7);
  if (choice === 0) {
    const testable = rand() < 0.6 ? { user: "Accountants", behaviour: "Export invoices as CSV", acceptance: "One row per invoice" } : { acceptance: rand() < 0.5 ? "" : null };
    return { name: "setGoal", req, result: setGoal(r, ref, { title: rand() < 0.2 ? " " : "Invoices export as CSV", ...testable }) };
  }
  if (choice === 1) return { name: "setRoadmap", req, result: setRoadmap(r, ref, ["Export", "Docs", "Tests", "Polish"].filter(() => rand() < 0.7)) };
  if (choice === 2) {
    const ids = [...own.today, ...(r.backlog ?? [])].filter(() => rand() < 0.5).map((w) => w.id);
    return { name: "setToday", req, result: setToday(r, ref, ids) };
  }
  if (choice === 3 && own.today.length > 0) {
    const id = pick(rand, own.today).id;
    return { name: "updateWorkOrder", req, result: updateWorkOrder(r, id, { status: pick(rand, STATUSES), artifactId: rand() < 0.5 ? "art_x" : null }) };
  }
  if (choice === 4 && own.today.length > 0) {
    return { name: "completeWorkOrder", req, result: completeWorkOrder(r, pick(rand, own.today).id, rand() < 0.7 ? "art_pr" : null) };
  }
  return { name: "advanceStage", req, result: advanceStage(r, req) };
}

const upTo = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
const tracked = (t: Roadmap) => ({ goal: t.goal, stage: t.stage, today: t.today });

describe("roadmap conforms to BobFormal.Roadmap", () => {
  it("has the stages and limits the model has", () => {
    expect(STAGES.length).toBe(STAGE_COUNT);
    expect(MAX_TODAY).toBe(MODEL_MAX_TODAY);
  });

  it.each(SEEDS)("random history over three requests %i: each track's gate matches the model, advances need it, no stage is skipped, other tracks stay put", (seed) => {
    const rand = seeded(seed);
    let r = emptyRoadmap();
    const left: Record<string, number[]> = Object.fromEntries(REQUESTS.map((q) => [q.requestId, []]));
    for (let step = 0; step < 300; step++) {
      for (const { requestId } of REQUESTS) expect(gateHolds(trackView(r, requestId))).toBe(unmetCriteria(r, requestId).length === 0);
      const { name, req, result } = randomOp(r, rand);
      const next = result.ok ? result.roadmap : r;
      for (const { requestId } of REQUESTS) {
        const before = trackView(r, requestId);
        const after = trackView(next, requestId);
        if (requestId !== req) {
          expect(tracked(after)).toEqual(tracked(before));
          continue;
        }
        if (after.stage !== before.stage) {
          expect(name).toBe("advanceStage");
          expect(after.stage).toBe(before.stage + 1);
          expect(gateHolds(before)).toBe(true);
          left[requestId].push(before.stage);
        }
        if (name === "advanceStage" && before.stage < STAGE_COUNT && gateHolds(before)) expect(after.stage).toBe(before.stage + 1);
      }
      r = next;
      for (const { requestId } of REQUESTS) {
        const t = trackView(r, requestId);
        expect(t.stage).toBeGreaterThanOrEqual(1);
        expect(t.stage).toBeLessThanOrEqual(STAGE_COUNT);
        expect(t.today.length).toBeLessThanOrEqual(MAX_TODAY);
        expect(left[requestId]).toEqual(upTo(t.stage - 1));
        const track = r.tracks?.find((x) => x.requestId === requestId);
        if (track) expect(track.gates.map((g) => g.done)).toEqual(upTo(STAGE_COUNT).map((i) => i < t.stage));
      }
    }
  });
});
