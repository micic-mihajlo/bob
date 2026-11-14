"use client";

import { type ShjLanguage, type ShjToken, tokenize } from "@speed-highlight/core";
import { Check, Copy } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { MessageCodeBlock } from "./DataTable";

export interface CodeToken {
  text: string;
  type?: ShjToken | undefined;
}

export type CodeLine = CodeToken[];

interface HighlightedCode {
  /** The highlighted source. While the block streams, this ends at its last line break. */
  code: string;
  language: ShjLanguage;
  lines: CodeLine[];
  /** For each line start, whether the tokenizer had no open token there, so it can start again there. */
  restarts: boolean[];
}

const LANGUAGE_ALIASES: Record<string, ShjLanguage> = {
  assembly: "asm",
  shell: "bash",
  sh: "bash",
  zsh: "bash",
  cpp: "c",
  cxx: "c",
  dockerfile: "docker",
  golang: "go",
  htaccess: "http",
  htm: "html",
  javascript: "js",
  jsx: "js",
  mjs: "js",
  cjs: "js",
  makefile: "make",
  markdown: "md",
  mts: "ts",
  cts: "ts",
  patch: "diff",
  perl: "pl",
  plaintext: "plain",
  text: "plain",
  txt: "plain",
  python: "py",
  rust: "rs",
  scss: "css",
  typescript: "ts",
  tsx: "ts",
  svg: "xml",
  yml: "yaml",
};

const SUPPORTED_LANGUAGES = new Set<string>([
  "asm",
  "bash",
  "bf",
  "c",
  "css",
  "csv",
  "diff",
  "docker",
  "git",
  "go",
  "html",
  "http",
  "ini",
  "java",
  "js",
  "jsdoc",
  "json",
  "leanpub-md",
  "log",
  "lua",
  "make",
  "md",
  "pl",
  "plain",
  "py",
  "regex",
  "rs",
  "sql",
  "todo",
  "toml",
  "ts",
  "uri",
  "xml",
  "yaml",
]);

// Words, not language names.
const LANGUAGE_TEXT = {
  asm: "Assembly",
  bash: "Shell",
  diff: "Diff",
  plain: "Code",
  regex: "Regular expression",
} as const satisfies Partial<Record<ShjLanguage, string>>;

// Mermaid has no highlighter, so it shows as plain code with its own name.
const PLAIN_LANGUAGE_LABELS: Record<string, string> = { mermaid: "Mermaid", mmd: "Mermaid" };

const LANGUAGE_LABELS: Partial<Record<ShjLanguage, string>> = {
  c: "C",
  css: "CSS",
  csv: "CSV",
  docker: "Dockerfile",
  go: "Go",
  html: "HTML",
  http: "HTTP",
  ini: "INI",
  java: "Java",
  js: "JavaScript",
  jsdoc: "JSDoc",
  json: "JSON",
  lua: "Lua",
  make: "Makefile",
  md: "Markdown",
  py: "Python",
  rs: "Rust",
  sql: "SQL",
  toml: "TOML",
  ts: "TypeScript",
  xml: "XML",
  yaml: "YAML",
};

