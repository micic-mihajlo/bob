"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { PreviewView } from "@/lib/preview";
import { API } from "@/lib/types";

/** The window's view of the one preview the server runs, and a counter that asks the side panel to show it. */
interface PreviewStore {
  view: PreviewView | null;
  error: string | null;
  shown: number;
}

let store: PreviewStore = { view: null, error: null, shown: 0 };
const listeners = new Set<() => void>();
let polling: ReturnType<typeof setTimeout> | null = null;

function set(next: Partial<PreviewStore>): void {
  store = { ...store, ...next };
  listeners.forEach((notify) => notify());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function poll(): Promise<void> {
  polling = null;
  const response = await fetch(API.preview(), { cache: "no-store" }).catch(() => null);
  const body = response?.ok ? ((await response.json()) as { preview: PreviewView | null }) : null;
  if (body) set({ view: body.preview });
  if (store.view?.status === "starting") polling = setTimeout(() => void poll(), 1000);
}

export function usePreview(): PreviewStore {
  return useSyncExternalStore(subscribe, () => store, () => store);
}

/** Whether the server can preview this pull request: its project has a dev script. Asked once per pull request. */
export function usePreviewAvailable(pullRequestId: string): boolean {
  const [available, setAvailable] = useState<{ id: string; ok: boolean } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(API.preview(pullRequestId), { cache: "no-store", signal: controller.signal })
      .then((response) => (response.ok ? (response.json() as Promise<{ available: boolean }>) : { available: false }))
      .then((body) => setAvailable({ id: pullRequestId, ok: body.available }), () => undefined);
    return () => controller.abort();
  }, [pullRequestId]);
  return available?.id === pullRequestId && available.ok;
}

/** Starts the pull request's preview and asks the side panel to show it. */
export async function startPreview(pullRequestId: string): Promise<void> {
  set({ error: null, shown: store.shown + 1 });
  const response = await fetch(API.preview(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pullRequestId }),
  }).catch(() => null);
  const body = (await response?.json().catch(() => null)) as { ok: boolean; preview?: PreviewView; error?: string } | null;
  if (!body?.ok || !body.preview) {
    set({ error: body?.error ?? "Could not reach the server." });
    return;
  }
  set({ view: body.preview });
  if (polling === null) void poll();
}

export async function stopPreview(): Promise<void> {
  await fetch(API.preview(), { method: "DELETE" }).catch(() => null);
  set({ view: null, error: null });
}
