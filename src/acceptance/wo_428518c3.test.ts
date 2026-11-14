import { describe, expect, it } from "vitest";
import { formatElapsed } from "../lib/format-time";

describe("formatElapsed", () => {
  it("shows 45 seconds under a minute", () => {
    expect(formatElapsed(45_000)).toBe("45s");
  });

  it("shows 3 minutes 05 seconds under an hour", () => {
    expect(formatElapsed(185_000)).toBe("3m 05s");
  });

  it("shows 1 hour 02 minutes from an hour up", () => {
    expect(formatElapsed(3_720_000)).toBe("1h 02m");
  });
});
