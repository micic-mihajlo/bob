import { describe, expect, it } from "vitest";
import { addInvoice, markPaid, outstanding, overdue, overdueInvoices, SAMPLE_INVOICES, totalCents } from "./invoices";

describe("invoices", () => {
  it("adds an invoice and refuses a duplicate id", () => {
    const next = addInvoice([], SAMPLE_INVOICES[0]);
    expect(next).toHaveLength(1);
    expect(() => addInvoice(next, SAMPLE_INVOICES[0])).toThrow("already exists");
  });

  it("marks one invoice paid", () => {
    const paid = markPaid(SAMPLE_INVOICES, "INV-1002");
    expect(paid.find((i) => i.id === "INV-1002")?.status).toBe("paid");
    expect(outstanding(paid).map((i) => i.id)).toEqual(["INV-1003"]);
  });

  it("finds overdue invoices", () => {
    expect(overdue(SAMPLE_INVOICES, "2026-11-20").map((i) => i.id)).toEqual(["INV-1002"]);
    expect(overdue(SAMPLE_INVOICES, "2026-11-01")).toEqual([]);
  });

  it("finds overdue invoices oldest due date first", () => {
    const mixed = [
      { ...SAMPLE_INVOICES[1], id: "INV-2001", dueDate: "2026-11-10" },
      { ...SAMPLE_INVOICES[0], id: "INV-2002", dueDate: "2026-09-01" },
      { ...SAMPLE_INVOICES[1], id: "INV-2003", dueDate: "2026-12-20" },
    ];
    expect(overdueInvoices(mixed, "2026-11-20").map((i) => i.id)).toEqual(["INV-2001"]);
    expect(
      overdueInvoices(
        [
          { ...SAMPLE_INVOICES[1], id: "INV-2010", dueDate: "2026-11-01" },
          { ...SAMPLE_INVOICES[1], id: "INV-2011", dueDate: "2026-09-15" },
        ],
        "2026-11-20",
      ).map((i) => i.id),
    ).toEqual(["INV-2011", "INV-2010"]);
    expect(overdueInvoices(SAMPLE_INVOICES, "2026-11-01")).toEqual([]);
  });

  it("totals amounts in cents", () => {
    expect(totalCents(SAMPLE_INVOICES)).toBe(182950);
  });
});
