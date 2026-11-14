"use client";

import { useMemo } from "react";
import { parseMarkdown } from "@/lib/blocks/markdown";
import { MarkdownNode } from "./MarkdownNode";

export function MarkdownView({ text }: { text: string }) {
  const nodes = useMemo(() => parseMarkdown(text), [text]);
  return (
    <div className="blk-md">
      {nodes.map((node, index) => (
        <MarkdownNode key={index} node={node} />
      ))}
    </div>
  );
}
