import { graphViewFor } from "@/lib/graph/view";
import { failure, json, ready } from "@/lib/http";
import { getState } from "@/lib/store";

export async function GET(request: Request): Promise<Response> {
  ready();
  const prId = new URL(request.url).searchParams.get("prId");
  if (!prId) return failure("Pass ?prId=...");
  const view = await graphViewFor(getState(), prId);
  return view ? json(view) : failure(`No pull request with id ${prId}.`, 404);
}
