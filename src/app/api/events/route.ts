import { connection } from "next/server";
import { NO_STORE, ready } from "@/lib/http";
import { getState, subscribe } from "@/lib/store";

const HEARTBEAT_MS = 15_000;

export async function GET(request: Request): Promise<Response> {
  await connection();
  ready();
  const encoder = new TextEncoder();
  let stop = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const push = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          stop();
        }
      };
      const sendRev = () => push(`data: ${JSON.stringify({ rev: getState().rev })}\n\n`);
      const unsubscribe = subscribe(sendRev);
      const heartbeat = setInterval(() => push(": heartbeat\n\n"), HEARTBEAT_MS);
      stop = () => {
        unsubscribe();
        clearInterval(heartbeat);
      };
      request.signal.addEventListener("abort", () => {
        stop();
        try {
          controller.close();
        } catch {
          // Already closed by the client.
        }
      });
      sendRev();
    },
    cancel() {
      stop();
    },
  });
  return new Response(stream, {
    headers: { ...NO_STORE, "content-type": "text/event-stream", connection: "keep-alive", "x-accel-buffering": "no" },
  });
}
