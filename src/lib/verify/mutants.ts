/**
 * Line-level mutants for the changed lines of a JavaScript or TypeScript file: flipped comparisons and
 * logic, swapped arithmetic, off-by-one numbers, negated conditions and dropped calls. Only code is
 * mutated, never the inside of a string, template text, regular expression or comment.
 */

export interface Mutant {
  file: string;
  line: number;
  operator: string;
  /** The line before and after, trimmed, for the finding. */
  before: string;
  after: string;
  /** The whole mutated file. */
  source: string;
}

const REGEX_AFTER = /^(return|typeof|case|in|of|delete|void|throw|new|yield|await)$/;

/** Which characters of a source are code: false inside strings, template text, regular expressions and comments. */
export function codeMask(src: string): boolean[] {
  const code = new Array<boolean>(src.length).fill(true);
  const hide = (from: number, to: number) => {
    for (let k = from; k < Math.min(to, src.length); k++) code[k] = false;
  };
  const scanTemplate = (start: number): number => {
    let i = start + 1;
    hide(start, i);
    while (i < src.length && src[i] !== "`") {
      if (src[i] === "\\") {
        hide(i, i + 2);
        i += 2;
      } else if (src[i] === "$" && src[i + 1] === "{") {
        hide(i, i + 2);
        const end = scanCode(i + 2, true);
        hide(end, end + 1);
        i = end + 1;
      } else {
        hide(i, i + 1);
        i++;
      }
    }
    hide(i, i + 1);
    return i + 1;
  };
  const scanCode = (start: number, inExpression: boolean): number => {
    let i = start;
    let depth = 0;
    let last = "";
    while (i < src.length) {
      const c = src[i];
      const n = src[i + 1];
      if (c === "/" && (n === "/" || n === "*")) {
        const close = n === "/" ? src.indexOf("\n", i) : src.indexOf("*/", i + 2);
        const end = close < 0 ? src.length : n === "/" ? close : close + 2;
        hide(i, end);
        i = end;
      } else if (c === '"' || c === "'") {
        let j = i + 1;
        while (j < src.length && src[j] !== c && src[j] !== "\n") j += src[j] === "\\" ? 2 : 1;
        hide(i, j + 1);
        i = j + 1;
        last = "x";
      } else if (c === "`") {
        i = scanTemplate(i);
        last = "x";
      } else if (c === "/" && (last === "" || /[(,=:[!&|?{};+\-*%<>~^]/.test(last) || REGEX_AFTER.test(last))) {
        let j = i + 1;
        let inClass = false;
        while (j < src.length && src[j] !== "\n") {
          if (src[j] === "\\") j++;
          else if (src[j] === "[") inClass = true;
          else if (src[j] === "]") inClass = false;
          else if (src[j] === "/" && !inClass) break;
          j++;
        }
        j++;
        while (j < src.length && /[a-z]/i.test(src[j])) j++;
        hide(i, j);
        i = j;
        last = "x";
      } else if (/[A-Za-z_$0-9]/.test(c)) {
        let j = i;
        while (j < src.length && /[A-Za-z_$0-9.]/.test(src[j]) && !(src[j] === "." && !/[0-9]/.test(src[j + 1] ?? ""))) j++;
        last = src.slice(i, j);
        i = j;
      } else {
        if (inExpression && c === "{") depth++;
        if (inExpression && c === "}") {
          if (depth === 0) return i;
          depth--;
        }
        if (!/\s/.test(c)) last = c;
        i++;
      }
    }
    return i;
  };
  scanCode(0, false);
  return code;
}

const SWAPS: readonly { find: string; to: string; operator: string }[] = [
  { find: "===", to: "!==", operator: "flipped comparison" },
  { find: "!==", to: "===", operator: "flipped comparison" },
  { find: " <= ", to: " < ", operator: "off-by-one comparison" },
  { find: " >= ", to: " > ", operator: "off-by-one comparison" },
  { find: " < ", to: " <= ", operator: "off-by-one comparison" },
  { find: " > ", to: " >= ", operator: "off-by-one comparison" },
  { find: " && ", to: " || ", operator: "flipped logic" },
  { find: " || ", to: " && ", operator: "flipped logic" },
  { find: " + ", to: " - ", operator: "swapped arithmetic" },
  { find: " - ", to: " + ", operator: "swapped arithmetic" },
  { find: " * ", to: " / ", operator: "swapped arithmetic" },
  { find: " / ", to: " * ", operator: "swapped arithmetic" },
];

const DROPPABLE = /\.(replace|replaceAll|trim|trimStart|trimEnd|toLowerCase|toUpperCase|toFixed|padStart|padEnd|map|filter|sort|slice)\(/g;

/** The index of the parenthesis that closes the one at `open`, counting code only. */
function closing(src: string, code: boolean[], open: number): number {
  let depth = 0;
  for (let k = open; k < src.length; k++) {
    if (!code[k]) continue;
    if (src[k] === "(") depth++;
    if (src[k] === ")" && --depth === 0) return k;
  }
  return -1;
}

const allCode = (code: boolean[], from: number, to: number) => {
  for (let k = from; k < to; k++) if (!code[k]) return false;
  return true;
};

/** Every mutant of the given lines (1-based), deduplicated, at most `limit`. */
export function mutantsOf(file: string, src: string, lines: ReadonlySet<number>, limit = 40): Mutant[] {
  const code = codeMask(src);
  const starts = [0];
  for (let k = 0; k < src.length; k++) if (src[k] === "\n") starts.push(k + 1);
  const lineAt = (index: number) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= index) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
  const textOf = (s: string, line: number) => s.split("\n")[line - 1]?.trim() ?? "";
  const out: Mutant[] = [];
  const seen = new Set<string>();
  const add = (from: number, to: number, replacement: string, operator: string, checked = to) => {
    const line = lineAt(from);
    if (!lines.has(line) || !allCode(code, from, checked)) return;
    const before = textOf(src, line);
    if (/^(import|export type|type |interface )/.test(before)) return;
    const source = src.slice(0, from) + replacement + src.slice(to);
    if (seen.has(source)) return;
    seen.add(source);
    out.push({ file, line, operator, before, after: textOf(source, line), source });
  };
  for (const swap of SWAPS) {
    for (let at = src.indexOf(swap.find); at >= 0; at = src.indexOf(swap.find, at + 1)) add(at, at + swap.find.length, swap.to, swap.operator);
  }
  for (const m of src.matchAll(/(?<![\w$.])\d+(\.\d+)?(?![\w$])/g)) {
    add(m.index, m.index + m[0].length, String(Number(m[0]) + 1), "off-by-one number");
  }
  for (const m of src.matchAll(/\bif \(/g)) {
    const open = m.index + 3;
    const close = closing(src, code, open);
    if (close > open) add(open, close + 1, `(!${src.slice(open, close + 1)})`, "negated condition", open + 1);
  }
  for (const m of src.matchAll(DROPPABLE)) {
    const open = m.index + m[0].length - 1;
    const close = closing(src, code, open);
    if (close > open) add(m.index, close + 1, "", `dropped .${m[1]}()`, open + 1);
  }
  return out.sort((a, b) => a.line - b.line).slice(0, limit);
}

/** The lines a unified diff with zero context adds or changes, by hunk header. */
export function changedLines(diff: string): Set<number> {
  const lines = new Set<number>();
  for (const m of diff.matchAll(/^@@ -\S+ \+(\d+)(?:,(\d+))? @@/gm)) {
    const start = Number(m[1]);
    const count = m[2] === undefined ? 1 : Number(m[2]);
    for (let k = 0; k < count; k++) lines.add(start + k);
  }
  return lines;
}
