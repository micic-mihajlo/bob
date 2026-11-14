import { afterEach, describe, expect, it, vi } from "vitest";
import { trackElapsed, trackViews } from "@/lib/client/roadmap-view";
import type { Roadmap, Track } from "@/lib/types";

const START = Date.parse("2026-11-14T12:00:00.000Z");

function roadmap(track: Track): Roadmap {
  return {
    goal: null,
    stage: track.stage,
    stageTitle: track.stageTitle,
    totalStages: 5,
    gates: [],
    today: [],
    backlog: [],
    tracks: [track],
    updatedAt: track.updatedAt,
  };
}

const track = (stage: number, updatedAt: number): Track => ({
  requestId: "req_elapsed",
  messageId: null,
  goal: { title: "Export tasks as CSV", why: null, deadline: null },
  stage,
  stageTitle: "Build",
  gates: [],
  startedAt: new Date(START).toISOString(),
  updatedAt: new Date(updatedAt).toISOString(),
});

describe("the elapsed time on a roadmap card", () => {
  afterEach(() => vi.useRealTimers());

  it("goes from 2m 14s to 2m 15s when the clock advances one second on a request in progress", () => {
    vi.useFakeTimers();
    vi.setSystemTime(START + 134_000);
    const plan = roadmap(track(3, START + 134_000));
    const [card] = trackViews(plan).tracks;

    expect(trackElapsed(card, plan.totalStages, Date.now())).toBe("2m 14s");

    vi.advanceTimersByTime(1000);

    expect(trackElapsed(card, plan.totalStages, Date.now())).toBe("2m 15s");
  });

  it("keeps a fixed duration on a finished request, however far the clock advances", () => {
    vi.useFakeTimers();
    vi.setSystemTime(START + 300_000);
    const plan = roadmap(track(5, START + 245_000));
    const [card] = trackViews(plan).tracks;

    expect(trackElapsed(card, plan.totalStages, Date.now())).toBe("4m 05s");

    vi.advanceTimersByTime(1000);

    expect(trackElapsed(card, plan.totalStages, Date.now())).toBe("4m 05s");
  });
});
