import fc from "fast-check";
import { describe, it } from "vitest";
import { formatElapsed } from "./format";
import { trackElapsed } from "./roadmap-view";

const LAST_STAGE = 5;
const iso = (milliseconds: number) => new Date(milliseconds).toISOString();

describe("trackElapsed", () => {
  it("counts a running request up to the clock it is given", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10 ** 12 }), fc.integer({ min: 0, max: 10 ** 7 }), (start, seconds) => {
        const track = { stage: 1, startedAt: iso(start), updatedAt: iso(start) };
        return trackElapsed(track, LAST_STAGE, start + seconds * 1000) === formatElapsed(seconds * 1000);
      }),
    );
  });

  it("never changes a finished request's label as the clock moves", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10 ** 12 }),
        fc.integer({ min: 0, max: 10 ** 7 }),
        fc.integer({ min: 0, max: 10 ** 7 }),
        (start, spanMs, laterMs) => {
          const track = { stage: LAST_STAGE, startedAt: iso(start), updatedAt: iso(start + spanMs) };
          return trackElapsed(track, LAST_STAGE, start + spanMs + laterMs) === trackElapsed(track, LAST_STAGE, start + spanMs);
        },
      ),
    );
  });

  it("holds a finished request at zero when its track has no usable stop", () => {
    fc.assert(
      fc.property(fc.integer({ min: -(10 ** 12), max: 10 ** 12 }), fc.integer({ min: 0, max: 10 ** 7 }), (start, laterMs) => {
        const track = { stage: LAST_STAGE, startedAt: iso(start) };
        return trackElapsed(track, LAST_STAGE, start + laterMs) === "0s";
      }),
    );
  });

  it("shows no label for a track saved without a start", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: LAST_STAGE }), fc.integer(), (stage, now) => trackElapsed({ stage }, LAST_STAGE, now) === null),
    );
  });
});
