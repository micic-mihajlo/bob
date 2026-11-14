"use client";

import { useState, type FormEvent } from "react";
import { cleanValues, fieldError, formErrors, type FormErrors, type FormValues } from "@/lib/blocks/form";
import type { AnswerByKind, FormBlock, InteractiveProps } from "@/lib/blocks/types";
import { BlockCard } from "./BlockCard";
import { FormFieldInput } from "./FormFieldInput";
import { FormSummary } from "./FormSummary";

type Answer = AnswerByKind["form"];

export function FormCard({ block, status, answer, onAnswer }: { block: FormBlock } & InteractiveProps<"form">) {
  const [values, setValues] = useState<FormValues>({});
  const [errors, setErrors] = useState<FormErrors>({});
  const [local, setLocal] = useState<Answer | null>(null);
  const chosen = answer ?? local;
  const settled = status === "answered" || chosen !== null ? "answered" : status;

  if (chosen !== null) {
    return (
      <BlockCard title={block.title} status="answered" outcome="Sent">
        <FormSummary block={block} values={chosen.values} />
      </BlockCard>
    );
  }
  if (settled === "answered") return <BlockCard title={block.title} status="answered" collapsed />;

  function change(id: string, value: string): void {
    setValues({ ...values, [id]: value });
    const field = block.fields.find((entry) => entry.id === id);
    // Once a field has shown an error, it re-checks as the person types so the error clears.
    if (field && errors[id] !== undefined) {
      const error = fieldError(field, value);
      const rest = Object.fromEntries(Object.entries(errors).filter(([key]) => key !== id));
      setErrors(error === null ? rest : { ...rest, [id]: error });
    }
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (settled !== "pending") return;
    const found = formErrors(block.fields, values);
    setErrors(found);
    const firstInvalid = block.fields.find((field) => found[field.id] !== undefined);
    if (firstInvalid) {
      const target = event.currentTarget.querySelector<HTMLElement>(`[data-field="${CSS.escape(firstInvalid.id)}"]`);
      target?.focus();
      return;
    }
    const value = { values: cleanValues(block.fields, values) };
    setLocal(value);
    onAnswer(value);
  }

  const expired = settled === "expired";

  return (
    <BlockCard title={block.title} status={settled} outcome={null}>
      <form className="blk-form" noValidate onSubmit={submit}>
        <fieldset className="blk-form-fields" disabled={expired}>
          {block.fields.map((field) => (
            <FormFieldInput
              key={field.id}
              field={field}
              value={values[field.id] ?? ""}
              error={errors[field.id]}
              onChange={(value) => change(field.id, value)}
            />
          ))}
        </fieldset>
        {expired ? null : (
          <div className="blk-actions">
            <button type="submit" className="blk-btn" data-style="primary">
              {block.submitLabel ?? "Submit"}
            </button>
          </div>
        )}
      </form>
    </BlockCard>
  );
}
