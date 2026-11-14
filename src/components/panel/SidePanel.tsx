"use client";

import { Activity, AppWindow, Map as MapIcon, type LucideIcon } from "lucide-react";
import { useRef, type KeyboardEvent } from "react";
import { useBob, type PanelTab } from "@/components/app/BobContext";
import { ActivityTab } from "./ActivityTab";
import { RoadmapTab } from "./RoadmapTab";

const TABS: ReadonlyArray<{ id: PanelTab; label: string; icon: LucideIcon }> = [
  { id: "roadmap", label: "Roadmap", icon: MapIcon },
  { id: "activity", label: "Activity", icon: Activity },
];

export function SidePanel() {
  const { panelTab, setPanelTab } = useBob();
  const tabRefs = useRef<Partial<Record<PanelTab, HTMLButtonElement | null>>>({});

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const index = TABS.findIndex((tab) => tab.id === panelTab);
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    const target = event.key === "Home" ? TABS[0] : event.key === "End" ? TABS.at(-1) : step !== 0 ? TABS[(index + step + TABS.length) % TABS.length] : undefined;
    if (!target) return;
    event.preventDefault();
    setPanelTab(target.id);
    tabRefs.current[target.id]?.focus();
  }

  return (
    <aside className="region" id="side-panel" aria-label="Project">
      <div className="panel-top">
        <div className="panel-tabs" role="tablist" aria-label="Panel" onKeyDown={onKeyDown}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              ref={(element) => {
                tabRefs.current[tab.id] = element;
              }}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              className="panel-tab"
              aria-selected={panelTab === tab.id}
              aria-controls="panel-content"
              tabIndex={panelTab === tab.id ? 0 : -1}
              onClick={() => setPanelTab(tab.id)}
            >
              <tab.icon className="icon" size={14} aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          ))}
          <button type="button" role="tab" className="panel-tab" aria-selected={false} aria-disabled="true" tabIndex={-1} disabled title="Preview comes next">
            <AppWindow className="icon" size={14} aria-hidden="true" />
            <span>Preview</span>
          </button>
        </div>
      </div>
      <div className="panel-body" id="panel-content" role="tabpanel" aria-labelledby={`tab-${panelTab}`}>
        {panelTab === "roadmap" ? <RoadmapTab /> : <ActivityTab />}
      </div>
    </aside>
  );
}
