import { describe, expect, it } from "vitest";
import { addInvoice, csvFilename, invoicesCsv, markPaid, outstanding, overdue, SAMPLE_INVOICES, totalCents } from "./invoices";

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

  it("exports every invoice as CSV with a header row", () => {
    expect(invoicesCsv(SAMPLE_INVOICES)).toBe(
      [
        "id,customer,amount,status,dueDate",
        "INV-1001,Acme Corp,1250.00,paid,2026-10-31",
        'INV-1002,"Globex, Inc.",480.50,sent,2026-11-14',
        "INV-1003,Initech,99.00,draft,2026-12-01",
        "",
      ].join("\n"),
    );
  });

  it("quotes CSV fields that contain commas, quotes or newlines", () => {
    const row = invoicesCsv([
      { id: "INV-2001", customer: 'He said "hi", then left', amountCents: 5, status: "sent", issuedDate: "2026-10-01", dueDate: "2026-10-31" },
    ]).split("\n")[1];
    expect(row).toBe('INV-2001,"He said ""hi"", then left",0.05,sent,2026-10-31');
  });

  it("names the CSV file after the export date", () => {
    expect(csvFilename("2026-11-30")).toBe("invoices-2026-11-30.csv");
  });
});
