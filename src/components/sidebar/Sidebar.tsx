"use client";

import { FolderGit2, FolderPlus, Plus } from "lucide-react";
import { useBob } from "@/components/app/BobContext";
import { CREW_GROUPS, sidebarModel } from "@/lib/client/crew";
import { needsYouItems } from "@/lib/client/needs-you";
import { AgentRow } from "./AgentRow";
import { BrainFooter } from "./BrainFooter";
import { NeedsYouGroup } from "./NeedsYouGroup";
import { ThreadGroup } from "./ThreadGroup";

export function Sidebar() {
  const { snapshot, setNewAgentOpen } = useBob();
  const { captain, crew, standing } = sidebarModel(snapshot);
  const noCrew = CREW_GROUPS.every((group) => crew[group.id].length === 0);

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
          {captain ? (
            <div className="captain-pin">
              <AgentRow agent={captain} />
            </div>
          ) : null}
          <NeedsYouGroup items={needsYouItems(snapshot)} />
          {CREW_GROUPS.map((group) => (
            <ThreadGroup key={group.id} label={group.label} threads={crew[group.id]} startOpen={group.id !== "closed"} />
          ))}
          {noCrew && captain ? <p className="empty-line crew-empty">No crew threads yet. {captain.name} starts one for each piece of work.</p> : null}
          <section className="agent-section" aria-labelledby="agents-heading">
            <h2 id="agents-heading" className="agent-section-name">
              Agents
            </h2>
            {standing.map((agent) => (
              <AgentRow key={agent.id} agent={agent} />
            ))}
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
