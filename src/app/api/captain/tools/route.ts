import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { runRemoteTool } from "@/lib/brain/pi-durable";
import { failure, json, parseBody, ready } from "@/lib/http";

const callSchema = z.object({
  agentId: z.string().min(1),
  callId: z.string().min(1),
  name: z.string().min(1),
  input: z.unknown(),
});

const sameSecret = (given: string | null, expected: string) =>
  !!given && given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));

/**
 * The captain's tools, for its Pi Durable agent in the bob-captain Worker (BOB_CAPTAIN_ENGINE=pi-durable). Each call runs
 * here through callTool, under every rule the in-process loop has. Authenticated with BOB_DURABLE_SECRET.
 */
export async function POST(request: Request): Promise<Response> {
  const secret = process.env.BOB_DURABLE_SECRET?.trim();
  if (!secret || process.env.BOB_CAPTAIN_ENGINE !== "pi-durable") return failure("The pi-durable captain is off.", 404);
  if (!sameSecret(request.headers.get("x-bob-durable-secret"), secret)) return failure("Wrong or missing secret.", 401);
  ready();
  const body = await parseBody(request, callSchema);
  if (!body.ok) return body.response;
  const out = await runRemoteTool(body.data);
  return json(out.body, out.status);
}
