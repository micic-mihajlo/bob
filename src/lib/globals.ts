import type { Brain } from "./brain/types";
import type { State } from "./state";

export interface Config {
  /** Milliseconds between steps, so the UI can show work in progress. */
  pace: number;
  persist: boolean;
}

export interface BobGlobals {
  state: State | null;
  listeners: Set<() => void>;
  persistTimer: ReturnType<typeof setTimeout> | null;
  config: Config;
  inflight: Set<Promise<void>>;
  brainOverride: Brain | null;
  /** Turns closed by the boot sweep whose follow-up (relays, drains) has not run yet. */
  pendingBoot: string[] | null;
}

const KEY = "__bobCore";

function defaultPace(): number {
  const raw = Number(process.env.BOB_PACE);
  return Number.isFinite(raw) && raw >= 0 ? raw : 600;
}

/** Lives on globalThis so hot reload and per-route bundles share one instance. */
export function globals(): BobGlobals {
  const g = globalThis as unknown as Record<string, BobGlobals | undefined>;
  if (!g[KEY]) {
    g[KEY] = {
      state: null,
      listeners: new Set(),
      persistTimer: null,
      config: { pace: defaultPace(), persist: !process.env.VITEST },
      inflight: new Set(),
      brainOverride: null,
      pendingBoot: null,
    };
  }
  return g[KEY] as BobGlobals;
}
