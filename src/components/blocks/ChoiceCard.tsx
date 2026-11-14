"use client";

import { useId, useState, type KeyboardEvent } from "react";
import type { AnswerByKind, ChoiceBlock, InteractiveProps } from "@/lib/blocks/types";
import { BlockCard } from "./BlockCard";

type Answer = AnswerByKind["choice"];

const letterOf = (index: number): string => String.fromCharCode(65 + index);
const indexOfKey = (key: string): number => (/^[a-z]$/i.test(key) ? key.toUpperCase().charCodeAt(0) - 65 : -1);

export function ChoiceCard({ block, status, answer, onAnswer }: { block: ChoiceBlock } & InteractiveProps<"choice">) {
  const name = useId();
  const hintId = useId();
  const [picked, setPicked] = useState<readonly string[]>([]);
  const [local, setLocal] = useState<Answer | null>(null);
  const chosen = answer ?? local;
  const settled = status === "answered" || chosen !== null ? "answered" : status;
  const locked = settled !== "pending";
  const shown = chosen?.selected ?? picked;

  function toggle(id: string): void {
    if (locked) return;
    if (!block.multiple) setPicked([id]);
    else setPicked(picked.includes(id) ? picked.filter((item) => item !== id) : [...picked, id]);
  }

  function submit(): void {
    if (locked || picked.length === 0) return;
    const value = { selected: block.options.filter((option) => picked.includes(option.id)).map((option) => option.id) };
    setLocal(value);
    onAnswer(value);
  }

  function handleKey(event: KeyboardEvent<HTMLFieldSetElement>): void {
    if (locked || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === "Enter" && picked.length > 0) {
      event.preventDefault();
      submit();
      return;
    }
    const option = block.options[indexOfKey(event.key)];
    if (!option) return;
    event.preventDefault();
    toggle(option.id);
  }

  const labels = block.options.filter((option) => shown.includes(option.id)).map((option) => option.label);
  const last = letterOf(Math.min(block.options.length, 26) - 1);

  return (
    <BlockCard title={block.title} status={settled} outcome={labels.join(", ")}>
      <fieldset className="blk-options" aria-label={block.title} aria-describedby={locked ? undefined : hintId} onKeyDown={handleKey}>
        {block.options.map((option, index) => {
          const checked = shown.includes(option.id);
          return (
            <label
              key={option.id}
              className="blk-option"
              data-checked={checked ? "" : undefined}
              data-locked={locked ? "" : undefined}
              data-faded={locked && !checked ? "" : undefined}
            >
              <input
                className="blk-option-input"
                type={block.multiple ? "checkbox" : "radio"}
                name={name}
                value={option.id}
                checked={checked}
                disabled={locked}
                onChange={() => toggle(option.id)}
              />
              <span className="blk-option-key" aria-hidden="true">
                {index < 26 ? letterOf(index) : ""}
              </span>
              <span className="blk-option-label">{option.label}</span>
              {option.meta ? <span className="blk-option-meta">{option.meta}</span> : null}
            </label>
          );
        })}
      </fieldset>
      {locked ? null : (
        <>
          <div className="blk-actions">
            <button type="button" className="blk-btn" data-style="primary" disabled={picked.length === 0} onClick={submit}>
              {block.submitLabel ?? "Submit"}
            </button>
            {block.multiple ? (
              <span className="blk-hint" role="status">
                {picked.length === 0 ? "Pick one or more" : `${picked.length} selected`}
              </span>
            ) : null}
          </div>
          <p id={hintId} className="blk-hint">
            Press A–{last} to pick, Enter to submit.
          </p>
        </>
      )}
    </BlockCard>
  );
}
