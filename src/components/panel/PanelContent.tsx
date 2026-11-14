"use client";

import { useBob } from "@/components/app/BobContext";
import type { PanelTab } from "@/lib/client/panel-tabs";
import { ActivityTab } from "./ActivityTab";
import { ChangesTab } from "./ChangesTab";
import { CrewTab } from "./CrewTab";
import { DriveTab } from "./DriveTab";
import { FilesTab } from "./FilesTab";
import { ReviewTab } from "./ReviewTab";
import { RoadmapTab } from "./RoadmapTab";

export function PanelContent({ tab }: { tab: PanelTab }) {
  const { selectedAgent } = useBob();
  switch (tab) {
    case "roadmap":
      return <RoadmapTab />;
    case "crew":
      return <CrewTab />;
    case "drive":
      return <DriveTab />;
    case "activity":
      return <ActivityTab />;
    case "changes":
      return selectedAgent ? <ChangesTab key={selectedAgent.id} agent={selectedAgent} /> : null;
    case "files":
      return selectedAgent ? <FilesTab key={selectedAgent.id} agent={selectedAgent} /> : null;
    case "review":
      return selectedAgent ? <ReviewTab agent={selectedAgent} /> : null;
  }
}
