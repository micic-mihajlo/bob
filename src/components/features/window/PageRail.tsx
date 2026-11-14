"use client";

import { Bot, FolderOpen, Inbox, Map as MapIcon, Users, type LucideIcon } from "lucide-react";
import { useBob } from "@/components/features/window/BobContext";
import { buttonClass } from "@/components/ui/classes";
import type { PanelTab } from "@/lib/client/panel-tabs";

/** One rail button; its name shows as the tooltip. */
function RailButton({ label, icon: Icon, current = false, onClick }: { label: string; icon: LucideIcon; current?: boolean; onClick: () => void }) {
  return (
    <div className="ui-motion-tooltip-trigger">
      <button
        type="button"
        className={buttonClass({ variant: "ghost", className: "window-rail-button" })}
        data-slot="button"
        data-variant="ghost"
        data-size="default"
        aria-label={label}
        title={label}
        aria-current={current ? "page" : undefined}
        onClick={onClick}
      >
        <Icon aria-hidden="true" />
      </button>
    </div>
  );
}

const CAPTAIN_PAGES: ReadonlyArray<{ tab: PanelTab; label: string; icon: LucideIcon }> = [
  { tab: "roadmap", label: "Roadmap", icon: MapIcon },
  { tab: "inbox", label: "Inbox", icon: Inbox },
  { tab: "crew", label: "Crew", icon: Users },
  { tab: "drive", label: "Drive", icon: FolderOpen },
];

/** The page rail at the left of the window. Agents is the page; the rest open the captain's panel. */
export function PageRail() {
  const { captain, openThreadTab, selectAgent } = useBob();

  return (
    <nav className="window-rail" aria-label="Pages">
      <div className="window-rail-group">
        <RailButton label="Agents" icon={Bot} current onClick={() => captain && selectAgent(captain.id)} />
        {captain
          ? CAPTAIN_PAGES.map((page) => <RailButton key={page.tab} label={page.label} icon={page.icon} onClick={() => openThreadTab(captain.id, page.tab)} />)
          : null}
      </div>
    </nav>
  );
}
