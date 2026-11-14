import { describe, expect, it } from "vitest";
import { formatAgo } from "./format-time";

describe("formatAgo", () => {
  it("says just now under ten seconds", () => {
    expect(formatAgo(5000)).toBe("just now");
  });

  it("says whole seconds under a minute", () => {
    expect(formatAgo(12000)).toBe("12s ago");
  });

  it("says whole minutes under an hour", () => {
    expect(formatAgo(300000)).toBe("5m ago");
  });

  it("says whole hours under a day", () => {
    expect(formatAgo(7200000)).toBe("2h ago");
  });

  it("says whole days after that", () => {
    expect(formatAgo(259200000)).toBe("3d ago");
  });

  it("clamps negatives and values that are not finite to just now", () => {
    expect(formatAgo(-1)).toBe("just now");
    expect(formatAgo(-90000)).toBe("just now");
    expect(formatAgo(Number.NaN)).toBe("just now");
    expect(formatAgo(Number.POSITIVE_INFINITY)).toBe("just now");
    expect(formatAgo(Number.NEGATIVE_INFINITY)).toBe("just now");
  });
});
