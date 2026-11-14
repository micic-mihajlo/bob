import { describe, expect, it } from "vitest";
import { advanceStage, emptyRoadmap, setGoal, setRoadmap, setToday, completeWorkOrder } from "../roadmap";
import type { Roadmap } from "../types";

const unwrap = (r: { ok: true; roadmap: Roadmap } | { ok: false; error: string }): Roadmap => {
  if (!r.ok) throw new Error(r.error);
  return r.roadmap;
};

function planned(titles: string[]): Roadmap {
  return unwrap(setRoadmap(unwrap(setGoal(emptyRoadmap(), { title: "Ship exports" })), titles));
}

describe("roadmap rules", () => {
  it("refuses a fourth work order in today", () => {
    const road = planned(["a", "b", "c", "d"]);
    const ids = (road.backlog ?? []).map((w) => w.id);
    expect(setToday(road, ids).ok).toBe(false);
    const today = unwrap(setToday(road, ids.slice(0, 3)));
    expect(today.today).toHaveLength(3);
    expect(today.backlog?.map((w) => w.id)).toEqual([ids[3]]);
  });

  it("will not advance a stage until its exit criteria hold", () => {
    expect(advanceStage(emptyRoadmap()).ok).toBe(false);
    const spec = unwrap(advanceStage(planned(["a"])));
    expect(spec.stageTitle).toBe("Spec");
    expect(advanceStage(spec).ok).toBe(false);
    const id = (spec.backlog ?? [])[0].id;
    const build = unwrap(advanceStage(unwrap(setToday(spec, [id]))));
    expect(build.stageTitle).toBe("Build");
    expect(advanceStage(build).ok).toBe(false);
    const shipped = unwrap(advanceStage(unwrap(completeWorkOrder(build, id, null))));
    expect(shipped.stageTitle).toBe("Ship");
    expect(shipped.gates.filter((g) => g.done)).toHaveLength(3);
  });

  it("keeps stage and work when the goal is set again", () => {
    const spec = unwrap(advanceStage(planned(["a"])));
    const scheduled = unwrap(setToday(spec, [(spec.backlog ?? [])[0].id]));
    const renamed = unwrap(setGoal(scheduled, { title: "Ship exports and imports" }));
    expect(renamed.goal?.title).toBe("Ship exports and imports");
    expect(renamed.stage).toBe(scheduled.stage);
    expect(renamed.today).toEqual(scheduled.today);
  });
});
