/**
 * The sample app a new project starts from: a small invoices module with real tests, so a request such as
 * "customers want to export invoices as CSV" has a place to land and a test suite to prove it. Kept as
 * strings rather than files on disk so Bob's own typecheck and test run never pick it up.
 */
export interface TemplateFile {
  path: string;
  content: string;
}

const readme = `# Invoices

A small TypeScript module that keeps a list of invoices, works out what is owed, and formats invoices for display.

- \`src/invoices.ts\`: the \`Invoice\` type, sample data, and list operations (add, mark paid, outstanding, overdue, totals).
- \`src/format.ts\`: money and invoice formatting for display.
- \`src/*.test.ts\`: vitest tests next to the code they check.

Amounts are integer cents. Dates are ISO \`YYYY-MM-DD\` strings.

Run the tests with \`npm test\` and the type check with \`npm run typecheck\`.
`;

const packageJson = `{
  "name": "invoices",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "5.9.3",
    "vitest": "5.1.0"
  }
}
`;

const tsconfig = `{
  "compilerOptions": {
    "target": "ES2022",
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
  { path: "src/invoices.ts", content: invoices },
  { path: "src/invoices.test.ts", content: invoicesTest },
  { path: "src/format.ts", content: format },
  { path: "src/format.test.ts", content: formatTest },
];
