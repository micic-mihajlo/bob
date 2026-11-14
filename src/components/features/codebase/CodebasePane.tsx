"use client";

import "./codebase.css";
import { FileCode2, Network, X } from "lucide-react";
import { useEffect, useState } from "react";
import { PaneFrame } from "@/components/features/panel/PaneFrame";
import { useBob } from "@/components/features/window/BobContext";
import { Button } from "@/components/ui/Button";
import { fetchCodebaseGraph, fetchModuleFiles, moduleOfPath, statsLine, type CodebaseGraph as Graph, type CodebaseHit } from "@/lib/client/codebase-view";
import { CodebaseGraph } from "./CodebaseGraph";
import { CodebaseSearch } from "./CodebaseSearch";

type Load = { state: "loading" } | { state: "ready"; graph: Graph } | { state: "failed" };
type ModuleFiles = { module: string; files: string[] };

/** Bob's codebase: the module graph HydraDB holds for the active project, and a live search over its knowledge. */
export function CodebasePane({ onClose }: { onClose: () => void }) {
  const { snapshot } = useBob();
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [selected, setSelected] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [moduleFiles, setModuleFiles] = useState<ModuleFiles | null>(null);
  const projectId = snapshot.project.id;

  useEffect(() => {
    const controller = new AbortController();
    fetchCodebaseGraph(controller.signal)
      .then((graph) => setLoad({ state: "ready", graph }))
      .catch(() => {
        if (!controller.signal.aborted) setLoad({ state: "failed" });
      });
    return () => controller.abort();
  }, [projectId]);

  const overview = load.state === "ready" ? load.graph.overview : null;
  const chosen = overview?.modules.find((entry) => entry.path === selected) ?? null;

  useEffect(() => {
    if (!chosen) return;
    const controller = new AbortController();
    fetchModuleFiles(chosen.path, controller.signal)
      .then((files) => setModuleFiles({ module: chosen.path, files }))
      .catch(() => {
        if (!controller.signal.aborted) setModuleFiles({ module: chosen.path, files: [] });
      });
    return () => controller.abort();
  }, [chosen]);

  const pick = (hit: CodebaseHit) => {
    if (!overview || !hit.path) return;
    const target = moduleOfPath(overview.modules, hit.path);
    setHighlighted(target?.path ?? null);
    if (target) setSelected(target.path);
  };
  const files = chosen && moduleFiles?.module === chosen.path ? moduleFiles.files : null;
  const summary = load.state === "ready" ? statsLine(load.graph) : null;

  return (
    <PaneFrame className="conversation-files-panel bob-codebase-panel" label="Codebase">
      <header className="file-preview-header conversation-files-header">
        <Network className="file-preview-file-icon side-panel-pane-title" aria-hidden="true" />
        <h2 className="side-panel-pane-title">Codebase</h2>
        {summary ? <span className="conversation-files-summary codebase-stats">{summary}</span> : null}
        <Button variant="ghost" className="browser-toolbar-button side-panel-pane-close" aria-label="Close panel" onClick={onClose}>
          <X className="browser-toolbar-icon" aria-hidden="true" />
        </Button>
      </header>
      <div className="conversation-files-content codebase-content">
        <div className="codebase-layout">
          <CodebaseSearch onPick={pick} />
          {load.state === "loading" ? (
            <div className="bob-pane-empty" aria-busy="true">
              <p>Reading the module graph…</p>
            </div>
          ) : null}
          {load.state === "failed" ? (
            <div className="bob-pane-empty" role="alert">
              <p>The module graph did not load.</p>
            </div>
          ) : null}
          {load.state === "ready" && (!overview || overview.modules.length === 0) ? (
            <div className="bob-pane-empty">
              <Network aria-hidden="true" />
              <p>No module graph yet. Once HydraDB has read this project, its modules and imports show here.</p>
            </div>
          ) : null}
          {overview && overview.modules.length > 0 ? (
            <section className="codebase-map" aria-label="Module graph">
              <header className="why-graph-header">
                <span className="why-graph-title">Modules</span>
                <span className="why-graph-source" data-source={load.state === "ready" ? load.graph.source : undefined}>
                  {load.state === "ready" && load.graph.source === "hydra" ? "from HydraDB" : "from memory"}
                </span>
                <span className="codebase-map-count">
                  {overview.modules.length} modules · {overview.imports.length} import links
                </span>
              </header>
              <CodebaseGraph
                modules={overview.modules}
                edges={overview.imports}
                selected={selected}
                highlighted={highlighted}
                onSelect={(id) => {
                  setHighlighted(null);
                  setSelected(id === selected ? null : id);
                }}
              />
              {chosen ? (
                <section className="codebase-module" aria-label={`Files in ${chosen.path}`}>
                  <header className="codebase-module-header">
                    <strong>{chosen.path}</strong>
                    <span>{chosen.files === 1 ? "1 file" : `${chosen.files} files`}</span>
                  </header>
                  {files === null ? (
                    <p className="bob-pane-muted">Listing files…</p>
                  ) : files.length === 0 ? (
                    <p className="bob-pane-muted">No files directly in this folder on main.</p>
                  ) : (
                    <ul className="codebase-module-files">
                      {files.map((file) => (
                        <li key={file}>
                          <FileCode2 aria-hidden="true" />
                          {file.slice(file.lastIndexOf("/") + 1)}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ) : null}
            </section>
          ) : null}
        </div>
      </div>
    </PaneFrame>
  );
}
