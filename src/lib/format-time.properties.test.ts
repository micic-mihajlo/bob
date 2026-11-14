import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { formatElapsed } from "./format-time";

/** The whole seconds a formatted elapsed time stands for. */
function toSeconds(text: string): number {
  const hours = /^(\d+)h (\d{2})m$/.exec(text);
  if (hours) return Number(hours[1]) * 3600 + Number(hours[2]) * 60;
  const minutes = /^(\d+)m (\d{2})s$/.exec(text);
  if (minutes) return Number(minutes[1]) * 60 + Number(minutes[2]);
  const seconds = /^(\d+)s$/.exec(text);
  if (seconds) return Number(seconds[1]);
  return Number.NaN;
}

describe("formatElapsed", () => {
  it("reads back the whole seconds it was given, and the whole minutes from an hour", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 360_000_000 }), (milliseconds) => {
        const total = Math.floor(milliseconds / 1000);
        const shown = total < 3600 ? total : Math.floor(total / 60) * 60;
        expect(toSeconds(formatElapsed(milliseconds))).toBe(shown);
      }),
    );
  });

  it("counts seconds below a minute, minutes and seconds below an hour, and hours after", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 360_000_000 }), (milliseconds) => {
        const text = formatElapsed(milliseconds);
        const total = Math.floor(milliseconds / 1000);
        if (total < 60) expect(text).toMatch(/^\d+s$/);
        else if (total < 3600) expect(text).toMatch(/^\d+m \d{2}s$/);
        else expect(text).toMatch(/^\d+h \d{2}m$/);
      }),
    );
  });

  it("never shows a negative time", () => {
    fc.assert(
      fc.property(fc.integer({ min: -1_000_000, max: 0 }), (milliseconds) => {
        expect(formatElapsed(milliseconds)).toBe("0s");
      }),
    );
  });
});
