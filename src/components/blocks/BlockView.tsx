"use client";

import type { Block, BlockHost, ContentBlock } from "@/lib/blocks/types";
import { ContentBlockView } from "./ContentBlockView";
import { InteractiveBlockView } from "./InteractiveBlockView";
import "./styles";

const isContent = (block: Block): block is ContentBlock =>
  block.kind === "markdown" || block.kind === "code" || block.kind === "diff" || block.kind === "table" || block.kind === "visual";

/** Interactive blocks render only with a host, since their status and answers live there. */
export function BlockView({ block, host }: { block: Block; host?: BlockHost }) {
  if (isContent(block)) return <ContentBlockView block={block} />;
  return host ? <InteractiveBlockView block={block} host={host} /> : null;
}
