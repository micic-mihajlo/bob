import { z } from "zod";
import { createAgentByPerson } from "@/lib/actions";
import { answer, parseBody, ready } from "@/lib/http";

const Body = z.object({
  name: z.string().trim().min(1).max(40),
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(1000),
});

export async function POST(request: Request): Promise<Response> {
  ready();
  const body = await parseBody(request, Body);
  return body.ok ? answer(createAgentByPerson(body.data)) : body.response;
}
