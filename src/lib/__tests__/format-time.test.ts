import { describe, expect, it } from "vitest";
import { formatAgo, openedAgo } from "../format-time";

const SECOND = 1_000;

describe("formatAgo", () => {
  it("says just now up to the last moment under ten seconds", () => {
    expect(formatAgo(0)).toBe("just now");
    expect(formatAgo(9_999)).toBe("just now");
  });

  it("rounds seconds down from ten", () => {
    expect(formatAgo(10 * SECOND)).toBe("10s ago");
    expect(formatAgo(59 * SECOND + 999)).toBe("59s ago");
  });

  it("rounds minutes down from a minute", () => {
    expect(formatAgo(60 * SECOND)).toBe("1m ago");
    expect(formatAgo(119 * SECOND)).toBe("1m ago");
    expect(formatAgo(59 * 60 * SECOND + 59 * SECOND)).toBe("59m ago");
  });

  it("rounds hours down from an hour", () => {
    expect(formatAgo(60 * 60 * SECOND)).toBe("1h ago");
    expect(formatAgo(23 * 60 * 60 * SECOND + 59 * 60 * SECOND)).toBe("23h ago");
  });

  it("rounds days down from a day", () => {
    expect(formatAgo(24 * 60 * 60 * SECOND)).toBe("1d ago");
    expect(formatAgo(7 * 24 * 60 * 60 * SECOND)).toBe("7d ago");
  });

  it("treats a clock that runs backwards as just now", () => {
    expect(formatAgo(-5 * SECOND)).toBe("just now");
  });
});

describe("openedAgo", () => {
  const OPENED = "2026-01-01T00:00:00.000Z";
  const openedAt = Date.parse(OPENED);

  it("reads when something was opened against the clock now", () => {
    expect(openedAgo(OPENED, openedAt + 300 * SECOND)).toBe("5m ago");
  });

  it("has no age for a timestamp it cannot read", () => {
    expect(openedAgo("not a date", openedAt)).toBeNull();
  });
});
