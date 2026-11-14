import { z } from "zod";
import { resetAll } from "@/lib/actions";
import { answer, parseBody } from "@/lib/http";

export async function POST(request: Request): Promise<Response> {
  const body = await parseBody(request, z.object({}));
  return body.ok ? answer(resetAll()) : body.response;
}
