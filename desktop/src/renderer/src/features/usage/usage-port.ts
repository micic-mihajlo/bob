import type { BobDesktopApi } from "@bob/contracts/ipc";

/**
 * What the usage panel reaches in main: the analytics of a server, its agents, and the events that
 * make the report stale.
 */
export interface UsagePort {
  agent: Pick<BobDesktopApi["agent"], "getHostAnalytics" | "listAgents" | "onScopedEvent">;
  servers: Pick<BobDesktopApi["servers"], "onEvent">;
}

/** Read on each call: tests and stories replace `window.bob` per case. */
export function usagePort(): UsagePort {
  return window.bob;
}
