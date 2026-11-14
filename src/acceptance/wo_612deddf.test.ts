import { describe, expect, it } from "vitest";
import { invoicesCsv, SAMPLE_INVOICES } from "../invoices";

describe("wo_612deddf CSV export", () => {
  it("writes the exact header row", () => {
    expect(invoicesCsv([])).toBe("id,customer,amount,status,dueDate\n");
  });

  it("writes one row per invoice", () => {
    const lines = invoicesCsv(SAMPLE_INVOICES).trimEnd().split("\n");
    expect(lines).toHaveLength(SAMPLE_INVOICES.length + 1);
    expect(lines[0]).toBe("id,customer,amount,status,dueDate");
    expect(lines.slice(1).map((line) => line.split(",")[0])).toEqual(SAMPLE_INVOICES.map((invoice) => invoice.id));
  });

  it('quotes a customer name like "Acme, Inc." so it stays in one column', () => {
    const csv = invoicesCsv([
      { id: "INV-2001", customer: "Acme, Inc.", amountCents: 123456, status: "sent", issuedDate: "2026-10-01", dueDate: "2026-10-31" },
    ]);
    const row = csv.trimEnd().split("\n")[1];
    expect(row).toBe('INV-2001,"Acme, Inc.",1234.56,sent,2026-10-31');
    expect(row?.split(",")).toHaveLength(6);
  });
});
