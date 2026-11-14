import { z } from "zod";
import { answer, parseBody, ready } from "@/lib/http";
import { commentOnLines } from "@/lib/line-comments";

const Body = z.object({
  path: z.string().min(1),
  startLine: z.number().int().min(1),
  endLine: z.number().int().min(1),
  text: z.string().min(1).max(4000),
});

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  ready();
  const { id } = await ctx.params;
  const body = await parseBody(request, Body);
  return body.ok ? answer(commentOnLines(id, body.data)) : body.response;
}
