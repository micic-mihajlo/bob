import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { formatAgo, formatAgoSince } from "./format-time";

const UNIT_SECONDS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };

/** The count and unit a label such as "12s ago" carries, or null when it is not that shape. */
function partsOf(label: string): { count: number; unit: string } | null {
  const match = /^(\d+)([smhd]) ago$/.exec(label);
  return match ? { count: Number(match[1]), unit: match[2] } : null;
}

describe("formatAgo", () => {
  it("reads just now for anything under ten seconds or not finite", () => {
    fc.assert(
      fc.property(fc.double({ min: -1e15, max: 9_999.999 }), (ms) => {
        expect(formatAgo(ms)).toBe("just now");
      }),
    );
    expect(formatAgo(Number.NaN)).toBe("just now");
    expect(formatAgo(Number.POSITIVE_INFINITY)).toBe("just now");
    expect(formatAgo(Number.NEGATIVE_INFINITY)).toBe("just now");
  });

  it("reads one whole unit and ago from ten seconds on, never a minus sign or NaN", () => {
    fc.assert(
      fc.property(fc.double({ min: 10_000, max: 1e15, noNaN: true }), (ms) => {
        const label = formatAgo(ms);
        expect(partsOf(label)).not.toBeNull();
        expect(label).not.toContain("-");
        expect(label).not.toContain("NaN");
      }),
    );
  });

  it("rounds the unit down: its count fits and one more would overshoot", () => {
    fc.assert(
      fc.property(fc.double({ min: 10_000, max: 1e15, noNaN: true }), (ms) => {
        const parts = partsOf(formatAgo(ms));
        expect(parts).not.toBeNull();
        const unitSeconds = UNIT_SECONDS[parts!.unit];
        const seconds = ms / 1000;
        expect(parts!.count * unitSeconds).toBeLessThanOrEqual(seconds);
        expect((parts!.count + 1) * unitSeconds).toBeGreaterThan(seconds);
      }),
    );
  });

  it("switches from seconds to minutes exactly at one minute", () => {
    fc.assert(
      fc.property(fc.constantFrom<[number, string]>([59_999, "59s ago"], [60_000, "1m ago"]), ([ms, label]) => {
        expect(formatAgo(ms)).toBe(label);
      }),
    );
  });

  it("switches from minutes to hours exactly at one hour", () => {
    fc.assert(
      fc.property(fc.constantFrom<[number, string]>([3_599_999, "59m ago"], [3_600_000, "1h ago"]), ([ms, label]) => {
        expect(formatAgo(ms)).toBe(label);
      }),
    );
  });

  it("switches from hours to days exactly at one day", () => {
    fc.assert(
      fc.property(fc.constantFrom<[number, string]>([86_399_999, "23h ago"], [86_400_000, "1d ago"]), ([ms, label]) => {
        expect(formatAgo(ms)).toBe(label);
      }),
    );
  });

  it("reads an ISO timestamp as the span from now, so the subtraction cannot flip", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 4_102_444_800_000 }), fc.integer({ min: 0, max: 4_102_444_800_000 }), (atMs, nowMs) => {
        expect(formatAgoSince(new Date(atMs).toISOString(), nowMs)).toBe(formatAgo(nowMs - atMs));
      }),
    );
  });
});
