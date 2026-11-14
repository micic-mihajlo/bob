"use client";

import { useEffect } from "react";
import { useBob } from "@/components/app/BobContext";
import { markThreadRead } from "@/lib/client/api";
import { useAgentActions } from "@/lib/client/use-agent-actions";
import type { Agent } from "@/lib/types";
import { ComposerStack } from "./ComposerStack";
import { ConversationHeader } from "./ConversationHeader";
import { Thread } from "./Thread";

export function AgentConversation({ agent }: { agent: Agent }) {
  const { snapshot } = useBob();
  const thread = snapshot.threads[agent.id];
  const activity = snapshot.activity[agent.id];
  const actions = useAgentActions(agent.id);
  const unread = thread?.unread ?? 0;

  // Opening a thread reads it, and so does anything that lands while it is open.
  useEffect(() => {
    if (unread > 0) void markThreadRead(agent.id);
  }, [agent.id, unread]);

  return (
    <main className="region" aria-label={`Thread with ${agent.name}`}>
      <ConversationHeader agent={agent} activity={activity} queued={thread?.queued ?? 0} actions={actions} />
      <div className="conversation-body">
        <Thread agent={agent} thread={thread} activity={activity} />
        <ComposerStack agent={agent} thread={thread} activity={activity} actions={actions} />
      </div>
    </main>
  );
}
