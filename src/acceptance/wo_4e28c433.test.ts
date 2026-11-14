import { describe, expect, it } from "vitest";
import { overdueInvoices, type Invoice } from "../invoices";
import { summary } from "../page";

// Fixtures: one overdue sent invoice, one paid invoice, one not-yet-due sent invoice.
const OVERDUE_LATE: Invoice = {
  id: "INV-2001",
  customer: "Late Co",
  amountCents: 10000,
  status: "sent",
  issuedDate: "2026-09-01",
  dueDate: "2026-09-30",
};
const OVERDUE_EARLY: Invoice = {
  id: "INV-2002",
  customer: "Earlier Co",
  amountCents: 20000,
  status: "sent",
  issuedDate: "2026-08-01",
  dueDate: "2026-08-31",
};
const PAID: Invoice = {
  id: "INV-2003",
  customer: "Paid Co",
  amountCents: 30000,
  status: "paid",
  issuedDate: "2026-07-01",
  dueDate: "2026-07-31",
};
const NOT_YET_DUE: Invoice = {
  id: "INV-2004",
  customer: "Future Co",
  amountCents: 40000,
  status: "sent",
  issuedDate: "2026-10-01",
  dueDate: "2026-12-15",
};
const TODAY = "2026-11-20";

const FIXTURES: readonly Invoice[] = [OVERDUE_LATE, PAID, NOT_YET_DUE, OVERDUE_EARLY];

describe("wo_4e28c433 overdue invoices", () => {
  it("returns only the overdue sent invoice out of overdue, paid and not-yet-due fixtures", () => {
    const base: readonly Invoice[] = [OVERDUE_LATE, PAID, NOT_YET_DUE];
    expect(overdueInvoices(base, TODAY).map((i) => i.id)).toEqual(["INV-2001"]);
  });

  it("orders overdue invoices oldest due date first", () => {
    expect(overdueInvoices(FIXTURES, TODAY).map((i) => i.id)).toEqual(["INV-2002", "INV-2001"]);
  });

  it("treats a due date equal to today as not overdue", () => {
    expect(overdueInvoices([{ ...NOT_YET_DUE, dueDate: TODAY }], TODAY)).toEqual([]);
  });

  it("shows the overdue count in the page summary", () => {
    expect(summary(FIXTURES, TODAY)).toContain("2 overdue");
  });
});
