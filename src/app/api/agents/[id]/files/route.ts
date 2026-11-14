import { connection } from "next/server";
import { json, ready } from "@/lib/http";
import { getState } from "@/lib/store";
import { browseWorkspace } from "@/lib/thread-workspace";

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  await connection();
  ready();
  const { id } = await ctx.params;
  const path = new URL(request.url).searchParams.get("path") ?? "";
  const listing = await browseWorkspace(getState(), id, path);
  return json(listing, listing.ok ? 200 : 400);
}
