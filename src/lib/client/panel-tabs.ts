import type { Agent } from "@/lib/types";

/** A pane of the side panel. Each open pane has a tab in the panel's top row. */
export type PanelTab = "roadmap" | "inbox" | "crew" | "drive" | "activity" | "changes" | "files" | "review" | "codebase";

/**
 * Every pane the new side panel can show. `verified` is not a PanelTab yet, because the old panel
 * maps every PanelTab to a tab of its own; fold it in when the old panel goes.
 */
export type SidePanelPaneId = PanelTab | "verified" | "preview";

/** What the panel is about: the captain's plan, one crew thread's workspace, or a standing agent. */
export type PanelKind = "captain" | "crew" | "standing";

/** The panes each kind of thread can open, in tab order. */
export const PANEL_TABS: Readonly<Record<PanelKind, readonly PanelTab[]>> = {
  captain: ["roadmap", "inbox", "crew", "drive", "activity"],
  crew: ["changes", "files", "review"],
  standing: ["roadmap", "activity"],
};

/** The panes the new side panel offers each kind of thread, in tab order. */
export const SIDE_PANEL_PANES: Readonly<Record<PanelKind, readonly SidePanelPaneId[]>> = {
  captain: [...PANEL_TABS.captain, "codebase", "verified"],
  crew: PANEL_TABS.crew,
  standing: PANEL_TABS.standing,
};

export const PANEL_TAB_LABEL: Readonly<Record<SidePanelPaneId, string>> = {
  roadmap: "Roadmap",
  inbox: "Inbox",
  crew: "Blobs",
  drive: "Drive",
  activity: "Activity",
  verified: "Verified",
  changes: "Changes",
  files: "Files",
  review: "Review",
  codebase: "Codebase",
  preview: "Preview",
};

export function panelKindOf(agent: Agent | undefined, captain: Agent | undefined): PanelKind {
  if (agent?.kind === "crew") return "crew";
  return agent !== undefined && agent.id === captain?.id ? "captain" : "standing";
}

export const FIRST_TABS: Readonly<Record<PanelKind, PanelTab>> = { captain: "roadmap", crew: "changes", standing: "roadmap" };

/** The open panes: every pane the thread can open that the person has not closed, in tab order. */
export function openPanes(available: readonly SidePanelPaneId[], closed: readonly SidePanelPaneId[]): SidePanelPaneId[] {
  return available.filter((pane) => !closed.includes(pane));
}

/** The selected pane: the remembered one while it is open, else the first open pane, else none. */
export function selectedPane(panes: readonly SidePanelPaneId[], remembered: SidePanelPaneId): SidePanelPaneId | null {
  return panes.includes(remembered) ? remembered : (panes[0] ?? null);
}

/** After a tab closes, the tab that takes its place is selected, or the one before it at the end. */
export function paneAfterClose(panes: readonly SidePanelPaneId[], closing: SidePanelPaneId, selected: SidePanelPaneId | null): SidePanelPaneId | null {
  const rest = panes.filter((pane) => pane !== closing);
  if (selected !== closing) return selected !== null && rest.includes(selected) ? selected : (rest[0] ?? null);
  const index = panes.indexOf(closing);
  return rest[Math.min(index, rest.length - 1)] ?? null;
}
