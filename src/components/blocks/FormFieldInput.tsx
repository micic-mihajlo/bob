"use client";

import { useId } from "react";
import type { FormField } from "@/lib/blocks/types";

interface FormFieldInputProps {
  field: FormField;
  value: string;
  error: string | undefined;
  onChange: (value: string) => void;
}

function Label({ field, htmlFor }: { field: FormField; htmlFor?: string }) {
  const content = (
    <>
      {field.label}
      {field.required ? (
        <span className="blk-required" aria-hidden="true">
          *
        </span>
      ) : null}
    </>
  );
  return htmlFor ? (
    <label className="blk-field-label" htmlFor={htmlFor}>
      {content}
    </label>
  ) : (
    <legend className="blk-field-label">{content}</legend>
  );
}

function Notes({ field, error, hintId, errorId }: { field: FormField; error?: string; hintId: string; errorId: string }) {
  return (
    <>
      {field.hint && !error ? (
        <p id={hintId} className="blk-field-hint">
          {field.hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="blk-field-error">
          {error}
        </p>
      ) : null}
    </>
  );
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
        <Label field={field} />
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
        <Notes field={field} error={error} hintId={hintId} errorId={errorId} />
      </fieldset>
    );
  }

  return (
    <div className="blk-field" data-invalid={error ? "" : undefined}>
      <Label field={field} htmlFor={inputId} />
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
      <Notes field={field} error={error} hintId={hintId} errorId={errorId} />
    </div>
  );
}