export function CodeBlock(props: {
  block: MessageCodeBlock;
  streaming?: boolean | undefined;
  /** Buttons before Copy, such as the switch between a preview and its code. */
  actions?: ReactNode;
  /** Buttons after Copy, such as the button that opens a larger view. */
  trailingActions?: ReactNode;
  /** Places the code lines in a larger body, such as beside a rendered preview of the code. */
  body?: ((code: ReactNode) => ReactNode) | undefined;
}) {
  const [lines, setLines] = useState<CodeLine[]>(() => plainCodeLines(props.block.code));
  const [copied, setCopied] = useState(false);
  const highlightRun = useRef(0);
  const highlighted = useRef<HighlightedCode | undefined>(undefined);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const language = codeLanguage(props.block.language);
  const languageLabel = codeLanguageLabel(props.block.language);
  const streaming = props.streaming === true;
  const blockCode = props.block.code;

  // While the block streams, only complete lines are highlighted, and only from the last line that
  // the tokenizer can start again at. The open line shows as plain text until it ends. The complete
  // block is highlighted whole once, so a color that depends on later lines is correct at the end.
  useEffect(() => {
    const run = ++highlightRun.current;
    const languageChanged = highlighted.current !== undefined && highlighted.current.language !== language;
    if (languageChanged) highlighted.current = undefined;
    setLines((current) => reusedCodeLines(blockCode, highlighted.current?.lines ?? [], languageChanged ? [] : current));
    if (language === "plain") return;

    const source = streaming ? blockCode.slice(0, blockCode.lastIndexOf("\n") + 1) : blockCode;
    if (streaming && highlighted.current?.code === source) return;
    void highlightedCode(source, language, streaming ? highlighted.current : undefined).then((result) => {
      if (run !== highlightRun.current) return;
      highlighted.current = result;
      setLines((current) => reusedCodeLines(blockCode, result.lines, current));
    });
  }, [blockCode, language, streaming]);

  useEffect(() => {
    const run = highlightRun;
    const timer = copiedTimer;
    return () => {
      run.current += 1;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(props.block.code);
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 1_500);
    } catch {
      setCopied(false);
    }
  };

  // One element, so the code keeps its scroll position when a caller moves it into its body.
  const code = (
    <pre className="message-code-scroll" tabIndex={0}>
      <code>
        {lines.map((line, lineIndex) => (
          <span key={lineIndex} className="message-code-line">
            <span className="message-code-line-number" aria-hidden="true">
              {lineIndex + 1}
            </span>
            <span className="message-code-line-source">
              {line.map((token, tokenIndex) => (
                <span key={tokenIndex} data-code-token={token.type}>
                  {token.text}
                </span>
              ))}
              {streaming && lineIndex === lines.length - 1 ? <span className="message-code-caret" aria-hidden="true" /> : null}
            </span>
          </span>
        ))}
      </code>
    </pre>
  );

  return (
    <section className="message-code-block" aria-label={`${languageLabel} code block`}>
      <header className="message-code-header">
        <div className="message-code-heading">
          {props.block.filename ? <span className="message-code-filename">{props.block.filename}</span> : null}
          <span className="message-code-language">{languageLabel}</span>
        </div>
        <div className="message-code-actions">
          {props.actions}
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="message-code-copy"
            aria-label={copied ? "Code copied" : "Copy code"}
            onClick={() => void copy()}
          >
            <span className="message-code-copy-icons" aria-hidden="true">
              <span data-visible={!copied ? "true" : undefined}>
                <Copy />
              </span>
              <span data-visible={copied ? "true" : undefined}>
                <Check />
              </span>
            </span>
            <span>{copied ? "Copied" : "Copy"}</span>
          </Button>
          {props.trailingActions}
        </div>
      </header>
      {props.body ? props.body(code) : code}
    </section>
  );
}

export function codeLanguage(language: string): ShjLanguage {
  const normalized = language.trim().toLowerCase();
  if (!normalized) return "plain";
  const alias = Object.hasOwn(LANGUAGE_ALIASES, normalized) ? LANGUAGE_ALIASES[normalized] : undefined;
  if (alias) return alias;
  return isSupportedLanguage(normalized) ? normalized : "plain";
}

/** The language of a file from its extension, or from its whole name when it has none, such as `Dockerfile`. */
export function fileCodeLanguage(name: string): ShjLanguage {
  const fileName = name.slice(name.lastIndexOf("/") + 1);
  const extensionStart = fileName.lastIndexOf(".");
  return codeLanguage(extensionStart > 0 ? fileName.slice(extensionStart + 1) : fileName);
}

function isSupportedLanguage(language: string): language is ShjLanguage {
  return SUPPORTED_LANGUAGES.has(language);
}

function isTranslatedLanguage(language: ShjLanguage): language is keyof typeof LANGUAGE_TEXT {
  return language in LANGUAGE_TEXT;
}

