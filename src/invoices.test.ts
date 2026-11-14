import { describe, expect, it } from "vitest";
import { addInvoice, invoicesToCsv, isOverdue, markPaid, outstanding, overdue, SAMPLE_INVOICES, totalCents } from "./invoices";

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
});

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

describe("invoicesToCsv", () => {
  it("writes the header and a plain row with the amount in dollars", () => {
    const csv = invoicesToCsv([
      { id: "INV-1007", customer: "Acme Corp", amountCents: 125000, status: "sent", issuedDate: "2026-10-01", dueDate: "2026-10-31" },
    ]);
    expect(csv).toBe("id,customer,amount,status,dueDate\nINV-1007,Acme Corp,$1250.00,sent,2026-10-31");
  });

  it("writes one row per invoice in order", () => {
    const csv = invoicesToCsv(SAMPLE_INVOICES);
    expect(csv.split("\n")).toEqual([
      "id,customer,amount,status,dueDate",
      "INV-1001,Acme Corp,$1250.00,paid,2026-10-31",
      'INV-1002,"Globex, Inc.",$480.50,sent,2026-11-14',
      "INV-1003,Initech,$99.00,draft,2026-12-01",
    ]);
  });

  it("quotes a customer name containing a comma", () => {
    const csv = invoicesToCsv([
      { id: "INV-1008", customer: "Globex, Inc.", amountCents: 48050, status: "sent", issuedDate: "2026-10-15", dueDate: "2026-11-14" },
    ]);
    expect(csv).toBe('id,customer,amount,status,dueDate\nINV-1008,"Globex, Inc.",$480.50,sent,2026-11-14');
  });

  it("quotes a cell containing a quote or a line break and doubles the quote", () => {
    const base = { id: "INV-1009", amountCents: 500, status: "draft" as const, issuedDate: "2026-11-01", dueDate: "2026-12-01" };
    expect(invoicesToCsv([{ ...base, customer: 'The "Quote" Co' }])).toBe(
      'id,customer,amount,status,dueDate\nINV-1009,"The ""Quote"" Co",$5.00,draft,2026-12-01',
    );
    expect(invoicesToCsv([{ ...base, customer: "Line\nBreak" }])).toBe(
      'id,customer,amount,status,dueDate\nINV-1009,"Line\nBreak",$5.00,draft,2026-12-01',
    );
  });

  it("writes only the header for an empty list", () => {
    expect(invoicesToCsv([])).toBe("id,customer,amount,status,dueDate");
  });
});
