"use client";

import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

/** One clock for the whole window, so every live timer ticks on the same second. */
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  timer ??= setInterval(() => listeners.forEach((notify) => notify()), 1000);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

function stayStill(): () => void {
  return () => undefined;
}

function currentSecond(): number {
  return Math.floor(Date.now() / 1000) * 1000;
}

export function useNow(active: boolean): number {
  return useSyncExternalStore(active ? subscribe : stayStill, currentSecond, () => 0);
}
