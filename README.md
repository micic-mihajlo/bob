# Invoices

A small web page that lists invoices, over a TypeScript module that keeps the list, works out what is owed, and formats invoices for display.

- `index.html` and `src/main.ts`: the page. It shows the summary, an actions bar for buttons, and the invoice table.
- `src/page.ts`: renders the summary and the table rows as HTML strings, so the page logic has tests.
- `src/invoices.ts`: the `Invoice` type, sample data, and list operations (add, mark paid, outstanding, overdue, totals).
- `src/overdue.ts`: `isOverdue`, which decides whether a single invoice is unpaid and past its due date.
- `src/format.ts`: money and invoice formatting for display.
- `src/*.test.ts`: vitest tests next to the code they check.

Amounts are integer cents. Dates are ISO `YYYY-MM-DD` strings.

Run the tests with `npm test`, the type check with `npm run typecheck`, and build the page into `dist/` with `npm run build`. `npm run dev` serves it locally.
