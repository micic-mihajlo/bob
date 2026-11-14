"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * What the person has typed and not sent, per thread. It lives outside React state, so a keystroke re-renders
 * only the composer and the one sidebar row that shows the draft, and it is saved to this browser's storage
 * a moment after typing stops, so it survives a refresh. Scoped by project: thread ids repeat across projects.
 */

const SAVE_DELAY_MS = 250;
const storageKey = (projectId: string) => `bob-drafts:${projectId}`;

interface Drafts {
  texts: Map<string, string>;
  listeners: Map<string, Set<() => void>>;
  saveTimer: ReturnType<typeof setTimeout> | null;
}

const projects = new Map<string, Drafts>();

function draftsOf(projectId: string): Drafts {
  let drafts = projects.get(projectId);
  if (drafts) return drafts;
  drafts = { texts: new Map(), listeners: new Map(), saveTimer: null };
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey(projectId)) ?? "{}") as Record<string, unknown>;
    for (const [id, text] of Object.entries(saved)) if (typeof text === "string" && text.trim()) drafts.texts.set(id, text);
  } catch {}
  projects.set(projectId, drafts);
  return drafts;
}

function save(projectId: string, drafts: Drafts): void {
  if (drafts.saveTimer) clearTimeout(drafts.saveTimer);
  drafts.saveTimer = setTimeout(() => {
    drafts.saveTimer = null;
    try {
      if (drafts.texts.size === 0) localStorage.removeItem(storageKey(projectId));
      else localStorage.setItem(storageKey(projectId), JSON.stringify(Object.fromEntries(drafts.texts)));
    } catch {}
  }, SAVE_DELAY_MS);
}

export function setDraftText(projectId: string, agentId: string, text: string): void {
  const drafts = draftsOf(projectId);
  if ((drafts.texts.get(agentId) ?? "") === text) return;
  if (text.trim()) drafts.texts.set(agentId, text);
  else drafts.texts.delete(agentId);
  save(projectId, drafts);
  for (const listener of drafts.listeners.get(agentId) ?? []) listener();
}

function subscribeTo(projectId: string, agentId: string) {
  return (listener: () => void) => {
    const drafts = draftsOf(projectId);
    const set = drafts.listeners.get(agentId) ?? new Set();
    set.add(listener);
    drafts.listeners.set(agentId, set);
    return () => set.delete(listener);
  };
}

/** The thread's draft and its setter. Empty on the server, restored from storage after hydration. */
export function useDraft(projectId: string, agentId: string): [string, (text: string) => void] {
  // biome-ignore lint/correctness/useExhaustiveDependencies: the subscription is keyed by the thread.
  const subscribe = useCallback(subscribeTo(projectId, agentId), [projectId, agentId]);
  const text = useSyncExternalStore(
    subscribe,
    () => draftsOf(projectId).texts.get(agentId) ?? "",
    () => "",
  );
  const set = useCallback((next: string) => setDraftText(projectId, agentId, next), [projectId, agentId]);
  return [text, set];
}
