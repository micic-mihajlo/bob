import type { FormField } from "@/lib/blocks/types";

export function FieldNotes({ field, error, hintId, errorId }: { field: FormField; error?: string; hintId: string; errorId: string }) {
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
