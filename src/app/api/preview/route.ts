import { z } from "zod";
import { json, parseBody, ready } from "@/lib/http";
import { canPreview, previewView, startPreview, stopPreview } from "@/lib/preview";

/** The running preview, and whether the pull request named by ?prId can be previewed. */
export async function GET(request: Request): Promise<Response> {
  ready();
  const prId = new URL(request.url).searchParams.get("prId");
  return json({ preview: previewView(), available: prId ? await canPreview(prId) : false });
}

export async function POST(request: Request): Promise<Response> {
  ready();
  const body = await parseBody(request, z.object({ pullRequestId: z.string().min(1) }));
  if (!body.ok) return body.response;
  const started = await startPreview(body.data.pullRequestId);
  return started.ok ? json(started) : json(started, 400);
}

export async function DELETE(): Promise<Response> {
  stopPreview();
  return json({ ok: true });
}
