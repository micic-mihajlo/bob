import type { MdNode } from "@/lib/blocks/markdown";
import { CodeBlock } from "./CodeBlock";
import { InlineView } from "./InlineView";
import { MarkdownListItem } from "./MarkdownListItem";

const HEADINGS = { 1: "h1", 2: "h2", 3: "h3", 4: "h4", 5: "h5", 6: "h6" } as const;

export function MarkdownNode({ node }: { node: MdNode }) {
  switch (node.type) {
    case "heading": {
      const Heading = HEADINGS[node.level];
      return (
        <Heading>
          <InlineView nodes={node.inline} />
        </Heading>
      );
    }
    case "paragraph":
      return (
        <p>
          <InlineView nodes={node.inline} />
        </p>
      );
    case "list": {
      const items = node.items.map((item, index) => <MarkdownListItem key={index} item={item} />);
      return node.ordered ? <ol start={node.start === 1 ? undefined : node.start}>{items}</ol> : <ul>{items}</ul>;
    }
    case "quote":
      return (
        <blockquote>
          {node.children.map((child, index) => (
            <MarkdownNode key={index} node={child} />
          ))}
        </blockquote>
      );
    case "rule":
      return <hr />;
    case "code":
      return <CodeBlock lang={node.lang} code={node.code} />;
  }
}
