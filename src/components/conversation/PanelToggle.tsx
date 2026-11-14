"use client";

import { PanelRight } from "lucide-react";
import { useBob } from "@/components/app/BobContext";

export function PanelToggle() {
  const { panelOpen, togglePanel } = useBob();
  return (
    <button
      type="button"
      className="icon-button panel-toggle"
      aria-expanded={panelOpen}
      aria-controls="side-panel"
      aria-label={panelOpen ? "Hide panel" : "Show panel"}
      title={panelOpen ? "Hide panel" : "Show panel"}
      onClick={togglePanel}
    >
      <PanelRight className="icon" size={14} aria-hidden="true" />
    </button>
  );
}
