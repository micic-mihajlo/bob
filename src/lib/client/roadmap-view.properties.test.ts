import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { formatTrackElapsed, trackElapsedLabel } from "./roadmap-view";

const MIN = 60_000;

describe("track elapsed label properties", () => {
  it("shows whole minutes under an hour", () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 59 }), fc.integer({ min: 0, max: MIN - 1 }), (m, extra) => {
      expect(formatTrackElapsed(m * MIN + extra)).toBe(`${m}m`);
    }));
  });

  it("shows <1m in the first minute and for negative time", () => {
    fc.assert(fc.property(fc.integer({ min: -10 * MIN, max: MIN - 1 }), (ms) => {
      expect(formatTrackElapsed(ms)).toBe("<1m");
    }));
  });

  it("shows hours and minutes from an hour up", () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 99 }), fc.integer({ min: 0, max: 59 }), (h, m) => {
      expect(formatTrackElapsed((h * 60 + m) * MIN)).toBe(`${h}h ${m}m`);
    }));
  });

  it("freezes a finished track at its last change and keeps counting an open one", () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 500 }), fc.integer({ min: 0, max: 500 }), fc.integer({ min: 0, max: 500 }), (run, after, open) => {
      const start = 1_700_000_000_000;
      const iso = (t: number) => new Date(t).toISOString();
      const end = start + run * MIN;
      const track = { startedAt: iso(start), updatedAt: iso(end) };
      expect(trackElapsedLabel({ ...track, stage: 5 }, 5, end + after * MIN)).toBe(formatTrackElapsed(run * MIN));
      expect(trackElapsedLabel({ ...track, stage: 2 }, 5, start + open * MIN)).toBe(formatTrackElapsed(open * MIN));
    }));
  });
});
