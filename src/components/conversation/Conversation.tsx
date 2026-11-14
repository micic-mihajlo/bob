"use client";

import { useBob } from "@/components/app/BobContext";
import { AgentConversation } from "./AgentConversation";

export function Conversation() {
  const { selectedAgent } = useBob();
  if (!selectedAgent) {
    return (
      <main className="region">
        <div className="conversation-top" />
        <div className="conversation-body conversation-empty">
          <p className="empty-line">No agents yet. Make one from the sidebar to start.</p>
        </div>
      </main>
    );
  }
  return <AgentConversation key={selectedAgent.id} agent={selectedAgent} />;
}
