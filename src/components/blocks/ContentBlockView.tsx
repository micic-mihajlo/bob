"use client";

import type { ContentBlock } from "@/lib/blocks/types";
import { CodeBlock } from "./CodeBlock";
import { DiffView } from "./DiffView";
import { MarkdownView } from "./MarkdownView";
import { TableBlock } from "./TableBlock";
import { VisualFrame } from "./VisualFrame";

export function ContentBlockView({ block }: { block: ContentBlock }) {
  switch (block.kind) {
    case "markdown":
      return <MarkdownView text={block.text} />;
    case "code":
      return <CodeBlock lang={block.lang} code={block.code} />;
    case "diff":
      return <DiffView patch={block.patch} />;
    case "table":
      return <TableBlock table={block} />;
    case "visual":
      return <VisualFrame title={block.title} html={block.html} />;
  }
}
