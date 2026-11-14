import { describe, expect, it } from "vitest";
import { advanceStage, completeWorkOrder, emptyRoadmap, setGoal, setRoadmap, setToday, updateWorkOrder, type GoalInput } from "../roadmap";
import { STAGES } from "../stages";
import type { Roadmap } from "../types";

const unwrap = (r: { ok: true; roadmap: Roadmap } | { ok: false; error: string }): Roadmap => {
  if (!r.ok) throw new Error(r.error);
  return r.roadmap;
};

const TESTABLE: GoalInput = {
  title: "Ship exports",
  user: "Accountants on the invoices page",
  behaviour: "Download every invoice as a CSV file",
  acceptance: "The file has a header row and one row per invoice",
};

function planned(titles: string[], goal: GoalInput = TESTABLE): Roadmap {
  return unwrap(setRoadmap(unwrap(setGoal(emptyRoadmap(), goal)), titles));
}

describe("roadmap rules", () => {
  it("has the five software delivery stages", () => {
    expect(STAGES.map((s) => s.title)).toEqual(["Intent", "Spec", "Build", "Ship", "Learn"]);
    expect(emptyRoadmap().gates.map((g) => g.title)[0]).toBe("The request is testable");
  });

  it("refuses a fourth work order in today", () => {
    const road = planned(["a", "b", "c", "d"]);
    const ids = (road.backlog ?? []).map((w) => w.id);
    expect(setToday(road, ids).ok).toBe(false);
    const today = unwrap(setToday(road, ids.slice(0, 3)));
    expect(today.today).toHaveLength(3);
    expect(today.backlog?.map((w) => w.id)).toEqual([ids[3]]);
  });

  it("keeps a request that is not testable in Intent and names what is missing", () => {
    const vague = unwrap(setGoal(emptyRoadmap(), { title: "Customers want CSV export" }));
    const refused = advanceStage(vague);
    expect(refused.ok ? null : refused.error).toMatch(/A named user; The behaviour they need; An acceptance check/);
    const partial = unwrap(setGoal(vague, { title: "CSV export", user: "Accountants", behaviour: "Export invoices" }));
    expect(advanceStage(partial).ok ? null : "refused").toBe("refused");
    expect(unwrap(advanceStage(unwrap(setGoal(partial, { title: "CSV export", acceptance: "One row per invoice" })))).stageTitle).toBe("Spec");
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
    const inReview = unwrap(updateWorkOrder(build, id, { status: "review", artifactId: "art_pr" }));
    const ship = unwrap(advanceStage(inReview));
    expect(ship.stageTitle).toBe("Ship");
    expect(advanceStage(ship).ok).toBe(false);
    const learn = unwrap(advanceStage(unwrap(completeWorkOrder(ship, id, "art_pr"))));
    expect(learn.stageTitle).toBe("Learn");
    expect(learn.gates.filter((g) => g.done)).toHaveLength(4);
    expect(advanceStage(learn).ok).toBe(false);
  });

  it("keeps stage and work when the goal is set again", () => {
    const spec = unwrap(advanceStage(planned(["a"])));
    const scheduled = unwrap(setToday(spec, [(spec.backlog ?? [])[0].id]));
    const renamed = unwrap(setGoal(scheduled, { title: "Ship exports and imports" }));
    expect(renamed.goal?.title).toBe("Ship exports and imports");
    expect(renamed.goal?.acceptance).toBe(TESTABLE.acceptance);
    expect(renamed.stage).toBe(scheduled.stage);
    expect(renamed.today).toEqual(scheduled.today);
  });

  it("never goes back a stage when a new intent is recorded", () => {
    const spec = unwrap(advanceStage(planned(["a"])));
    const [a] = spec.backlog ?? [];
    const built = unwrap(updateWorkOrder(unwrap(setToday(spec, [a.id])), a.id, { status: "review", artifactId: "art_pr" }));
    const learn = unwrap(advanceStage(unwrap(completeWorkOrder(unwrap(advanceStage(unwrap(advanceStage(built)))), a.id, "art_pr"))));
    const next = unwrap(setGoal(learn, { title: "Import invoices", acceptance: "Imported rows match the file" }));
    expect(next.stageTitle).toBe("Learn");
    expect(next.goal).toMatchObject({ title: "Import invoices", user: TESTABLE.user, acceptance: "Imported rows match the file" });
  });
});
