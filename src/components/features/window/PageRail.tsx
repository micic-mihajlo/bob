"use client";

import { Bot, FolderOpen, Inbox, Map as MapIcon, Users, type LucideIcon } from "lucide-react";
import { useBob } from "@/components/features/window/BobContext";
import { Button } from "@/components/ui/Button";
import { MotionTooltip } from "@/components/ui/MotionTooltip";
import type { PanelTab } from "@/lib/client/panel-tabs";

/** One rail button. Its name shows as a tooltip. */
function RailButton({ label, icon: Icon, current = false, onClick }: { label: string; icon: LucideIcon; current?: boolean; onClick: () => void }) {
  return (
    <MotionTooltip content={label}>
      <Button variant="ghost" type="button" className="window-rail-button" aria-label={label} aria-current={current ? "page" : undefined} onClick={onClick}>
        <Icon aria-hidden="true" />
      </Button>
    </MotionTooltip>
  );
}

const CAPTAIN_PAGES: ReadonlyArray<{ tab: PanelTab; label: string; icon: LucideIcon }> = [
  { tab: "roadmap", label: "Roadmap", icon: MapIcon },
  { tab: "inbox", label: "Inbox", icon: Inbox },
  { tab: "crew", label: "Blobs", icon: Users },
  { tab: "drive", label: "Drive", icon: FolderOpen },
];

/** The page rail at the left of the window. Agents is the page; the rest open the captain's panel. */
export function PageRail() {
  const { captain, selectedAgent, panelOpen, panelTab, openThreadTab, selectAgent } = useBob();
  const onCaptain = captain !== undefined && selectedAgent?.id === captain.id && panelOpen;
  const currentTab = CAPTAIN_PAGES.find((page) => onCaptain && page.tab === panelTab)?.tab;

  return (
    <nav className="window-rail" aria-label="Pages">
      <div className="window-rail-group">
        <RailButton label="Agents" icon={Bot} current={currentTab === undefined} onClick={() => captain && selectAgent(captain.id)} />
        {captain
          ? CAPTAIN_PAGES.map((page) => (
              <RailButton key={page.tab} label={page.label} icon={page.icon} current={currentTab === page.tab} onClick={() => openThreadTab(captain.id, page.tab)} />
            ))
          : null}
      </div>
    </nav>
  );
}
