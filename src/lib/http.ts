import { z } from "zod";
import { boot } from "./actions";
import { startLinearPolling } from "./integrations/linear";

/** Helpers for the route handlers: the only place request bodies are parsed. */

export const NO_STORE = { "cache-control": "no-store" } as const;

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

export const failure = (error: string, status = 400) => json({ ok: false, error }, status);

/** Every POST answers `{ ok: true, ... }` or `{ ok: false, error }`. */
export function answer(result: { ok: true } | { ok: false; error: string }): Response {
  return result.ok ? json(result) : failure(result.error);
}

export async function parseBody<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<{ ok: true; data: z.infer<S> } | { ok: false; response: Response }> {
  const raw = await request.text();
  let value: unknown = {};
  if (raw.trim()) {
    try {
      value = JSON.parse(raw);
    } catch {
      return { ok: false, response: failure("The request body is not valid JSON.") };
    }
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) return { ok: false, response: failure(z.prettifyError(parsed.error).replace(/\n/g, " ")) };
  return { ok: true, data: parsed.data };
}

/** Loads the store and finishes any boot sweep before a route touches state, and starts the Linear poll when it is on. */
export const ready = (): void => {
  boot();
  startLinearPolling();
};
