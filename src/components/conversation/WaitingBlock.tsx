"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import { useBob } from "@/components/app/BobContext";
import { AgentLabel } from "@/components/common/AgentLabel";
import { ProgressRing } from "@/components/common/ProgressRing";
import { RollingNumber } from "@/components/common/RollingNumber";
import { StateMark } from "@/components/common/StateMark";
import { REPLY_STATE_LABEL } from "@/lib/client/agent-status";
import { displayName } from "@/lib/client/crew";
import type { WaitingOn } from "@/lib/types";

export function WaitingBlock({ rows }: { rows: readonly WaitingOn[] }) {
  const { agentsById, selectAgent } = useBob();
  const [open, setOpen] = useState(true);
  const panelId = useId();
  const done = rows.filter((row) => row.state === "replied" || row.state === "failed").length;

  return (
    <section className="waiting" aria-label="Waiting for replies">
      <button
        type="button"
        className="waiting-header"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <ProgressRing done={done} total={rows.length} />
        <span className="waiting-title">Waiting for replies</span>
        <span className="waiting-count">
          <RollingNumber value={done} text={String(done)} /> of {rows.length}
        </span>
        <ChevronDown className="icon chevron waiting-chevron" size={14} aria-hidden="true" />
      </button>
      <div id={panelId} className="reveal" data-open={open ? "" : undefined} inert={!open}>
        <div className="reveal-inner">
          <ul className="waiting-chips">
            {rows.map((row) => {
              const agent = agentsById.get(row.agentId);
              return (
                <li key={`${row.messageId}:${row.agentId}`}>
                  <button
                    type="button"
                    className="waiting-chip"
                    data-state={row.state}
                    title={`Open ${agent ? displayName(agent) : "this agent"}'s thread`}
                    onClick={() => selectAgent(row.agentId)}
                  >
                    {agent ? <AgentLabel agent={agent} nameClass="waiting-chip-name" /> : <span className="waiting-chip-name">A former teammate</span>}
                    <StateMark state={row.state} size={12} />
                    <span className="waiting-chip-state">{REPLY_STATE_LABEL[row.state]}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
