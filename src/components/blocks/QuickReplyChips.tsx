"use client";

import { useState } from "react";
import type { AnswerByKind, InteractiveProps, QuickRepliesBlock } from "@/lib/blocks/types";
import { BlockOutcome } from "./BlockCard";

type Answer = AnswerByKind["quick_replies"];

/** A row of reply chips with no card: once one is picked it stays marked and the rest fade. */
export function QuickReplyChips({ block, status, answer, onAnswer }: { block: QuickRepliesBlock } & InteractiveProps<"quick_replies">) {
  const [local, setLocal] = useState<Answer | null>(null);
  const chosen = answer ?? local;
  const locked = status !== "pending" || chosen !== null;

  function pick(reply: string): void {
    if (locked) return;
    const value = { reply };
    setLocal(value);
    onAnswer(value);
  }

  return (
    <div className="blk-chips-wrap">
      <div className="blk-chips" role="group" aria-label="Suggested replies">
        {block.replies.map((reply) => {
          const isChosen = chosen?.reply === reply;
          return (
            <button
              key={reply}
              type="button"
              className="blk-chip"
              aria-pressed={isChosen}
              data-chosen={isChosen ? "" : undefined}
              data-faded={locked && !isChosen ? "" : undefined}
              disabled={locked}
              onClick={() => pick(reply)}
            >
              {reply}
            </button>
          );
        })}
      </div>
      {status === "expired" && chosen === null ? <BlockOutcome status="expired" /> : null}
    </div>
  );
}
