import type { Agent } from "@/lib/types";

export type PanelTab = "roadmap" | "crew" | "drive" | "activity" | "changes" | "files" | "review";

/** What the panel is about: the captain's plan, one crew thread's workspace, or a standing agent. */
export type PanelKind = "captain" | "crew" | "standing";

export const PANEL_TABS: Readonly<Record<PanelKind, readonly PanelTab[]>> = {
  captain: ["roadmap", "crew", "drive", "activity"],
  crew: ["changes", "files", "review"],
  standing: ["roadmap", "activity"],
};

export const PANEL_TAB_LABEL: Readonly<Record<PanelTab, string>> = {
  roadmap: "Roadmap",
  crew: "Crew",
  drive: "Drive",
  activity: "Activity",
  changes: "Changes",
  files: "Files",
  review: "Review",
};

export function panelKindOf(agent: Agent | undefined, captain: Agent | undefined): PanelKind {
  if (agent?.kind === "crew") return "crew";
  return agent !== undefined && agent.id === captain?.id ? "captain" : "standing";
}

export const FIRST_TABS: Readonly<Record<PanelKind, PanelTab>> = { captain: "roadmap", crew: "changes", standing: "roadmap" };
