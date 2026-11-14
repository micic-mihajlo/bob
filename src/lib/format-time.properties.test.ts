import fc from "fast-check";
import { describe, it } from "vitest";
import { formatAgo, openedAgo } from "./format-time";

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const OPENED = Date.parse("2026-01-01T00:00:00.000Z");

describe("formatAgo properties", () => {
  it("says just now for anything under ten seconds, including a clock that ran backwards", () => {
    fc.assert(fc.property(fc.integer({ min: -1_000 * DAY, max: 10 * SECOND - 1 }), (ms) => formatAgo(ms) === "just now"));
  });

  it("counts whole seconds from ten seconds up to a minute", () => {
    fc.assert(fc.property(fc.integer({ min: 10 * SECOND, max: MINUTE - 1 }), (ms) => formatAgo(ms) === `${Math.floor(ms / SECOND)}s ago`));
  });

  it("counts whole minutes from a minute up to an hour", () => {
    fc.assert(fc.property(fc.integer({ min: MINUTE, max: HOUR - 1 }), (ms) => formatAgo(ms) === `${Math.floor(ms / MINUTE)}m ago`));
  });

  it("counts whole hours from an hour up to a day", () => {
    fc.assert(fc.property(fc.integer({ min: HOUR, max: DAY - 1 }), (ms) => formatAgo(ms) === `${Math.floor(ms / HOUR)}h ago`));
  });

  it("counts whole days from a day on", () => {
    fc.assert(fc.property(fc.integer({ min: DAY, max: 3650 * DAY }), (ms) => formatAgo(ms) === `${Math.floor(ms / DAY)}d ago`));
  });

  it("counts the age from the opened moment up to the clock now", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 3650 * DAY }), (age) => {
        const opened = new Date(OPENED - age).toISOString();
        return openedAgo(opened, OPENED) === formatAgo(age);
      }),
    );
  });

  it("has no age for a timestamp it cannot read", () => {
    fc.assert(fc.property(fc.constantFrom("", "not a date", "yesterday"), (at) => openedAgo(at, OPENED) === null));
  });
});
