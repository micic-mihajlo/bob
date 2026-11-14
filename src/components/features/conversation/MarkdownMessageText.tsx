import { Fragment, useMemo } from "react";
import { parseMarkdown, type Block, type Inline } from "@/lib/client/markdown";

function InlineText({ parts }: { parts: readonly Inline[] }) {
  return (
    <>
      {parts.map((part, index) => {
        if (part.kind === "code") return <code key={index}>{part.text}</code>;
        if (part.kind === "strong") return <strong key={index}>{part.text}</strong>;
        if (part.kind === "em") return <em key={index}>{part.text}</em>;
        return <Fragment key={index}>{part.text}</Fragment>;
      })}
    </>
  );
}

function CodeBlock({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <section className="message-code-block" aria-label="Text code block">
      <header className="message-code-header">
        <div className="message-code-heading">
          <span className="message-code-language">Text</span>
        </div>
      </header>
      <pre className="message-code-scroll" tabIndex={0}>
        <code>
          {lines.map((line, index) => (
            <span key={index} className="message-code-line">
              <span className="message-code-line-number" aria-hidden="true">
                {index + 1}
              </span>
              <span className="message-code-line-source">
                <span>{line}</span>
              </span>
            </span>
          ))}
        </code>
      </pre>
    </section>
  );
}

function MarkdownBlock({ block }: { block: Block }) {
  switch (block.kind) {
    case "heading": {
      const Heading = `h${block.level}` as "h1" | "h2" | "h3";
      return (
        <Heading className="message-markdown-heading" data-level={block.level}>
          <InlineText parts={block.inline} />
        </Heading>
      );
    }
    case "paragraph":
      return (
        <p>
          <InlineText parts={block.inline} />
        </p>
      );
    case "quote":
      return (
        <blockquote>
          <p>
            <InlineText parts={block.inline} />
          </p>
        </blockquote>
      );
    case "list": {
      const List = block.ordered ? "ol" : "ul";
      return (
        <List>
          {block.items.map((item, index) => (
            <li key={index} className={item.checked === null ? undefined : "message-markdown-task"}>
              {item.checked === null ? null : (
                <input type="checkbox" className="message-markdown-checkbox" checked={item.checked} disabled readOnly />
              )}
              <InlineText parts={item.inline} />
            </li>
          ))}
        </List>
      );
    }
    case "code":
      return <CodeBlock text={block.text} />;
    case "rule":
      return <hr />;
  }
}

/** The reference's markdown message body, for the subset Bob's agents write. */
export function MarkdownMessageText({ text }: { text: string }) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  return (
    <>
      {blocks.map((block, index) => (
        <MarkdownBlock key={index} block={block} />
      ))}
    </>
  );
}
