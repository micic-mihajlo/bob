import { describe, expect, it } from "vitest";
import { addInvoice, invoicesToCsv, markPaid, outstanding, overdue, SAMPLE_INVOICES, totalCents } from "./invoices";

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

  it("totals amounts in cents", () => {
    expect(totalCents(SAMPLE_INVOICES)).toBe(182950);
  });

  it("converts one plain invoice to a CSV row after the header", () => {
    const plain = {
      id: "INV-1001",
      customer: "Acme Corp",
      amountCents: 125000,
      status: "paid" as const,
      issuedDate: "2026-10-01",
      dueDate: "2026-10-31",
    };
    expect(invoicesToCsv([plain])).toBe("id,customer,amount,status,dueDate\nINV-1001,Acme Corp,1250.00,paid,2026-10-31");
    expect(invoicesToCsv(SAMPLE_INVOICES).split("\n").slice(1).map((row) => row.split(",")[0])).toEqual([
      "INV-1001",
      "INV-1002",
      "INV-1003",
    ]);
  });

  it("quotes a customer name with a comma", () => {
    const csv = invoicesToCsv([{ ...SAMPLE_INVOICES[1], customer: "Globex, Inc." }]);
    expect(csv.split("\n")[1]).toBe('INV-1002,"Globex, Inc.",480.50,sent,2026-11-14');
  });
});
