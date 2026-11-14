import { describe, expect, it } from "vitest";
import { formatAgo } from "../lib/format-time";

describe("formatAgo", () => {
  it("says just now under ten seconds", () => {
    expect(formatAgo(5000)).toBe("just now");
  });

  it("says seconds under a minute", () => {
    expect(formatAgo(12000)).toBe("12s ago");
  });

  it("says minutes under an hour", () => {
    expect(formatAgo(300000)).toBe("5m ago");
  });

  it("says hours under a day", () => {
    expect(formatAgo(7200000)).toBe("2h ago");
  });

  it("says days after that", () => {
    expect(formatAgo(259200000)).toBe("3d ago");
  });
});
