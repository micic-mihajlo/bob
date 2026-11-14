import { describe, expect, it } from "vitest";
import { SAMPLE_INVOICES } from "./invoices";
import { invoiceRows, invoicesCsv, summary } from "./page";

describe("page", () => {
  it("renders one row per invoice", () => {
    const rows = invoiceRows(SAMPLE_INVOICES);
    expect(rows.match(/<tr>/g)).toHaveLength(SAMPLE_INVOICES.length);
    expect(rows).toContain("<td>Globex, Inc.</td>");
    expect(rows).toContain("$480.50");
  });

  it("escapes customer names", () => {
    expect(invoiceRows([{ ...SAMPLE_INVOICES[0], customer: "<b>A&B</b>" }])).toContain("&lt;b&gt;A&amp;B&lt;/b&gt;");
  });

  it("summarises what is owed", () => {
    expect(summary(SAMPLE_INVOICES)).toBe("3 invoices, 2 outstanding ($579.50 owed)");
  });

  it("exports every invoice as CSV", () => {
    expect(invoicesCsv(SAMPLE_INVOICES).split("\n")).toEqual([
      "Invoice,Customer,Amount,Status,Due",
      "INV-1001,Acme Corp,$1250.00,paid,2026-10-31",
      'INV-1002,"Globex, Inc.",$480.50,sent,2026-11-14',
      "INV-1003,Initech,$99.00,draft,2026-12-01",
    ]);
  });

  it("escapes quotes in a CSV field", () => {
    const csv = invoicesCsv([{ ...SAMPLE_INVOICES[0], customer: 'Say "hi", Ltd.' }]);
    expect(csv.split("\n")[1]).toBe('INV-1001,"Say ""hi"", Ltd.",$1250.00,paid,2026-10-31');
  });
});
