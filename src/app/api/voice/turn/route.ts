import { z } from "zod";
import { answer, parseBody, ready } from "@/lib/http";
import { voiceTurn } from "@/lib/voice/turn";

const Body = z.object({ agentId: z.string().min(1), text: z.string().trim().min(1).max(8000) });

export async function POST(request: Request): Promise<Response> {
  ready();
  const body = await parseBody(request, Body);
  return body.ok ? answer(await voiceTurn(body.data.agentId, body.data.text)) : body.response;
}
