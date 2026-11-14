"use client";

import { Users } from "lucide-react";
import { useBob } from "@/components/app/BobContext";
import { PanelEmpty } from "@/components/common/PanelEmpty";
import { crewInOrder } from "@/lib/client/crew";
import { CrewRow } from "./CrewRow";

export function CrewTab() {
  const { snapshot, captain } = useBob();
  const crew = crewInOrder(snapshot);
  const captainName = captain?.name ?? "The captain";

  if (crew.length === 0) {
    return (
      <PanelEmpty icon={Users} title="No crew yet">
        {captainName} starts a thread for each piece of work: one to build it, one to review it, one to look things up.
      </PanelEmpty>
    );
  }

  return (
    <div className="panel-scroll">
      <ul className="crew-list" aria-label="Crew threads">
        {crew.map((agent) => (
          <CrewRow key={agent.id} agent={agent} />
        ))}
      </ul>
    </div>
  );
}
