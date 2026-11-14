"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import type { Agent } from "@/lib/types";
import { ThreadRow } from "./ThreadRow";

export function ThreadGroup({ label, threads, startOpen }: { label: string; threads: readonly Agent[]; startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const bodyId = useId();
  if (threads.length === 0) return null;

  return (
    <section className="agent-section thread-group" aria-label={`${label}, ${threads.length}`}>
      <h2 className="thread-group-heading">
        <button type="button" className="thread-group-toggle" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((value) => !value)}>
          <span>{label}</span>
          <span className="thread-group-count">{threads.length}</span>
          <ChevronDown className="icon chevron" size={12} aria-hidden="true" />
        </button>
      </h2>
      <div id={bodyId} className="reveal" data-open={open ? "" : undefined} inert={!open}>
        <div className="reveal-inner thread-group-body">
          {threads.map((agent) => (
            <ThreadRow key={agent.id} agent={agent} />
          ))}
        </div>
      </div>
    </section>
  );
}
