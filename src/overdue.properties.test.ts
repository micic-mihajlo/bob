import fc from "fast-check";
import { it } from "vitest";
import { overdueInvoices, type Invoice } from "./invoices";

const day = fc.date({ min: new Date("2020-01-01"), max: new Date("2030-12-31"), noInvalidDate: true }).map((d) => d.toISOString().slice(0, 10));
const invoice: fc.Arbitrary<Invoice> = fc.record({
  id: fc.stringMatching(/^INV-[0-9]{4}$/),
  customer: fc.string({ maxLength: 12 }),
  amountCents: fc.integer({ min: 0, max: 10_000_000 }),
  status: fc.constantFrom("draft", "sent", "paid"),
  issuedDate: day,
  dueDate: day,
});
const invoices = fc.array(invoice, { maxLength: 12 });

it("only sent invoices come back", () => {
  fc.assert(fc.property(invoices, day, (list, today) => overdueInvoices(list, today).every((i) => i.status === "sent")));
});

it("oldest due date first", () => {
  fc.assert(
    fc.property(invoices, day, (list, today) => {
      const due = overdueInvoices(list, today).map((i) => i.dueDate);
      return due.every((d, k) => k === 0 || due[k - 1] <= d);
    }),
  );
});

it("every sent invoice past its due date comes back", () => {
  fc.assert(
    fc.property(invoices, day, (list, today) => {
      const result = overdueInvoices(list, today);
      return list.filter((i) => i.status === "sent" && i.dueDate < today).every((i) => result.includes(i));
    }),
  );
});

it("an invoice due today is not overdue yet", () => {
  fc.assert(fc.property(invoice, day, (i, today) => overdueInvoices([{ ...i, status: "sent", dueDate: today }], today).length === 0));
});
