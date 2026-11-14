"use client";

import { Check, ChevronsUpDown, KeyRound, Plus } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useBob } from "@/components/features/window/BobContext";
import { buttonClass } from "@/components/ui/classes";
import { listProjects, openProject } from "@/lib/client/api";
import type { Project } from "@/lib/types";
import { ConnectClaudeDialog } from "./ConnectClaudeDialog";
import { OpenProjectDialog, TEMPLATE_LABELS } from "./OpenProjectDialog";

/**
 * The project name on the sidebar title, as the reference's server menu: it lists the projects
 * with a check on the active one, and ends with the item that opens another.
 */
export function ProjectMenu() {
  const { snapshot, selectAgent } = useBob();
  const [open, setOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [claudeOpen, setClaudeOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([snapshot.project]);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const active = snapshot.project;

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>("[role=menuitem][aria-current=true], [role=menuitem]")?.focus();
    let live = true;
    void listProjects().then((list) => live && list && setProjects(list));
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      live = false;
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const items = [...(menu.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
    const index = items.indexOf(document.activeElement as HTMLElement);
    items[(index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
  };

  async function choose(project: Project): Promise<void> {
    if (project.id === active.id) return setOpen(false);
    setPendingId(project.id);
    setError(null);
    const result = await openProject({ name: project.name });
    setPendingId(null);
    if (!result.ok) return setError(result.error);
    selectAgent("bob");
    setOpen(false);
  }

  return (
    <div ref={root} className="sidebar-project-menu">
      <button
        ref={trigger}
        type="button"
        className={buttonClass({ variant: "ghost", size: "sm", className: "sidebar-server-name no-drag" })}
        data-slot="button"
        data-variant="ghost"
        data-size="sm"
        aria-haspopup="menu"
        aria-expanded={open ? "true" : "false"}
        aria-label={`Open project menu, ${active.name}`}
        title={active.repo ?? active.name}
        onClick={() => {
          setError(null);
          setOpen((value) => !value);
        }}
      >
        <span className="sidebar-server-name-label">
          <span>{active.name}</span>
        </span>
        <ChevronsUpDown className="sidebar-server-name-chevron" aria-hidden="true" />
      </button>
      {open ? (
        <div
          ref={menu}
          role="menu"
          aria-label="Projects"
          className="ui-action-menu agent-context-menu server-menu sidebar-project-menu-content"
          data-expanded=""
          onKeyDown={onMenuKeyDown}
        >
          <div className="ui-menu-label" aria-hidden="true">
            Projects
          </div>
          {projects.map((project) => (
            <button
              key={project.id}
              type="button"
              role="menuitem"
              className="server-menu-row"
              aria-current={project.id === active.id ? "true" : undefined}
              disabled={pendingId !== null}
              title={project.repo ?? TEMPLATE_LABELS[project.template ?? "blank-ts"]}
              onClick={() => void choose(project)}
            >
              <span className="ui-menu-check" data-checked={project.id === active.id ? "" : undefined} aria-hidden="true">
                {project.id === active.id ? <Check /> : null}
              </span>
              <span className="server-menu-name">{project.name}</span>
              {pendingId === project.id ? <span className="ui-menu-trailing">Opening</span> : null}
            </button>
          ))}
          {error ? (
            <p className="sidebar-project-menu-error" role="alert">
              {error}
            </p>
          ) : null}
          <div role="separator" />
          <button
            type="button"
            role="menuitem"
            className="server-menu-add"
            onClick={() => {
              setOpen(false);
              setDialogOpen(true);
            }}
          >
            <span className="server-menu-add-circle" aria-hidden="true">
              <Plus />
            </span>
            <span>Open a project</span>
          </button>
          <div role="separator" />
          <button
            type="button"
            role="menuitem"
            className="server-menu-add"
            onClick={() => {
              setOpen(false);
              setClaudeOpen(true);
            }}
          >
            <span className="server-menu-add-circle" aria-hidden="true">
              <KeyRound />
            </span>
            <span>{snapshot.claude?.connected ? "Claude connected" : "Connect your Claude"}</span>
          </button>
        </div>
      ) : null}
      {dialogOpen ? (
        <OpenProjectDialog
          onClose={() => {
            setDialogOpen(false);
            requestAnimationFrame(() => trigger.current?.focus());
          }}
        />
      ) : null}
      {claudeOpen ? (
        <ConnectClaudeDialog
          onClose={() => {
            setClaudeOpen(false);
            requestAnimationFrame(() => trigger.current?.focus());
          }}
        />
      ) : null}
    </div>
  );
}
