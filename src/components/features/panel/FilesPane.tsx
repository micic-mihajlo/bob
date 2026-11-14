"use client";

import { useState } from "react";
import { useBob } from "@/components/app/BobContext";
import { FilePreviewPanel, FileSourceText, FolderEntries } from "@/components/features/files/FilePreviewPanel";
import { MarkdownFilePreview } from "@/components/features/files/MarkdownFilePreview";
import { Spinner } from "@/components/ui/Surface";
import { joinPath, useWorkspaceListing } from "@/lib/client/use-workspace-listing";
import type { Agent } from "@/lib/types";

function parentOf(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash < 0 ? "" : path.slice(0, slash);
}

function nameOf(path: string, fallback: string): string {
  return path === "" ? fallback : path.slice(path.lastIndexOf("/") + 1);
}

/**
 * A crew thread's workspace in the reference file preview: a folder lists its entries, folders
 * first, and a file shows its text. Back goes to the parent folder.
 */
export function FilesPane({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const [path, setPath] = useState("");
  const { snapshot } = useBob();
  const [raw, setRaw] = useState(false);
  const [wrap, setWrap] = useState(false);
  const { data, error } = useWorkspaceListing(agent.id, path, snapshot.rev);
  const root = agent.branch ?? "Workspace";
  const go = (next: string) => {
    setPath(next);
    setRaw(false);
  };
  const back = path === "" ? undefined : () => go(parentOf(path));
  const file = data?.ok && data.kind === "file" ? data : null;
  const markdown = file !== null && /\.md$/i.test(file.path);

  return (
    <FilePreviewPanel
      title={nameOf(path, root)}
      path={path || root}
      icon={file ? "file" : "folder"}
      label="Files"
      onBack={back}
      rawMarkdown={markdown ? { raw, onToggle: () => setRaw((value) => !value) } : undefined}
      wrapLines={file && (!markdown || raw) ? { wrap, onToggle: () => setWrap((value) => !value) } : undefined}
      copyText={file?.content}
      onClose={onClose}
    >
      {data === null ? (
        error ? (
          <p className="file-preview-folder-empty" role="alert">
            Could not read this. {error}
          </p>
        ) : (
          <div className="file-preview-folder-empty" aria-busy="true">
            <Spinner label="Reading the workspace" />
          </div>
        )
      ) : !data.ok ? (
        <p className="file-preview-folder-empty">{data.error}</p>
      ) : data.kind === "dir" ? (
        <FolderEntries
          label={nameOf(path, root)}
          entries={[...data.entries]
            .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "dir" ? -1 : 1))
            .map((entry) => ({ name: entry.name, kind: entry.kind, path: joinPath(path, entry.name) }))}
          onOpen={(entry) => go(entry.path)}
        />
      ) : markdown && !raw ? (
        <MarkdownFilePreview className="file-preview-markdown" body={data.content} />
      ) : (
        <>
          <FileSourceText text={data.content} wrap={wrap} />
          {data.truncated ? <p className="file-preview-truncated">The preview stops here; the file is longer.</p> : null}
        </>
      )}
    </FilePreviewPanel>
  );
}
