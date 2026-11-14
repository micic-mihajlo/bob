import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { formatElapsed } from "./format-time";

const pad = (value: number) => String(value).padStart(2, "0");
const seconds = (milliseconds: number) => Math.floor(milliseconds / 1000);

describe("formatElapsed properties", () => {
  it("shows whole floored seconds under a minute", () => {
    fc.assert(
      fc.property(fc.oneof(fc.integer({ min: 0, max: 59_999 }), fc.constantFrom(0, 1_999, 59_999)), (milliseconds) => {
        expect(formatElapsed(milliseconds)).toBe(`${seconds(milliseconds)}s`);
      }),
    );
  });

  it("pads the seconds to two digits under an hour", () => {
    fc.assert(
      fc.property(fc.oneof(fc.integer({ min: 60_000, max: 3_599_999 }), fc.constantFrom(60_000, 65_000, 185_000, 3_599_999)), (milliseconds) => {
        const total = seconds(milliseconds);
        expect(formatElapsed(milliseconds)).toBe(`${Math.floor(total / 60)}m ${pad(total % 60)}s`);
      }),
    );
  });

  it("drops the seconds and pads the minutes from an hour", () => {
    fc.assert(
      fc.property(fc.oneof(fc.integer({ min: 3_600_000, max: 1_000_000_000_000 }), fc.constantFrom(3_600_000, 3_720_000, 7_265_000)), (milliseconds) => {
        const total = seconds(milliseconds);
        expect(formatElapsed(milliseconds)).toBe(`${Math.floor(total / 3_600)}h ${pad(Math.floor(total / 60) % 60)}m`);
      }),
    );
  });

  it("shows 0s for a negative or non-finite time", () => {
    fc.assert(
      fc.property(fc.double({ noNaN: false, noDefaultInfinity: false, max: -1 }), (milliseconds) => {
        expect(formatElapsed(milliseconds)).toBe("0s");
      }),
    );
    expect(formatElapsed(Number.NaN)).toBe("0s");
    expect(formatElapsed(Number.POSITIVE_INFINITY)).toBe("0s");
    expect(formatElapsed(Number.NEGATIVE_INFINITY)).toBe("0s");
  });

  it("never writes NaN or a minus sign", () => {
    fc.assert(
      fc.property(fc.double({ noNaN: false, noDefaultInfinity: false, min: -1e15, max: 1e15 }), (milliseconds) => {
        expect(formatElapsed(milliseconds)).toMatch(/^\d+s$|^\d+m \d{2}s$|^\d+h \d{2}m$/);
      }),
    );
  });
});
