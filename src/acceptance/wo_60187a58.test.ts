import { describe, expect, it } from "vitest";
import { formatAmount } from "../format";
import { outstandingTotal, type Invoice } from "../invoices";
import { summary } from "../page";

// Fixtures: one sent invoice, one paid invoice, one draft invoice.
const SENT: Invoice = {
  id: "INV-3001",
  customer: "Sent Co",
  amountCents: 24000,
  status: "sent",
  issuedDate: "2026-11-01",
  dueDate: "2026-11-30",
};
const PAID: Invoice = {
  id: "INV-3002",
  customer: "Paid Co",
  amountCents: 30000,
  status: "paid",
  issuedDate: "2026-10-01",
  dueDate: "2026-10-31",
};
const DRAFT: Invoice = {
  id: "INV-3003",
  customer: "Draft Co",
  amountCents: 9000,
  status: "draft",
  issuedDate: "2026-11-10",
  dueDate: "2026-12-10",
};
const TODAY = "2026-11-20";

const FIXTURES: readonly Invoice[] = [SENT, PAID, DRAFT];

describe("wo_60187a58 outstanding total", () => {
  it("counts only the sent invoice out of one sent, one paid and one draft", () => {
    expect(outstandingTotal(FIXTURES)).toBe(24000);
  });

  it("is zero when no invoice is sent", () => {
    expect(outstandingTotal([PAID, DRAFT])).toBe(0);
    expect(outstandingTotal([])).toBe(0);
  });

  it("formats with the existing money formatting", () => {
    expect(formatAmount(outstandingTotal(FIXTURES))).toBe("$240.00");
  });

  it("shows the amount still owed in the page summary", () => {
    expect(summary(FIXTURES, TODAY)).toContain("Outstanding: $240.00");
  });
});
