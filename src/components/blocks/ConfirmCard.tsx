"use client";

import { useId, useState } from "react";
import type { AnswerByKind, ConfirmAction, ConfirmBlock, InteractiveProps } from "@/lib/blocks/types";
import { BlockCard } from "./BlockCard";
import { ConfirmPreview } from "./ConfirmPreview";
import { HoldButton } from "./HoldButton";

const HOLD_MS = 800;

type Answer = AnswerByKind["confirm"];

export function ConfirmCard({ block, status, answer, onAnswer }: { block: ConfirmBlock } & InteractiveProps<"confirm">) {
  const hintId = useId();
  const [local, setLocal] = useState<Answer | null>(null);
  const chosen = answer ?? local;
  const settled = status === "answered" || chosen !== null ? "answered" : status;
  const chosenAction = block.actions.find((action) => action.id === chosen?.actionId);

  function respond(action: ConfirmAction): void {
    if (settled !== "pending") return;
    const value = { actionId: action.id };
    setLocal(value);
    onAnswer(value);
  }

  if (settled === "answered") {
    return <BlockCard title={block.title} status="answered" collapsed outcome={chosenAction?.label ?? "Answered"} />;
  }

  const expired = settled === "expired";
  const anyHeld = block.actions.some((action) => action.style === "danger");

  return (
    <BlockCard title={block.title} status={settled} outcome={null}>
      {block.preview ? <ConfirmPreview text={block.preview} /> : null}
      {expired ? null : (
        <>
          <div className="blk-actions">
            {block.actions.map((action) =>
              action.style === "danger" ? (
                <HoldButton
                  key={action.id}
                  holdMs={HOLD_MS}
                  variant="danger"
                  describedBy={hintId}
                  onConfirm={() => respond(action)}
                  armedLabel={`Click again to ${action.label.toLowerCase()}`}
                >
                  {action.label}
                </HoldButton>
              ) : (
                <button key={action.id} type="button" className="blk-btn" data-style={action.style} onClick={() => respond(action)}>
                  {action.label}
                </button>
              ),
            )}
          </div>
          {anyHeld ? (
            <p id={hintId} className="blk-hint">
              Hold to confirm, or click twice.
            </p>
          ) : null}
        </>
      )}
    </BlockCard>
  );
}
