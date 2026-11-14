"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import { useBob } from "@/components/app/BobContext";
import { Avatar } from "@/components/common/Avatar";
import { ProgressRing } from "@/components/common/ProgressRing";
import { RollingNumber } from "@/components/common/RollingNumber";
import { isSettled } from "@/lib/client/agent-status";
import { formatClock, formatElapsed, pluralize } from "@/lib/client/format";
import { elapsedSince } from "@/lib/client/thread-rows";
import { useNow } from "@/lib/client/use-now";
import { MessageMarker } from "./MessageMarker";
import type { SentRow } from "./SentBlock";

/** Open by default only while a reply is outstanding; once the person toggles it, their choice sticks. */
export function SentGroup({ rows }: { rows: readonly SentRow[] }) {
  const { agentsById } = useBob();
  const [chosen, setChosen] = useState<boolean | null>(null);
  const panelId = useId();

  const asked = rows.filter((row) => row.expectsReply);
  const done = asked.filter((row) => isSettled(row.state)).length;
  const active = done < asked.length;
  const open = chosen ?? active;
  const startedAt = rows[0]?.at ?? "";
  const now = useNow(active);
  const elapsed = elapsedSince(startedAt, now);
  const recipients = new Set(rows.map((row) => row.agentId));
  const faces = [...recipients].slice(0, 3).flatMap((id) => {
    const agent = agentsById.get(id);
    return agent ? [agent] : [];
  });
  const verb = asked.length > 0 ? "Messaged" : "Informed";

  return (
    <div className="marker-entry marker-group">
      <div className="marker">
        <button
          type="button"
          className="marker-group-toggle"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setChosen(!open)}
        >
          <span className="marker-label">
            {verb} {pluralize(recipients.size, "agent")}
          </span>
          <span className="marker-pill marker-pill-static">
            <span className="face-stack" aria-hidden="true">
              {faces.map((agent) => (
                <Avatar key={agent.id} agent={agent} size={16} />
              ))}
            </span>
            {asked.length > 0 ? (
              <>
                <ProgressRing done={done} total={asked.length} />
                <span className="marker-count">
                  <RollingNumber value={done} text={String(done)} /> of {asked.length}
                </span>
              </>
            ) : null}
          </span>
          {active ? (
            <span className="marker-time marker-elapsed" aria-hidden="true">
              <RollingNumber value={Math.floor(elapsed / 1000)} text={formatElapsed(elapsed)} />
            </span>
          ) : (
            <time className="marker-time" dateTime={startedAt}>
              {formatClock(startedAt)}
            </time>
          )}
          <ChevronDown className="icon chevron" size={14} aria-hidden="true" />
        </button>
      </div>
      <div id={panelId} className="reveal" data-open={open ? "" : undefined} inert={!open}>
        <div className="reveal-inner">
          <div className="marker-group-list">
            {rows.map((row) => (
              <MessageMarker
                key={row.key}
                label={row.expectsReply ? "Messaged" : "Informed"}
                agentId={row.agentId}
                messageId={row.messageId}
                text={row.text}
                at={row.at}
                state={row.expectsReply ? row.state : undefined}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
