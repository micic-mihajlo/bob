import type { FormField } from "./types";

export type FormValues = Readonly<Record<string, string>>;
export type FormErrors = Readonly<Record<string, string>>;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function matches(pattern: string, value: string): boolean {
  try {
    return new RegExp(`^(?:${pattern})$`).test(value);
  } catch {
    // A pattern the agent wrote badly must not block the person from answering.
    return true;
  }
}

/** Why a value is not acceptable for its field, or null when it is. */
export function fieldError(field: FormField, value: string): string | null {
  const text = value.trim();
  if (text === "") return field.required ? `${field.label} is required.` : null;
  switch (field.type) {
    case "text":
    case "textarea":
      if (field.maxLength !== undefined && value.length > field.maxLength) return `Use at most ${field.maxLength} characters.`;
      if (field.pattern !== undefined && !matches(field.pattern, text)) return field.patternMessage ?? `${field.label} is not in the expected format.`;
      return null;
    case "select":
    case "segmented":
      return field.options.includes(value) ? null : "Pick one of the options.";
    case "date":
      return DATE.test(text) && !Number.isNaN(Date.parse(text)) ? null : "Enter a real date.";
  }
}

export function formErrors(fields: readonly FormField[], values: FormValues): FormErrors {
  return Object.fromEntries(
    fields.flatMap((field) => {
      const error = fieldError(field, values[field.id] ?? "");
      return error === null ? [] : [[field.id, error] as const];
    }),
  );
}

/** The submitted values: trimmed single-line text, and no empty optional fields. */
export function cleanValues(fields: readonly FormField[], values: FormValues): Record<string, string> {
  return Object.fromEntries(
    fields.flatMap((field) => {
      const raw = values[field.id] ?? "";
      const value = field.type === "textarea" ? raw : raw.trim();
      return value.trim() === "" ? [] : [[field.id, value] as const];
    }),
  );
}
