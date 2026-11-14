import type { FormBlock } from "@/lib/blocks/types";

export function FormSummary({ block, values }: { block: FormBlock; values: Readonly<Record<string, string>> }) {
  return (
    <dl className="blk-summary">
      {block.fields.map((field) => (
        <div key={field.id}>
          <dt>{field.label}</dt>
          <dd>{values[field.id] ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
