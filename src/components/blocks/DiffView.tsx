"use client";

import { useMemo } from "react";
import { parsePatch } from "@/lib/blocks/diff";
import { CodeBlock } from "./CodeBlock";
import { DiffFileView } from "./DiffFileView";
import "./styles";

/** Files past this many changed lines start collapsed, so one huge file does not bury the rest. */
const COLLAPSE_AFTER_LINES = 400;

/** A unified diff viewer. Takes a raw patch, so a side panel can show one without the chat. */
export function DiffView({ patch }: { patch: string }) {
  const files = useMemo(() => parsePatch(patch), [patch]);
  if (files.length === 0) return <CodeBlock lang="diff" code={patch} />;
  return (
    <div className="blk-diff">
      {files.map((file, index) => (
        <DiffFileView
          key={`${file.oldPath ?? ""}:${file.newPath ?? ""}:${index}`}
          file={file}
          defaultOpen={file.additions + file.deletions <= COLLAPSE_AFTER_LINES}
        />
      ))}
    </div>
  );
}
