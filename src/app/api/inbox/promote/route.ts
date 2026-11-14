import { z } from "zod";
import { answer, parseBody, ready } from "@/lib/http";
import { promoteInboxOrder } from "@/lib/inbox";

export async function POST(request: Request): Promise<Response> {
  ready();
  const parsed = await parseBody(request, z.object({ workOrderId: z.string().min(1) }));
  return parsed.ok ? answer(promoteInboxOrder(parsed.data.workOrderId)) : parsed.response;
}
