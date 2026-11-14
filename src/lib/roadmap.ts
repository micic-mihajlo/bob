import { newId, nowIso } from "./ids";
import { MAX_TODAY, STAGES } from "./stages";
import type { Roadmap, WorkOrder, WorkOrderSource, WorkOrderStatus } from "./types";

export type RoadmapResult = { ok: true; roadmap: Roadmap } | { ok: false; error: string };

const fail = (error: string): RoadmapResult => ({ ok: false, error });

/** Recomputes the fields that depend on `stage`, so callers never set them by hand. */
function finalize(r: Roadmap, at: string): RoadmapResult {
  const stage = STAGES[r.stage - 1];
  return {
    ok: true,
    roadmap: {
      ...r,
      stageTitle: stage.title,
      totalStages: STAGES.length,
      gates: STAGES.map((s, i) => ({ stage: i + 1, title: s.gateTitle, done: i + 1 < r.stage })),
      updatedAt: at,
    },
  };
}

export function emptyRoadmap(at: string = nowIso()): Roadmap {
  const base: Roadmap = {
    goal: null,
    stage: 1,
    stageTitle: "",
    totalStages: STAGES.length,
    gates: [],
    today: [],
    backlog: [],
    updatedAt: at,
  };
  const done = finalize(base, at);
  return done.ok ? done.roadmap : base;
}

export interface GoalInput {
  title: string;
  why?: string | null;
  deadline?: string | null;
  /** Who needs it, by role. */
  user?: string | null;
  /** What they can do afterwards, and where. */
  behaviour?: string | null;
  /** One check a test could assert. */
  acceptance?: string | null;
  /** Gaps the captain filled itself, stated so the person can correct them. */
  assumptions?: string[];
}

const clean = (value: string | null | undefined) => value?.trim() || null;

/**
 * Records the request's intent. Setting it again renames or sharpens it and keeps stage, today and
 * backlog, so setting it twice loses no progress. A part left out keeps its earlier value.
 */
export function setGoal(r: Roadmap, input: GoalInput, at: string = nowIso()): RoadmapResult {
  const title = input.title.trim();
  if (!title) return fail("A goal needs a title. Call set_goal again with a short title.");
  const prior = r.goal;
  const pick = (key: "why" | "deadline" | "user" | "behaviour" | "acceptance") =>
    input[key] !== undefined ? clean(input[key]) : (prior?.[key] ?? null);
  const assumptions = (input.assumptions ?? prior?.assumptions ?? []).map((a) => a.trim()).filter(Boolean);
  const goal = {
    title,
    why: pick("why"),
    deadline: pick("deadline"),
    user: pick("user"),
    behaviour: pick("behaviour"),
    acceptance: pick("acceptance"),
    assumptions,
  };
  return finalize({ ...r, goal }, at);
}

const newOrder = (title: string): WorkOrder => ({
  id: newId("wo"),
  title,
  status: "open",
  ownerAgentId: null,
  artifactId: null,
});

const sameTitle = (a: string) => a.toLowerCase().replace(/[\s.]+/g, " ").trim();

/**
 * Replaces the planned (not yet scheduled) work. Today is left alone, and so are work orders that came from the
 * inbox: a title that repeats one of them keeps that order instead of adding a copy without its source.
 */
export function setRoadmap(r: Roadmap, titles: string[], at: string = nowIso()): RoadmapResult {
  const clean = titles.map((t) => t.trim()).filter(Boolean);
  if (clean.length === 0) return fail("Give at least one work order title in workOrderTitles.");
  const fromInbox = (r.backlog ?? []).filter((w) => w.source);
  const fresh = clean.filter((t) => !fromInbox.some((w) => sameTitle(w.title) === sameTitle(t)));
  return finalize({ ...r, backlog: [...fromInbox, ...fresh.map(newOrder)] }, at);
}

/** Adds one work order to the backlog, quoting where it came from. */
export function addSourcedOrder(r: Roadmap, title: string, source: WorkOrderSource, at: string = nowIso()): { roadmap: Roadmap; order: WorkOrder } {
  const order = { ...newOrder(title), source };
  const result = finalize({ ...r, backlog: [...(r.backlog ?? []), order] }, at);
  return { roadmap: result.ok ? result.roadmap : r, order };
}

/** Picks today's work by id from today and the backlog. Unpicked open work goes back to the backlog. */
export function setToday(r: Roadmap, ids: string[], at: string = nowIso()): RoadmapResult {
  const wanted = [...new Set(ids)];
  if (wanted.length > MAX_TODAY) {
    return fail(`At most ${MAX_TODAY} work orders fit in today. Pick ${MAX_TODAY} or fewer ids.`);
  }
  const pool = [...r.today, ...(r.backlog ?? [])];
  const unknown = wanted.filter((id) => !pool.some((w) => w.id === id));
  if (unknown.length > 0) {
    return fail(`Unknown work order: ${unknown.join(", ")}. Use ids returned by set_roadmap or shown in the roadmap.`);
  }
  const today = wanted.map((id) => pool.find((w) => w.id === id) as WorkOrder);
  const backlog = pool.filter((w) => !wanted.includes(w.id) && w.status !== "done");
  return finalize({ ...r, today, backlog }, at);
}

export interface WorkOrderPatch {
  ownerAgentId?: string | null;
  status?: WorkOrderStatus;
  artifactId?: string | null;
}

export function updateWorkOrder(r: Roadmap, id: string, patch: WorkOrderPatch, at: string = nowIso()): RoadmapResult {
  if (!r.today.some((w) => w.id === id)) {
    return fail(`Work order ${id} is not in today. Call set_today to schedule it first.`);
  }
  return finalize({ ...r, today: r.today.map((w) => (w.id === id ? { ...w, ...patch } : w)) }, at);
}

/** Completes a work order wherever it is: set_today may have moved in-flight work back to the backlog before its PR merged. */
export function completeWorkOrder(r: Roadmap, id: string, artifactId: string | null, at: string = nowIso()): RoadmapResult {
  const patch: WorkOrderPatch = artifactId ? { status: "done", artifactId } : { status: "done" };
  if (r.today.some((w) => w.id === id) || !(r.backlog ?? []).some((w) => w.id === id)) return updateWorkOrder(r, id, patch, at);
  return finalize({ ...r, backlog: (r.backlog ?? []).map((w) => (w.id === id ? { ...w, ...patch } : w)) }, at);
}

export function unmetCriteria(r: Roadmap): string[] {
  return (STAGES[r.stage - 1]?.criteria ?? []).filter((c) => !c.met(r)).map((c) => c.label);
}

export function advanceStage(r: Roadmap, at: string = nowIso()): RoadmapResult {
  if (r.stage >= STAGES.length) return fail("The roadmap is already at its last stage. Nothing to advance.");
  const unmet = unmetCriteria(r);
  if (unmet.length > 0) {
    const title = STAGES[r.stage - 1].title;
    return fail(`Cannot leave ${title} yet. First make these true: ${unmet.join("; ")}.`);
  }
  return finalize({ ...r, stage: r.stage + 1 }, at);
}
