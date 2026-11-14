import { connection } from "next/server";
import { z } from "zod";
import { answer, json, parseBody, ready } from "@/lib/http";
import { addInboxItem, INBOX_KINDS, inboxItems, SAMPLE_INBOX } from "@/lib/inbox";
import { getState } from "@/lib/store";

const item = z.object({ kind: z.enum(INBOX_KINDS), source: z.string().max(200), text: z.string().min(1).max(50_000) });
const body = z.union([item, z.object({ sample: z.literal(true) })]);

export async function GET(): Promise<Response> {
  await connection();
  ready();
  return json(inboxItems(getState()));
}

export async function POST(request: Request): Promise<Response> {
  ready();
  const parsed = await parseBody(request, body);
  if (!parsed.ok) return parsed.response;
  if (!("sample" in parsed.data)) return answer(addInboxItem(parsed.data));
  const ids: string[] = [];
  for (const sample of SAMPLE_INBOX) {
    const added = addInboxItem(sample);
    if (!added.ok) return answer(added);
    ids.push(added.inboxId);
  }
  return json({ ok: true, inboxIds: ids });
}
