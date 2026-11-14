import { useSyncExternalStore } from "react";
import type { AgentId } from "@/lib/types";

/**
 * The person's own sidebar layout for one project: the pinned agents in their order, and the agents
 * they hid with when. It lives in this browser's storage, as the reference keeps it per scope.
 */
export interface SidebarPins {
  pinned: readonly AgentId[];
  hidden: Readonly<Record<AgentId, string>>;
}

const EMPTY: SidebarPins = { pinned: [], hidden: {} };
const EVENT = "bob-sidebar-pins";
const cache = new Map<string, { raw: string | null; value: SidebarPins }>();

function storageKey(projectId: string): string {
  return `bob-sidebar-pins:${projectId}`;
}

function read(projectId: string): SidebarPins {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(storageKey(projectId));
  } catch {}
  const cached = cache.get(projectId);
  if (cached && cached.raw === raw) return cached.value;
  let value = EMPTY;
  try {
    const parsed = raw ? (JSON.parse(raw) as Partial<SidebarPins>) : null;
    if (parsed) value = { pinned: Array.isArray(parsed.pinned) ? parsed.pinned : [], hidden: parsed.hidden ?? {} };
  } catch {}
  cache.set(projectId, { raw, value });
  return value;
}

function write(projectId: string, next: SidebarPins): void {
  try {
    localStorage.setItem(storageKey(projectId), JSON.stringify(next));
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useSidebarPins(projectId: string) {
  const pins = useSyncExternalStore(subscribe, () => read(projectId), () => EMPTY);
  const update = (change: (current: SidebarPins) => SidebarPins) => write(projectId, change(read(projectId)));
  return {
    pins,
    pin: (id: AgentId) =>
      update((current) => ({ ...current, pinned: current.pinned.includes(id) ? current.pinned : [...current.pinned, id] })),
    unpin: (id: AgentId) => update((current) => ({ ...current, pinned: current.pinned.filter((entry) => entry !== id) })),
    movePinned: (id: AgentId, offset: -1 | 1) =>
      update((current) => {
        const from = current.pinned.indexOf(id);
        const to = from + offset;
        if (from < 0 || to < 0 || to >= current.pinned.length) return current;
        const pinned = [...current.pinned];
        pinned.splice(to, 0, ...pinned.splice(from, 1));
        return { ...current, pinned };
      }),
    hide: (id: AgentId) =>
      update((current) => ({
        pinned: current.pinned.filter((entry) => entry !== id),
        hidden: { ...current.hidden, [id]: new Date().toISOString() },
      })),
    restore: (id: AgentId) =>
      update((current) => {
        const { [id]: _, ...hidden } = current.hidden;
        return { ...current, hidden };
      }),
  };
}
