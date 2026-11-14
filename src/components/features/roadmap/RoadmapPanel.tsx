"use client";

import "./roadmap-panel.css";
import { Check, Map as MapIcon, TriangleAlert } from "lucide-react";
import { Fragment } from "react";
import { useBob } from "@/components/features/window/BobContext";
import { PaneFrame, PaneHeader } from "@/components/features/panel/PaneFrame";
import { Badge } from "@/components/ui/Badge";
import { Checkbox } from "@/components/ui/Checkbox";
import { Progress } from "@/components/ui/Progress";
import { Card } from "@/components/ui/Surface";
import { displayName } from "@/lib/client/crew";
import { formatDeadline } from "@/lib/client/format";
import { requestLabel, requestUsage } from "@/lib/client/requests";
import {
  forUserLine,
  hasPlan,
  roadmapSteps,
  trackElapsedLabel,
  trackViews,
  WORK_ORDER_STATUS_LABEL,
  trackProgress,
  type RoadmapStep,
  type StepPhase,
  type TrackView,
} from "@/lib/client/roadmap-view";
import type { WorkOrder } from "@/lib/types";

const PHASE_LABEL: Record<StepPhase, string> = {
  done: "Done",
  current: "Now",
  next: "Up next",
};

/**
 * The roadmap beside the captain's chat. Each request still moving gets a card: its goal and how far
 * along it is, its work orders for today, and its stages as a line with its planned work under the
 * current one. Work no shown request owns sits in the backlog below. It reads the live snapshot.
 */
