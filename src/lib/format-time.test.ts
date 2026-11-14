import { afterEach, describe, expect, it, vi } from "vitest";
import { formatAgo } from "./format-time";

const now = Date.UTC(2026, 10, 14, 12, 0, 0);

describe("formatAgo", () => {
  afterEach(() => vi.useRealTimers());

  it("says just now under ten seconds", () => {
    expect(formatAgo(now - 5_000, now)).toBe("just now");
    expect(formatAgo(now - 9_999, now)).toBe("just now");
  });

  it("counts whole seconds from ten up to a minute", () => {
    expect(formatAgo(now - 10_000, now)).toBe("10s ago");
    expect(formatAgo(now - 12_000, now)).toBe("12s ago");
    expect(formatAgo(now - 59_999, now)).toBe("59s ago");
  });

  it("counts whole minutes under an hour", () => {
    expect(formatAgo(now - 60_000, now)).toBe("1m ago");
    expect(formatAgo(now - 300_000, now)).toBe("5m ago");
    expect(formatAgo(now - 3_599_999, now)).toBe("59m ago");
  });

  it("counts whole hours under a day", () => {
    expect(formatAgo(now - 3_600_000, now)).toBe("1h ago");
    expect(formatAgo(now - 7_200_000, now)).toBe("2h ago");
    expect(formatAgo(now - 86_399_999, now)).toBe("23h ago");
  });

  it("counts whole days beyond that", () => {
    expect(formatAgo(now - 86_400_000, now)).toBe("1d ago");
    expect(formatAgo(now - 3 * 86_400_000, now)).toBe("3d ago");
  });

  it("says just now for a timestamp ahead of the clock", () => {
    expect(formatAgo(now + 60_000, now)).toBe("just now");
  });

  it("reads the clock from Date.now() when none is passed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now + 12_000));
    expect(formatAgo(now)).toBe("12s ago");
  });
});
