import { Check } from "lucide-react";
import { RollingNumber } from "@/components/common/RollingNumber";
import type { Roadmap } from "@/lib/types";

export function StageCard({ roadmap }: { roadmap: Roadmap }) {
  return (
    <section className="card" aria-labelledby="stage-heading">
      <h2 id="stage-heading" className="card-label">
        Stage{" "}
        <span className="stage-count">
          <RollingNumber value={roadmap.stage} text={String(roadmap.stage)} /> of {roadmap.totalStages}
        </span>
      </h2>
      <p className="stage-title">{roadmap.stageTitle}</p>
      {roadmap.gates.length === 0 ? (
        <p className="empty-line">No gates for this stage.</p>
      ) : (
        <ol className="gates">
          {roadmap.gates.map((gate) => {
            const position = gate.done ? "done" : gate.stage === roadmap.stage ? "current" : "next";
            return (
              <li key={`${gate.stage}-${gate.title}`} className="gate" data-position={position}>
                <span className="gate-node" aria-hidden="true">
                  {gate.done ? <Check className="icon" size={12} /> : null}
                </span>
                <span className="gate-text">
                  <span className="gate-stage">Stage {gate.stage}</span>
                  <span className="gate-title">{gate.title}</span>
                </span>
                <span className="sr-only">{gate.done ? "Done" : "Not done"}</span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
