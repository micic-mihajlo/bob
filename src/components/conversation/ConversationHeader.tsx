"use client";

import { Avatar } from "@/components/common/Avatar";
import { isCrew } from "@/lib/client/crew";
import type { AgentActions } from "@/lib/client/use-agent-actions";
import type { Agent, AgentActivity } from "@/lib/types";
import { CrewHeader } from "./CrewHeader";
import { PanelToggle } from "./PanelToggle";
import { StopButton } from "./StopButton";

interface ConversationHeaderProps {
  agent: Agent;
  activity: AgentActivity | undefined;
  queued: number;
  actions: AgentActions;
}

export function ConversationHeader({ agent, activity, queued, actions }: ConversationHeaderProps) {
  if (isCrew(agent)) return <CrewHeader agent={agent} activity={activity} queued={queued} actions={actions} />;
  return (
    <header className="conversation-top">
      <div className="conversation-title">
        <Avatar agent={agent} size={18} />
        <h1 className="conversation-name">{agent.name}</h1>
        <span className="conversation-subtitle">{agent.title}</span>
      </div>
      <div className="conversation-actions">
        {queued > 0 ? <span className="conversation-queued">{queued} queued</span> : null}
        {activity?.state === "working" ? <StopButton actions={actions} /> : null}
        <span className="conversation-divider" aria-hidden="true" />
        <PanelToggle />
      </div>
    </header>
  );
}
