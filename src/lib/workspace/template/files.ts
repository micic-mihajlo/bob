/**
 * The sample app a new project starts from. Kept as strings rather than files on disk
 * so Bob's own typecheck and test run never pick it up, and bundling cannot lose it.
 */
export interface TemplateFile {
  path: string;
  content: string;
}

const readme = `# Invoices

A small TypeScript module that keeps a list of invoices and formats them for display.

- \`src/invoices.ts\` holds the invoice type and the list operations.
- \`src/format.ts\` turns an invoice into a line of text.
- \`src/format.test.ts\` checks the formatter.

Run the tests with \`npm test\`.
`;

const packageJson = `{
  "name": "invoices",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run"
  },
  "devDependencies": {
    "typescript": "^5",
    "vitest": "^3"
  }
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
  dueDate: string;
}

export function addInvoice(list: readonly Invoice[], invoice: Invoice): Invoice[] {
  return [...list, invoice];
}

export function markPaid(list: readonly Invoice[], id: string): Invoice[] {
  return list.map((invoice) => (invoice.id === id ? { ...invoice, status: "paid" } : invoice));
}

export function outstanding(list: readonly Invoice[]): Invoice[] {
  return list.filter((invoice) => invoice.status !== "paid");
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

const formatTest = `import { describe, expect, it } from "vitest";
import { formatAmount, formatInvoice } from "./format";

describe("format", () => {
  it("formats cents as dollars", () => {
    expect(formatAmount(123456)).toBe("$1234.56");
  });

  it("formats one invoice as a line", () => {
    const line = formatInvoice({
      id: "INV-1",
      customer: "Customer A",
      amountCents: 5000,
      status: "sent",
      dueDate: "2026-12-01",
    });
    expect(line).toBe("INV-1  Customer A  $50.00  sent");
  });
});
`;

export const TEMPLATE_FILES: readonly TemplateFile[] = [
  { path: "README.md", content: readme },
  { path: "package.json", content: packageJson },
  { path: ".gitignore", content: gitignore },
  { path: "src/invoices.ts", content: invoices },
  { path: "src/format.ts", content: format },
  { path: "src/format.test.ts", content: formatTest },
];
