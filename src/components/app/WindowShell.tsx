"use client";

import { Conversation } from "@/components/conversation/Conversation";
import { SidePanel } from "@/components/panel/SidePanel";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { NewAgentDialog } from "@/components/sidebar/NewAgentDialog";
import { WhyDrawer } from "@/components/why/WhyDrawer";
import { useBob } from "./BobContext";

export function WindowShell() {
  const { panelOpen } = useBob();
  return (
    <div className="window" data-panel={panelOpen ? "open" : "closed"}>
      <Sidebar />
      <Conversation />
      {panelOpen ? <SidePanel /> : null}
      <NewAgentDialog />
      <WhyDrawer />
    </div>
  );
}
