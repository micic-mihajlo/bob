import { describe, expect, it } from "vitest";
import { overdueInvoices, type Invoice } from "../invoices";

const base = { customer: "Customer A", amountCents: 1000, issuedDate: "2026-10-01" };

describe("overdueInvoices", () => {
  it("returns the sent invoices due before today, oldest due date first", () => {
    const list: Invoice[] = [
      { ...base, id: "INV-1", status: "sent", dueDate: "2026-11-01" },
      { ...base, id: "INV-2", status: "paid", dueDate: "2026-10-15" },
      { ...base, id: "INV-3", status: "sent", dueDate: "2026-12-01" },
      { ...base, id: "INV-4", status: "sent", dueDate: "2026-10-20" },
    ];
    expect(overdueInvoices(list, "2026-11-14").map((i) => i.id)).toEqual(["INV-4", "INV-1"]);
  });
});
