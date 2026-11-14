import type { CSSProperties } from "react";
import { parseMarkdown, type Block, type Inline } from "@/lib/client/markdown";
import { CodeBlock } from "./CodeBlock";

function InlineText({ parts }: { parts: readonly Inline[] }) {
  return (
    <>
      {parts.map((part, index) => {
        switch (part.kind) {
          case "code":
            return <code key={index}>{part.text}</code>;
          case "strong":
            return <strong key={index}>{part.text}</strong>;
          case "em":
            return <em key={index}>{part.text}</em>;
          default:
            return <span key={index}>{part.text}</span>;
        }
      })}
    </>
  );
}

function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case "heading": {
      const Tag = block.level === 1 ? "h1" : block.level === 2 ? "h2" : "h3";
      return (
        <Tag className="message-markdown-heading" data-level={block.level}>
          <InlineText parts={block.inline} />
        </Tag>
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
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag>
          {block.items.map((item, index) => (
            <li key={index} data-checked={item.checked === null ? undefined : String(item.checked)}>
              {item.checked !== null ? <input type="checkbox" checked={item.checked} readOnly disabled aria-label={item.checked ? "Done" : "Not done"} /> : null}{" "}
              <InlineText parts={item.inline} />
              {item.sublist ? <BlockView block={item.sublist} /> : null}
            </li>
          ))}
        </Tag>
      );
    }
    case "code":
      return <CodeBlock code={block.text} language="Code" />;
    case "rule":
      return <hr />;
    case "table":
      return (
        <section className="message-markdown-table-scroll" aria-label="Data table" tabIndex={0}>
          <table className="message-markdown-table" style={{ "--message-markdown-table-columns": block.header.length } as CSSProperties}>
            <thead>
              <tr>
                {block.header.map((cell, index) => (
                  <th key={index} scope="col" data-align={cell.align}>
                    <InlineText parts={cell.inline} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, index) => (
                    <td key={index} data-align={cell.align}>
                      <InlineText parts={cell.inline} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      );
  }
}

/**
 * A Markdown file as the reference file preview draws it: the chat's message Markdown in a reading
 * column. Agent text becomes elements, never injected HTML.
 */
export function MarkdownFilePreview({ body, className }: { body: string; className?: string }) {
  return (
    <div className={`markdown-file-preview${className ? ` ${className}` : ""}`}>
      <article className="message-markdown">
        {parseMarkdown(body).map((block, index) => (
          <BlockView key={index} block={block} />
        ))}
      </article>
    </div>
  );
}
