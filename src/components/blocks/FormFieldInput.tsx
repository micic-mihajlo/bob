"use client";

import { useId } from "react";
import type { FormField } from "@/lib/blocks/types";
import { FieldLabel } from "./FieldLabel";
import { FieldNotes } from "./FieldNotes";

interface FormFieldInputProps {
  field: FormField;
  value: string;
  error: string | undefined;
  onChange: (value: string) => void;
}

export function FormFieldInput({ field, value, error, onChange }: FormFieldInputProps) {
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();
  const describedBy = error ? errorId : field.hint ? hintId : undefined;
  const common = {
    id: inputId,
    className: "blk-input",
    "data-field": field.id,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy,
    "aria-required": field.required || undefined,
  };

  if (field.type === "segmented") {
    return (
      <fieldset className="blk-field" data-invalid={error ? "" : undefined} aria-describedby={describedBy}>
        <FieldLabel field={field} />
        <div className="blk-segmented" role="group" aria-label={field.label}>
          {field.options.map((option, index) => (
            <button
              key={option}
              type="button"
              className="blk-segment"
              data-field={index === 0 ? field.id : undefined}
              aria-pressed={value === option}
              onClick={() => onChange(value === option && !field.required ? "" : option)}
            >
              {option}
            </button>
          ))}
        </div>
        <FieldNotes field={field} error={error} hintId={hintId} errorId={errorId} />
      </fieldset>
    );
  }

  return (
    <div className="blk-field" data-invalid={error ? "" : undefined}>
      <FieldLabel field={field} htmlFor={inputId} />
      {field.type === "textarea" ? (
        <textarea {...common} value={value} placeholder={field.placeholder} rows={3} onChange={(event) => onChange(event.target.value)} />
      ) : field.type === "select" ? (
        <select {...common} value={value} onChange={(event) => onChange(event.target.value)}>
          <option value="" disabled={field.required}>
            {field.required ? "Choose…" : "Not set"}
          </option>
          {field.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : field.type === "date" ? (
        <input {...common} type="date" value={value} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input
          {...common}
          type="text"
          value={value}
          placeholder={field.placeholder}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      <FieldNotes field={field} error={error} hintId={hintId} errorId={errorId} />
    </div>
  );
}
