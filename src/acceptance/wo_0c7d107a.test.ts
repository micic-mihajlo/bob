import { describe, expect, it } from "vitest";
import { overdueInvoices, type Invoice } from "../invoices";
import { summary } from "../page";

const TODAY = "2026-11-20";

function invoice(overrides: Partial<Invoice> & Pick<Invoice, "id">): Invoice {
  return {
    customer: "Acme Corp",
    amountCents: 10000,
    status: "sent",
    issuedDate: "2026-10-01",
    dueDate: "2026-10-31",
    ...overrides,
  };
}

const mixed = [
  invoice({ id: "INV-OVERDUE", dueDate: "2026-11-10" }),
  invoice({ id: "INV-PAID", status: "paid", dueDate: "2026-11-01" }),
  invoice({ id: "INV-NOT-YET-DUE", dueDate: "2026-12-01" }),
];

describe("wo_0c7d107a overdue invoice filtering and summary count", () => {
  it("returns only the overdue sent invoice, excluding paid and not-yet-due invoices", () => {
    expect(overdueInvoices(mixed, TODAY).map((i) => i.id)).toEqual(["INV-OVERDUE"]);
  });

  it("treats the due-date cutoff as strict", () => {
    expect(overdueInvoices([invoice({ id: "INV-DUE-TODAY", dueDate: TODAY })], TODAY)).toEqual([]);
  });

  it("orders overdue invoices oldest due date first", () => {
    const list = [
      invoice({ id: "INV-1002", dueDate: "2026-11-10" }),
      invoice({ id: "INV-1003", dueDate: "2026-10-05" }),
      invoice({ id: "INV-1004", dueDate: "2026-11-19" }),
      invoice({ id: "INV-1005", dueDate: "2026-12-24" }),
    ];
    expect(overdueInvoices(list, TODAY).map((i) => i.id)).toEqual(["INV-1003", "INV-1002", "INV-1004"]);
  });

  it("shows the overdue count in the existing page summary", () => {
    expect(summary(mixed, TODAY)).toBe("3 invoices, 2 outstanding ($200.00 owed), 1 overdue");
  });
});
