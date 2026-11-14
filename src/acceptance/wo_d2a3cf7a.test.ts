import { describe, expect, it } from "vitest";
import { overdueInvoices, type Invoice } from "../invoices";
import { summary } from "../page";

const invoice = (fields: Partial<Invoice>): Invoice => ({
  id: "INV-9001",
  customer: "Acme Corp",
  amountCents: 1000,
  status: "sent",
  issuedDate: "2026-10-01",
  dueDate: "2026-10-31",
  ...fields,
});

const MIXED: readonly Invoice[] = [
  invoice({ id: "INV-9001", status: "sent", dueDate: "2026-11-10" }),
  invoice({ id: "INV-9002", status: "paid", dueDate: "2026-09-01" }),
  invoice({ id: "INV-9003", status: "sent", dueDate: "2026-12-20" }),
];

describe("overdueInvoices", () => {
  it("returns only the sent invoice that is past its due date", () => {
    const late = overdueInvoices(MIXED, "2026-11-20");
    expect(late.map((i) => i.id)).toEqual(["INV-9001"]);
  });

  it("orders by oldest due date first", () => {
    const late = overdueInvoices(
      [
        invoice({ id: "INV-9010", dueDate: "2026-11-01" }),
        invoice({ id: "INV-9011", dueDate: "2026-09-15" }),
        invoice({ id: "INV-9012", dueDate: "2026-10-20" }),
      ],
      "2026-11-20",
    );
    expect(late.map((i) => i.id)).toEqual(["INV-9011", "INV-9012", "INV-9010"]);
  });
});

describe("page summary", () => {
  it("shows how many invoices are overdue", () => {
    expect(summary(MIXED, "2026-11-20")).toBe("3 invoices, 2 outstanding ($20.00 owed), 1 overdue");
  });
});
