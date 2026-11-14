"use client";

import "./roadmap-panel.css";
import { Check, Map as MapIcon, TriangleAlert } from "lucide-react";
import { useBob } from "@/components/features/window/BobContext";
import { PaneFrame, PaneHeader } from "@/components/features/panel/PaneFrame";
import { Badge } from "@/components/ui/Badge";
import { Checkbox } from "@/components/ui/Checkbox";
import { Progress } from "@/components/ui/Progress";
import { Card } from "@/components/ui/Surface";
import { displayName } from "@/lib/client/crew";
import { formatDeadline } from "@/lib/client/format";
import { requestUsageLine } from "@/lib/client/requests";
import { hasPlan, roadmapSteps, WORK_ORDER_STATUS_LABEL, workOrderProgress, type StepPhase } from "@/lib/client/roadmap-view";
import type { WorkOrder } from "@/lib/types";

const PHASE_LABEL: Record<StepPhase, string> = { done: "Done", current: "Now", next: "Up next" };

/**
 * The roadmap beside the captain's chat: the goal and how far along it is, today's work orders, and
 * the delivery stages as a line with the planned work of the current one. It reads the live snapshot.
 */
export function RoadmapPanel({ onClose }: { onClose: () => void }) {
  const { snapshot, agentsById, selectAgent } = useBob();
  const { roadmap, releaseNotes = [], requests = [], budgets } = snapshot;
  const goal = roadmap.goal;
  const progress = workOrderProgress(roadmap);
  const steps = roadmapSteps(roadmap);
  const planned = [...roadmap.today, ...(roadmap.backlog ?? [])];

  const meta = (order: WorkOrder) => {
    const owner = order.ownerAgentId ? agentsById.get(order.ownerAgentId) : undefined;
    return owner ? `${displayName(owner)} · ${WORK_ORDER_STATUS_LABEL[order.status]}` : WORK_ORDER_STATUS_LABEL[order.status];
  };
  const openOwner = (order: WorkOrder) => {
    if (order.ownerAgentId && agentsById.has(order.ownerAgentId)) selectAgent(order.ownerAgentId);
  };

  return (
    <PaneFrame className="bob-roadmap-panel" label="Roadmap">
      <PaneHeader title="Roadmap" onClose={onClose} />
      <div className="bob-roadmap-body">
        {!hasPlan(roadmap) ? (
          <div className="bob-roadmap-empty">
            <MapIcon aria-hidden="true" />
            <p>Tell Bob what you want to build and Bob lays out the goal, the stages and today&apos;s work here.</p>
          </div>
        ) : (
          <>
            <Card className="bob-roadmap-card">
              <p className="bob-roadmap-label">Goal</p>
              <h3 className="bob-roadmap-goal">{goal?.title ?? "No goal set yet"}</h3>
              {goal?.why ? <p className="bob-roadmap-muted">{goal.why}</p> : null}
              {goal?.user ? <p className="bob-roadmap-muted">For {goal.user}</p> : null}
              {goal?.behaviour ? <p className="bob-roadmap-muted">{goal.behaviour}</p> : null}
              {goal?.acceptance ? <p className="bob-roadmap-muted">{goal.acceptance}</p> : null}
              {goal?.deadline ? <p className="bob-roadmap-muted">By {formatDeadline(goal.deadline)}</p> : null}
              <Progress
                className="bob-roadmap-progress"
                value={progress.done}
                minValue={0}
                maxValue={Math.max(progress.total, 1)}
                aria-label="Work orders done toward the goal"
              />
              <p className="bob-roadmap-earned">
                {progress.done} of {progress.total} work orders done
              </p>
            </Card>

            <Card className="bob-roadmap-card">
              <h3 className="bob-roadmap-label">Today</h3>
              <ul className="bob-roadmap-list">
                {roadmap.today.length === 0 ? <li className="bob-roadmap-muted">No work orders for today yet.</li> : null}
                {roadmap.today.slice(0, 3).map((order) => {
                  const done = order.status === "done";
                  const owner = order.ownerAgentId ? agentsById.get(order.ownerAgentId) : undefined;
                  return (
                    <li key={order.id} className="bob-roadmap-task" data-done={done ? "true" : undefined}>
                      <Checkbox id={`bob-roadmap-task-${order.id}`} checked={done} disabled readOnly aria-label={WORK_ORDER_STATUS_LABEL[order.status]} />
                      <button
                        type="button"
                        className="bob-roadmap-task-title"
                        disabled={owner === undefined}
                        title={owner ? `Open ${displayName(owner)}` : undefined}
                        onClick={() => openOwner(order)}
                      >
                        {order.title}
                      </button>
                      <span className="bob-roadmap-task-meta">{meta(order)}</span>
                    </li>
                  );
                })}
              </ul>
            </Card>

            {steps.length > 0 ? (
              <Card className="bob-roadmap-card">
                <h3 className="bob-roadmap-label">Roadmap</h3>
                <ol className="bob-roadmap-timeline">
                  {steps.map(({ gate, phase }) => (
                    <li
                      key={`${gate.stage}-${gate.title}`}
                      className="bob-roadmap-step"
                      data-phase={phase}
                      aria-current={phase === "current" ? "step" : undefined}
                    >
                      <span className="bob-roadmap-node" role="img" aria-label={PHASE_LABEL[phase]}>
                        {phase === "done" ? <Check aria-hidden="true" /> : null}
                      </span>
                      <div className="bob-roadmap-step-body">
                        {phase === "current" ? (
                          <p className="bob-roadmap-stage">
                            Stage {roadmap.stage} of {roadmap.totalStages}: {roadmap.stageTitle}
                          </p>
                        ) : null}
                        <p className="bob-roadmap-step-title">{gate.title}</p>
                        {phase === "current" && planned.length > 0 ? (
                          <ul className="bob-roadmap-plan">
                            {planned.map((order) => (
                              <li key={order.id} data-done={order.status === "done" ? "true" : undefined}>
                                <span className="bob-roadmap-plan-title">{order.title}</span>
                                <span className="bob-roadmap-task-meta">{meta(order)}</span>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ol>
              </Card>
            ) : null}

            {releaseNotes.length > 0 ? (
              <Card className="bob-roadmap-card">
                <h3 className="bob-roadmap-label">Shipped</h3>
                <ul className="bob-roadmap-list">
                  {releaseNotes.map((note) => (
                    <li key={note.pullRequestId} className="bob-roadmap-note">
                      <span className="bob-roadmap-task-meta">PR #{note.number}</span>
                      <p>{note.text}</p>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}
          </>
        )}

        {requests.length > 0 ? (
          <Card className="bob-roadmap-card">
            <h3 className="bob-roadmap-label">Requests</h3>
            <ul className="bob-roadmap-list">
              {requests.map((request) => (
                <li key={request.requestId} className="bob-roadmap-request" data-running={request.running ? "true" : undefined}>
                  <p className="bob-roadmap-request-ask">{request.ask}</p>
                  <p className="bob-roadmap-task-meta">
                    {request.running ? <Badge variant="secondary">Running</Badge> : null}
                    {requestUsageLine(request, budgets)}
                  </p>
                  {request.alerts.map((alert) => (
                    <p key={alert} className="bob-roadmap-request-alert">
                      <TriangleAlert aria-hidden="true" />
                      {alert}
                    </p>
                  ))}
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>
    </PaneFrame>
  );
}
