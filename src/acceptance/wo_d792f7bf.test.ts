import { describe, expect, it } from "vitest";
import { trackElapsedLabel, trackViews } from "../lib/client/roadmap-view";
import type { Roadmap } from "../lib/types";

const NOW = Date.parse("2026-11-14T12:00:00.000Z");
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

function roadmapWith(startedAt: string, stage: number, updatedAt = startedAt): Roadmap {
  const track = { requestId: "req_1", messageId: null, goal: null, stage, stageTitle: "", gates: [], startedAt, updatedAt };
  return { goal: null, stage, stageTitle: "", gates: [], today: [], backlog: [], totalStages: 5, updatedAt, tracks: [track] } as unknown as Roadmap;
}

describe("elapsed label on a roadmap track", () => {
  it("shows 5m for a track whose request was set 5 minutes ago", () => {
    const roadmap = roadmapWith(ago(5), 2);
    const [track] = trackViews(roadmap).tracks;
    expect(trackElapsedLabel(track, roadmap.totalStages, NOW)).toBe("5m");
  });

  it("shows <1m, then 1h 12m, and freezes at merge", () => {
    const young = roadmapWith(ago(0.5), 2);
    expect(trackElapsedLabel(trackViews(young).tracks[0], 5, NOW)).toBe("<1m");
    const long = roadmapWith(ago(72), 2);
    expect(trackElapsedLabel(trackViews(long).tracks[0], 5, NOW)).toBe("1h 12m");
    const merged = roadmapWith(ago(60), 5, ago(50));
    expect(trackElapsedLabel(trackViews(merged).tracks[0], 5, NOW)).toBe("10m");
  });
});
