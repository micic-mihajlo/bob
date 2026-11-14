import { describe, expect, it } from "vitest";
import { formatElapsed } from "@/lib/format-time";

describe("formatElapsed", () => {
  it("shows seconds under a minute", () => {
    expect(formatElapsed(45_000)).toBe("45s");
  });

  it("shows padded seconds with minutes under an hour", () => {
    expect(formatElapsed(185_000)).toBe("3m 05s");
  });

  it("shows padded minutes with hours from an hour", () => {
    expect(formatElapsed(3_720_000)).toBe("1h 02m");
  });
});
