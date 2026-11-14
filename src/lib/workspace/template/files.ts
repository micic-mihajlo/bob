/**
 * The sample app a new project starts from: a small invoices web page over an invoices module with real
 * tests, so a request such as "customers want to export invoices as CSV" has a place to land, a test suite
 * to prove it, and a page a preview deployment can show. Vite builds it with no config (vitest already
 * installs it), which Vercel detects as is. Kept as strings rather than files on disk so Bob's own
 * typecheck and test run never pick it up.
 */
export interface TemplateFile {
  path: string;
  content: string;
}

const readme = `# Invoices

A small web page that lists invoices, over a TypeScript module that keeps the list, works out what is owed, and formats invoices for display.

- \`index.html\` and \`src/main.ts\`: the page. It shows the summary, an actions bar for buttons, and the invoice table.
- \`src/page.ts\`: renders the summary and the table rows as HTML strings, so the page logic has tests.
- \`src/invoices.ts\`: the \`Invoice\` type, sample data, and list operations (add, mark paid, outstanding, overdue, totals).
- \`src/format.ts\`: money and invoice formatting for display.
- \`src/*.test.ts\`: vitest tests next to the code they check.

Amounts are integer cents. Dates are ISO \`YYYY-MM-DD\` strings.

Run the tests with \`npm test\`, the type check with \`npm run typecheck\`, and build the page into \`dist/\` with \`npm run build\`. \`npm run dev\` serves it locally.
`;

const packageJson = `{
  "name": "invoices",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "fast-check": "4.10.2",
    "typescript": "5.9.3",
    "vite": "8.3.8",
    "vitest": "5.1.0"
  }
}
`;

const tsconfig = `{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
`;

const gitignore = `node_modules
dist
`;

const indexHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Invoices</title>
    <link rel="stylesheet" href="/src/style.css" />
  </head>
  <body>
    <main>
      <h1>Invoices</h1>
      <p id="summary"></p>
      <div id="actions"></div>
      <table>
        <thead>
          <tr><th>Invoice</th><th>Customer</th><th>Amount</th><th>Status</th><th>Due</th></tr>
        </thead>
        <tbody id="invoices"></tbody>
      </table>
    </main>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`;

const style = `body {
  margin: 0;
  font: 15px/1.5 system-ui, sans-serif;
  color: #1c1c1c;
  background: #fafafa;
}

main {
  max-width: 760px;
  margin: 48px auto;
  padding: 0 24px;
}

#actions {
  display: flex;
  gap: 8px;
  margin: 16px 0;
}

table {
  width: 100%;
  border-collapse: collapse;
  background: #fff;
}

th,
td {
  padding: 8px 12px;
  border-bottom: 1px solid #e6e6e6;
  text-align: left;
}

td.amount {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
`;

const page = `import { formatAmount } from "./format";
import { outstanding, totalCents, type Invoice } from "./invoices";

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

/** One table row per invoice. */
export function invoiceRows(list: readonly Invoice[]): string {
  return list
    .map(
      (invoice) =>
        \`<tr><td>\${escapeHtml(invoice.id)}</td><td>\${escapeHtml(invoice.customer)}</td><td class="amount">\${formatAmount(invoice.amountCents)}</td><td>\${invoice.status}</td><td>\${invoice.dueDate}</td></tr>\`,
    )
    .join("");
}

export function summary(list: readonly Invoice[]): string {
  const owed = outstanding(list);
  return \`\${list.length} invoices, \${owed.length} outstanding (\${formatAmount(totalCents(owed))} owed)\`;
}
`;

const main = `import { SAMPLE_INVOICES } from "./invoices";
import { invoiceRows, summary } from "./page";

const invoices = [...SAMPLE_INVOICES];

document.querySelector("#summary")!.textContent = summary(invoices);
document.querySelector("#invoices")!.innerHTML = invoiceRows(invoices);
`;

const pageTest = `import { describe, expect, it } from "vitest";
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

  it("summarises what is owed", () => {
    expect(summary(SAMPLE_INVOICES)).toBe("3 invoices, 2 outstanding ($579.50 owed)");
  });
});
`;

const invoices = `export type InvoiceStatus = "draft" | "sent" | "paid";

export interface Invoice {
  id: string;
  customer: string;
  amountCents: number;
  status: InvoiceStatus;
  issuedDate: string;
  dueDate: string;
}

export const SAMPLE_INVOICES: readonly Invoice[] = [
  { id: "INV-1001", customer: "Acme Corp", amountCents: 125000, status: "paid", issuedDate: "2026-10-01", dueDate: "2026-10-31" },
  { id: "INV-1002", customer: "Globex, Inc.", amountCents: 48050, status: "sent", issuedDate: "2026-10-15", dueDate: "2026-11-14" },
  { id: "INV-1003", customer: "Initech", amountCents: 9900, status: "draft", issuedDate: "2026-11-01", dueDate: "2026-12-01" },
];

export function addInvoice(list: readonly Invoice[], invoice: Invoice): Invoice[] {
  if (list.some((existing) => existing.id === invoice.id)) throw new Error(\`Invoice \${invoice.id} already exists\`);
  return [...list, invoice];
}

export function markPaid(list: readonly Invoice[], id: string): Invoice[] {
  return list.map((invoice) => (invoice.id === id ? { ...invoice, status: "paid" } : invoice));
}

export function outstanding(list: readonly Invoice[]): Invoice[] {
  return list.filter((invoice) => invoice.status !== "paid");
}

/** Sent and unpaid past their due date. Dates compare as ISO strings. */
export function overdue(invoices: readonly Invoice[], today: string): Invoice[] {
  return invoices.filter((invoice) => invoice.status === "sent" && invoice.dueDate < today);
}

export function totalCents(list: readonly Invoice[]): number {
  return list.reduce((sum, invoice) => sum + invoice.amountCents, 0);
}
`;

const format = `import type { Invoice } from "./invoices";

export function formatAmount(cents: number): string {
  return \`$\${(cents / 100).toFixed(2)}\`;
}

export function formatInvoice(invoice: Invoice): string {
  return \`\${invoice.id}  \${invoice.customer}  \${formatAmount(invoice.amountCents)}  \${invoice.status}\`;
}
`;

const invoicesTest = `import { describe, expect, it } from "vitest";
import { addInvoice, markPaid, outstanding, overdue, SAMPLE_INVOICES, totalCents } from "./invoices";

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
`;

const formatTest = `import { describe, expect, it } from "vitest";
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
`;

export const TEMPLATE_FILES: readonly TemplateFile[] = [
  { path: "README.md", content: readme },
  { path: "package.json", content: packageJson },
  { path: "tsconfig.json", content: tsconfig },
  { path: ".gitignore", content: gitignore },
  { path: "index.html", content: indexHtml },
  { path: "src/style.css", content: style },
  { path: "src/main.ts", content: main },
  { path: "src/page.ts", content: page },
  { path: "src/page.test.ts", content: pageTest },
  { path: "src/invoices.ts", content: invoices },
  { path: "src/invoices.test.ts", content: invoicesTest },
  { path: "src/format.ts", content: format },
  { path: "src/format.test.ts", content: formatTest },
];
