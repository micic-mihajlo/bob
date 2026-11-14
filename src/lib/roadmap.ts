import { newId, nowIso } from "./ids";
import { MAX_TODAY, STAGES } from "./stages";
import type { Goal, Roadmap, Track, WorkOrder, WorkOrderSource, WorkOrderStatus } from "./types";

export type RoadmapResult = { ok: true; roadmap: Roadmap } | { ok: false; error: string };

/** Which request's track a call works on, and the message the person typed to start that request. */
export interface TrackRef {
  requestId: string;
  messageId?: string | null;
}

const fail = (error: string): RoadmapResult => ({ ok: false, error });

const gatesAt = (stage: number) => STAGES.map((s, i) => ({ stage: i + 1, title: s.gateTitle, done: i + 1 < stage }));

export const tracksOf = (r: Roadmap): Track[] => r.tracks ?? [];

export const trackOf = (r: Roadmap, requestId: string): Track | undefined => tracksOf(r).find((t) => t.requestId === requestId);

export const isFinished = (t: Track) => t.stage >= STAGES.length;

/** The track views that show one track follow: the newest unfinished one, else the newest. */
export function focusTrack(r: Roadmap): Track | null {
  const tracks = tracksOf(r);
  return [...tracks].reverse().find((t) => !isFinished(t)) ?? tracks.at(-1) ?? null;
}

/** The goal of a request's track, or the focus track's when the request has none. */
export const goalOf = (r: Roadmap, requestId: string | null | undefined) => (requestId ? trackOf(r, requestId)?.goal : null) ?? r.goal;

/** A track's own work orders, from today and the backlog. */
export const ordersOf = (r: Roadmap, requestId: string) => ({
  today: r.today.filter((w) => w.requestId === requestId),
  backlog: (r.backlog ?? []).filter((w) => w.requestId === requestId),
});

/**
 * One track seen as a single roadmap: its goal, its stage and its own work orders. The stage criteria read
 * this, so each track's gates look only at its own work.
 */
export function trackView(r: Roadmap, requestId: string): Roadmap {
  const t = trackOf(r, requestId);
  const stage = t?.stage ?? 1;
  return {
    ...r,
    goal: t?.goal ?? null,
    stage,
    stageTitle: STAGES[stage - 1].title,
    gates: gatesAt(stage),
    ...ordersOf(r, requestId),
  };
}

