"use client";

import { Check } from "lucide-react";
import { useMemo } from "react";
import { parseMarkdown, type MdItem, type MdNode } from "@/lib/blocks/markdown";
import { CodeBlock } from "./CodeBlock";
import { InlineView } from "./InlineView";

const HEADINGS = { 1: "h1", 2: "h2", 3: "h3", 4: "h4", 5: "h5", 6: "h6" } as const;

function Item({ item }: { item: MdItem }) {
  // A tight item is one paragraph: render its text straight into the item, with no block gap.
  const [first, ...rest] = item.children;
  const lead = first?.type === "paragraph" ? <InlineView nodes={first.inline} /> : null;
  const body = lead ? rest : item.children;
  if (item.checked !== null) {
    return (
      <li className="blk-task" data-checked={item.checked ? "" : undefined}>
        <div className="blk-md-item">
          <span className="blk-task-row">
            <span className="blk-task-box" data-checked={item.checked ? "" : undefined} role="img" aria-label={item.checked ? "Done" : "Not done"}>
              {item.checked ? <Check size={12} strokeWidth={2.5} aria-hidden="true" /> : null}
            </span>
            <span className="blk-task-text">{lead}</span>
          </span>
          <Nodes nodes={body} />
        </div>
      </li>
    );
  }
  return (
    <li>
      <div className="blk-md-item">
        {lead ? <span>{lead}</span> : null}
        <Nodes nodes={body} />
      </div>
    </li>
  );
}

function Node({ node }: { node: MdNode }) {
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
      const items = node.items.map((item, index) => <Item key={index} item={item} />);
      return node.ordered ? <ol start={node.start === 1 ? undefined : node.start}>{items}</ol> : <ul>{items}</ul>;
    }
    case "quote":
      return (
        <blockquote>
          <Nodes nodes={node.children} />
        </blockquote>
      );
    case "rule":
      return <hr />;
    case "code":
      return <CodeBlock lang={node.lang} code={node.code} />;
  }
}

function Nodes({ nodes }: { nodes: readonly MdNode[] }) {
  return nodes.map((node, index) => <Node key={index} node={node} />);
}

export function MarkdownView({ text }: { text: string }) {
  const nodes = useMemo(() => parseMarkdown(text), [text]);
  return (
    <div className="blk-md">
      <Nodes nodes={nodes} />
    </div>
  );
}
