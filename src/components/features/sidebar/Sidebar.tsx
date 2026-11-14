"use client";

import { ChevronDown } from "lucide-react";
import { Fragment, useState } from "react";
import { useBob } from "@/components/features/window/BobContext";
import { buttonClass, cx } from "@/components/ui/classes";
import { sidebarList, type SidebarListModel, type SidebarSectionModel } from "@/lib/client/sidebar-rows";
import type { Agent } from "@/lib/types";
import { NewAgentDialog } from "./NewAgentDialog";
import { ProjectMenu } from "./ProjectMenu";
import { SidebarAgentRow } from "./SidebarAgentRow";
import { PlusIcon, SearchIcon, SidebarToggleIcon } from "./SidebarIcons";

/** The reference sidebar: the project in the top row, "Needs you", then the threads by section. */
export function Sidebar({ compact = false, onExpand }: { compact?: boolean; onExpand?: () => void }) {
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
        {compact ? null : <ProjectMenu />}
        <div className="sidebar-topbar-actions">
          {compact ? (
            <button
              type="button"
              className="sidebar-icon-button sidebar-toggle-button no-drag"
              aria-label="Expand sidebar"
              aria-controls="agent-sidebar"
              aria-expanded="false"
              title="Expand sidebar"
              onClick={onExpand}
            >
              <SidebarToggleIcon />
            </button>
          ) : null}
          <button
            type="button"
            className="sidebar-icon-button sidebar-new-button no-drag"
            aria-hidden={compact ? "true" : undefined}
            tabIndex={compact ? -1 : 0}
            aria-label="New agent"
            title="New agent"
            onClick={() => setNewAgentOpen(true)}
          >
            <PlusIcon />
          </button>
        </div>
      </div>

      <div className="sidebar-search-wrap">
        <label className="search-field sidebar-search-trigger" aria-hidden={compact ? "true" : undefined}>
          <SearchIcon />
          <input
            type="search"
            placeholder="Search"
            aria-label="Search threads"
            tabIndex={compact ? -1 : 0}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <button
          type="button"
          className={buttonClass({ variant: "ghost", className: "sidebar-compact-search" })}
          aria-label="Search threads"
          aria-hidden={compact ? undefined : "true"}
          tabIndex={compact ? 0 : -1}
          onClick={onExpand}
        >
          <SearchIcon />
        </button>
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
            <SidebarSection key={section.id} section={section} list={list} />
          ))}
        </div>
      </nav>

      <div className="sidebar-update-island" hidden={compact}>
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
function SidebarSection({ section, list }: { section: SidebarSectionModel; list: SidebarListModel }) {
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
            <Fragment key={agent.id}>
              <SidebarAgentRow agent={agent} state={list.states[agent.id]} />
              {list.subagents[agent.id] ? (
                <div className="sidebar-subagents" role="group" aria-label={`${agent.code ?? agent.name} subagents`}>
                  {list.subagents[agent.id].map((sub) => (
                    <SidebarAgentRow key={sub.id} agent={sub} state={list.states[sub.id]} />
                  ))}
                </div>
              ) : null}
            </Fragment>
          ))}
        </div>
      </div>
    </section>
  );
}
