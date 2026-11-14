"use client";

import { Map as MapIcon } from "lucide-react";
import { useBob } from "@/components/app/BobContext";
import { GoalCard } from "./GoalCard";
import { StageCard } from "./StageCard";
import { WorkOrderList } from "./WorkOrderList";

export function RoadmapTab() {
  const { snapshot } = useBob();
  const { roadmap } = snapshot;
  const hasPlan = roadmap.goal !== null || roadmap.today.length > 0 || roadmap.totalStages > 0;

  if (!hasPlan) {
    return (
      <div className="panel-scroll panel-empty">
        <MapIcon className="icon" size={20} aria-hidden="true" />
        <p className="panel-empty-title">No roadmap yet</p>
        <p className="empty-line">Tell Bob what you want to build. Bob sets the goal, the stages and today&apos;s work.</p>
      </div>
    );
  }

  return (
    <div className="panel-scroll">
      <GoalCard roadmap={roadmap} />
      {roadmap.totalStages > 0 ? <StageCard roadmap={roadmap} /> : null}
      <section className="card" aria-labelledby="today-heading">
        <h2 id="today-heading" className="card-label">
          Today
        </h2>
        <WorkOrderList orders={roadmap.today} empty="Nothing scheduled for today." />
      </section>
      {roadmap.backlog && roadmap.backlog.length > 0 ? (
        <section className="card" aria-labelledby="backlog-heading">
          <h2 id="backlog-heading" className="card-label">
            Later
          </h2>
          <WorkOrderList orders={roadmap.backlog} empty="" />
        </section>
      ) : null}
    </div>
  );
}
