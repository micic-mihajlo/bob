"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { agentActivityExitDelay, agentActivityExitDuration, agentActivityShowDelay } from "./activity-timing";
import { nextAgentActivityLabel, type AgentActivityLabel } from "./AgentActivity";

export interface RenderedAgentActivity {
  activityId: string;
  detail: string | null;
  /** When the current line started, so the indicator can show how long a long step has run. */
  since: number;
  phase: "active" | "exiting";
  label: AgentActivityLabel;
}

type Update = RenderedAgentActivity | null | ((current: RenderedAgentActivity | null) => RenderedAgentActivity | null);

function createRenderedActivity() {
  let state: RenderedAgentActivity | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(update: Update) {
      const next = typeof update === "function" ? update(state) : update;
      if (next === state) return;
      state = next;
      listeners.forEach((notify) => notify());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/**
 * The activity line of one chat. A line shows after a short delay, so a turn that ends at once does
 * not flash one; a new detail restarts its time; and when the work ends the line waits, then leaves
 * with its exit motion before it goes. Each run picks its own label, never the one before.
 */
export function useAgentActivity(activityId: string | null, detail: string | null): RenderedAgentActivity | null {
  const [store] = useState(createRenderedActivity);
  const rendered = useSyncExternalStore(store.subscribe, store.get, () => null);
  const latest = useRef({ activityId, detail });
  const lastLabel = useRef<{ activityId: string; label: AgentActivityLabel } | null>(null);
  useEffect(() => {
    latest.current = { activityId, detail };
  });

  useEffect(() => {
    if (activityId) {
      const previous = lastLabel.current;
      const label = previous?.activityId === activityId ? previous.label : nextAgentActivityLabel(previous?.label);
      lastLabel.current = { activityId, label };
      const next = { activityId, detail: latest.current.detail, since: Date.now(), phase: "active" as const, label };
      if (store.get()) {
        store.set(next);
        return;
      }
      const show = window.setTimeout(() => {
        if (latest.current.activityId === activityId) store.set({ ...next, detail: latest.current.detail });
      }, agentActivityShowDelay());
      return () => window.clearTimeout(show);
    }
    const current = store.get();
    if (!current) return;
    const exitId = current.activityId;
    let exit: number | undefined;
    const beginExit = () => {
      store.set((now) => (now?.activityId === exitId ? { ...now, phase: "exiting" } : now));
      exit = window.setTimeout(() => {
        store.set((now) => (now?.activityId === exitId && now.phase === "exiting" ? null : now));
      }, agentActivityExitDuration());
    };
    const delay = agentActivityExitDelay();
    const wait = delay === 0 ? undefined : window.setTimeout(beginExit, delay);
    if (delay === 0) beginExit();
    return () => {
      window.clearTimeout(wait);
      window.clearTimeout(exit);
    };
  }, [activityId, store]);

  useEffect(() => {
    if (!activityId) return;
    store.set((current) => (current?.activityId === activityId && current.detail !== detail ? { ...current, detail, since: Date.now() } : current));
  }, [activityId, detail, store]);

  return rendered;
}
