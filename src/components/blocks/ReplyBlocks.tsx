"use client";

import { useMemo } from "react";
import { parseReply } from "@/lib/blocks/parse-reply";
import type { Block, BlockHost } from "@/lib/blocks/types";
import { BlockView } from "./BlockView";

const NONE: readonly Block[] = [];

interface ReplyBlocksProps {
  /** The agent's markdown reply. */
  text: string;
  /** Interactive blocks from the same turn's tool calls, shown after the text. */
  extra?: readonly Block[];
  host?: BlockHost;
}

/** An agent reply as rich blocks: its markdown split by `parseReply`, then any interactive blocks. */
export function ReplyBlocks({ text, extra = NONE, host }: ReplyBlocksProps) {
  const blocks = useMemo(() => [...parseReply(text), ...extra], [text, extra]);
  return (
    <div className="blk-reply">
      {blocks.map((block, index) => (
        <BlockView key={"id" in block ? block.id : `${block.kind}-${index}`} block={block} host={host} />
      ))}
    </div>
  );
}
