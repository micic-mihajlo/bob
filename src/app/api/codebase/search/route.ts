import { searchKnowledge } from "@/lib/graph/knowledge";
import { json, ready } from "@/lib/http";
import { getState } from "@/lib/store";

/** Live HydraDB recall over the active project's files and pull requests, for the codebase view's search box. */
export async function GET(request: Request): Promise<Response> {
  ready();
  const q = new URL(request.url).searchParams.get("q") ?? "";
  return json(await searchKnowledge(getState(), q));
}
