import fc from "fast-check";
import { describe, it } from "vitest";
import { formatAgo, openedTimeSuffix } from "./format-time";

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
});
