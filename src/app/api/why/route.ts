import { failure, json, ready } from "@/lib/http";
import { getState } from "@/lib/store";
import { answerWhy } from "@/lib/why";

export async function GET(request: Request): Promise<Response> {
  ready();
  const messageId = new URL(request.url).searchParams.get("messageId");
  if (!messageId) return failure("Pass ?messageId=...");
  const { hops, source } = await answerWhy(getState(), messageId);
  return hops.length > 0 ? json({ hops, source }) : failure(`No message with id ${messageId}.`, 404);
}
