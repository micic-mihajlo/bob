import type { AgentId } from "@/lib/types";

/** The oldest visits drop off after this many, as in a browser tab. */
const HISTORY_LIMIT = 50;

export interface ChatHistory {
  entries: readonly AgentId[];
  index: number;
}

export const EMPTY_CHAT_HISTORY: ChatHistory = { entries: [], index: -1 };

/**
 * The index of the nearest chat in that direction that can still open, or -1. A skipped chat can
 * leave the open chat on both sides of it, so the open chat is skipped too.
 */
export function nearestChat(history: ChatHistory, offset: 1 | -1, exists: (id: AgentId) => boolean): number {
  const open = history.entries[history.index];
  for (let index = history.index + offset; index >= 0 && index < history.entries.length; index += offset) {
    const entry = history.entries[index];
    if (entry !== undefined && exists(entry) && entry !== open) return index;
  }
  return -1;
}

/**
 * Records the chat that is open now. A move to `target` that opened it keeps the history, so
 * Forward still works after Back. Any other chat drops the forward entries, as a browser does.
 */
export function recordChat(history: ChatHistory, entry: AgentId, target: number | null): ChatHistory {
  if (target !== null && history.entries[target] === entry) return { ...history, index: target };
  if (history.entries[history.index] === entry) return history;
  const entries = [...history.entries.slice(0, history.index + 1), entry].slice(-HISTORY_LIMIT);
  return { entries, index: entries.length - 1 };
}

/**
 * The key of Back or Forward: ⌘[ and ⌘] on macOS, Alt+← and Alt+→ elsewhere, as in a browser. Alt+←
 * in a text field stays with the field.
 */
export function chatHistoryShortcut(
  event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey" | "target">,
  mac: boolean,
): "back" | "forward" | undefined {
  if (event.shiftKey) return undefined;
  if (mac) {
    if (!event.metaKey || event.altKey || event.ctrlKey) return undefined;
    return event.key === "[" ? "back" : event.key === "]" ? "forward" : undefined;
  }
  if (!event.altKey || event.metaKey || event.ctrlKey || editableTarget(event.target)) return undefined;
  return event.key === "ArrowLeft" ? "back" : event.key === "ArrowRight" ? "forward" : undefined;
}

function editableTarget(target: EventTarget | null): boolean {
  return (
    typeof HTMLElement !== "undefined" &&
    target instanceof HTMLElement &&
    (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
  );
}

/** The keys of Back and Forward, as a tooltip shows them on this platform. */
export function chatHistoryKeys(mac: boolean) {
  return mac ? { back: "⌘[", forward: "⌘]" } : { back: "Alt+←", forward: "Alt+→" };
}
