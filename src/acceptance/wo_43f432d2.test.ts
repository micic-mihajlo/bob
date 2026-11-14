import { describe, expect, it } from "vitest";
import { formatAgo } from "../lib/format-time";

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("formatAgo", () => {
  it("says just now under ten seconds", () => {
    expect(formatAgo(5 * SECOND)).toBe("just now");
  });

  it("counts seconds under a minute", () => {
    expect(formatAgo(12 * SECOND)).toBe("12s ago");
  });

  it("counts minutes under an hour", () => {
    expect(formatAgo(300 * SECOND)).toBe("5m ago");
  });

  it("counts hours under a day", () => {
    expect(formatAgo(7200 * SECOND)).toBe("2h ago");
  });

  it("counts days after that", () => {
    expect(formatAgo(3 * DAY)).toBe("3d ago");
  });
});
