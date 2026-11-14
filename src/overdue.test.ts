import { describe, expect, it } from "vitest";
import { SAMPLE_INVOICES } from "./invoices";
import { isOverdue } from "./overdue";

describe("isOverdue", () => {
  it("is false for a paid invoice even when past due", () => {
    const paid = { ...SAMPLE_INVOICES[1], status: "paid" as const };
    expect(isOverdue(paid, "2026-12-31")).toBe(false);
  });

  it("is true for an unpaid invoice past its due date", () => {
    expect(isOverdue(SAMPLE_INVOICES[1], "2026-11-20")).toBe(true);
    expect(isOverdue({ ...SAMPLE_INVOICES[2], status: "draft" }, "2026-12-31")).toBe(true);
  });

  it("is false for an unpaid invoice due today", () => {
    expect(isOverdue(SAMPLE_INVOICES[1], "2026-11-14")).toBe(false);
  });
});
