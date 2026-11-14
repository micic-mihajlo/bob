import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Roadmap, Track } from "@/lib/types";

const NOW = Date.parse("2026-11-14T12:00:00.000Z");
const MINUTE = 60_000;

const track = (over: Partial<Track>): Track => ({
  requestId: "req_1",
  messageId: null,
  goal: { title: "Export tasks as CSV", why: null, deadline: null },
  stage: 3,
  stageTitle: "Build",
  gates: [{ stage: 3, title: "Build", done: false }],
  startedAt: new Date(NOW - 5 * MINUTE).toISOString(),
  updatedAt: new Date(NOW - MINUTE).toISOString(),
  ...over,
});

const roadmapWith = (tracks: Track[]): Roadmap => ({
  goal: tracks[0].goal,
  stage: tracks[0].stage,
  stageTitle: tracks[0].stageTitle,
  totalStages: 5,
  gates: tracks[0].gates,
  today: [],
  backlog: [],
  tracks,
  updatedAt: new Date(NOW).toISOString(),
});

let current: Roadmap;
vi.mock("@/components/features/window/BobContext", () => ({
  useBob: () => ({ snapshot: { roadmap: current, releaseNotes: [], requests: [], budgets: undefined, inbox: [] }, agentsById: new Map(), selectAgent: () => {}, captain: null, openThreadTab: () => {} }),
}));

async function timers(): Promise<string[]> {
  const { RoadmapPanel } = await import("@/components/features/roadmap/RoadmapPanel");
  const html = renderToStaticMarkup(createElement(RoadmapPanel, { onClose: () => {} }));
  return [...html.matchAll(/data-roadmap-timer[^>]*>([^<]*)</g)].map((m) => m[1]);
}

describe("wo_325f1d92: live running timer on each roadmap card", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it("shows 5:00 for a request recorded 5 minutes ago, and 5:01 one second later", async () => {
    current = roadmapWith([track({})]);
    expect(await timers()).toEqual(["5:00"]);
    vi.setSystemTime(NOW + 1000);
    expect(await timers()).toEqual(["5:01"]);
  });
});
