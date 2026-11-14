"use client";

import { ArrowUpRight, HelpCircle } from "lucide-react";
import { useBob } from "@/components/app/BobContext";
import type { AgentId, MessageId } from "@/lib/types";

export function MarkerDetail({ text, agentId, messageId }: { text: string; agentId: AgentId; messageId: MessageId }) {
  const { selectAgent, openWhy } = useBob();
  return (
    <div className="marker-detail">
      <p className="marker-detail-text">{text}</p>
      <div className="marker-detail-actions">
        <button type="button" className="btn btn-quiet btn-small" onClick={() => selectAgent(agentId)}>
          <ArrowUpRight className="icon" size={14} aria-hidden="true" />
          Open thread
        </button>
        <button type="button" className="btn btn-quiet btn-small" onClick={() => openWhy(messageId)}>
          <HelpCircle className="icon" size={14} aria-hidden="true" />
          Why?
        </button>
      </div>
    </div>
  );
}
