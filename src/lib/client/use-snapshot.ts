"use client";

import { useEffect, useState } from "react";
import { API, type Snapshot } from "@/lib/types";

const POLL_INTERVAL_MS = 2000;

export interface SnapshotState {
  snapshot: Snapshot | null;
  /** The last fetch error. Cleared by the next successful fetch. */
  error: string | null;
  /** True while the event stream is open. */
  connected: boolean;
}

function isSnapshot(value: unknown): value is Snapshot {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<Snapshot>;
  return typeof candidate.rev === "number" && Array.isArray(candidate.agents) && candidate.threads !== undefined;
}

function parseRev(data: string): number | null {
  try {
    const parsed: unknown = JSON.parse(data);
    if (typeof parsed === "object" && parsed !== null && typeof (parsed as { rev?: unknown }).rev === "number") {
      return (parsed as { rev: number }).rev;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Fetches the snapshot once, then refetches on every revision the event stream announces. When the
 * stream is closed or failing, it polls instead.
 */
export function useSnapshot(): SnapshotState {
  const [state, setState] = useState<SnapshotState>({ snapshot: null, error: null, connected: false });

  useEffect(() => {
    let disposed = false;
    let inFlight = false;
    let refetchQueued = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let source: EventSource | null = null;

    async function load(): Promise<void> {
      if (inFlight) {
        refetchQueued = true;
        return;
      }
      inFlight = true;
      try {
        const response = await fetch(API.state, { cache: "no-store" });
        if (!response.ok) throw new Error(`The server answered ${response.status}.`);
        const payload: unknown = await response.json();
        if (!isSnapshot(payload)) throw new Error("The state was not in the expected shape.");
        if (disposed) return;
        setState((previous) => ({ ...previous, snapshot: payload, error: null }));
      } catch (error) {
        if (disposed) return;
        const message = error instanceof Error ? error.message : "Could not load the state.";
        setState((previous) => ({ ...previous, error: message }));
      } finally {
        inFlight = false;
        if (refetchQueued && !disposed) {
          refetchQueued = false;
          void load();
        }
      }
    }

    function startPolling(): void {
      if (pollTimer !== null) return;
      pollTimer = setInterval(() => void load(), POLL_INTERVAL_MS);
    }

    function stopPolling(): void {
      if (pollTimer === null) return;
      clearInterval(pollTimer);
      pollTimer = null;
    }

    function openStream(): void {
      if (typeof EventSource === "undefined") {
        startPolling();
        return;
      }
      source = new EventSource(API.events);
      source.onopen = () => {
        stopPolling();
        setState((previous) => ({ ...previous, connected: true }));
        void load();
      };
      source.onmessage = (event: MessageEvent<string>) => {
        if (parseRev(event.data) !== null) void load();
      };
      source.onerror = () => {
        setState((previous) => ({ ...previous, connected: false }));
        startPolling();
      };
    }

    void load();
    openStream();

    return () => {
      disposed = true;
      stopPolling();
      source?.close();
    };
  }, []);

  return state;
}
