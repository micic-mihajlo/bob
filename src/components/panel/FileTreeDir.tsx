"use client";

import { ChevronRight, FileText, Folder, FolderOpen } from "lucide-react";
import { useState, type CSSProperties } from "react";
import { joinPath, useWorkspaceListing } from "@/lib/client/use-workspace-listing";
import type { AgentId } from "@/lib/types";

interface FileTreeDirProps {
  agentId: AgentId;
  path: string;
  depth: number;
  version: number;
  selected: string | null;
  onPick: (path: string) => void;
}

/** One folder of the workspace, read when it opens. Folders come first, each list sorted by name. */
export function FileTreeDir({ agentId, path, depth, version, selected, onPick }: FileTreeDirProps) {
  const { data, error } = useWorkspaceListing(agentId, path, version);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const indent = { "--tree-depth": depth } as CSSProperties;

  if (data === null) {
    return error ? (
      <p className="tree-note" style={indent} role="alert">
        Could not read this folder. {error}
      </p>
    ) : (
      <p className="tree-note tree-loading" style={indent}>
        Reading
      </p>
    );
  }
  if (!data.ok) return <p className="tree-note" style={indent}>{data.error}</p>;
  if (data.kind !== "dir") return null;
  if (data.entries.length === 0) return <p className="tree-note" style={indent}>{depth === 0 ? "The workspace is empty." : "Empty folder"}</p>;

  const entries = [...data.entries].sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "dir" ? -1 : 1));
  const toggle = (name: string) =>
    setOpen((previous) => (previous.has(name) ? new Set([...previous].filter((entry) => entry !== name)) : new Set([...previous, name])));

  return (
    <ul className="tree-list">
      {entries.map((entry) => {
        const full = joinPath(path, entry.name);
        const expanded = open.has(entry.name);
        if (entry.kind === "file") {
          return (
            <li key={entry.name}>
              <button type="button" className="tree-item" style={indent} aria-current={selected === full ? "true" : undefined} onClick={() => onPick(full)}>
                <span className="tree-chevron-slot" aria-hidden="true" />
                <FileText className="icon" size={14} aria-hidden="true" />
                <span className="tree-name">{entry.name}</span>
              </button>
            </li>
          );
        }
        const Icon = expanded ? FolderOpen : Folder;
        return (
          <li key={entry.name}>
            <button type="button" className="tree-item" style={indent} aria-expanded={expanded} onClick={() => toggle(entry.name)}>
              <ChevronRight className="icon tree-chevron" size={12} aria-hidden="true" />
              <Icon className="icon" size={14} aria-hidden="true" />
              <span className="tree-name">{entry.name}</span>
            </button>
            {expanded ? <FileTreeDir agentId={agentId} path={full} depth={depth + 1} version={version} selected={selected} onPick={onPick} /> : null}
          </li>
        );
      })}
    </ul>
  );
}
