import { describe, expect, it } from "vitest";
import { CSV_HEADER, invoicesCsv, SAMPLE_INVOICES } from "./invoices";
import { csvFileName } from "./page";

describe("csv export", () => {
  it("starts with the agreed header and one row per invoice", () => {
    const lines = invoicesCsv(SAMPLE_INVOICES).split("\r\n");
    expect(lines[0]).toBe("id,customer,amount,status,due_date");
    expect(CSV_HEADER).toBe("id,customer,amount,status,due_date");
    expect(lines.filter((line) => line !== "")).toHaveLength(SAMPLE_INVOICES.length + 1);
  });

  it("writes amounts as plain dollars and cents", () => {
    expect(invoicesCsv([SAMPLE_INVOICES[1]])).toContain('INV-1002,"Globex, Inc.",480.50,sent,2026-11-14');
  });

  it("quotes a name with a comma so it stays one column", () => {
    const csv = invoicesCsv([{ ...SAMPLE_INVOICES[0], customer: "Acme, Inc." }]);
    expect(csv.split("\r\n")[1]).toBe('INV-1001,"Acme, Inc.",1250.00,paid,2026-10-31');
  });

  it("doubles quotes inside a field and leaves plain names bare", () => {
    expect(invoicesCsv([{ ...SAMPLE_INVOICES[0], customer: 'The "Big" Co' }])).toContain('"The ""Big"" Co"');
    expect(invoicesCsv([SAMPLE_INVOICES[0]])).toContain("INV-1001,Acme Corp,1250.00,paid,2026-10-31");
  });

  it("names the download with the export date", () => {
    expect(csvFileName(new Date("2026-11-30T12:00:00Z"))).toBe("invoices-2026-11-30.csv");
  });
});
