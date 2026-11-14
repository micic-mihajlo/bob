"use client";

import "@/components/theme/index.css";
import { useBob } from "@/components/app/BobContext";
import { SidePanel, SidePanelToggle, useSidePanelFrame } from "@/components/features/panel/SidePanel";
import { SnapshotGate } from "@/components/features/window/SnapshotGate";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/classes";
import { displayName } from "@/lib/client/crew";

/** A stand-in conversation: an agent switcher where the chat goes, and the docked side panel. */
function PanelLab() {
  const { snapshot, selectedAgent, selectAgent } = useBob();
  const frame = useSidePanelFrame();
  return (
    <main className={cx("conversation-panel", frame.className)} style={{ ...frame.style, height: "100vh" }} aria-label="Side panel lab">
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: 12, alignItems: "center" }}>
        {snapshot.agents.map((agent) => (
          <Button key={agent.id} size="sm" variant={selectedAgent?.id === agent.id ? "secondary" : "ghost"} onClick={() => selectAgent(agent.id)}>
            {displayName(agent)}
          </Button>
        ))}
        <SidePanelToggle />
      </div>
      <SidePanel />
    </main>
  );
}

export default function SidePanelLabPage() {
  return (
    <SnapshotGate>
      <PanelLab />
    </SnapshotGate>
  );
}
