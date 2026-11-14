import { failure, json, ready } from "@/lib/http";
import { getState } from "@/lib/store";
import { traceWhy } from "@/lib/why";

export async function GET(request: Request): Promise<Response> {
  ready();
  const messageId = new URL(request.url).searchParams.get("messageId");
  if (!messageId) return failure("Pass ?messageId=...");
  const hops = traceWhy(getState(), messageId);
  return hops.length > 0 ? json({ hops }) : failure(`No message with id ${messageId}.`, 404);
}
