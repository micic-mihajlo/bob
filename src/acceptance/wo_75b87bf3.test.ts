import { describe, expect, it } from "vitest";
import { overdueInvoices, type Invoice } from "../invoices";
import { summary } from "../page";

const TODAY = "2026-11-20";

/** One overdue sent invoice, one paid invoice past due, one sent invoice not yet due. */
const ACCEPTANCE_FIXTURE: Invoice[] = [
  { id: "INV-2001", customer: "Overdue Co", amountCents: 10000, status: "sent", issuedDate: "2026-10-01", dueDate: "2026-11-14" },
  { id: "INV-2002", customer: "Paid Co", amountCents: 20000, status: "paid", issuedDate: "2026-10-01", dueDate: "2026-10-31" },
  { id: "INV-2003", customer: "Later Co", amountCents: 30000, status: "sent", issuedDate: "2026-11-01", dueDate: "2026-12-01" },
];

describe("acceptance: overdue invoices", () => {
  it("returns only the overdue sent invoice from the acceptance fixture", () => {
    expect(overdueInvoices(ACCEPTANCE_FIXTURE, TODAY).map((invoice) => invoice.id)).toEqual(["INV-2001"]);
  });

  it("reports one overdue invoice in the page summary", () => {
    expect(summary(ACCEPTANCE_FIXTURE, TODAY)).toBe("3 invoices, 2 outstanding ($400.00 owed), 1 overdue");
  });

  it("orders multiple overdue invoices oldest due date first", () => {
    const many: Invoice[] = [
      { id: "INV-3001", customer: "Alpha", amountCents: 100, status: "sent", issuedDate: "2026-10-01", dueDate: "2026-11-14" },
      { id: "INV-3002", customer: "Beta", amountCents: 200, status: "sent", issuedDate: "2026-08-01", dueDate: "2026-09-30" },
      { id: "INV-3003", customer: "Gamma", amountCents: 300, status: "sent", issuedDate: "2026-09-01", dueDate: "2026-10-20" },
      { id: "INV-3004", customer: "Paid past due", amountCents: 400, status: "paid", issuedDate: "2026-08-01", dueDate: "2026-08-31" },
      { id: "INV-3005", customer: "Not due yet", amountCents: 500, status: "sent", issuedDate: "2026-11-01", dueDate: "2026-12-15" },
    ];
    expect(overdueInvoices(many, TODAY).map((invoice) => invoice.id)).toEqual(["INV-3002", "INV-3003", "INV-3001"]);
    expect(summary(many, TODAY)).toBe("5 invoices, 4 outstanding ($11.00 owed), 3 overdue");
  });
});
