import { describe, expect, it } from "vitest";
import { formatElapsed } from "./format-time";

describe("formatElapsed", () => {
  it("shows seconds under a minute", () => {
    expect(formatElapsed(45_000)).toBe("45s");
  });

  it("shows minutes and padded seconds under an hour", () => {
    expect(formatElapsed(185_000)).toBe("3m 05s");
  });

  it("shows hours and padded minutes from an hour, with the seconds dropped", () => {
    expect(formatElapsed(3_720_000)).toBe("1h 02m");
  });

  it("clamps negative and non-finite times to 0s", () => {
    expect(formatElapsed(-1_000)).toBe("0s");
    expect(formatElapsed(Number.NaN)).toBe("0s");
    expect(formatElapsed(Number.POSITIVE_INFINITY)).toBe("0s");
  });
});
