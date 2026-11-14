import { PANEL_TABS, type PanelKind, type PanelTab } from "@/lib/client/panel-tabs";

export interface UrlState {
  thread: string | null;
  tab: string | null;
}

export function parseUrlState(search: string): UrlState {
  const params = new URLSearchParams(search);
  return { thread: params.get("thread"), tab: params.get("tab") };
}

/** The search string for a thread and its panel tab; a closed panel has no tab. */
export function buildUrlSearch(thread: string | null, tab: PanelTab | null): string {
  const params = new URLSearchParams();
  if (thread !== null) params.set("thread", thread);
  if (thread !== null && tab !== null) params.set("tab", tab);
  const text = params.toString();
  return text === "" ? "" : `?${text}`;
}

/** The tab if the kind of thread can open it, else null. */
export function validTabFor(kind: PanelKind, tab: string | null): PanelTab | null {
  return PANEL_TABS[kind].find((candidate) => candidate === tab) ?? null;
}
