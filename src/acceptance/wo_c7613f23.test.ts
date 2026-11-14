import { describe, expect, it } from "vitest";
import { invoicesToCsv } from "../csv";

describe("invoicesToCsv", () => {
  it("writes a header and one row per invoice", () => {
    const csv = invoicesToCsv([{ id: "INV-1", customer: "Customer A", amountCents: 5000, status: "sent", dueDate: "2026-12-01" }]);
    expect(csv).toBe("id,customer,amount,status,dueDate\nINV-1,Customer A,50.00,sent,2026-12-01");
  });

  it("quotes a customer name that holds a comma", () => {
    const csv = invoicesToCsv([{ id: "INV-2", customer: "Smith, Jones", amountCents: 1, status: "draft", dueDate: "2026-12-02" }]);
    expect(csv.split("\n")[1]).toBe('INV-2,"Smith, Jones",0.01,draft,2026-12-02');
  });
});
