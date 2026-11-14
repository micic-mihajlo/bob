import { connection } from "next/server";
import { json, ready } from "@/lib/http";
import { getState } from "@/lib/store";
import { workspaceChanges } from "@/lib/thread-workspace";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  await connection();
  ready();
  const { id } = await ctx.params;
  const changes = await workspaceChanges(getState(), id);
  return json(changes, changes.ok ? 200 : 400);
}
