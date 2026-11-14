/** What a paste turns into when it is more than a few words: a link chip or a collapsed block. */
export type PasteChip =
  | { kind: "link"; url: string; label: string; icon: "pull" | "issue" }
  | { kind: "block"; language: string; text: string; lines: number };

const LINK_SOURCE =
  "https://(?:www\\.)?(?:github\\.com/([\\w.-]+)/([\\w.-]+)/(pull|issues)/(\\d+)|linear\\.app/[\\w-]+/issue/([A-Za-z][A-Za-z0-9]*-\\d+))(?:[/?#][^\\s]*)?";
/** A GitHub pull request or issue, or a Linear issue, anywhere in the draft. */
export const LINK_PATTERN = new RegExp(LINK_SOURCE, "g");
/** A fenced block as the draft stores it. The fence is longer than any run of backticks inside. */
export const BLOCK_PATTERN = /(`{3,})([\w+-]*)\n([\s\S]*?)\n\1/g;

const MIN_BLOCK_LINES = 4;
/* Past these, a paste is a chip whatever it holds: a contenteditable with thousands of lines makes
 * every later keystroke slow. */
const LARGE_LINES = 40;
const LARGE_CHARS = 4000;

const LANGUAGE_LABELS: Record<string, string> = {
  stacktrace: "Stack trace",
  log: "Log",
  diff: "Diff",
  json: "JSON",
  python: "Python",
  go: "Go",
  rust: "Rust",
  sql: "SQL",
  tsx: "TSX",
  ts: "TypeScript",
  js: "JavaScript",
  sh: "Shell",
  code: "Code",
  text: "Text",
};

export function languageLabel(language: string): string {
  return LANGUAGE_LABELS[language] ?? (language ? language.toUpperCase() : "Text");
}

export function linkChip(url: string): Extract<PasteChip, { kind: "link" }> | null {
  const match = new RegExp(`^${LINK_SOURCE}$`).exec(url);
  if (!match) return null;
  const [, , repo, type, number, linearId] = match;
  if (linearId) return { kind: "link", url, label: linearId.toUpperCase(), icon: "issue" };
  return { kind: "link", url, label: `${repo}#${number}`, icon: type === "pull" ? "pull" : "issue" };
}

export function blockChip(language: string, text: string): Extract<PasteChip, { kind: "block" }> {
  return { kind: "block", language: language || "text", text, lines: text.split("\n").length };
}

export function serializeBlock(language: string, text: string): string {
  const longestRun = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(Math.max(3, longestRun + 1));
  return `${fence}${language}\n${text}\n${fence}`;
}

const STACK_LINE = /^\s*at\s+\S.*(?::\d+(?::\d+)?\)?|\(native\)|\(<anonymous>\))\s*$/;
const LOG_LINE =
  /^\s*\[?(?:\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}|\d{2}:\d{2}:\d{2}|(?:TRACE|DEBUG|INFO|WARN|WARNING|ERROR|FATAL)\b)/;
const CODE_LINE =
  /[;{}([,]\s*$|^\s*[)}\]]|^\s*(?:import|export|const|let|var|function|def|class|return|if|elif|else|for|while|fn|pub|func|package|from|async|await|interface|type|#include|SELECT|INSERT|UPDATE)\b|^\s*\$ |=>|^\s{2,}\S/;

/** The block's language, or null when the text reads as prose. */
export function detectLanguage(text: string): string | null {
  const lines = text.split("\n").filter((line) => line.trim());
  if (!lines.length) return null;
  const share = (pattern: RegExp) => lines.filter((line) => pattern.test(line)).length / lines.length;
  if (/Traceback \(most recent call last\)/.test(text) || lines.filter((line) => STACK_LINE.test(line)).length >= 2) return "stacktrace";
  if (/^(?:diff --git |@@ -\d)/m.test(text) && share(/^[+\- @]/) > 0.6) return "diff";
  if (/^\s*[[{]/.test(text)) {
    try {
      JSON.parse(text);
      return "json";
    } catch {}
  }
  if (share(LOG_LINE) >= 0.5) return "log";
  if (share(CODE_LINE) < 0.5) return null;
  if (share(/^\s*\$ /) >= 0.3) return "sh";
  if (/^\s*(?:def \w+\(|from [\w.]+ import |import \w+\s*$)|\bself\./m.test(text) && !/;\s*$/m.test(text)) return "python";
  if (/^\s*package \w+\s*$|\bfunc (?:\(\w+ \*?\w+\) )?\w+\(/m.test(text)) return "go";
  if (/\bfn \w+\(|\blet mut\b|^\s*impl\b/m.test(text)) return "rust";
  if (/^\s*(?:SELECT|INSERT INTO|UPDATE|CREATE TABLE|WITH)\b/im.test(text) && !/[{}]/.test(text)) return "sql";
  if (/<\/?[A-Z]\w*[\s/>]|className=/.test(text)) return "tsx";
  if (/\binterface \w+|\bimport type\b|:\s*(?:string|number|boolean)\b|\bas const\b/.test(text)) return "ts";
  if (/\b(?:const|let|function)\b|=>/.test(text)) return "js";
  return "code";
}

/** The chip a paste becomes, or null when it goes in as plain text. */
export function classifyPaste(raw: string): PasteChip | null {
  const text = raw.replace(/^\s*\n/, "").replace(/\s+$/, "");
  const single = text.trim();
  if (!/\s/.test(single)) return linkChip(single);
  const fenced = /^(`{3,})([\w+-]*)\n([\s\S]*?)\n\1$/.exec(single);
  if (fenced) return blockChip(fenced[2] ?? "", fenced[3] ?? "");
  const lines = text.split("\n").length;
  const language = lines >= MIN_BLOCK_LINES ? detectLanguage(text) : null;
  if (language) return blockChip(language, text);
  if (lines > LARGE_LINES || text.length > LARGE_CHARS) return blockChip("text", text);
  return null;
}
