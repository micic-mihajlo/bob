import { z } from "zod";
import { postUserMessage } from "@/lib/actions";
import { answer, parseBody, ready } from "@/lib/http";

const Body = z.object({ text: z.string().trim().min(1).max(8000), mode: z.enum(["steer", "queue"]).optional(), newRequest: z.boolean().optional() });

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  ready();
  const { id } = await ctx.params;
  const body = await parseBody(request, Body);
  return body.ok ? answer(postUserMessage(id, body.data.text, body.data.mode, undefined, body.data.newRequest)) : body.response;
}
