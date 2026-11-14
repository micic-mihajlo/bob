"use client";

import { ChevronRight, CircleAlert, CircleCheck, Clock, LoaderCircle, Minus, Users, X } from "lucide-react";
import { useState } from "react";
import { useBob } from "@/components/features/window/BobContext";
import { AgentAvatar } from "@/components/features/agents/AgentAvatar";
import { agentMood } from "@/components/features/agents/agent-mood";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/classes";
import { crewInOrder, displayName, THREAD_STATUS_LABEL, threadStatusOf } from "@/lib/client/crew";
import { PULL_REQUEST_STATE_LABEL, pullRequestState, pullRequestsBy, reviewsForThread, VERDICT_LABEL } from "@/lib/client/pull-requests";
import type { Agent, CrewRole, ThreadStatus } from "@/lib/types";
import { PaneFrame, PaneHeader } from "./PaneFrame";

const ROLE_LABEL: Record<CrewRole, string> = { build: "Build", review: "Review", research: "Research" };

function StatusGlyph({ status }: { status: ThreadStatus }) {
  switch (status) {
    case "working":
      return <LoaderCircle className="subagents-live-glyph bob-crew-spin" aria-hidden="true" />;
    case "waiting":
      return <Clock className="subagents-live-glyph" aria-hidden="true" />;
    case "needs_you":
      return <CircleAlert className="subagents-live-glyph" aria-hidden="true" />;
    case "failed":
      return <X className="subagents-live-glyph" aria-hidden="true" />;
    case "closed":
      return <Minus className="subagents-live-glyph" aria-hidden="true" />;
    case "idle":
      return <CircleCheck className="subagents-live-glyph" aria-hidden="true" />;
  }
}

function CrewRow({ agent }: { agent: Agent }) {
  const { snapshot, selectedAgent, selectAgent } = useBob();
  const status = threadStatusOf(snapshot, agent);
  const activity = snapshot.activity[agent.id];
  const pullRequest = pullRequestsBy(snapshot.artifacts, agent.id)[0];
  const review = reviewsForThread(snapshot.artifacts, agent.id)[0];
  const selected = selectedAgent?.id === agent.id;
  const step = activity?.state === "working" ? activity.step : null;
  const live =
    step ??
    [
      agent.crewRole ? ROLE_LABEL[agent.crewRole] : null,
      pullRequest ? `#${pullRequest.pullRequest.number}` : null,
      pullRequest ? PULL_REQUEST_STATE_LABEL[pullRequestState(pullRequest, snapshot.approvals)] : review ? VERDICT_LABEL[review.review.verdict] : null,
      agent.branch,
    ]
      .filter(Boolean)
      .join(" · ");
  return (
    <li>
      <Button
        variant="ghost"
        className={cx("subagents-row", selected && "subagents-row-selected")}
        aria-current={selected ? "true" : undefined}
        aria-label={`${displayName(agent)}, ${agent.title || agent.name}, ${THREAD_STATUS_LABEL[status].toLowerCase()}. Open the thread.`}
        onClick={() => selectAgent(agent.id)}
      >
        <span className="subagents-status" data-state={status === "working" ? "running" : status === "failed" ? "failed" : "stopped"}>
          <AgentAvatar agent={agent} mood={agentMood(snapshot, agent.id)} className="bob-crew-avatar" />
        </span>
        <span className="subagents-row-copy">
          <span className="subagents-row-title">
            <span className="bob-crew-code">{displayName(agent)}</span> {agent.title || agent.name}
          </span>
          <span className="subagents-live" data-state={status === "failed" ? "failed" : status === "working" ? "running" : "completed"}>
            <StatusGlyph status={status} />
            <span className={cx("subagents-live-text", status === "working" && step !== null && "agent-activity-label")}>{live || THREAD_STATUS_LABEL[status]}</span>
          </span>
        </span>
        <span className="subagents-elapsed">{THREAD_STATUS_LABEL[status]}</span>
        <ChevronRight className="subagents-row-chevron" aria-hidden="true" />
      </Button>
    </li>
  );
}

/** Every crew thread as the reference's subagent rows; a row opens its thread. */
export function CrewPane({ onClose }: { onClose: () => void }) {
  const { snapshot, captain } = useBob();
  const crew = crewInOrder(snapshot);
  const [open, setOpen] = useState(true);
  const working = crew.filter((agent) => threadStatusOf(snapshot, agent) === "working").length;
  const needsYou = crew.filter((agent) => threadStatusOf(snapshot, agent) === "needs_you").length;
  const captainName = captain?.name ?? "The captain";

  return (
    <PaneFrame className="subagents-panel bob-crew-panel" label="Crew">
      <PaneHeader title="Crew" onClose={onClose} />
      <section className="subagents-panel-detail" aria-label="Crew threads">
        {crew.length === 0 ? (
          <div className="bob-pane-empty">
            <Users aria-hidden="true" />
            <p>{captainName} starts a thread for each piece of work: one to build it, one to review it, one to look things up.</p>
          </div>
        ) : (
          <div className="subagents-group">
            <Button variant="ghost" className="subagents-group-header" aria-expanded={open ? "true" : "false"} onClick={() => setOpen((value) => !value)}>
              <span className="subagents-group-title">{crew.length === 1 ? "1 crew thread" : `${crew.length} crew threads`}</span>
              <Badge className="subagents-progress">
                {working} working
                {needsYou > 0 ? <span className="subagents-progress-failed">· {needsYou} need you</span> : null}
              </Badge>
              <ChevronRight className="subagents-group-chevron" aria-hidden="true" />
            </Button>
            {open ? (
              <ul className="subagents-list">
                {crew.map((agent) => (
                  <CrewRow key={agent.id} agent={agent} />
                ))}
              </ul>
            ) : null}
          </div>
        )}
      </section>
    </PaneFrame>
  );
}
