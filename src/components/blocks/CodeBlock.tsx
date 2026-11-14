"use client";

import { useMemo } from "react";
import { highlight, splitLines } from "@/lib/blocks/highlight";
import { CopyButton } from "./CopyButton";
import { Tokens } from "./Tokens";

/** Short snippets read better without numbers; past this many lines they help people point at one. */
const NUMBER_LINES_AFTER = 8;

const LANGUAGE_LABEL: Record<string, string> = {
  ts: "TypeScript",
  tsx: "TSX",
  typescript: "TypeScript",
  js: "JavaScript",
  jsx: "JSX",
  javascript: "JavaScript",
  json: "JSON",
  bash: "Bash",
  sh: "Shell",
  shell: "Shell",
  zsh: "Shell",
  python: "Python",
  py: "Python",
  diff: "Diff",
  patch: "Diff",
};

export function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const lines = useMemo(() => splitLines(highlight(code, lang)), [code, lang]);
  const numbered = lines.length > NUMBER_LINES_AFTER;
  const label = LANGUAGE_LABEL[lang] ?? (lang || "Text");

  return (
    <figure className="blk-code">
      <figcaption className="blk-code-header">
        <span className="blk-code-lang">{label}</span>
        <CopyButton text={() => code} label="Copy" />
      </figcaption>
      <pre className="blk-code-body" tabIndex={0} aria-label={`${label} code`}>
        {numbered ? (
          <span className="blk-code-gutter" aria-hidden="true">
            {lines.map((_, index) => (
              <span key={index} className="blk-code-line">
                {index + 1}
              </span>
            ))}
          </span>
        ) : null}
        <code className="blk-code-text">
          {lines.map((line, index) => (
            <span key={index} className="blk-code-line">
              <Tokens tokens={line} />
              {index < lines.length - 1 ? "\n" : null}
            </span>
          ))}
        </code>
      </pre>
    </figure>
  );
}
