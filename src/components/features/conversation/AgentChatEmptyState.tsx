"use client";

import { AgentAvatar } from "@/components/features/agents/AgentAvatar";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/classes";
import type { Agent } from "@/lib/types";

/** The reference's quick actions, as Bob's captain answers them. */
export const QUICK_ACTIONS = [
  {
    label: "Plan my day",
    message: "Plan my day: pick my tasks for today from my roadmap, small enough for the time I have, and tell me which one to do first.",
  },
  { label: "I did it", message: "I did it: I finished my current task. Mark it done and tell me what's next." },
] as const;

export const STUCK_LABEL = "I'm stuck";
export const STUCK_PREFILL = "I'm stuck on: ";

/**
 * Chips for a person who does not know what to type: each sends a whole message to the captain,
 * except "I'm stuck", which starts the sentence in the composer.
 */
export function QuickActions({
  className,
  disabled,
  onSend,
  onPrefill,
}: {
  className?: string;
  disabled?: boolean;
  onSend: (text: string) => void;
  onPrefill: (text: string) => void;
}) {
  return (
    <section className={cx("ui-block-chips bob-quick-actions", className)} aria-label="Quick actions">
      {QUICK_ACTIONS.map((action) => (
        <Button key={action.label} variant="outline" size="sm" className="ui-block-chip" disabled={disabled} onClick={() => onSend(action.message)}>
          {action.label}
        </Button>
      ))}
      <Button variant="outline" size="sm" className="ui-block-chip" disabled={disabled} onClick={() => onPrefill(STUCK_PREFILL)}>
        {STUCK_LABEL}
      </Button>
    </section>
  );
}

/** The captain's chat before its first message: the captain, one line, and the quick actions. */
export function CaptainChatEmptyState({
  agent,
  disabled,
  onSend,
  onPrefill,
}: {
  agent: Agent;
  disabled?: boolean;
  onSend: (text: string) => void;
  onPrefill: (text: string) => void;
}) {
  return (
    <div className="agent-chat-empty bob-chat-empty">
      <div className="agent-chat-empty-pitch">
        <AgentAvatar agent={agent} mood="idle" motion="always" className="agent-chat-empty-avatar" />
        <h2 className="agent-chat-empty-title">Hi, I&apos;m {agent.name}. Where do you want to start?</h2>
        <QuickActions className="bob-quick-actions-centered" disabled={disabled} onSend={onSend} onPrefill={onPrefill} />
      </div>
    </div>
  );
}

/** Any other chat before its first message: the agent, its line, and what it is for. */
export function AgentChatEmptyState({ agent }: { agent: Agent }) {
  const description = (agent.description || agent.title).trim();
  return (
    <div className="agent-chat-empty">
      <div className="agent-chat-empty-pitch">
        <AgentAvatar agent={agent} mood="idle" motion="always" className="agent-chat-empty-avatar" />
        <h2 className="agent-chat-empty-title">
          <span className="agent-chat-empty-ready">{agent.name} is ready.</span>
          <span>
            Ask, then watch it <span className="agent-chat-empty-hand">work</span>.
          </span>
        </h2>
        {description ? <p className="agent-chat-empty-description">{description}</p> : null}
      </div>
    </div>
  );
}
