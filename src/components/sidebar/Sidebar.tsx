"use client";

import { FolderGit2, FolderPlus, Plus } from "lucide-react";
import { useBob } from "@/components/app/BobContext";
import { agentsNeedingYou, agentsNotNeedingYou } from "@/lib/client/selectors";
import { AgentRow } from "./AgentRow";
import { BrainFooter } from "./BrainFooter";
import { NeedsYouGroup } from "./NeedsYouGroup";

export function Sidebar() {
  const { snapshot, setNewAgentOpen } = useBob();
  const waiting = agentsNeedingYou(snapshot);
  const rest = agentsNotNeedingYou(snapshot);

  return (
    <nav className="region" aria-label="Team">
      <div className="sidebar-top">
        <span className="project-mark" aria-hidden="true">
          {snapshot.project.name.trim().charAt(0).toUpperCase()}
        </span>
        <span className="project-name" title={snapshot.project.repo ?? undefined}>
          {snapshot.project.name}
        </span>
      </div>
      <div className="sidebar-body">
        <div className="project-links">
          <button type="button" className="project-link" disabled title="Comes after the first project">
            <FolderGit2 className="icon" size={14} aria-hidden="true" />
            Import a repo
          </button>
          <button type="button" className="project-link" disabled title="Comes after the first project">
            <FolderPlus className="icon" size={14} aria-hidden="true" />
            New project
          </button>
        </div>
        <div className="agent-list">
          <NeedsYouGroup agents={waiting} />
          <section className="agent-section" aria-labelledby="agents-heading">
            <h2 id="agents-heading" className="agent-section-name">
              Agents
            </h2>
            {rest.length === 0 && waiting.length === 0 ? (
              <p className="empty-line agent-section-empty">No agents yet. Make the first one below.</p>
            ) : (
              rest.map((agent) => <AgentRow key={agent.id} agent={agent} />)
            )}
            <button type="button" className="team-row team-row-add" onClick={() => setNewAgentOpen(true)}>
              <span className="new-agent-face" aria-hidden="true">
                <Plus className="icon" size={16} />
              </span>
              <span className="new-agent-label">New agent</span>
            </button>
          </section>
        </div>
        <BrainFooter />
      </div>
    </nav>
  );
}
