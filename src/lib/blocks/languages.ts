export type TokenKind =
  | "plain"
  | "keyword"
  | "string"
  | "number"
  | "comment"
  | "type"
  | "fn"
  | "literal"
  | "property"
  | "variable"
  | "add"
  | "del"
  | "hunk"
  | "meta";

export interface Rule {
  kind: TokenKind;
  pattern: RegExp;
  /** A guard on the position, for rules that only start a token in some places. */
  when?: (code: string, at: number) => boolean;
  /** Picks the kind from the matched text, for words that may be keywords, types or calls. */
  classify?: (text: string, code: string, end: number) => TokenKind;
}

export type LanguageId = "ts" | "json" | "bash" | "python";

const ALIASES: Record<string, LanguageId | "diff"> = {
  ts: "ts",
  tsx: "ts",
  typescript: "ts",
  js: "ts",
  jsx: "ts",
  javascript: "ts",
  mjs: "ts",
  cjs: "ts",
  json: "json",
  jsonc: "json",
  bash: "bash",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  console: "bash",
  python: "python",
  py: "python",
  diff: "diff",
  patch: "diff",
};

export function languageOf(lang: string): LanguageId | "diff" | null {
  return ALIASES[lang.trim().toLowerCase()] ?? null;
}

const words = (list: string): ReadonlySet<string> => new Set(list.split(" "));

const TS_KEYWORDS = words(
  "as async await break case catch class const continue debugger default delete do else enum export extends finally for from function if implements import in instanceof interface let new of private protected public readonly return satisfies static super switch this throw try type typeof var void while yield keyof declare abstract",
);
const TS_LITERALS = words("true false null undefined NaN Infinity");
const PY_KEYWORDS = words(
  "and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case self",
);
const PY_LITERALS = words("True False None");
const BASH_KEYWORDS = words(
  "if then else elif fi for while until do done case esac in function return export local readonly set unset source alias exit",
);

function nextNonSpace(code: string, end: number): string {
  return /\S/.exec(code.slice(end, end + 40))?.[0] ?? "";
}

function wordClassifier(keywords: ReadonlySet<string>, literals: ReadonlySet<string>) {
  return (text: string, code: string, end: number): TokenKind => {
    if (keywords.has(text)) return "keyword";
    if (literals.has(text)) return "literal";
    if (nextNonSpace(code, end) === "(") return "fn";
    return /^[A-Z][a-z0-9]/.test(text) ? "type" : "plain";
  };
}

const atWordStart = (code: string, at: number): boolean => at === 0 || /[\s;|&(]/.test(code.charAt(at - 1));

const DOUBLE_QUOTED = /"(?:[^"\\\n]|\\.)*"?/;
const SINGLE_QUOTED = /'(?:[^'\\\n]|\\.)*'?/;
const NUMBER = /(?:0[xXbBoO][\da-fA-F_]+|\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?)n?/;

export const LANGUAGES: Record<LanguageId, readonly Rule[]> = {
  ts: [
    { kind: "comment", pattern: /\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)/ },
    { kind: "string", pattern: DOUBLE_QUOTED },
    { kind: "string", pattern: SINGLE_QUOTED },
    { kind: "string", pattern: /`(?:[^`\\]|\\[\s\S])*`?/ },
    { kind: "number", pattern: NUMBER, when: (code, at) => !/[\w$]/.test(code.charAt(at - 1)) },
    { kind: "plain", pattern: /[A-Za-z_$][\w$]*/, classify: wordClassifier(TS_KEYWORDS, TS_LITERALS) },
  ],
  json: [
    { kind: "property", pattern: /"(?:[^"\\\n]|\\.)*"(?=\s*:)/ },
    { kind: "string", pattern: DOUBLE_QUOTED },
    { kind: "number", pattern: /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/ },
    { kind: "literal", pattern: /\b(?:true|false|null)\b/ },
    { kind: "comment", pattern: /\/\/[^\n]*/ },
  ],
  bash: [
    { kind: "comment", pattern: /#[^\n]*/, when: atWordStart },
    { kind: "string", pattern: DOUBLE_QUOTED },
    { kind: "string", pattern: SINGLE_QUOTED },
    { kind: "variable", pattern: /\$\{[^}\n]*\}?|\$[\w@#?$!*-]?/ },
    { kind: "property", pattern: /--?[A-Za-z][\w-]*/, when: atWordStart },
    { kind: "plain", pattern: /[A-Za-z_][\w-]*/, classify: (text) => (BASH_KEYWORDS.has(text) ? "keyword" : "plain") },
  ],
  python: [
    { kind: "comment", pattern: /#[^\n]*/ },
    { kind: "string", pattern: /[rRbBfFuU]{0,2}(?:"""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$))/ },
    { kind: "string", pattern: /[rRbBfFuU]{0,2}(?:"(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?)/ },
    { kind: "fn", pattern: /@[\w.]+/, when: atWordStart },
    { kind: "number", pattern: NUMBER, when: (code, at) => !/\w/.test(code.charAt(at - 1)) },
    { kind: "plain", pattern: /[A-Za-z_]\w*/, classify: wordClassifier(PY_KEYWORDS, PY_LITERALS) },
  ],
};
