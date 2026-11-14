"use client";

import { useEffect, useState } from "react";

export interface Loaded<T> {
  /** The last answer for this identity. It stays on screen while a newer version loads. */
  data: T | null;
  error: string | null;
  loading: boolean;
}

interface Result<T> {
  identity: string;
  version: number;
  data: T | null;
  error: string | null;
}

/**
 * Loads `identity` again whenever `version` changes, aborting the request it replaces. `load` must be
 * stable for one identity, since a new function starts a new request.
 */
export function useKeyedLoad<T>(identity: string, version: number, load: (signal: AbortSignal) => Promise<T>): Loaded<T> {
  const [result, setResult] = useState<Result<T> | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal)
      .then((data) => setResult({ identity, version, data, error: null }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const message = error instanceof Error ? error.message : "Could not load this.";
        setResult((previous) => ({ identity, version, data: previous?.identity === identity ? previous.data : null, error: message }));
      });
    return () => controller.abort();
  }, [identity, version, load]);

  const same = result?.identity === identity;
  return {
    data: same ? result.data : null,
    error: same ? result.error : null,
    loading: !same || result.version !== version,
  };
}
