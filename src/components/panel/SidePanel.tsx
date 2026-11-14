"use client";

import { Activity, AppWindow, FileDiff, FolderTree, HardDrive, Map as MapIcon, ScanSearch, Users, type LucideIcon } from "lucide-react";
import { useRef, type KeyboardEvent } from "react";
import { useBob } from "@/components/app/BobContext";
import { displayName } from "@/lib/client/crew";
import { PANEL_TAB_LABEL, PANEL_TABS, type PanelTab } from "@/lib/client/panel-tabs";
import { PanelContent } from "./PanelContent";

const TAB_ICON: Record<PanelTab, LucideIcon> = {
  roadmap: MapIcon,
  crew: Users,
  drive: HardDrive,
  activity: Activity,
  changes: FileDiff,
  files: FolderTree,
  review: ScanSearch,
};

export function SidePanel() {
  const { panelKind, panelTab, setPanelTab, selectedAgent } = useBob();
  const tabs = PANEL_TABS[panelKind];
  const active = tabs.includes(panelTab) ? panelTab : tabs[0];
  const tabRefs = useRef<Partial<Record<PanelTab, HTMLButtonElement | null>>>({});

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const index = tabs.findIndex((tab) => tab === active);
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    const target = event.key === "Home" ? tabs[0] : event.key === "End" ? tabs.at(-1) : step !== 0 ? tabs[(index + step + tabs.length) % tabs.length] : undefined;
    if (!target) return;
    event.preventDefault();
    setPanelTab(target);
    tabRefs.current[target]?.focus();
  }

  const label = panelKind === "crew" && selectedAgent ? `${displayName(selectedAgent)} workspace` : "Project";

  return (
    <aside className="region" id="side-panel" aria-label={label}>
      <div className="panel-top">
        <div className="panel-tabs" role="tablist" aria-label="Panel" onKeyDown={onKeyDown}>
          {tabs.map((tab) => {
            const Icon = TAB_ICON[tab];
            return (
              <button
                key={tab}
                ref={(element) => {
                  tabRefs.current[tab] = element;
                }}
                type="button"
                role="tab"
                id={`tab-${tab}`}
                className="panel-tab"
                aria-selected={active === tab}
                aria-controls="panel-content"
                tabIndex={active === tab ? 0 : -1}
                onClick={() => setPanelTab(tab)}
              >
                <Icon className="icon" size={14} aria-hidden="true" />
                <span>{PANEL_TAB_LABEL[tab]}</span>
              </button>
            );
          })}
          {panelKind === "standing" ? (
            <button type="button" role="tab" className="panel-tab" aria-selected={false} aria-disabled="true" tabIndex={-1} disabled title="Preview comes next">
              <AppWindow className="icon" size={14} aria-hidden="true" />
              <span>Preview</span>
            </button>
          ) : null}
        </div>
      </div>
      <div className="panel-body" id="panel-content" role="tabpanel" aria-labelledby={`tab-${active}`}>
        {active ? <PanelContent tab={active} /> : null}
      </div>
    </aside>
  );
}
