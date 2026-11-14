"use client";

import { Check, Copy } from "lucide-react";
import { Fragment, useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";

export interface CodeToken {
  text: string;
  type?: string | undefined;
}

export interface CodeLine {
  /** The number in the gutter. A diff numbers lines by their side of the change. */
  number?: number | string | null;
  tokens: readonly CodeToken[];
}

/** Plain lines numbered from one, for code with no highlighter. */
export function plainCodeLines(code: string): CodeLine[] {
  return code.split("\n").map((text, index) => ({ number: index + 1, tokens: [{ text }] }));
}

/** Copies the text and shows Copied for a moment. */
function useCopy(text: string) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1_500);
    } catch {
      setCopied(false);
    }
  };
  return { copied, copy };
}

/**
 * The reference chat code block: a header with the file name and language, Copy, and the numbered
 * lines with their code tokens.
 */
export function CodeBlock({
  code,
  language,
  filename,
  lines,
  actions,
  id,
  lineState,
  onLineClick,
  afterLine,
}: {
  code: string;
  language: string;
  filename?: string;
  lines?: readonly CodeLine[];
  /** Buttons after Copy. */
  actions?: ReactNode;
  id?: string;
  /** A line's state for styling, such as selected or pinned, as its data-line-state. */
  lineState?: (index: number) => string | undefined;
  /** Makes lines clickable, for selecting them. */
  onLineClick?: (index: number, event: MouseEvent) => void;
  /** Rendered under a line, such as a comment pinned to it. */
  afterLine?: (index: number) => ReactNode;
}) {
  const { copied, copy } = useCopy(code);
  const shown = lines ?? plainCodeLines(code);
  return (
    <section id={id} className="message-code-block" aria-label={`${filename ?? language} code block`}>
      <header className="message-code-header">
        <div className="message-code-heading">
          {filename ? <span className="message-code-filename">{filename}</span> : null}
          <span className="message-code-language">{language}</span>
        </div>
        <div className="message-code-actions">
          <Button variant="ghost" size="xs" className="message-code-copy" aria-label={copied ? "Code copied" : "Copy code"} onClick={() => void copy()}>
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
          {actions}
        </div>
      </header>
      <pre className="message-code-scroll" tabIndex={0}>
        <code>
          {shown.map((line, index) => (
            <Fragment key={index}>
              <span className="message-code-line" data-line-state={lineState?.(index)} onClick={onLineClick ? (event) => onLineClick(index, event) : undefined}>
                <span className="message-code-line-number" aria-hidden="true">
                  {line.number ?? ""}
                </span>
                <span className="message-code-line-source">
                  {line.tokens.map((token, part) => (
                    <span key={part} data-code-token={token.type}>
                      {token.text}
                    </span>
                  ))}
                </span>
              </span>
              {afterLine?.(index)}
            </Fragment>
          ))}
        </code>
      </pre>
    </section>
  );
}

/** The icon-only Copy of the file preview header. */
export function CopyTextButton({ text, label }: { text: string; label: string }) {
  const { copied, copy } = useCopy(text);
  return (
    <Button variant="ghost" className="browser-toolbar-button file-preview-copy" aria-label={label} title={label} onClick={() => void copy()}>
      {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      <span className="sr-only" aria-live="polite">
        {copied ? "Copied" : label}
      </span>
    </Button>
  );
}
