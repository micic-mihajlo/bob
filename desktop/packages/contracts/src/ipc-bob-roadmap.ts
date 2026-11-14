import { type DynamicRecord, isBoolean, isDynamicRecord, isNumber, isString } from "./runtime-values";

/**
 * Where an Bob founder is on the way to their MRR goal. The BobAgent Worker in `apps/cloud` owns it;
 * main reads it from `GET {BOB_URL}/agents/bob-agent/{user}/roadmap`, and a ticked task goes to
 * `POST .../tasks/{id}/done`, which answers the new roadmap.
 */
export interface BobRoadmap {
  goal: BobRoadmapGoal | null;
  /** The stage of the framework, such as 2 of 6. `index` starts at 1. */
  stage: { index: number; total: number; title: string; lesson?: string };
  /** One per stage, in order, each with the planned tasks of its stage once Bob has laid out the roadmap. */
  milestones: BobRoadmapMilestone[];
  /** At most 3. */
  today: BobRoadmapTask[];
  /** The weekly blocks of recurring work. Bob also puts each one on the Schedule as a routine. */
  rhythm?: BobRoadmapRhythm[];
  /** The current monthly recurring revenue in US dollars. The name predates MRR. */
  earnedUsd: number;
  /** ISO 8601. */
  updatedAt: string;
}

export interface BobRoadmapMilestone {
  id: string;
  title: string;
  done: boolean;
  /** The stage this milestone ends. */
  stage?: number;
  tasks?: { title: string; minutes?: number; done: boolean }[];
}

export interface BobRoadmapRhythm {
  title: string;
  /** In words, such as "Tue and Thu 08:00". */
  when: string;
  minutes?: number;
}

export interface BobRoadmapGoal {
  title: string;
  why?: string;
  /** The MRR target. */
  targetUsd: number;
  /** YYYY-MM-DD. */
  deadline?: string;
}

export interface BobRoadmapTask {
  id: string;
  title: string;
  minutes?: number;
  /** ISO 8601. */
  due?: string;
  done: boolean;
}

/** An optional field. The Worker can send it as null or leave it out; both leave it out. */
function optional<Value>(
  record: DynamicRecord,
  key: string,
  guard: (value: unknown) => value is Value,
): { ok: boolean; value?: Value } {
  const value = record[key];
  if (value === undefined || value === null) return { ok: true };
  return guard(value) ? { ok: true, value } : { ok: false };
}

function parseGoal(value: unknown): BobRoadmapGoal | null | undefined {
  if (value === null || value === undefined) return null;
  if (!isDynamicRecord(value) || !isString(value.title) || !isNumber(value.targetUsd)) return undefined;
  const why = optional(value, "why", isString);
  const deadline = optional(value, "deadline", isString);
  if (!why.ok || !deadline.ok) return undefined;
  return {
    title: value.title,
    targetUsd: value.targetUsd,
    ...(why.value === undefined ? {} : { why: why.value }),
    ...(deadline.value === undefined ? {} : { deadline: deadline.value }),
  };
}

function parseTask(value: unknown): BobRoadmapTask | undefined {
  if (!isDynamicRecord(value) || !isString(value.id) || !isString(value.title) || !isBoolean(value.done)) {
    return undefined;
  }
  const minutes = optional(value, "minutes", isNumber);
  const due = optional(value, "due", isString);
  if (!minutes.ok || !due.ok) return undefined;
  return {
    id: value.id,
    title: value.title,
    done: value.done,
    ...(minutes.value === undefined ? {} : { minutes: minutes.value }),
    ...(due.value === undefined ? {} : { due: due.value }),
  };
}

function parseMilestone(value: unknown): BobRoadmapMilestone | undefined {
  if (!isDynamicRecord(value) || !isString(value.id) || !isString(value.title) || !isBoolean(value.done)) {
    return undefined;
  }
  const stage = optional(value, "stage", isNumber);
  if (!stage.ok) return undefined;
  let tasks: BobRoadmapMilestone["tasks"];
  if (value.tasks !== undefined && value.tasks !== null) {
    if (!Array.isArray(value.tasks)) return undefined;
    tasks = [];
    for (const item of value.tasks) {
      if (!isDynamicRecord(item) || !isString(item.title) || !isBoolean(item.done)) return undefined;
      const minutes = optional(item, "minutes", isNumber);
      if (!minutes.ok) return undefined;
      tasks.push({
        title: item.title,
        done: item.done,
        ...(minutes.value === undefined ? {} : { minutes: minutes.value }),
      });
    }
  }
  return {
    id: value.id,
    title: value.title,
    done: value.done,
    ...(stage.value === undefined ? {} : { stage: stage.value }),
    ...(tasks === undefined ? {} : { tasks }),
  };
}

function parseRhythm(value: unknown): BobRoadmapRhythm | undefined {
  if (!isDynamicRecord(value) || !isString(value.title) || !isString(value.when)) return undefined;
  const minutes = optional(value, "minutes", isNumber);
  if (!minutes.ok) return undefined;
  return { title: value.title, when: value.when, ...(minutes.value === undefined ? {} : { minutes: minutes.value }) };
}

/** Reads a roadmap that the Worker or main sent. Answers null when the value is not a roadmap. */
export function parseBobRoadmap(value: unknown): BobRoadmap | null {
  if (!isDynamicRecord(value) || !isDynamicRecord(value.stage) || !Array.isArray(value.milestones)) return null;
  if (!Array.isArray(value.today) || !isNumber(value.earnedUsd) || !isString(value.updatedAt)) return null;
  const goal = parseGoal(value.goal);
  const { stage } = value;
  if (goal === undefined || !isNumber(stage.index) || !isNumber(stage.total) || !isString(stage.title)) return null;
  const lesson = optional(stage, "lesson", isString);
  if (!lesson.ok) return null;
  const milestones: BobRoadmapMilestone[] = [];
  for (const item of value.milestones) {
    const milestone = parseMilestone(item);
    if (!milestone) return null;
    milestones.push(milestone);
  }
  // A Worker from before the roadmap plan sends no rhythm.
  const rhythm: BobRoadmapRhythm[] = [];
  if (value.rhythm !== undefined && value.rhythm !== null) {
    if (!Array.isArray(value.rhythm)) return null;
    for (const item of value.rhythm) {
      const block = parseRhythm(item);
      if (!block) return null;
      rhythm.push(block);
    }
  }
  const today: BobRoadmapTask[] = [];
  for (const item of value.today) {
    const task = parseTask(item);
    if (!task) return null;
    today.push(task);
  }
  return {
    goal,
    stage: {
      index: stage.index,
      total: stage.total,
      title: stage.title,
      ...(lesson.value === undefined ? {} : { lesson: lesson.value }),
    },
    milestones,
    today,
    rhythm,
    earnedUsd: value.earnedUsd,
    updatedAt: value.updatedAt,
  };
}
