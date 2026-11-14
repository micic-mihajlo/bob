"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import { useBob } from "@/components/app/BobContext";
import { ProgressRing } from "@/components/common/ProgressRing";
import { RollingNumber } from "@/components/common/RollingNumber";
import { ThreadFace } from "@/components/common/ThreadFace";
import { threadStatusOf } from "@/lib/client/crew";
import { formatClock, pluralize } from "@/lib/client/format";
import type { ThreadStatus } from "@/lib/types";
import type { SentRow } from "./SentBlock";
import { StartedRow } from "./StartedRow";

const ACTIVE: ReadonlySet<ThreadStatus> = new Set(["working", "waiting", "needs_you"]);

/** Threads the captain started in one turn. Open while any of them still works, unless the person chose. */
export function StartedGroup({ rows }: { rows: readonly SentRow[] }) {
  const { snapshot, agentsById } = useBob();
  const [chosen, setChosen] = useState<boolean | null>(null);
  const panelId = useId();
  const threads = rows.flatMap((row) => {
    const agent = agentsById.get(row.agentId);
    return agent ? [agent] : [];
  });
  const settled = threads.filter((agent) => !ACTIVE.has(threadStatusOf(snapshot, agent))).length;
  const open = chosen ?? settled < threads.length;
  const startedAt = rows[0]?.at ?? "";

  return (
    <div className="marker-entry marker-group">
      <div className="marker">
        <button type="button" className="marker-group-toggle" aria-expanded={open} aria-controls={panelId} onClick={() => setChosen(!open)}>
          <span className="marker-label">Started {pluralize(rows.length, "thread")}</span>
          <span className="marker-pill marker-pill-static">
            <span className="face-stack" aria-hidden="true">
              {threads.slice(0, 3).map((agent) => (
                <ThreadFace key={agent.id} agent={agent} size={16} />
              ))}
            </span>
            <ProgressRing done={settled} total={threads.length} />
            <span className="marker-count">
              <RollingNumber value={settled} text={String(settled)} /> of {threads.length} done
            </span>
          </span>
          <time className="marker-time" dateTime={startedAt}>
            {formatClock(startedAt)}
          </time>
          <ChevronDown className="icon chevron" size={14} aria-hidden="true" />
        </button>
      </div>
      <div id={panelId} className="reveal" data-open={open ? "" : undefined} inert={!open}>
        <div className="reveal-inner">
          <ul className="started-list">
            {rows.map((row) => (
              <StartedRow key={row.key} agentId={row.agentId} />
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
