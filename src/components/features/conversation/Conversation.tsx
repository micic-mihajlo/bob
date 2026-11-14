"use client";

import { useEffect } from "react";
import { useBob } from "@/components/features/window/BobContext";
import { SidePanel, useSidePanelFrame } from "@/components/features/panel/SidePanel";
import { cx } from "@/components/ui/classes";
import { markThreadRead, sendMessage } from "@/lib/client/api";
import type { Agent, ThreadView } from "@/lib/types";
import { AgentChatEmptyState, CaptainChatEmptyState } from "./AgentChatEmptyState";
import { ConversationComposer } from "./ConversationComposer";
import { ConversationHeader } from "./ConversationHeader";
import { ConversationTimeline } from "./ConversationTimeline";
import { WhyTraceDialog } from "./WhyTraceDialog";

const EMPTY_THREAD: Omit<ThreadView, "agentId"> = { items: [], waitingOn: [], queued: 0, unread: 0 };

function ClosedNotice({ agent }: { agent: Agent }) {
  return <p className="channel-preview-notice">{agent.code ?? agent.name} is closed. Its history stays readable.</p>;
}

/** One thread's chat, keyed by agent so its scroll, draft focus and open rows start fresh. */
function AgentConversation({ agent }: { agent: Agent }) {
  const { snapshot, captain, setDraft } = useBob();
  const thread = snapshot.threads[agent.id] ?? { agentId: agent.id, ...EMPTY_THREAD };
  const working = snapshot.activity[agent.id]?.state === "working";
  const isCaptain = agent.id === captain?.id;
  const closed = Boolean(agent.closedAt);
  const unread = thread.unread;

  useEffect(() => {
    if (unread > 0 || thread.items.length > 0) void markThreadRead(agent.id);
  }, [agent.id, unread, thread.items.length]);

  const empty = isCaptain ? (
    <CaptainChatEmptyState
      agent={agent}
      disabled={closed}
      onSend={(text) => void sendMessage(agent.id, text)}
      onPrefill={(text) => setDraft(agent.id, text)}
    />
  ) : (
    <AgentChatEmptyState agent={agent} />
  );

  return (
    <>
      <ConversationHeader agent={agent} />
      <ConversationTimeline agent={agent} thread={thread} empty={empty} />
      {closed ? (
        <ClosedNotice agent={agent} />
      ) : (
        <ConversationComposer agent={agent} thread={thread} working={working} quickActions={isCaptain && !working && thread.items.length > 0} />
      )}
    </>
  );
}

/** The middle pane: the selected agent's chat and, docked after it as in the reference, the side panel. */
export function Conversation() {
  const { selectedAgent } = useBob();
  const frame = useSidePanelFrame();
  return (
    <main className={cx("conversation-panel", frame.className)} aria-label="Conversation" style={frame.style}>
      {selectedAgent ? <AgentConversation key={selectedAgent.id} agent={selectedAgent} /> : null}
      <SidePanel />
      <WhyTraceDialog />
    </main>
  );
}
