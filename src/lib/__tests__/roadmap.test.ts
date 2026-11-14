import { describe, expect, it } from "vitest";
import { addSourcedOrder, advanceStage, completeWorkOrder, emptyRoadmap, setGoal, setRoadmap, setToday, trackOf, updateWorkOrder, withTracks, type GoalInput } from "../roadmap";
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

const A = { requestId: "req_a", messageId: "msg_a" };
const B = { requestId: "req_b", messageId: "msg_b" };

function planned(titles: string[], goal: GoalInput = TESTABLE, road: Roadmap = emptyRoadmap(), ref = A): Roadmap {
  return unwrap(setRoadmap(unwrap(setGoal(road, ref, goal)), ref, titles));
}

const own = (road: Roadmap, ref = A) => (road.backlog ?? []).filter((w) => w.requestId === ref.requestId);

/** Takes a request's first work order from Intent to Ship: planned, scheduled, a pull request, Build left. */
function atShip(road: Roadmap, ref = A): Roadmap {
  const spec = unwrap(advanceStage(road, ref.requestId));
  const [a] = own(spec, ref);
  const built = unwrap(updateWorkOrder(unwrap(setToday(spec, ref, [a.id])), a.id, { status: "review", artifactId: "art_pr" }));
  return unwrap(advanceStage(unwrap(advanceStage(built, ref.requestId)), ref.requestId));
}

