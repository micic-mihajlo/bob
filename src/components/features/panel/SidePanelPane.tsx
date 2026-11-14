"use client";

import { RoadmapPanel } from "@/components/features/roadmap/RoadmapPanel";
import { useBob } from "@/components/features/window/BobContext";
import type { SidePanelPaneId } from "@/lib/client/panel-tabs";
import { ActivityPane } from "./ActivityPane";
import { ChangesPane } from "./ChangesPane";
import { CrewPane } from "./CrewPane";
import { DrivePane } from "./DrivePane";
import { FilesPane } from "./FilesPane";
import { InboxPane } from "./InboxPane";
import { ReviewPane } from "./ReviewPane";
import { VerifiedPane } from "./VerifiedPane";

/** The pane a tab opens. A crew thread's panes start again for each thread. */
export function SidePanelPane({ pane, onClose }: { pane: SidePanelPaneId; onClose: () => void }) {
  const { selectedAgent } = useBob();
  switch (pane) {
    case "roadmap":
      return <RoadmapPanel onClose={onClose} />;
    case "inbox":
      return <InboxPane onClose={onClose} />;
    case "crew":
      return <CrewPane onClose={onClose} />;
    case "drive":
      return <DrivePane onClose={onClose} />;
    case "activity":
      return <ActivityPane onClose={onClose} />;
    case "verified":
      return <VerifiedPane onClose={onClose} />;
    case "changes":
      return selectedAgent ? <ChangesPane key={selectedAgent.id} agent={selectedAgent} onClose={onClose} /> : null;
    case "files":
      return selectedAgent ? <FilesPane key={selectedAgent.id} agent={selectedAgent} onClose={onClose} /> : null;
    case "review":
      return selectedAgent ? <ReviewPane agent={selectedAgent} onClose={onClose} /> : null;
  }
}
