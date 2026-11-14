import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { formatRunning } from "./format";

describe("formatRunning", () => {
  it("is m:ss under an hour and h:mm:ss after, and reads back to the whole seconds", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100 * 3600 }), fc.integer({ min: 0, max: 999 }), (seconds, extra) => {
        const text = formatRunning(seconds * 1000 + extra);
        const parts = text.split(":").map(Number);
        expect(parts.length).toBe(seconds < 3600 ? 2 : 3);
        expect(parts.reduce((sum, part) => sum * 60 + part, 0)).toBe(seconds);
        expect(text.split(":").slice(1).every((part) => part.length === 2)).toBe(true);
      }),
    );
  });

  it("never goes below 0:00", () => {
    fc.assert(fc.property(fc.integer({ min: -1e9, max: 0 }), (ms) => formatRunning(ms) === "0:00"));
  });

  it("ticks one second per second", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100 * 3600 }), (seconds) => {
        const next = formatRunning((seconds + 1) * 1000);
        expect(next).not.toBe(formatRunning(seconds * 1000));
      }),
    );
  });
});
