import fc from "fast-check";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RoadmapPanel } from "./RoadmapPanel";
import { BobProvider } from "../window/BobContext";
import { formatElapsed } from "../../../lib/client/format";
import type { Roadmap, Snapshot } from "../../../lib/types";

const gates = [
  { stage: 1, title: "Intent", done: true },
  { stage: 2, title: "Build", done: false },
  { stage: 3, title: "Ship", done: false },
];

const track = (index: number): NonNullable<Roadmap["tracks"]>[number] => ({
  requestId: `r${index}`,
  messageId: null,
  ask: `Ask ${index}`,
  goal: { title: `Goal ${index}`, why: null, deadline: null },
  stage: 2,
  stageTitle: "Build",
  gates,
  startedAt: "2026-11-14T12:00:00.000Z",
  updatedAt: "2026-11-14T12:03:05.000Z",
});

/** A snapshot with one track per request id, each request carrying its own elapsed seconds. */
function snapshotOf(seconds: number[]): Snapshot {
  const roadmap: Roadmap = {
    goal: { title: "Goal 0", why: null, deadline: null },
    stage: 2,
    stageTitle: "Build",
    totalStages: 3,
    gates,
    today: [],
    backlog: [],
    tracks: seconds.map((_, index) => track(index)),
    updatedAt: "2026-11-14T12:03:05.000Z",
  };
  return {
    roadmap,
    agents: [],
    requests: seconds.map((value, index) => ({
      requestId: `r${index}`,
      ask: `Ask ${index}`,
      startedAt: "2026-11-14T12:00:00.000Z",
      seconds: value,
      running: true,
      turns: 1,
      modelCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      alerts: [],
    })),
  } as unknown as Snapshot;
}

/** The panel's resizer reads the window while rendering, which the node test environment does not have. */
const withWindow = <T,>(run: () => T): T => {
  const globals = globalThis as { window?: unknown };
  globals.window = { innerWidth: 1200, matchMedia: () => ({ matches: true, addEventListener: () => undefined, removeEventListener: () => undefined }) };
  try {
    return run();
  } finally {
    delete globals.window;
  }
};

const render = (snapshot: Snapshot) =>
  withWindow(() =>
    renderToStaticMarkup(createElement(BobProvider, { snapshot, sync: "live" }, createElement(RoadmapPanel, { onClose: () => undefined }))),
  );

const TIMER = /<p class="bob-roadmap-timer"[^>]*>([^<]*)<\/p>/g;
const timers = (html: string) => [...html.matchAll(TIMER)].map((match) => match[1]);

describe("roadmap card elapsed timer", () => {
  it("shows formatElapsed of the request's time for any elapsed", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 360_000 }), (seconds) => {
        expect(timers(render(snapshotOf([seconds])))).toEqual([formatElapsed(seconds * 1000)]);
      }),
    );
  });

  it("gives every track card its own timer, in track order", () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 360_000 }), { minLength: 1, maxLength: 6 }), (values) => {
        expect(timers(render(snapshotOf(values)))).toEqual(values.map((seconds) => formatElapsed(seconds * 1000)));
      }),
    );
  });

  it("draws no timer when no request matches a track", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 4 }), (count) => {
        const snapshot = snapshotOf(new Array(count).fill(0));
        expect(timers(render({ ...snapshot, requests: [] }))).toEqual([]);
      }),
    );
  });
});
