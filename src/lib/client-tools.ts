import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { ToolSpec } from "./tools/define";

/** A tool that lives on the person's computer (a desktop MCP server) and runs there, not on this server. */
export const ClientToolSchema = z.object({
  name: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/u),
  description: z.string().max(4000).optional(),
  parameters: z.record(z.string(), z.unknown()).optional(),
});
export type ClientTool = z.infer<typeof ClientToolSchema>;

type Chunk = { type: "client-tool-call"; id: string; toolName: string; input: unknown };
type Result = { output?: unknown; errorText?: string };

const CALL_TIMEOUT_MS = 5 * 60_000;
const attached = new Map<string, { tools: ClientTool[]; emit: (chunk: Chunk) => void }>();
const pending = new Map<string, (result: Result) => void>();

/** Offers an agent the desktop's tools while one prompt stream is open; the returned function takes them back. */
export function attachClientTools(agentId: string, tools: ClientTool[], emit: (chunk: Chunk) => void): () => void {
  const entry = { tools, emit };
  attached.set(agentId, entry);
  return () => {
    if (attached.get(agentId) === entry) attached.delete(agentId);
  };
}

export function clientToolSpecs(agentId: string): ToolSpec[] {
  return (attached.get(agentId)?.tools ?? []).map((t) => ({
    name: t.name,
    description: t.description ?? t.name,
    schema: z.record(z.string(), z.unknown()),
    jsonSchema: { type: "object", ...t.parameters },
  }));
}

export const isClientTool = (agentId: string, name: string) => attached.get(agentId)?.tools.some((t) => t.name === name) ?? false;

/** Asks the desktop to run the tool and waits for its `/tool-result`. */
export function callClientTool(agentId: string, name: string, input: unknown): Promise<Result> {
  const entry = attached.get(agentId);
  if (!entry) return Promise.resolve({ errorText: "The desktop that offered this tool is gone." });
  const id = randomUUID();
  return new Promise<Result>((resolve) => {
    const timer = setTimeout(() => settleClientTool(id, { errorText: "The desktop did not answer in time." }), CALL_TIMEOUT_MS);
    pending.set(id, (result) => {
      clearTimeout(timer);
      resolve(result);
    });
    entry.emit({ type: "client-tool-call", id, toolName: name, input });
  });
}

export function settleClientTool(id: string, result: Result): boolean {
  const resolve = pending.get(id);
  if (!resolve) return false;
  pending.delete(id);
  resolve(result);
  return true;
}
