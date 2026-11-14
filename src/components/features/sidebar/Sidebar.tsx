"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { useBob } from "@/components/app/BobContext";
import { buttonClass, cx } from "@/components/ui/classes";
import { sidebarList, type SidebarSectionModel, type SidebarAgentState } from "@/lib/client/sidebar-rows";
import type { Agent, AgentId } from "@/lib/types";
import { NewAgentDialog } from "./NewAgentDialog";
import { SidebarAgentRow } from "./SidebarAgentRow";
import { PlusIcon, SearchIcon } from "./SidebarIcons";

/** The reference sidebar: the project in the top row, "Needs you", then the threads by section. */
export function Sidebar({ compact = false }: { compact?: boolean }) {
  const { snapshot, connected, newAgentOpen, setNewAgentOpen } = useBob();
  const [query, setQuery] = useState("");
  const list = sidebarList(snapshot);
  const needle = query.trim().toLowerCase();
  const matches = (agent: Agent) =>
    needle === "" || [agent.name, agent.code ?? "", agent.title].some((text) => text.toLowerCase().includes(needle));
  const waiting = list.waiting.filter((entry) => matches(entry.agent));
  const sections = list.sections
    .map((section) => ({ ...section, agents: section.agents.filter(matches) }))
    .filter((section) => section.agents.length > 0);

  return (
    <aside id="agent-sidebar" aria-label="Agent navigation" className={cx("sidebar panel-edge", compact && "sidebar-compact")}>
      <div className="window-drag sidebar-topbar">
        <button
          type="button"
          className={buttonClass({ variant: "ghost", size: "sm", className: "sidebar-server-name no-drag" })}
          data-slot="button"
          data-variant="ghost"
          data-size="sm"
          title={snapshot.project.repo ?? snapshot.project.name}
          aria-label={`Project ${snapshot.project.name}`}
        >
          <span className="sidebar-server-name-label">{snapshot.project.name}</span>
        </button>
        <div className="sidebar-topbar-actions">
          <button
            type="button"
            className="sidebar-icon-button sidebar-new-button no-drag"
            aria-label="New agent"
            title="New agent"
            onClick={() => setNewAgentOpen(true)}
          >
            <PlusIcon />
          </button>
        </div>
      </div>

      <div className="sidebar-search-wrap">
        <label className="search-field sidebar-search-trigger">
          <SearchIcon />
          <input type="search" placeholder="Search" aria-label="Search threads" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
      </div>

      <nav aria-label="Chat list" className="agent-list">
        <div className="agent-list-content">
          {waiting.length > 0 ? (
            <section
              className="sidebar-chat-group sidebar-waiting-group"
              aria-label={`Needs you, ${waiting.length} ${waiting.length === 1 ? "chat" : "chats"}`}
            >
              <header>
                <h2 className="sidebar-waiting-group-name">
                  Needs you
                  <span className="sidebar-waiting-group-count" aria-hidden="true">
                    {waiting.length}
                  </span>
                </h2>
              </header>
              {waiting.map(({ agent }) => (
                <SidebarAgentRow key={agent.id} agent={agent} state={list.states[agent.id]} waiting />
              ))}
            </section>
          ) : null}
          {sections.map((section) => (
            <SidebarSection key={section.id} section={section} states={list.states} />
          ))}
        </div>
      </nav>

      <div className="sidebar-update-island">
        <div className="account-update-island t-panel-slide" data-open="true" data-phase="available">
          <div className="account-update-island__copy" role="status" aria-live="polite">
            <strong>{snapshot.brain === "model" ? "Live model" : "Scripted agents"}</strong>
          </div>
          <span className="sidebar-brain-sync" data-live={connected ? "" : undefined}>
            {connected ? "Live" : "Polling"}
          </span>
        </div>
      </div>

      {newAgentOpen ? <NewAgentDialog onClose={() => setNewAgentOpen(false)} /> : null}
    </aside>
  );
}

/** One section. The first, which holds the captain, has no heading; the rest fold like the reference's. */
function SidebarSection({ section, states }: { section: SidebarSectionModel; states: Readonly<Record<AgentId, SidebarAgentState>> }) {
  const [collapsed, setCollapsed] = useState(section.collapsedByDefault);
  const bodyId = `sidebar-section-body-${section.id}`;
  const folded = section.name !== null && collapsed;

  return (
    <section className="sidebar-chat-group sidebar-section" aria-label={section.name ?? "Captain"} data-section-id={section.id}>
      {section.name !== null ? (
        <header>
          <button
            type="button"
            className={buttonClass({ variant: "ghost", className: "sidebar-section-toggle sidebar-section-drag-handle" })}
            aria-expanded={collapsed ? "false" : "true"}
            aria-controls={bodyId}
            onClick={() => setCollapsed((value) => !value)}
          >
            <span className="sidebar-section-name" title={section.name}>
              {section.name}
            </span>
            <ChevronDown
              className={`sidebar-section-chevron size-4${collapsed ? " sidebar-section-chevron-collapsed" : ""}`}
              aria-hidden="true"
            />
          </button>
        </header>
      ) : null}
      <div className="sidebar-section-collapse" data-collapsed={folded ? "" : undefined} aria-hidden={folded ? "true" : undefined} inert={folded}>
        <div id={bodyId} className="sidebar-section-body">
          {section.agents.map((agent) => (
            <SidebarAgentRow key={agent.id} agent={agent} state={states[agent.id]} />
          ))}
        </div>
      </div>
    </section>
  );
}
