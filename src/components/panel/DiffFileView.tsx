import { ChevronDown } from "lucide-react";
import { countsOf } from "@/lib/client/changes-view";
import { splitPath, type DiffFile } from "@/lib/client/diff";
import type { ChangedFile } from "@/lib/types";
import { DiffLines } from "./DiffLines";

const STATUS_LABEL: Record<DiffFile["status"], string | null> = { added: "New", deleted: "Deleted", renamed: "Renamed", modified: null };

interface DiffFileViewProps {
  id: string;
  diff: DiffFile;
  files: readonly ChangedFile[];
  open: boolean;
  onToggle: () => void;
}

export function DiffFileView({ id, diff, files, open, onToggle }: DiffFileViewProps) {
  const { dir, base } = splitPath(diff.path);
  const counts = countsOf(diff, files);
  const status = STATUS_LABEL[diff.status];
  const bodyId = `${id}-body`;

  return (
    <section id={id} className="diff-file" aria-label={diff.path}>
      <button type="button" className="diff-file-head" aria-expanded={open} aria-controls={bodyId} onClick={onToggle}>
        <ChevronDown className="icon chevron" size={12} aria-hidden="true" />
        <span className="diff-file-path" title={diff.path}>
          <span className="pr-file-dir">{dir}</span>
          {base}
        </span>
        {status ? <span className="diff-file-status">{status}</span> : null}
        <span className="diff-count" data-kind="add">+{counts.additions}</span>
        <span className="diff-count" data-kind="del">−{counts.deletions}</span>
      </button>
      {open ? (
        <div id={bodyId} className="diff-body">
          {diff.binary ? <p className="diff-empty">Binary file, not shown.</p> : <DiffLines lines={diff.lines} />}
        </div>
      ) : null}
    </section>
  );
}
