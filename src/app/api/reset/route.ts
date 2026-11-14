import { z } from "zod";
import { resetAll } from "@/lib/actions";
import { answer, parseBody } from "@/lib/http";

export async function POST(request: Request): Promise<Response> {
  const body = await parseBody(request, z.object({ warm: z.boolean().optional() }));
  return body.ok ? answer(await resetAll(body.data)) : body.response;
}
