import { inlineText, parseInline } from "./inline";
import type { TableAlign, TableBlock } from "./types";

const SEPARATOR_CELL = /^:?-{1,}:?$/;
const YES = new Set(["✓", "✔", "✔️", "✅"]);
const NO = new Set(["✗", "✘", "✕", "×", "❌"]);

/** Splits a table row on its unescaped pipes. Pipes inside a code span stay in the cell. */
export function splitRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "");
  const body = trimmed.endsWith("|") && !trimmed.endsWith("\\|") ? trimmed.slice(0, -1) : trimmed;
  let cells: string[] = [];
  let cell = "";
  let inCode = false;
  for (let index = 0; index < body.length; index += 1) {
    const char = body.charAt(index);
    if (char === "\\" && body.charAt(index + 1) === "|") {
      cell += "|";
      index += 1;
    } else if (char === "`") {
      inCode = !inCode;
      cell += char;
    } else if (char === "|" && !inCode) {
      cells = [...cells, cell.trim()];
      cell = "";
    } else {
      cell += char;
    }
  }
  return [...cells, cell.trim()];
}

function alignOf(cell: string): TableAlign {
  const left = cell.startsWith(":");
  const right = cell.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  return left ? "left" : null;
}

function separatorAligns(line: string, columns: number): TableAlign[] | null {
  if (!line.includes("-")) return null;
  const cells = splitRow(line);
  if (cells.length !== columns || !cells.every((cell) => SEPARATOR_CELL.test(cell))) return null;
  return cells.map(alignOf);
}

/** A GFM table starting at `start`, or null. Rows run until a blank line or a line with no pipe. */
export function readTable(lines: readonly string[], start: number): { table: TableBlock; next: number } | null {
  const head = lines[start] ?? "";
  if (!head.includes("|") || /^\s/.test(head)) return null;
  const header = splitRow(head);
  const align = separatorAligns(lines[start + 1] ?? "", header.length);
  if (!align || header.length < 2) return null;
  const end = lines.findIndex((line, index) => index > start + 1 && (line.trim() === "" || !line.includes("|")));
  const next = end < 0 ? lines.length : end;
  const rows = lines.slice(start + 2, next).map((line) => {
    const cells = splitRow(line);
    return header.map((_, column) => cells[column] ?? "");
  });
  return { table: { kind: "table", header, align, rows }, next };
}

export type Mark = "yes" | "no";

export function markOf(cell: string): Mark | null {
  const text = cell.trim();
  if (YES.has(text)) return "yes";
  return NO.has(text) ? "no" : null;
}

/** True when every cell after the first column is a check or a cross. */
export function isComparison(table: TableBlock): boolean {
  return (
    table.header.length >= 2 &&
    table.rows.length > 0 &&
    table.rows.every((row) => row.slice(1).every((cell) => markOf(cell) !== null))
  );
}

function csvCell(markdown: string): string {
  const mark = markOf(markdown);
  const text = mark ? mark : inlineText(parseInline(markdown));
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** The table as CSV, with markdown stripped from every cell. */
export function tableToCsv(table: TableBlock): string {
  return [table.header, ...table.rows].map((row) => row.map(csvCell).join(",")).join("\n");
}
