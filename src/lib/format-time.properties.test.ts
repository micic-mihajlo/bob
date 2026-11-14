import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { formatAgo, formatElapsed, nowFromClock, openedTimeSuffix } from "./format-time";
import { elapsedSince } from "./client/roadmap-view";

const SECOND = 1000;

describe("formatAgo properties", () => {
  it("says just now for every gap under ten seconds", () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 9_999 }), (gap) => formatAgo(0, gap) === "just now"));
  });

  it("says just now for a timestamp in the future", () => {
    fc.assert(fc.property(fc.integer({ min: -86_400_000, max: -1 }), (gap) => formatAgo(0, gap) === "just now"));
  });

  it("counts whole seconds under a minute", () => {
    fc.assert(
      fc.property(fc.integer({ min: 10, max: 59 }), (seconds) => formatAgo(0, seconds * SECOND) === `${seconds}s ago`),
    );
  });

  it("drops the part of a second that has not finished", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 10, max: 59 }),
        fc.integer({ min: 1, max: 999 }),
        (seconds, milliseconds) => formatAgo(0, seconds * SECOND + milliseconds) === `${seconds}s ago`,
      ),
    );
  });

  it("counts whole minutes under an hour", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 59 }), (minutes) => formatAgo(0, minutes * 60 * SECOND) === `${minutes}m ago`),
    );
  });

  it("counts whole hours under a day", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 23 }), (hours) => formatAgo(0, hours * 3_600 * SECOND) === `${hours}h ago`),
    );
  });

  it("counts whole days beyond that", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 3_650 }), (days) => formatAgo(0, days * 86_400 * SECOND) === `${days}d ago`),
    );
  });

  it("puts the opened time after a separator, and nothing when the card has no readable date", () => {
    fc.assert(
      fc.property(fc.oneof(fc.constant(null), fc.string()), (openedAgo) =>
        openedTimeSuffix(openedAgo) === (openedAgo === null ? "" : ` · ${openedAgo}`),
      ),
    );
  });

  it("uses the ticking clock, and the wall clock only while it reads zero", () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (clock, wall) => {
        expect(nowFromClock(clock, wall)).toBe(clock === 0 ? wall : clock);
      }),
    );
  });
});

/** The whole seconds a formatted elapsed time stands for; hours drop the seconds below the minute. */
function secondsOf(text: string): number {
  const bare = /^(\d+)s$/.exec(text);
  if (bare) return Number(bare[1]);
  const minutes = /^(\d+)m (\d{2})s$/.exec(text);
  if (minutes) return Number(minutes[1]) * 60 + Number(minutes[2]);
  const hours = /^(\d+)h (\d{2})m$/.exec(text);
  if (hours) return Number(hours[1]) * 3600 + Number(hours[2]) * 60;
  return Number.NaN;
}

/** The moments where the unit changes, and where minutes and seconds need a leading zero. */
const EDGES: ReadonlyArray<[number, string]> = [
  [0, "0s"],
  [999, "0s"],
  [1_000, "1s"],
  [45_000, "45s"],
  [59_999, "59s"],
  [60_000, "1m 00s"],
  [60_999, "1m 00s"],
  [61_000, "1m 01s"],
  [185_000, "3m 05s"],
  [3_599_999, "59m 59s"],
  [3_600_000, "1h 00m"],
  [3_660_000, "1h 01m"],
  [3_720_000, "1h 02m"],
];

describe("formatElapsed properties", () => {
  it("names one unit per range: seconds under a minute, minutes under an hour, hours after", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 359_999_999 }), (milliseconds) => {
        const seconds = Math.floor(milliseconds / 1000);
        const text = formatElapsed(milliseconds);
        if (seconds < 60) expect(text).toMatch(/^\d+s$/);
        else if (seconds < 3_600) expect(text).toMatch(/^\d+m \d{2}s$/);
        else expect(text).toMatch(/^\d+h \d{2}m$/);
      }),
    );
  });

  it("shows whole seconds only, dropping the part of a second below", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 359_999_999 }), (milliseconds) => {
        expect(formatElapsed(milliseconds)).toBe(formatElapsed(milliseconds - (milliseconds % 1000)));
      }),
    );
  });

  it("reads back to the same time, and never shows less time for a later moment", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 359_999_999 }), fc.integer({ min: 0, max: 3_600_000 }), (milliseconds, later) => {
        const seconds = Math.floor(milliseconds / 1000);
        expect(secondsOf(formatElapsed(milliseconds))).toBe(seconds < 3_600 ? seconds : Math.floor(seconds / 60) * 60);
        expect(secondsOf(formatElapsed(milliseconds + later))).toBeGreaterThanOrEqual(secondsOf(formatElapsed(milliseconds)));
      }),
    );
  });

  it("switches unit exactly at a minute and at an hour, padding the smaller parts", () => {
    fc.assert(
      fc.property(fc.constantFrom(...EDGES), ([milliseconds, text]) => {
        expect(formatElapsed(milliseconds)).toBe(text);
      }),
    );
  });

  it("reads a moment before the start as zero", () => {
    fc.assert(
      fc.property(fc.integer({ min: -10_000_000, max: 0 }), (milliseconds) => {
        expect(formatElapsed(milliseconds)).toBe("0s");
      }),
    );
  });
});

describe("elapsedSince properties", () => {
  it("counts from the recorded moment to now, not to it", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2_000_000_000_000 }), fc.integer({ min: 0, max: 86_400_000 }), (recorded, elapsed) => {
        expect(elapsedSince(new Date(recorded).toISOString(), recorded + elapsed)).toBe(elapsed);
      }),
    );
  });

  it("reads an unreadable start as zero", () => {
    fc.assert(
      fc.property(fc.string(), (startedAt) => {
        const recorded = Date.parse(startedAt);
        expect(elapsedSince(startedAt, 1_700_000_000_000)).toBe(Number.isNaN(recorded) ? 0 : 1_700_000_000_000 - recorded);
      }),
    );
  });
});
