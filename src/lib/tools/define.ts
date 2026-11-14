import type { z } from "zod";
import type { Toolset } from "../crew";
import type { ToolContext, ToolOutput } from "./context";

export interface ToolSpec {
  name: string;
  description: string;
  schema: z.ZodType;
}

export interface ToolDef extends ToolSpec {
  /** Which agents see and may call this tool. */
  sets: readonly Toolset[];
  label: (input: never) => string;
  execute: (input: never, ctx: ToolContext) => ToolOutput | Promise<ToolOutput>;
}

export function define<S extends z.ZodType>(def: {
  name: string;
  description: string;
  schema: S;
  sets: readonly Toolset[];
  label: (input: z.infer<S>) => string;
  execute: (input: z.infer<S>, ctx: ToolContext) => ToolOutput | Promise<ToolOutput>;
}): ToolDef {
  return def as unknown as ToolDef;
}

export const clip = (text: string, n = 60) => (text.length > n ? `${text.slice(0, n - 1)}…` : text);

/** A workspace result `{ ok, ...rest }` as a tool result. */
export function fromResult(result: { ok: true } | { ok: false; error: string }): ToolOutput {
  if (!result.ok) return { result: { error: result.error } };
  return { result: Object.fromEntries(Object.entries(result).filter(([key]) => key !== "ok")) };
}