describe("roadmap rules", () => {
  it("has the five software delivery stages", () => {
    expect(STAGES.map((s) => s.title)).toEqual(["Intent", "Spec", "Build", "Ship", "Learn"]);
    expect(emptyRoadmap().gates.map((g) => g.title)[0]).toBe("The request is testable");
  });

  it("refuses a fourth work order in a request's today", () => {
    const road = planned(["a", "b", "c", "d"]);
    const ids = (road.backlog ?? []).map((w) => w.id);
    expect(setToday(road, A, ids).ok).toBe(false);
    const today = unwrap(setToday(road, A, ids.slice(0, 3)));
    expect(today.today).toHaveLength(3);
    expect(today.backlog?.map((w) => w.id)).toEqual([ids[3]]);
  });

  it("keeps an inbox work order when set_roadmap repeats its title, instead of adding a copy without its source", () => {
    const source = { inboxId: "inb_1", kind: "meeting" as const, label: "customer call, Nov 13", quote: "Dana: a CSV export" };
    const { roadmap, order } = addSourcedOrder(emptyRoadmap(), "Export all invoices as a CSV", source);
    const planned = unwrap(setRoadmap(roadmap, A, ["export all invoices as a CSV.", "List overdue invoices"]));
    expect(planned.backlog?.map((w) => w.title)).toEqual(["Export all invoices as a CSV", "List overdue invoices"]);
    expect(planned.backlog?.[0]).toMatchObject({ id: order.id, source });
    const scheduled = unwrap(setToday(planned, A, [order.id]));
    expect(scheduled.today[0]).toMatchObject({ id: order.id, source, requestId: A.requestId });
  });

  it("completes a work order in review that set_today moved back to the backlog", () => {
    const road = planned(["a", "b"]);
    const [a, b] = (road.backlog ?? []).map((w) => w.id);
    const inReview = unwrap(updateWorkOrder(unwrap(setToday(road, A, [a])), a, { status: "review", artifactId: "art_pr" }));
    const moved = unwrap(setToday(inReview, A, [b]));
    expect(moved.backlog?.find((w) => w.id === a)?.status).toBe("review");
    const done = unwrap(completeWorkOrder(moved, a, "art_pr"));
    expect(done.backlog?.find((w) => w.id === a)).toMatchObject({ status: "done", artifactId: "art_pr" });
    expect(completeWorkOrder(moved, "wo_missing", null).ok).toBe(false);
  });

  it("keeps a request that is not testable in Intent and names what is missing", () => {
    const vague = unwrap(setGoal(emptyRoadmap(), A, { title: "Customers want CSV export" }));
    const refused = advanceStage(vague, A.requestId);
    expect(refused.ok ? null : refused.error).toMatch(/A named user; The behaviour they need; An acceptance check/);
    const partial = unwrap(setGoal(vague, A, { title: "CSV export", user: "Accountants", behaviour: "Export invoices" }));
    expect(advanceStage(partial, A.requestId).ok ? null : "refused").toBe("refused");
    expect(unwrap(advanceStage(unwrap(setGoal(partial, A, { title: "CSV export", acceptance: "One row per invoice" })), A.requestId)).stageTitle).toBe("Spec");
  });

  it("will not advance a stage until its exit criteria hold", () => {
    expect(advanceStage(emptyRoadmap(), A.requestId).ok).toBe(false);
    const spec = unwrap(advanceStage(planned(["a"]), A.requestId));
    expect(spec.stageTitle).toBe("Spec");
    expect(advanceStage(spec, A.requestId).ok).toBe(false);
    const id = (spec.backlog ?? [])[0].id;
    const build = unwrap(advanceStage(unwrap(setToday(spec, A, [id])), A.requestId));
    expect(build.stageTitle).toBe("Build");
    expect(advanceStage(build, A.requestId).ok).toBe(false);
    const inReview = unwrap(updateWorkOrder(build, id, { status: "review", artifactId: "art_pr" }));
    const ship = unwrap(advanceStage(inReview, A.requestId));
    expect(ship.stageTitle).toBe("Ship");
    expect(advanceStage(ship, A.requestId).ok).toBe(false);
    const learn = unwrap(advanceStage(unwrap(completeWorkOrder(ship, id, "art_pr")), A.requestId));
    expect(trackOf(learn, A.requestId)?.stageTitle).toBe("Learn");
    expect(learn.gates.filter((g) => g.done)).toHaveLength(4);
    expect(advanceStage(learn, A.requestId).ok).toBe(false);
  });

  it("keeps stage and work when the goal is set again", () => {
    const spec = unwrap(advanceStage(planned(["a"]), A.requestId));
    const scheduled = unwrap(setToday(spec, A, [(spec.backlog ?? [])[0].id]));
    const renamed = unwrap(setGoal(scheduled, A, { title: "Ship exports and imports" }));
    expect(renamed.goal?.title).toBe("Ship exports and imports");
    expect(renamed.goal?.acceptance).toBe(TESTABLE.acceptance);
    expect(renamed.stage).toBe(scheduled.stage);
    expect(renamed.today).toEqual(scheduled.today);
  });

  it("starts a new request on its own track at Intent and leaves a finished track at Learn", () => {
    const ship = atShip(planned(["a"]));
    const [a] = ship.today;
    const learn = unwrap(advanceStage(unwrap(completeWorkOrder(ship, a.id, "art_pr")), A.requestId));
    const next = unwrap(setGoal(learn, B, { title: "Import invoices", acceptance: "Imported rows match the file" }));
    expect(trackOf(next, A.requestId)).toMatchObject({ stageTitle: "Learn", goal: { title: TESTABLE.title } });
    expect(trackOf(next, B.requestId)).toMatchObject({ stageTitle: "Intent", messageId: B.messageId, goal: { title: "Import invoices", user: null } });
    expect(next).toMatchObject({ stageTitle: "Intent", goal: { title: "Import invoices" } });
  });

  it("moves a second request forward while the first waits at Ship, each on its own gates and work orders", () => {
    const first = atShip(planned(["Overdue invoices"]));
    const both = planned(["CSV export"], { ...TESTABLE, title: "CSV export" }, first, B);
    expect(advanceStage(both, A.requestId).ok).toBe(false);
    const spec = unwrap(advanceStage(both, B.requestId));
    expect(trackOf(spec, B.requestId)?.stageTitle).toBe("Spec");
    expect(advanceStage(spec, B.requestId).ok).toBe(false);
    const [csv] = own(spec, B);
    const build = unwrap(advanceStage(unwrap(setToday(spec, B, [csv.id])), B.requestId));
    expect(build.today.map((w) => [w.title, w.requestId])).toEqual([["Overdue invoices", A.requestId], ["CSV export", B.requestId]]);
    expect(trackOf(build, A.requestId)?.stageTitle).toBe("Ship");
    expect(trackOf(build, B.requestId)?.stageTitle).toBe("Build");
    expect(setToday(build, B, [build.today[0].id]).ok).toBe(false);
    const merged = unwrap(completeWorkOrder(build, build.today[0].id, "art_pr"));
    expect(trackOf(unwrap(advanceStage(merged, A.requestId)), A.requestId)?.stageTitle).toBe("Learn");
    expect(trackOf(merged, B.requestId)?.stageTitle).toBe("Build");
  });

  it("keeps each request's planned work when another request plans", () => {
    const first = planned(["Overdue invoices", "Docs"]);
    const both = planned(["CSV export"], TESTABLE, first, B);
    expect(both.backlog?.map((w) => [w.title, w.requestId])).toEqual([["Overdue invoices", A.requestId], ["Docs", A.requestId], ["CSV export", B.requestId]]);
  });

  it("turns a roadmap saved before tracks into one track at its stage", () => {
    const { tracks: _, ...old } = unwrap(advanceStage(planned(["a"]), A.requestId));
    const legacy = { ...old, today: old.today.map(({ requestId: __, ...w }) => w) } as Roadmap;
    const migrated = withTracks(legacy, "req_old");
    expect(migrated.tracks).toMatchObject([{ requestId: "req_old", stage: 2, goal: { title: TESTABLE.title } }]);
  });
});
