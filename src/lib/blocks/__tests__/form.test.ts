import { describe, expect, it } from "vitest";
import { cleanValues, formErrors } from "../form";
import { formBlockSchema } from "../types";

const block = formBlockSchema.parse({
  kind: "form",
  id: "env",
  title: "Add an environment variable",
  fields: [
    { type: "text", id: "name", label: "Name", required: true, pattern: "[A-Z][A-Z0-9_]*" },
    { type: "segmented", id: "scope", label: "Scope", options: ["Preview", "Production"], required: true },
    { type: "date", id: "review", label: "Review on" },
    { type: "text", id: "broken", label: "Broken pattern", pattern: "([" },
  ],
});

describe("form validation", () => {
  it("reports required, pattern and date errors by field", () => {
    expect(Object.keys(formErrors(block.fields, {}))).toEqual(["name", "scope"]);
    expect(Object.keys(formErrors(block.fields, { name: "lower", scope: "Preview", review: "2026-02-31x" }))).toEqual(["name", "review"]);
  });

  it("accepts valid values, ignores a pattern that does not compile, and drops empty optional fields", () => {
    const values = { name: " EXPORT_BATCH_SIZE ", scope: "Production", review: "", broken: "anything" };
    expect(formErrors(block.fields, values)).toEqual({});
    expect(cleanValues(block.fields, values)).toEqual({ name: "EXPORT_BATCH_SIZE", scope: "Production", broken: "anything" });
  });

  it("rejects a tool call that breaks the limits", () => {
    const tooMany = { ...block, fields: Array.from({ length: 21 }, (_, index) => ({ type: "date", id: `d${index}`, label: "Day" })) };
    expect(formBlockSchema.safeParse(tooMany).success).toBe(false);
  });
});
