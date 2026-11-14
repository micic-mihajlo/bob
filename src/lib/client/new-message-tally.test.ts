import { describe, expect, it } from "vitest";
import { anchorNewMessages, tallyNewMessages, type TimelineRow } from "./new-message-tally";

const rows = (...ids: string[]): TimelineRow[] => ids.map((id) => ({ id, countable: !id.startsWith("you") }));

describe("tallyNewMessages", () => {
  it("anchors on the newest row while the view follows", () => {
    expect(tallyNewMessages({ count: 3, anchorId: "a" }, rows("a", "b"), true)).toEqual({ count: 0, anchorId: "b" });
  });

  it("counts only countable rows that arrive below the anchor", () => {
    const start = anchorNewMessages(rows("a"));
    expect(tallyNewMessages(start, rows("a", "you-1", "b", "c"), false)).toEqual({ count: 2, anchorId: "c" });
  });

  it("keeps the count when the anchor is gone", () => {
    expect(tallyNewMessages({ count: 2, anchorId: "live" }, rows("a", "b"), false)).toEqual({ count: 2, anchorId: "b" });
  });

  it("drops the count for an empty timeline", () => {
    expect(tallyNewMessages({ count: 2, anchorId: "a" }, [], false)).toEqual({ count: 0, anchorId: undefined });
  });
});
