import { describe, expect, it } from "vitest";
import { formatAmount, formatInvoice } from "./format";
import { SAMPLE_INVOICES } from "./invoices";

describe("format", () => {
  it("formats cents as dollars", () => {
    expect(formatAmount(123456)).toBe("$1234.56");
    expect(formatAmount(5)).toBe("$0.05");
  });

  it("formats one invoice as a line", () => {
    expect(formatInvoice(SAMPLE_INVOICES[1])).toBe("INV-1002  Globex, Inc.  $480.50  sent");
  });
});
