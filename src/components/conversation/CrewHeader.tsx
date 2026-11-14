"use client";

import { Archive, GitBranch } from "lucide-react";
import { useState } from "react";
import { useBob } from "@/components/app/BobContext";
import { CodeChip } from "@/components/common/CodeChip";
import { CopyButton } from "@/components/common/CopyButton";
import { ROLE_LABEL, RoleIcon } from "@/components/common/RoleIcon";
import { THREAD_STATUS_LABEL, displayName, threadStatusOf } from "@/lib/client/crew";
import type { AgentActions } from "@/lib/client/use-agent-actions";
import type { Agent, AgentActivity } from "@/lib/types";
import { CloseThreadDialog } from "./CloseThreadDialog";
import { PanelToggle } from "./PanelToggle";
import { StopButton } from "./StopButton";

interface CrewHeaderProps {
  agent: Agent;
  activity: AgentActivity | undefined;
  queued: number;
  actions: AgentActions;
}

export function CrewHeader({ agent, activity, queued, actions }: CrewHeaderProps) {
  const { snapshot } = useBob();
  const [closing, setClosing] = useState(false);
  const status = threadStatusOf(snapshot, agent);
  const closed = status === "closed";
  const name = displayName(agent);

  return (
    <header className="conversation-top">
      <div className="conversation-title crew-title">
        <CodeChip code={name} />
        <h1 className="conversation-name crew-name">{agent.title || agent.name}</h1>
        {agent.crewRole ? (
          <span className="crew-role" title={`${ROLE_LABEL[agent.crewRole]} thread`}>
            <RoleIcon role={agent.crewRole} size={12} />
            <span className="crew-role-label">{ROLE_LABEL[agent.crewRole]}</span>
          </span>
        ) : null}
        {agent.branch ? (
          <span className="crew-branch">
            <GitBranch className="icon" size={12} aria-hidden="true" />
            <span className="crew-branch-name" title={agent.branch}>
              {agent.branch}
            </span>
            <CopyButton text={agent.branch} label="Copy branch name" />
          </span>
        ) : null}
      </div>
      <div className="conversation-actions">
        <span className="crew-status" data-status={status}>
          {THREAD_STATUS_LABEL[status]}
        </span>
        {queued > 0 && !closed ? <span className="conversation-queued">{queued} queued</span> : null}
        {activity?.state === "working" && !closed ? <StopButton actions={actions} /> : null}
        {closed ? null : (
          <button type="button" className="btn btn-quiet btn-small" aria-label={`Close ${name}`} title={`Close ${name}`} onClick={() => setClosing(true)}>
            <Archive className="icon" size={12} aria-hidden="true" />
            <span className="crew-close-label">Close</span>
          </button>
        )}
        <span className="conversation-divider" aria-hidden="true" />
        <PanelToggle />
      </div>
      <CloseThreadDialog agent={agent} open={closing} onClose={() => setClosing(false)} />
    </header>
  );
}
