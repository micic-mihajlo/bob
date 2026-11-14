"use client";

import { Clock3, LoaderCircle, ScrollText, TriangleAlert } from "lucide-react";
import { AgentAvatar } from "@/components/features/agents/AgentAvatar";
import { agentMood } from "@/components/features/agents/agent-mood";
import { useBob } from "@/components/features/window/BobContext";
import { ModelPicker, modelName } from "@/components/features/conversation/ModelPicker";
import { SidePanelToggle } from "@/components/features/panel/SidePanel";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { BadgeVariant } from "@/components/ui/classes";
import { stillAwaiting } from "@/lib/client/awaiting";
import { THREAD_STATUS_LABEL, threadStatusOf } from "@/lib/client/crew";
import { useNow } from "@/lib/client/use-now";
import type { Agent, ThreadStatus } from "@/lib/types";

const STATUS_BADGE: Partial<Record<ThreadStatus, BadgeVariant>> = {
  working: "info-light",
  waiting: "secondary",
  needs_you: "warning-light",
  failed: "destructive-light",
  closed: "secondary",
};

function StatusIcon({ status }: { status: ThreadStatus }) {
  if (status === "working") return <LoaderCircle className="conversation-interaction-spinner" aria-hidden="true" />;
  if (status === "needs_you" || status === "failed") return <TriangleAlert aria-hidden="true" />;
  return <Clock3 aria-hidden="true" />;
}

/** The top of the chat: the agent and what it is for, its state, the model, and the side panel button. */
export function ConversationHeader({ agent }: { agent: Agent }) {
  const { snapshot, panelOpen, togglePanel, awaiting } = useBob();
  const sent = awaiting[agent.id];
  const now = useNow(sent !== undefined);
  const thinking = sent !== undefined && stillAwaiting(sent, snapshot.threads[agent.id]?.items ?? [], now || sent.at);
  const status = threadStatusOf(snapshot, agent);
  const variant = STATUS_BADGE[status];
  const subtitle = agent.kind === "captain" ? null : agent.title;
  return (
    <header className="window-drag conversation-header">
      <div className="conversation-heading-group">
        <Button
          variant="ghost"
          size="sm"
          className="conversation-title no-drag"
          data-opens-panel=""
          aria-label={`${agent.name}: ${panelOpen ? "close" : "open"} the side panel`}
          onClick={togglePanel}
        >
          <AgentAvatar agent={agent} mood={thinking ? "working" : agentMood(snapshot, agent.id)} />
          <h1>{agent.name}</h1>
        </Button>
        {subtitle ? (
          <span className="conversation-header-subtitle" title={subtitle}>
            {subtitle}
          </span>
        ) : null}
      </div>
      <div className="conversation-header-actions no-drag">
        {variant ? (
          <Badge variant={variant} className="conversation-model-pending" role="status">
            <StatusIcon status={status} />
            {THREAD_STATUS_LABEL[status]}
          </Badge>
        ) : null}
        {snapshot.brain === "script" ? (
          <span
            className="conversation-scripted"
            role="note"
            aria-label="Scripted: the agents follow a script and no model is called"
            title="The agents follow a script and no model is called. Start Bob without --scripted for the live model."
          >
            <ScrollText aria-hidden="true" />
            Scripted
          </span>
        ) : agent.kind === "crew" && status !== "closed" ? (
          <ModelPicker agent={agent} />
        ) : (
          <div className="provider-model-picker">
            <span className="provider-model-trigger" aria-label={`Agent model: ${modelName(agent.model)}`} title={agent.model}>
              <span className="provider-model-trigger-value">
                <span className="ui-swap provider-model-trigger-name">
                  <span>{modelName(agent.model)}</span>
                </span>
              </span>
            </span>
          </div>
        )}
        <SidePanelToggle />
      </div>
    </header>
  );
}
