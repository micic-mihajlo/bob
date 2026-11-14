import type { FormField } from "@/lib/blocks/types";

/** A legend when the field is a group of buttons, a label for a single control. */
export function FieldLabel({ field, htmlFor }: { field: FormField; htmlFor?: string }) {
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
