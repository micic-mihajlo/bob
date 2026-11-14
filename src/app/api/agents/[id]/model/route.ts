import { z } from "zod";
import { setThreadModelByPerson } from "@/lib/actions";
import { answer, parseBody, ready } from "@/lib/http";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  ready();
  const { id } = await ctx.params;
  const body = await parseBody(request, z.object({ model: z.string().min(1) }));
  return body.ok ? answer(setThreadModelByPerson(id, body.data.model)) : body.response;
}
