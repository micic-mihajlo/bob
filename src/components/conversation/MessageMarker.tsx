"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import { useBob } from "@/components/app/BobContext";
import { AgentLabel } from "@/components/common/AgentLabel";
import { agentHueStyle } from "@/components/common/Avatar";
import { RollingNumber } from "@/components/common/RollingNumber";
import { StateMark } from "@/components/common/StateMark";
import { isSettled, REPLY_STATE_LABEL, type ReplyState } from "@/lib/client/agent-status";
import { displayName } from "@/lib/client/crew";
import { formatClock, formatElapsed } from "@/lib/client/format";
import { elapsedSince } from "@/lib/client/thread-rows";
import { useNow } from "@/lib/client/use-now";
import type { AgentId, MessageId } from "@/lib/types";
import { MarkerDetail } from "./MarkerDetail";

interface MessageMarkerProps {
  label: string;
  agentId: AgentId;
  messageId: MessageId;
  text: string;
  at: string;
  /** Where the recipient is with it. Absent for a message this agent received. */
  state?: ReplyState;
}

export function MessageMarker({ label, agentId, messageId, text, at, state }: MessageMarkerProps) {
  const { agentsById, selectAgent } = useBob();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const agent = agentsById.get(agentId);
  const name = agent ? displayName(agent) : "A former teammate";
  const ticking = state !== undefined && !isSettled(state);
  const now = useNow(ticking);
  const elapsed = elapsedSince(at, now);

  return (
    <div className="marker-entry">
      <div className="marker">
        <span className="marker-label">{label}</span>
        <button
          type="button"
          className="marker-pill"
          style={agent ? agentHueStyle(agent.hue) : undefined}
          title={`Open ${name}'s thread`}
          onClick={() => selectAgent(agentId)}
        >
          {agent ? <AgentLabel agent={agent} /> : <span className="marker-pill-name">{name}</span>}
        </button>
        {state ? (
          <span className="marker-state" data-state={state}>
            <StateMark state={state} size={12} />
            {REPLY_STATE_LABEL[state]}
          </span>
        ) : null}
        {ticking ? (
          <span className="marker-time marker-elapsed" aria-hidden="true">
            <RollingNumber value={Math.floor(elapsed / 1000)} text={formatElapsed(elapsed)} />
          </span>
        ) : (
          <time className="marker-time" dateTime={at}>
            {formatClock(at)}
          </time>
        )}
        <button
          type="button"
          className="icon-button icon-button-xs"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={open ? "Hide message" : "Show message"}
          onClick={() => setOpen((value) => !value)}
        >
          <ChevronDown className="icon chevron" size={14} aria-hidden="true" />
        </button>
      </div>
      <div id={panelId} className="reveal" data-open={open ? "" : undefined} inert={!open}>
        <div className="reveal-inner">
          <MarkerDetail text={text} agentId={agentId} messageId={messageId} />
        </div>
      </div>
    </div>
  );
}
