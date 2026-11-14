import { z } from "zod";
import { postUserMessage } from "@/lib/actions";
import { attachClientTools, ClientToolSchema } from "@/lib/client-tools";
import { NO_STORE, parseBody, ready } from "@/lib/http";
import { CAPTAIN_ID } from "@/lib/seed";
import { getState, subscribe } from "@/lib/store";

const Body = z.object({ text: z.string().trim().min(1).max(8000), clientTools: z.array(ClientToolSchema).max(200).optional() });

const SETTLE_MS = 2_000;
const LIMIT_MS = 10 * 60_000;

export async function POST(request: Request): Promise<Response> {
  ready();
  const body = await parseBody(request, Body);
  if (!body.ok) return body.response;
  const captain = getState().agents.find((a) => a.kind === "captain")?.id ?? CAPTAIN_ID;
  const early: Record<string, unknown>[] = [];
  let send: (chunk: Record<string, unknown>) => void = (chunk) => early.push(chunk);
  const detach = attachClientTools(captain, body.data.clientTools ?? [], (chunk) => send(chunk));
  const sent = postUserMessage(captain, body.data.text);
  if (!sent.ok) {
    detach();
    return new Response(sent.error, { status: 400 });
  }
  const requestId = getState().messages.find((m) => m.id === sent.messageId)?.requestId;
  const names = new Map(getState().agents.map((a) => [a.id, a.code ?? a.name]));
  const encoder = new TextEncoder();
  const seen = new Map<string, string | undefined>();
  let stop = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = (chunk: Record<string, unknown>) => controller.enqueue(encoder.encode(`${JSON.stringify(chunk)}\n`));
      send = emit;
      for (const chunk of early.splice(0)) emit(chunk);
      const close = () => {
        detach();
        stop();
        try {
          controller.close();
        } catch {}
      };
      let settle: ReturnType<typeof setTimeout> | undefined;

      const check = () => {
        const s = getState();
        const turns = s.turns.filter((t) => t.requestId === requestId);
        const turnIds = new Set(turns.map((t) => t.id));
        for (const [agentId, items] of Object.entries(s.threads)) {
          for (const item of items) {
            if (!("turnId" in item) || !turnIds.has(item.turnId)) continue;
            const known = seen.has(item.id);
            if (item.kind === "step") {
              if (!known) emit({ type: "tool-input-available", toolCallId: item.id, toolName: item.label, input: { agent: names.get(agentId), tool: item.tool } });
              if (item.outcome && seen.get(item.id) !== item.outcome) {
                emit(
                  item.outcome === "ok"
                    ? { type: "tool-output-available", toolCallId: item.id, output: item.detail ?? "done" }
                    : { type: "tool-output-error", toolCallId: item.id, errorText: item.detail ?? "failed" },
                );
              }
              seen.set(item.id, item.outcome);
              continue;
            }
            if (known) continue;
            seen.set(item.id, undefined);
            if (item.kind === "agent_text" && agentId === captain) emit({ type: "text-delta", delta: `${item.text}\n\n` });
            if (item.kind === "message_out") emit({ type: "reasoning-delta", delta: `${names.get(agentId)} → ${item.to.map((id) => names.get(id)).join(", ")}: ${item.text}\n` });
          }
        }
        for (const approval of s.approvals) {
          if (approval.requestId !== requestId || approval.status !== "pending" || seen.has(approval.id)) continue;
          seen.set(approval.id, undefined);
          emit({ type: "text-delta", delta: `Waiting on your approval: ${approval.title}\n\n` });
        }
        clearTimeout(settle);
        if (turns.length > 0 && turns.every((t) => t.status !== "running")) settle = setTimeout(close, SETTLE_MS);
      };

      const unsubscribe = subscribe(check);
      const limit = setTimeout(close, LIMIT_MS);
      stop = () => {
        unsubscribe();
        clearTimeout(settle);
        clearTimeout(limit);
      };
      request.signal.addEventListener("abort", close);
      check();
    },
    cancel() {
      detach();
      stop();
    },
  });

  return new Response(stream, { headers: { ...NO_STORE, "content-type": "application/x-ndjson" } });
}
