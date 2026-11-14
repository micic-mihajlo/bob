"use client";

import { GitBranch, RefreshCw } from "lucide-react";
import { useState } from "react";
import type { Agent } from "@/lib/types";
import { FileTreeDir } from "./FileTreeDir";
import { FileView } from "./FileView";

export function FilesTab({ agent }: { agent: Agent }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  return (
    <div className="files" data-split={selected !== null ? "" : undefined}>
      <header className="files-head">
        <span className="changes-branch" title={agent.branch ?? undefined}>
          <GitBranch className="icon" size={12} aria-hidden="true" />
          <span className="changes-branch-name">{agent.branch ?? "Workspace"}</span>
        </span>
        <button type="button" className="icon-button icon-button-xs" aria-label="Read the workspace again" title="Read the workspace again" onClick={() => setVersion((value) => value + 1)}>
          <RefreshCw className="icon" size={12} aria-hidden="true" />
        </button>
      </header>
      <nav className="file-tree" aria-label="Workspace files">
        <FileTreeDir agentId={agent.id} path="" depth={0} version={version} selected={selected} onPick={setSelected} />
      </nav>
      {selected !== null ? <FileView agentId={agent.id} path={selected} version={version} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}
