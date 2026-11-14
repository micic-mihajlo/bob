import { describe, expect, it } from "vitest";
import { SAMPLE_INVOICES } from "./invoices";
import { invoiceRows, summary } from "./page";

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

  it("summarises what is owed and how many are overdue", () => {
    expect(summary(SAMPLE_INVOICES, "2026-11-20")).toBe("3 invoices, 2 outstanding ($579.50 owed), 1 overdue");
    expect(summary(SAMPLE_INVOICES, "2026-11-01")).toBe("3 invoices, 2 outstanding ($579.50 owed), 0 overdue");
  });
});
