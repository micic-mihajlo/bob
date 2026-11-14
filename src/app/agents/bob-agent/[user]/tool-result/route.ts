import { z } from "zod";
import { settleClientTool } from "@/lib/client-tools";
import { NO_STORE, parseBody, ready } from "@/lib/http";

const Body = z.object({ id: z.string().min(1), output: z.unknown().optional(), errorText: z.string().optional() });

/** The desktop posts what one of its tools returned for a `client-tool-call` chunk of `/prompt`. */
export async function POST(request: Request): Promise<Response> {
  ready();
  const body = await parseBody(request, Body);
  if (!body.ok) return body.response;
  const settled = settleClientTool(body.data.id, { output: body.data.output, errorText: body.data.errorText });
  return Response.json({ ok: settled }, { status: settled ? 200 : 404, headers: NO_STORE });
}
