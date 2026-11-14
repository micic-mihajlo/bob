"use client";

import type { BlockHost, InteractiveBlock } from "@/lib/blocks/types";
import { ChoiceCard } from "./ChoiceCard";
import { ConfirmCard } from "./ConfirmCard";
import { FormCard } from "./FormCard";
import { QuickReplyChips } from "./QuickReplyChips";

export function InteractiveBlockView({ block, host }: { block: InteractiveBlock; host: BlockHost }) {
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
