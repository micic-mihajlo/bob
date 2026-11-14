import { z } from "zod";
import { connectClaude, disconnectClaude } from "@/lib/claude-actions";
import { claudeStatus } from "@/lib/claude-connection";
import { failure, json, parseBody, ready } from "@/lib/http";

const connectSchema = z.object({
  method: z.enum(["oauth-token", "api-key", "claude-code"]),
  secret: z.string().max(4_000).optional(),
});

/** Whether the person's own Claude is connected, and how. Never the credential. */
export function GET(): Response {
  return json(claudeStatus());
}

/** Connects it. The secret is written to a server-side file and never echoed back. */
export async function POST(request: Request): Promise<Response> {
  ready();
  const body = await parseBody(request, connectSchema);
  if (!body.ok) return body.response;
  const result = await connectClaude(body.data.method, body.data.secret);
  return result.ok ? json(result) : failure(result.error);
}

export function DELETE(): Response {
  ready();
  const result = disconnectClaude();
  return result.ok ? json(result) : failure(result.error);
}
