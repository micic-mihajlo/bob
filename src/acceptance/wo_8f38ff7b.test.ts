import { describe, expect, it } from "vitest";
import { formatElapsed } from "../lib/format-time";

describe("formatElapsed", () => {
  it("shows 45s under a minute, 3m 05s under an hour, and 1h 02m from an hour", () => {
    expect(formatElapsed(45_000)).toBe("45s");
    expect(formatElapsed(185_000)).toBe("3m 05s");
    expect(formatElapsed(3_720_000)).toBe("1h 02m");
  });
});
