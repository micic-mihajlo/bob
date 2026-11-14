"use client";

import type { Block, BlockHost, ContentBlock, InteractiveBlock } from "@/lib/blocks/types";
import { ChoiceCard } from "./ChoiceCard";
import { CodeBlock } from "./CodeBlock";
import { ConfirmCard } from "./ConfirmCard";
import { DiffView } from "./DiffView";
import { FormCard } from "./FormCard";
import { MarkdownView } from "./MarkdownView";
import { QuickReplyChips } from "./QuickReplyChips";
import { TableBlock } from "./TableBlock";
import { VisualFrame } from "./VisualFrame";
import "./styles";

function ContentView({ block }: { block: ContentBlock }) {
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

function InteractiveView({ block, host }: { block: InteractiveBlock; host: BlockHost }) {
  const status = host.statusOf(block.id);
  const stored = host.answerOf(block.id);
  switch (block.kind) {
    case "confirm":
      return (
        <ConfirmCard
          block={block}
          status={status}
          answer={stored?.kind === "confirm" ? stored.value : undefined}
          onAnswer={(value) => host.onAnswer({ blockId: block.id, kind: "confirm", value })}
        />
      );
    case "choice":
      return (
        <ChoiceCard
          block={block}
          status={status}
          answer={stored?.kind === "choice" ? stored.value : undefined}
          onAnswer={(value) => host.onAnswer({ blockId: block.id, kind: "choice", value })}
        />
      );
    case "form":
      return (
        <FormCard
          block={block}
          status={status}
          answer={stored?.kind === "form" ? stored.value : undefined}
          onAnswer={(value) => host.onAnswer({ blockId: block.id, kind: "form", value })}
        />
      );
    case "quick_replies":
      return (
        <QuickReplyChips
          block={block}
          status={status}
          answer={stored?.kind === "quick_replies" ? stored.value : undefined}
          onAnswer={(value) => host.onAnswer({ blockId: block.id, kind: "quick_replies", value })}
        />
      );
  }
}

const isContent = (block: Block): block is ContentBlock =>
  block.kind === "markdown" || block.kind === "code" || block.kind === "diff" || block.kind === "table" || block.kind === "visual";

/** Renders one block. Interactive blocks need a host; without one they are not rendered. */
export function BlockView({ block, host }: { block: Block; host?: BlockHost }) {
  if (isContent(block)) return <ContentView block={block} />;
  return host ? <InteractiveView block={block} host={host} /> : null;
}