/** Recomputes the fields that depend on a stage, so callers never set them by hand. */
function finalize(r: Roadmap, at: string): RoadmapResult {
  const tracks = tracksOf(r).map((t) => ({ ...t, stageTitle: STAGES[t.stage - 1].title, gates: gatesAt(t.stage) }));
  const focus = focusTrack({ ...r, tracks });
  const stage = focus?.stage ?? 1;
  return {
    ok: true,
    roadmap: {
      ...r,
      goal: focus?.goal ?? null,
      stage,
      stageTitle: STAGES[stage - 1].title,
      totalStages: STAGES.length,
      gates: gatesAt(stage),
      tracks,
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
    tracks: [],
    updatedAt: at,
  };
  const done = finalize(base, at);
  return done.ok ? done.roadmap : base;
}

/** The roadmap with a track for the request, a new one starting at Intent when the request has none yet. */
export function withTrack(r: Roadmap, ref: TrackRef, at: string = nowIso()): Roadmap {
  if (trackOf(r, ref.requestId)) return r;
  const track: Track = { requestId: ref.requestId, messageId: ref.messageId ?? null, goal: null, stage: 1, stageTitle: "", gates: [], startedAt: at, updatedAt: at };
  return { ...r, tracks: [...tracksOf(r), track] };
}

const patchTrack = (r: Roadmap, requestId: string, patch: Partial<Track>, at: string): Roadmap => ({
  ...r,
  tracks: tracksOf(r).map((t) => (t.requestId === requestId ? { ...t, ...patch, updatedAt: at } : t)),
});

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
 * Records a request's intent on its own track. Setting it again renames or sharpens it and keeps the track's
 * stage and work, so setting it twice loses no progress. A part left out keeps its earlier value.
 */
export function setGoal(r: Roadmap, ref: TrackRef, input: GoalInput, at: string = nowIso()): RoadmapResult {
  const title = input.title.trim();
  if (!title) return fail("A goal needs a title. Call set_goal again with a short title.");
  const road = withTrack(r, ref, at);
  const prior = trackOf(road, ref.requestId)?.goal ?? null;
  const pick = (key: "why" | "deadline" | "user" | "behaviour" | "acceptance") =>
    input[key] !== undefined ? clean(input[key]) : (prior?.[key] ?? null);
  const assumptions = (input.assumptions ?? prior?.assumptions ?? []).map((a) => a.trim()).filter(Boolean);
  const goal: Goal = {
    title,
    why: pick("why"),
    deadline: pick("deadline"),
    user: pick("user"),
    behaviour: pick("behaviour"),
    acceptance: pick("acceptance"),
    assumptions,
  };
  return finalize(patchTrack(road, ref.requestId, { goal }, at), at);
}

const newOrder = (title: string, requestId?: string): WorkOrder => ({
  id: newId("wo"),
  title,
  status: "open",
  ownerAgentId: null,
  artifactId: null,
  ...(requestId ? { requestId } : {}),
});

const sameTitle = (a: string) => a.toLowerCase().replace(/[\s.]+/g, " ").trim();

/**
 * Replaces the request's planned (not yet scheduled) work. Today is left alone, and so is everything in the
 * backlog that is not this request's own: other requests' plans and work orders that came from the inbox. A
 * title that repeats one of those keeps that order instead of adding a copy.
 */
export function setRoadmap(r: Roadmap, ref: TrackRef, titles: string[], at: string = nowIso()): RoadmapResult {
  const clean = titles.map((t) => t.trim()).filter(Boolean);
  if (clean.length === 0) return fail("Give at least one work order title in workOrderTitles.");
  const road = withTrack(r, ref, at);
  const kept = (road.backlog ?? []).filter((w) => w.source || w.requestId !== ref.requestId);
  const fresh = clean.filter((t) => !kept.some((w) => sameTitle(w.title) === sameTitle(t)));
  return finalize({ ...road, backlog: [...kept, ...fresh.map((t) => newOrder(t, ref.requestId))] }, at);
}

/** Adds one work order to the backlog, quoting where it came from. It joins a track when a request schedules it. */
export function addSourcedOrder(r: Roadmap, title: string, source: WorkOrderSource, at: string = nowIso()): { roadmap: Roadmap; order: WorkOrder } {
  const order = { ...newOrder(title), source };
  const result = finalize({ ...r, backlog: [...(r.backlog ?? []), order] }, at);
  return { roadmap: result.ok ? result.roadmap : r, order };
}

/**
 * Picks the request's work for today by id, from its own today and the backlog. A backlog order picked here joins
 * this request's track. Unpicked open work of this request goes back to the backlog; other requests' today stays.
 */
export function setToday(r: Roadmap, ref: TrackRef, ids: string[], at: string = nowIso()): RoadmapResult {
  const wanted = [...new Set(ids)];
  if (wanted.length > MAX_TODAY) {
    return fail(`At most ${MAX_TODAY} work orders fit in a request's today. Pick ${MAX_TODAY} or fewer ids.`);
  }
  const road = withTrack(r, ref, at);
  const others = road.today.filter((w) => w.requestId !== ref.requestId);
  const taken = wanted.filter((id) => others.some((w) => w.id === id));
  if (taken.length > 0) return fail(`Work order ${taken.join(", ")} is in another request's today. Pick this request's own work orders.`);
  const pool = [...ordersOf(road, ref.requestId).today, ...(road.backlog ?? [])];
  const unknown = wanted.filter((id) => !pool.some((w) => w.id === id));
  if (unknown.length > 0) {
    return fail(`Unknown work order: ${unknown.join(", ")}. Use ids returned by set_roadmap or shown in the roadmap.`);
  }
  const today = wanted.map((id) => ({ ...(pool.find((w) => w.id === id) as WorkOrder), requestId: ref.requestId }));
  const backlog = pool.filter((w) => !wanted.includes(w.id) && w.status !== "done");
  return finalize({ ...road, today: [...others, ...today], backlog }, at);
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

/** The unmet criteria of a request's track at its current stage, or of the focus track when no request is named. */
export function unmetCriteria(r: Roadmap, requestId?: string): string[] {
  const view = trackView(r, requestId ?? focusTrack(r)?.requestId ?? "");
  return (STAGES[view.stage - 1]?.criteria ?? []).filter((c) => !c.met(view)).map((c) => c.label);
}

/** Moves one request's track one stage forward, only when that track's gate holds. Other tracks stay where they are. */
export function advanceStage(r: Roadmap, requestId: string, at: string = nowIso()): RoadmapResult {
  const track = trackOf(r, requestId);
  if (!track) return fail("This request has no track yet. Record its intent with set_goal first.");
  if (isFinished(track)) return fail("This request's track is already at its last stage. Nothing to advance.");
  const unmet = unmetCriteria(r, requestId);
  if (unmet.length > 0) {
    const title = STAGES[track.stage - 1].title;
    return fail(`Cannot leave ${title} yet. First make these true: ${unmet.join("; ")}.`);
  }
  return finalize(patchTrack(r, requestId, { stage: track.stage + 1 }, at), at);
}

/** Fills tracks into a roadmap saved before they existed: its one goal and stage become one track. */
export function withTracks(r: Roadmap, requestId: string | null): Roadmap {
  if (r.tracks) return r;
  if (!r.goal || !requestId) return { ...r, tracks: [] };
  const track: Track = { requestId, messageId: null, goal: r.goal, stage: r.stage, stageTitle: r.stageTitle, gates: r.gates, startedAt: r.updatedAt, updatedAt: r.updatedAt };
  const tag = (w: WorkOrder) => (w.requestId || w.source ? w : { ...w, requestId });
  return { ...r, tracks: [track], today: r.today.map(tag) };
}
