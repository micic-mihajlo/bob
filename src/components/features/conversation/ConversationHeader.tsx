"use client";

import { Clock3, LoaderCircle, TriangleAlert } from "lucide-react";
import { AgentAvatar } from "@/components/features/agents/AgentAvatar";
import { agentMood } from "@/components/features/agents/agent-mood";
import { useBob } from "@/components/features/window/BobContext";
import { ModelPicker, modelName } from "@/components/features/conversation/ModelPicker";
import { SidePanelToggle } from "@/components/features/panel/SidePanel";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { BadgeVariant } from "@/components/ui/classes";
import { THREAD_STATUS_LABEL, threadStatusOf } from "@/lib/client/crew";
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
  const { snapshot, panelOpen, togglePanel } = useBob();
  const status = threadStatusOf(snapshot, agent);
  const variant = STATUS_BADGE[status];
  const subtitle = agent.kind === "captain" ? null : agent.title;
  const model = snapshot.brain === "script" ? "Scripted" : modelName(agent.model);
  return (
    <header className="window-drag conversation-header">
      <div className="conversation-heading-group">
        <Button
          variant="ghost"
          size="sm"
          className="conversation-title no-drag"
          data-opens-panel=""
          aria-label={panelOpen ? "Close side panel" : "Open side panel"}
          onClick={togglePanel}
        >
          <AgentAvatar agent={agent} mood={agentMood(snapshot, agent.id)} />
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
        {agent.kind === "crew" && snapshot.brain !== "script" ? (
          <ModelPicker agent={agent} />
        ) : (
          <div className="provider-model-picker">
            <span className="provider-model-trigger" aria-label={`Agent model: ${model}`} title={agent.model}>
              <span className="provider-model-trigger-value">
                <span className="ui-swap provider-model-trigger-name">
                  <span>{model}</span>
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
