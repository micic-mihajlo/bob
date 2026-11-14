import { describe, expect, it } from "vitest";
import { anchoredTooltipPosition, repeatsShownText } from "../tooltip-position";

const viewport = { width: 1000, height: 800 };
const anchor = (left: number, top: number) => ({ left, top, bottom: top + 20, width: 40, height: 20 });

describe("anchoredTooltipPosition", () => {
  it("centres the tooltip above its control with a gap", () => {
    expect(anchoredTooltipPosition(anchor(500, 400), { width: 100, height: 30 }, viewport)).toEqual({ left: 470, top: 362, placement: "top" });
  });

  it("goes under a control at the top edge", () => {
    expect(anchoredTooltipPosition(anchor(500, 10), { width: 100, height: 30 }, viewport)).toEqual({ left: 470, top: 38, placement: "bottom" });
  });

  it("stays inside the viewport at the side edges", () => {
    expect(anchoredTooltipPosition(anchor(0, 400), { width: 100, height: 30 }, viewport).left).toBe(8);
    expect(anchoredTooltipPosition(anchor(980, 400), { width: 100, height: 30 }, viewport).left).toBe(892);
  });
});

describe("repeatsShownText", () => {
  it("skips a title the control shows in full", () => {
    expect(repeatsShownText("tasks-app", " tasks-app ", false)).toBe(true);
  });

  it("keeps a title whose text is cut off or not shown", () => {
    expect(repeatsShownText("Overdue filter for tasks", "Overdue filter for tasks", true)).toBe(false);
    expect(repeatsShownText("Close panel", "", false)).toBe(false);
  });
});
