"use client";

import { ChevronRight } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { displayPath, type DiffFile, type DiffHunk, type DiffLine } from "@/lib/blocks/diff";
import { highlight } from "@/lib/blocks/highlight";
import { Tokens } from "./Tokens";

const STATUS_LABEL = { added: "Added", deleted: "Deleted", renamed: "Renamed", modified: null } as const;
const SIGN = { add: "+", del: "-", context: " " } as const;

/** The highlight language for a path, from its extension. */
function languageOfPath(path: string | null): string {
  const extension = /\.([a-z0-9]+)$/i.exec(path ?? "")?.[1]?.toLowerCase() ?? "";
  return extension === "sh" ? "bash" : extension;
}

function Line({ line, lang }: { line: DiffLine; lang: string }) {
  const tokens = useMemo(() => highlight(line.text, lang), [line.text, lang]);
  return (
    <tr data-kind={line.kind}>
      <td className="blk-diff-no">{line.oldNo ?? ""}</td>
      <td className="blk-diff-no">{line.newNo ?? ""}</td>
      <td className="blk-diff-sign" aria-hidden="true">
        {SIGN[line.kind]}
      </td>
      <td className="blk-diff-text">
        {line.kind === "add" ? <span className="blk-sr-only">Added: </span> : line.kind === "del" ? <span className="blk-sr-only">Removed: </span> : null}
        <Tokens tokens={tokens} />
        {line.noNewline ? <span className="blk-diff-eof">No newline at end of file</span> : null}
      </td>
    </tr>
  );
}

function Hunk({ hunk, lang }: { hunk: DiffHunk; lang: string }) {
  return (
    <tbody>
      <tr className="blk-diff-hunk">
        <td colSpan={4}>{hunk.header}</td>
      </tr>
      {hunk.lines.map((line, index) => (
        <Line key={index} line={line} lang={lang} />
      ))}
    </tbody>
  );
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
      <div id={bodyId} className="blk-diff-scroll" hidden={!open}>
        {file.hunks.length > 0 ? (
          <table className="blk-diff-table">
            {file.hunks.map((hunk, index) => (
              <Hunk key={index} hunk={hunk} lang={lang} />
            ))}
          </table>
        ) : (
          <p className="blk-diff-empty">{file.binary ? "Binary file changed." : "Renamed with no changes to its content."}</p>
        )}
      </div>
    </section>
  );
}
