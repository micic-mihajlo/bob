import { parseMarkdown, type Block, type Inline } from "@/lib/client/markdown";

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
      const Tag = block.level === 1 ? "h3" : block.level === 2 ? "h4" : "h5";
      return (
        <Tag className="md-heading" data-level={block.level}>
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
          <InlineText parts={block.inline} />
        </blockquote>
      );
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag>
          {block.items.map((item, index) => (
            <li key={index} data-checked={item.checked === null ? undefined : String(item.checked)}>
              {item.checked !== null ? <input type="checkbox" checked={item.checked} readOnly disabled aria-label={item.checked ? "Done" : "Not done"} /> : null}
              <InlineText parts={item.inline} />
            </li>
          ))}
        </Tag>
      );
    }
    case "code":
      return <pre className="md-code">{block.text}</pre>;
    case "rule":
      return <hr />;
  }
}

/** Agent-written markdown, rendered as elements and never as injected HTML. */
export function MarkdownView({ source }: { source: string }) {
  const blocks = parseMarkdown(source);
  return (
    <div className="markdown">
      {blocks.map((block, index) => (
        <BlockView key={index} block={block} />
      ))}
    </div>
  );
}
