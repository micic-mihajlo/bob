"use client";

import { useMemo } from "react";
import type { DiffLine } from "@/lib/blocks/diff";
import { highlight } from "@/lib/blocks/highlight";
import { Tokens } from "./Tokens";

const SIGN = { add: "+", del: "-", context: " " } as const;
const SPOKEN = { add: "Added: ", del: "Removed: ", context: null } as const;

export function DiffLineRow({ line, lang }: { line: DiffLine; lang: string }) {
  const tokens = useMemo(() => highlight(line.text, lang), [line.text, lang]);
  const spoken = SPOKEN[line.kind];
  return (
    <tr data-kind={line.kind}>
      <td className="blk-diff-no">{line.oldNo ?? ""}</td>
      <td className="blk-diff-no">{line.newNo ?? ""}</td>
      <td className="blk-diff-sign" aria-hidden="true">
        {SIGN[line.kind]}
      </td>
      <td className="blk-diff-text">
        {spoken ? <span className="blk-sr-only">{spoken}</span> : null}
        <Tokens tokens={tokens} />
        {line.noNewline ? <span className="blk-diff-eof">No newline at end of file</span> : null}
      </td>
    </tr>
  );
}