export function RoadmapPanel({ onClose }: { onClose: () => void }) {
  const { snapshot, agentsById, selectAgent, captain, openThreadTab } = useBob();
  const { roadmap, releaseNotes = [], requests = [], budgets, inbox = [] } = snapshot;
  const { tracks, backlog } = trackViews(roadmap);
  const started = tracks.some((track) => track.goal !== null) || roadmap.today.length > 0 || (roadmap.backlog?.length ?? 0) > 0;

  const meta = (order: WorkOrder) => {
    const owner = order.ownerAgentId ? agentsById.get(order.ownerAgentId) : undefined;
    return owner ? `${displayName(owner)} · ${WORK_ORDER_STATUS_LABEL[order.status]}` : WORK_ORDER_STATUS_LABEL[order.status];
  };
  const openOwner = (order: WorkOrder) => {
    if (order.ownerAgentId && agentsById.has(order.ownerAgentId)) selectAgent(order.ownerAgentId);
  };
  const planItem = (order: WorkOrder) => (
    <li key={order.id} data-done={order.status === "done" ? "true" : undefined}>
      <span className="bob-roadmap-plan-title">{order.title}</span>
      <span className="bob-roadmap-task-meta">{meta(order)}</span>
      {order.source && captain ? (
        <button type="button" className="bob-roadmap-source" title={`“${order.source.quote}”`} onClick={() => openThreadTab(captain.id, "inbox")}>
          From {order.source.label}
        </button>
      ) : null}
    </li>
  );

  const timeline = (track: TrackView, steps: RoadmapStep[]) => (
    <ol className="bob-roadmap-timeline">
      {steps.map(({ gate, phase }) => (
        <li key={`${gate.stage}-${gate.title}`} className="bob-roadmap-step" data-phase={phase} aria-current={phase === "current" ? "step" : undefined}>
          <span className="bob-roadmap-node" role="img" aria-label={PHASE_LABEL[phase]}>
            {phase === "done" ? <Check aria-hidden="true" /> : null}
          </span>
          <div className="bob-roadmap-step-body">
            {phase === "current" ? (
              <p className="bob-roadmap-stage">
                Stage {track.stage} of {roadmap.totalStages}: {track.stageTitle}
              </p>
            ) : null}
            <p className="bob-roadmap-step-title">{gate.title}</p>
            {phase === "current" && track.backlog.length > 0 ? <ul className="bob-roadmap-plan">{track.backlog.map(planItem)}</ul> : null}
          </div>
        </li>
      ))}
    </ol>
  );

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
            {!started ? (
              <>
                <Card className="bob-roadmap-card">
                  <p className="bob-roadmap-label">Goal</p>
                  <h3 className="bob-roadmap-goal">Nothing planned yet</h3>
                  <p className="bob-roadmap-muted">
                    Tell Bob what you want built. Bob asks until the request can be tested, then sets the goal, cuts it into work orders and starts a thread for
                    each.
                  </p>
                </Card>
                {tracks[0] && roadmapSteps(tracks[0]).length > 0 ? (
                  <Card className="bob-roadmap-card">
                    <h3 className="bob-roadmap-label">Roadmap</h3>
                    {timeline(tracks[0], roadmapSteps(tracks[0]))}
                  </Card>
                ) : null}
              </>
            ) : null}

            {started
              ? tracks.map((track) => {
                  const { goal } = track;
                  const progress = trackProgress(track, roadmap.totalStages);
                  const asked = track.ask ? requestLabel(track.ask, inbox) : null;
                  const steps = roadmapSteps(track);
                  const elapsed = trackElapsedLabel(track, roadmap.totalStages);
                  return (
                    <Fragment key={track.key}>
                      <Card className="bob-roadmap-card" aria-label={goal?.title ?? "Goal"}>
                        <div className="bob-roadmap-card-head">
                          <p className="bob-roadmap-label">Goal</p>
                          {elapsed ? <span className="bob-roadmap-elapsed">{elapsed}</span> : null}
                        </div>
                        <h3 className="bob-roadmap-goal">{goal?.title ?? "No goal set yet"}</h3>
                        {asked ? (
                          <p className="bob-roadmap-ask" title={asked}>
                            {asked === track.ask ? `“${asked}”` : asked}
                          </p>
                        ) : null}
                        {goal?.why ? <p className="bob-roadmap-muted">{goal.why}</p> : null}
                        {goal?.user ? <p className="bob-roadmap-muted">{forUserLine(goal.user)}</p> : null}
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
                          {progress.followUps > 0 ? ` · ${progress.followUps} follow-up${progress.followUps === 1 ? "" : "s"}` : null}
                        </p>
                      </Card>

                      <Card className="bob-roadmap-card">
                        <h3 className="bob-roadmap-label">Today</h3>
                        <ul className="bob-roadmap-list">
                          {track.today.length === 0 ? <li className="bob-roadmap-muted">No work orders for today yet.</li> : null}
                          {track.today.slice(0, 3).map((order) => {
                            const done = order.status === "done";
                            const owner = order.ownerAgentId ? agentsById.get(order.ownerAgentId) : undefined;
                            return (
                              <li key={order.id} className="bob-roadmap-task" data-done={done ? "true" : undefined}>
                                <Checkbox
                                  id={`bob-roadmap-task-${order.id}`}
                                  checked={done}
                                  disabled
                                  readOnly
                                  aria-label={WORK_ORDER_STATUS_LABEL[order.status]}
                                />
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
                          {timeline(track, steps)}
                        </Card>
                      ) : null}
                    </Fragment>
                  );
                })
              : null}

            {backlog.length > 0 ? (
              <Card className="bob-roadmap-card">
                <h3 className="bob-roadmap-label">Backlog</h3>
                <ul className="bob-roadmap-plan">{backlog.map(planItem)}</ul>
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
              {requests.map((request) => {
                const usage = requestUsage(request, budgets, snapshot.brain === "model");
                return (
                  <li key={request.requestId} className="bob-roadmap-request" data-running={request.running ? "true" : undefined}>
                    <div className="bob-roadmap-request-head">
                      <p className="bob-roadmap-request-ask">{requestLabel(request.ask, inbox)}</p>
                      {request.running ? <Badge variant="secondary">Running</Badge> : null}
                    </div>
                    {usage ? (
                      <p className="bob-roadmap-task-meta">
                        {usage.split(" · ").map((part, index) => (
                          <span key={part} className="bob-roadmap-usage-part">
                            {index > 0 ? " · " : null}
                            {part}
                          </span>
                        ))}
                      </p>
                    ) : null}
                    {request.alerts.map((alert) => (
                      <p key={alert} className="bob-roadmap-request-alert">
                        <TriangleAlert aria-hidden="true" />
                        {alert}
                      </p>
                    ))}
                  </li>
                );
              })}
            </ul>
          </Card>
        ) : null}
      </div>
    </PaneFrame>
  );
}
