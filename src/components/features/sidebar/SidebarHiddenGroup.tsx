"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { buttonClass } from "@/components/ui/classes";
import type { Agent } from "@/lib/types";
import { SidebarAgentRow } from "./SidebarAgentRow";
import type { useSidebarPins } from "./sidebar-pins";

const BODY_ID = "sidebar-hidden-agents-body";

/**
 * "Hidden": the agents that the person hid, after every section. Like "Needs you", it is not a
 * section of the layout, and it is collapsed until the person opens it.
 */
export function SidebarHiddenGroup({ agents, pins }: { agents: readonly Agent[]; pins: ReturnType<typeof useSidebarPins> }) {
  const [open, setOpen] = useState(false);
  const count = agents.length;
  if (count === 0) return null;
  const label = `Hidden, ${count} ${count === 1 ? "agent" : "agents"}`;
  return (
    <section className="sidebar-chat-group sidebar-section sidebar-hidden-group" aria-label={label}>
      <header>
        <button
          type="button"
          className={buttonClass({ variant: "ghost", className: "sidebar-section-toggle" })}
          aria-label={label}
          aria-expanded={open ? "true" : "false"}
          aria-controls={BODY_ID}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="sidebar-section-name">
            Hidden
            <span className="sidebar-hidden-group-count">({count})</span>
          </span>
          <ChevronDown className={`sidebar-section-chevron size-4${open ? "" : " sidebar-section-chevron-collapsed"}`} aria-hidden="true" />
        </button>
      </header>
      <div className="sidebar-section-collapse" data-collapsed={open ? undefined : ""} aria-hidden={open ? undefined : "true"} inert={!open}>
        <div id={BODY_ID} className="sidebar-section-body">
          {agents.map((agent) => (
            <SidebarAgentRow key={agent.id} agent={agent} state={undefined} pins={pins} userHidden hiddenSince={pins.pins.hidden[agent.id]} />
          ))}
        </div>
      </div>
    </section>
  );
}