export function codeLanguageLabel(language: string): string {
  const normalized = codeLanguage(language);
  if (normalized !== "plain") {
    if (isTranslatedLanguage(normalized)) return LANGUAGE_TEXT[normalized];
    return LANGUAGE_LABELS[normalized] ?? normalized.toUpperCase();
  }
  const original = language.trim();
  const plainLanguage = original.toLowerCase();
  const plainLabel = Object.hasOwn(PLAIN_LANGUAGE_LABELS, plainLanguage) ? PLAIN_LANGUAGE_LABELS[plainLanguage] : undefined;
  if (plainLabel) return plainLabel;
  return original ? original.toUpperCase() : LANGUAGE_TEXT.plain;
}

function plainCodeLines(code: string): CodeLine[] {
  return code.split("\n").map((line) => [{ text: line }]);
}

function codeLineText(line: CodeLine | undefined): string | undefined {
  return line?.map((token) => token.text).join("");
}

function sameCodeLine(left: CodeLine, right: CodeLine): boolean {
  return left.length === right.length && left.every((token, index) => token.text === right[index]?.text && token.type === right[index]?.type);
}

/**
 * The lines of `code`: a highlighted line, else a current line, else plain text, each only while
 * its text is still the same. A line equal to the current one is the current array, so React
 * keeps its elements.
 */
function reusedCodeLines(code: string, highlightedLines: CodeLine[], current: CodeLine[]): CodeLine[] {
  return code.split("\n").map((text, index) => {
    const highlightedLine = highlightedLines[index];
    const currentLine = current[index];
    const line =
      highlightedLine && codeLineText(highlightedLine) === text
        ? highlightedLine
        : currentLine && codeLineText(currentLine) === text
          ? currentLine
          : [{ text }];
    return currentLine && sameCodeLine(currentLine, line) ? currentLine : line;
  });
}

// Languages that contain lines of a different language, such as script in HTML or a fence in
// Markdown. Their lines have no type, so each one looks like a restart point.
const EMBEDDING_LANGUAGES = new Set<ShjLanguage>(["html", "md", "leanpub-md"]);

/**
 * Highlights `code`. With an earlier result for the start of the same code, the lines before a
 * restart point are kept and only the rest is tokenized.
 *
 * Text with no type can also come from a sub-language, such as script in HTML, so a restart point
 * can be false. Tokenizing starts before at least one complete line of the earlier result. A
 * different token on those lines, or a tail that ends in an open token, such as a string that a
 * false restart point started, tokenizes the whole code instead.
 */
async function highlightedCode(code: string, language: ShjLanguage, earlier: HighlightedCode | undefined): Promise<HighlightedCode> {
  if (earlier && !EMBEDDING_LANGUAGES.has(language) && code.startsWith(earlier.code)) {
    const completeLines = earlier.lines.length - 1;
    const restart = earlier.restarts.lastIndexOf(true, completeLines - 1);
    if (restart > 0) {
      const kept = earlier.lines.slice(0, restart);
      const start = kept.reduce((length, line) => length + (codeLineText(line)?.length ?? 0) + 1, 0);
      const rest = await tokenizedCode(code.slice(start), language);
      const overlap = earlier.lines.slice(restart, completeLines);
      if (rest && rest.restarts.at(-1) !== false && overlap.every((line, index) => sameCodeLine(line, rest.lines[index] ?? []))) {
        return {
          code,
          language,
          lines: [...kept, ...rest.lines],
          restarts: [...earlier.restarts.slice(0, restart), ...rest.restarts],
        };
      }
    }
  }
  const whole = await tokenizedCode(code, language);
  return { code, language, lines: whole?.lines ?? plainCodeLines(code), restarts: whole?.restarts ?? [] };
}

async function tokenizedCode(code: string, language: ShjLanguage): Promise<Pick<HighlightedCode, "lines" | "restarts"> | undefined> {
  const lines: CodeLine[] = [[]];
  // Line 0 is a restart point: it is the block start or an earlier restart point.
  const restarts = [true];
  try {
    // At the top level of a language, text that no rule matches has no type.
    await tokenize(code, language, (text, type) => {
      const fragments = text.split("\n");
      for (const [index, fragment] of fragments.entries()) {
        if (fragment) lines.at(-1)?.push({ text: fragment, type });
        if (index < fragments.length - 1) {
          lines.push([]);
          restarts.push(type === undefined);
        }
      }
    });
    return { lines, restarts };
  } catch {
    return undefined;
  }
}
