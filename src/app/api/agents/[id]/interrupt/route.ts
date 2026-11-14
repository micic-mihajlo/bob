import { z } from "zod";
import { stopAgent } from "@/lib/actions";
import { answer, parseBody, ready } from "@/lib/http";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  ready();
  const { id } = await ctx.params;
  const body = await parseBody(request, z.object({}));
  return body.ok ? answer(stopAgent(id)) : body.response;
}
