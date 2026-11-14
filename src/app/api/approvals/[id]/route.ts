import { z } from "zod";
import { decideApproval } from "@/lib/actions";
import { answer, parseBody, ready } from "@/lib/http";

const Body = z.object({ decision: z.enum(["approved", "denied"]) });

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  ready();
  const { id } = await ctx.params;
  const body = await parseBody(request, Body);
  return body.ok ? answer(decideApproval(id, body.data.decision)) : body.response;
}
