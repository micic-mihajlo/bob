"use client";

import { ChevronRight } from "lucide-react";
import { useId, useState } from "react";
import { displayPath, type DiffFile } from "@/lib/blocks/diff";
import { DiffHunkRows } from "./DiffHunkRows";

const STATUS_LABEL = { added: "Added", deleted: "Deleted", renamed: "Renamed", modified: null } as const;

function languageOfPath(path: string | null): string {
  const extension = /\.([a-z0-9]+)$/i.exec(path ?? "")?.[1]?.toLowerCase() ?? "";
  return extension === "sh" ? "bash" : extension;
}

export function DiffFileView({ file, defaultOpen = true }: { file: DiffFile; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  const status = STATUS_LABEL[file.status];
  const lang = languageOfPath(file.newPath ?? file.oldPath);

  return (
    <section className="blk-diff-file" data-collapsed={open ? undefined : ""}>
      <header className="blk-diff-file-header">
        <button type="button" className="blk-diff-toggle" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen(!open)}>
          <ChevronRight className="icon blk-chevron" size={14} aria-hidden="true" />
          <span className="blk-diff-path">{displayPath(file)}</span>
          {status ? <span className="blk-diff-status">{status}</span> : null}
        </button>
        <span className="blk-diff-count" aria-label={`${file.additions} added, ${file.deletions} removed`}>
          <span data-sign="add">+{file.additions}</span> <span data-sign="del">−{file.deletions}</span>
        </span>
      </header>
      <div id={bodyId} className="blk-diff-scroll" hidden={!open} tabIndex={0} role="region" aria-label={`Changes in ${displayPath(file)}`}>
        {file.hunks.length > 0 ? (
          <table className="blk-diff-table">
            {file.hunks.map((hunk, index) => (
              <DiffHunkRows key={index} hunk={hunk} lang={lang} />
            ))}
          </table>
        ) : (
          <p className="blk-diff-empty">{file.binary ? "Binary file changed." : "Renamed with no changes to its content."}</p>
        )}
      </div>
    </section>
  );
}
