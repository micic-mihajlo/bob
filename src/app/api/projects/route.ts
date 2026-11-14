import { connection } from "next/server";
import { z } from "zod";
import { answer, json, parseBody, ready } from "@/lib/http";
import { listProjects, openProject } from "@/lib/projects";

export async function GET(): Promise<Response> {
  await connection();
  ready();
  return json(listProjects());
}

export async function POST(request: Request): Promise<Response> {
  ready();
  const body = await parseBody(request, z.object({ repo: z.string().max(500).optional(), branch: z.string().max(200).optional(), name: z.string().max(80).optional(), template: z.enum(["invoices", "blank-ts"]).optional() }));
  return body.ok ? answer(await openProject(body.data)) : body.response;
}
