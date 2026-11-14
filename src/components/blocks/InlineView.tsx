import type { Inline } from "@/lib/blocks/inline";

/** Renders parsed inline markdown as React elements; no HTML from the reply reaches the DOM. */
export function InlineView({ nodes }: { nodes: readonly Inline[] }) {
  return nodes.map((node, index) => {
    switch (node.type) {
      case "text":
        return node.text;
      case "break":
        return <br key={index} />;
      case "code":
        return (
          <code key={index} className="blk-inline-code">
            {node.text}
          </code>
        );
      case "strong":
        return (
          <strong key={index}>
            <InlineView nodes={node.children} />
          </strong>
        );
      case "em":
        return (
          <em key={index}>
            <InlineView nodes={node.children} />
          </em>
        );
      case "del":
        return (
          <del key={index}>
            <InlineView nodes={node.children} />
          </del>
        );
      case "link":
        return (
          <a key={index} className="blk-link" href={node.href} target="_blank" rel="noopener noreferrer">
            <InlineView nodes={node.children} />
          </a>
        );
    }
  });
}
