"use client";

import { X } from "lucide-react";
import { useWorkspaceListing } from "@/lib/client/use-workspace-listing";
import type { AgentId } from "@/lib/types";

interface FileViewProps {
  agentId: AgentId;
  path: string;
  version: number;
  onClose: () => void;
}

export function FileView({ agentId, path, version, onClose }: FileViewProps) {
  const { data, error } = useWorkspaceListing(agentId, path, version);

  return (
    <section className="file-view" aria-label={path}>
      <header className="file-view-head">
        <span className="file-view-path" title={path}>
          {path}
        </span>
        {data?.ok && data.kind === "file" && data.truncated ? <span className="file-view-cut">Cut short</span> : null}
        <button type="button" className="icon-button icon-button-xs" aria-label="Close file" title="Close file" onClick={onClose}>
          <X className="icon" size={12} aria-hidden="true" />
        </button>
      </header>
      <div className="file-view-body" tabIndex={0}>
        {data === null ? <p className="tree-note">{error ? `Could not read this file. ${error}` : "Reading"}</p> : null}
        {data && !data.ok ? <p className="tree-note">{data.error}</p> : null}
        {data?.ok && data.kind === "dir" ? <p className="tree-note">This is a folder.</p> : null}
        {data?.ok && data.kind === "file" ? (
          <table className="code-table">
            <tbody>
              {data.content.split("\n").map((line, index) => (
                <tr key={index}>
                  <td className="diff-num">{index + 1}</td>
                  <td className="code-line">{line}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </section>
  );
}
