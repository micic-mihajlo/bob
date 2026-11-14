import { LANGUAGES, languageOf, type Rule, type TokenKind } from "./languages";

export type { TokenKind } from "./languages";

export interface Token {
  kind: TokenKind;
  text: string;
}

function* scan(code: string, rules: readonly Rule[]): Generator<Token> {
  // Sticky copies are made per call, so no shared regex carries `lastIndex` between calls.
  const sticky = rules.map((rule) => ({ ...rule, regex: new RegExp(rule.pattern.source, "y") }));
  let plainStart = 0;
  let index = 0;
  while (index < code.length) {
    const hit = sticky
      .map((rule) => {
        if (rule.when && !rule.when(code, index)) return null;
        rule.regex.lastIndex = index;
        const found = rule.regex.exec(code);
        return found && found[0].length > 0 ? { rule, text: found[0] } : null;
      })
      .find((candidate) => candidate !== null);
    if (!hit) {
      index += 1;
      continue;
    }
    if (plainStart < index) yield { kind: "plain", text: code.slice(plainStart, index) };
    const end = index + hit.text.length;
    yield { kind: hit.rule.classify ? hit.rule.classify(hit.text, code, end) : hit.rule.kind, text: hit.text };
    index = end;
    plainStart = end;
  }
  if (plainStart < code.length) yield { kind: "plain", text: code.slice(plainStart) };
}

/** Diff colouring is per line: the first character decides the whole line. */
function* scanDiff(code: string): Generator<Token> {
  const lines = code.split("\n");
  for (const [index, line] of lines.entries()) {
    const kind: TokenKind = /^(?:diff |index |--- |\+\+\+ |similarity |rename |new file|deleted file)/.test(line)
      ? "meta"
      : line.startsWith("@@")
        ? "hunk"
        : line.startsWith("+")
          ? "add"
          : line.startsWith("-")
            ? "del"
            : "plain";
    if (line !== "") yield { kind, text: line };
    if (index < lines.length - 1) yield { kind: "plain", text: "\n" };
  }
}

/** Splits code into coloured tokens. Joined back together they are exactly `code`. */
export function highlight(code: string, lang: string): Token[] {
  const language = languageOf(lang);
  if (language === "diff") return Array.from(scanDiff(code));
  if (language === null) return code === "" ? [] : [{ kind: "plain", text: code }];
  return Array.from(scan(code, LANGUAGES[language]));
}

function* lineTokens(tokens: readonly Token[]): Generator<Token[]> {
  let line: Token[] = [];
  for (const token of tokens) {
    const parts = token.text.split("\n");
    for (const [index, part] of parts.entries()) {
      if (index > 0) {
        yield line;
        line = [];
      }
      if (part !== "") line = [...line, { kind: token.kind, text: part }];
    }
  }
  yield line;
}

/** Tokens grouped by source line, for line numbers. A trailing newline does not add an empty line. */
export function splitLines(tokens: readonly Token[]): Token[][] {
  const lines = Array.from(lineTokens(tokens));
  return lines.length > 1 && lines[lines.length - 1]?.length === 0 ? lines.slice(0, -1) : lines;
}
