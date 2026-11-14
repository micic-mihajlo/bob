import { parseInline, type Inline } from "./inline";

export interface MdItem {
  /** null for a plain item, a boolean for a task list item. */
  checked: boolean | null;
  children: MdNode[];
}

export type MdNode =
  | { type: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; inline: Inline[] }
  | { type: "paragraph"; inline: Inline[] }
  | { type: "list"; ordered: boolean; start: number; items: MdItem[] }
  | { type: "quote"; children: MdNode[] }
  | { type: "rule" }
  | { type: "code"; lang: string; code: string };

interface Parsed<T> {
  node: T;
  next: number;
}

export const FENCE_OPEN = /^( *)(`{3,}|~{3,})[ \t]*([^\s`]*)[^`]*$/;
const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const RULE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const QUOTE = /^ {0,3}> ?(.*)$/;
const LIST_ITEM = /^( {0,3})([-+*]|\d{1,9}[.)])(?:([ \t]+)(.*))?$/;
const TASK = /^\[([ xX])\][ \t]+/;

const leadingSpaces = (line: string): number => /^ */.exec(line)?.[0].length ?? 0;
const isBlank = (line: string): boolean => line.trim() === "";
const dedent = (line: string, amount: number): string => line.slice(Math.min(amount, leadingSpaces(line)));

function startsBlock(line: string): boolean {
  return FENCE_OPEN.test(line) || HEADING.test(line) || RULE.test(line) || QUOTE.test(line) || LIST_ITEM.test(line);
}

/** The index just past a fence that opens at `start`. An unclosed fence runs to the end. */
export function fenceEnd(lines: readonly string[], start: number): { close: number; next: number } {
  const marker = FENCE_OPEN.exec(lines[start] ?? "")?.[2] ?? "```";
  const closing = new RegExp(`^ *${marker.charAt(0) === "`" ? "`" : "~"}{${marker.length},}[ \\t]*$`);
  const close = lines.findIndex((line, index) => index > start && closing.test(line));
  return close < 0 ? { close: lines.length, next: lines.length } : { close, next: close + 1 };
}

function parseFence(lines: readonly string[], start: number): Parsed<MdNode> {
  const [, indent = "", , lang = ""] = FENCE_OPEN.exec(lines[start] ?? "") ?? [];
  const { close, next } = fenceEnd(lines, start);
  const code = lines
    .slice(start + 1, close)
    .map((line) => dedent(line, indent.length))
    .join("\n");
  return { node: { type: "code", lang: lang.toLowerCase(), code }, next };
}

function parseQuote(lines: readonly string[], start: number): Parsed<MdNode> {
  const end = lines.findIndex((line, index) => index >= start && !QUOTE.test(line));
  const next = end < 0 ? lines.length : end;
  const inner = lines.slice(start, next).map((line) => QUOTE.exec(line)?.[1] ?? "");
  return { node: { type: "quote", children: parseBlocks(inner) }, next };
}

interface Marker {
  ordered: boolean;
  symbol: string;
  number: number;
  contentIndent: number;
  first: string;
}

function readMarker(line: string): Marker | null {
  const found = LIST_ITEM.exec(line);
  if (!found || RULE.test(line)) return null;
  const [, indent = "", marker = "", gap = " ", rest = ""] = found;
  const ordered = /\d/.test(marker);
  const contentIndent = indent.length + marker.length + (gap.length > 4 ? 1 : gap.length);
  return { ordered, symbol: ordered ? marker.slice(-1) : marker, number: ordered ? Number.parseInt(marker, 10) : 1, contentIndent, first: rest };
}

/** The lines that belong to one item, already dedented, and where the item ends. */
function itemLines(lines: readonly string[], start: number, marker: Marker): Parsed<string[]> {
  let body = [marker.first];
  let index = start + 1;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (isBlank(line)) {
      const resume = lines.findIndex((later, at) => at > index && !isBlank(later));
      if (resume < 0 || leadingSpaces(lines[resume] ?? "") < marker.contentIndent) break;
      body = [...body, ""];
    } else if (leadingSpaces(line) >= marker.contentIndent) {
      body = [...body, dedent(line, marker.contentIndent)];
    } else if (!isBlank(body[body.length - 1] ?? "") && !startsBlock(line)) {
      body = [...body, line.trim()];
    } else {
      break;
    }
    index += 1;
  }
  return { node: body, next: index };
}

function parseList(lines: readonly string[], start: number): Parsed<MdNode> {
  const first = readMarker(lines[start] ?? "");
  if (!first) return { node: { type: "paragraph", inline: parseInline(lines[start] ?? "") }, next: start + 1 };
  let items: MdItem[] = [];
  let index = start;
  while (index < lines.length) {
    const marker = readMarker(lines[index] ?? "");
    if (!marker || marker.ordered !== first.ordered || marker.symbol !== first.symbol) break;
    const { node: body, next } = itemLines(lines, index, marker);
    const task = TASK.exec(body[0] ?? "");
    const content = task ? [(body[0] ?? "").slice(task[0].length), ...body.slice(1)] : body;
    items = [...items, { checked: task ? task[1] !== " " : null, children: parseBlocks(content) }];
    const resume = lines.findIndex((line, at) => at >= next && !isBlank(line));
    // A blank line between two items keeps the list going.
    index = resume >= 0 && readMarker(lines[resume] ?? "") ? resume : next;
    if (index !== resume) break;
  }
  return { node: { type: "list", ordered: first.ordered, start: first.number, items }, next: index };
}

function parseParagraph(lines: readonly string[], start: number): Parsed<MdNode> {
  const end = lines.findIndex((line, index) => index > start && (isBlank(line) || startsBlock(line)));
  const next = end < 0 ? lines.length : end;
  const text = lines
    .slice(start, next)
    .map((line) => line.trim())
    .join("\n");
  return { node: { type: "paragraph", inline: parseInline(text) }, next };
}

function parseOne(lines: readonly string[], start: number): Parsed<MdNode> {
  const line = lines[start] ?? "";
  if (FENCE_OPEN.test(line)) return parseFence(lines, start);
  const heading = HEADING.exec(line);
  if (heading) {
    const level = (heading[1]?.length ?? 1) as 1 | 2 | 3 | 4 | 5 | 6;
    return { node: { type: "heading", level, inline: parseInline(heading[2] ?? "") }, next: start + 1 };
  }
  if (RULE.test(line)) return { node: { type: "rule" }, next: start + 1 };
  if (QUOTE.test(line)) return parseQuote(lines, start);
  if (readMarker(line)) return parseList(lines, start);
  return parseParagraph(lines, start);
}

function parseBlocks(lines: readonly string[]): MdNode[] {
  let nodes: MdNode[] = [];
  let index = 0;
  while (index < lines.length) {
    if (isBlank(lines[index] ?? "")) {
      index += 1;
      continue;
    }
    const { node, next } = parseOne(lines, index);
    nodes = [...nodes, node];
    index = Math.max(next, index + 1);
  }
  return nodes;
}

/** Parses the block structure of a markdown segment. Never throws. */
export function parseMarkdown(text: string): MdNode[] {
  return parseBlocks(text.replace(/\r\n?/g, "\n").replace(/\t/g, "    ").split("\n"));
}
