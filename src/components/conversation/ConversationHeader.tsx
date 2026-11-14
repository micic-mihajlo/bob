"use client";

import { PanelRight, Square } from "lucide-react";
import { useBob } from "@/components/app/BobContext";
import { Avatar } from "@/components/common/Avatar";
import type { AgentActions } from "@/lib/client/use-agent-actions";
import type { Agent, AgentActivity } from "@/lib/types";

interface ConversationHeaderProps {
  agent: Agent;
  activity: AgentActivity | undefined;
  queued: number;
  actions: AgentActions;
}

export function ConversationHeader({ agent, activity, queued, actions }: ConversationHeaderProps) {
  const { panelOpen, togglePanel } = useBob();
  const working = activity?.state === "working";

  return (
    <header className="conversation-top">
      <div className="conversation-title">
        <Avatar agent={agent} size={18} />
        <h1 className="conversation-name">{agent.name}</h1>
        <span className="conversation-subtitle">{agent.title}</span>
      </div>
      <div className="conversation-actions">
        {queued > 0 ? <span className="conversation-queued">{queued} queued</span> : null}
        {working ? (
          <button type="button" className="btn btn-quiet btn-small" onClick={() => void actions.stop()} disabled={actions.stopping}>
            <Square className="icon" size={12} aria-hidden="true" />
            {actions.stopping ? "Stopping it" : "Stop"}
          </button>
        ) : null}
        <span className="conversation-divider" aria-hidden="true" />
        <button
          type="button"
          className="icon-button panel-toggle"
          aria-expanded={panelOpen}
          aria-controls="side-panel"
          aria-label={panelOpen ? "Hide panel" : "Show panel"}
          title={panelOpen ? "Hide panel" : "Show panel"}
          onClick={togglePanel}
        >
          <PanelRight className="icon" size={14} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
