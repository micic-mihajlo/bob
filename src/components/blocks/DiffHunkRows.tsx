import type { DiffHunk } from "@/lib/blocks/diff";
import { DiffLineRow } from "./DiffLineRow";

export function DiffHunkRows({ hunk, lang }: { hunk: DiffHunk; lang: string }) {
  return (
    <tbody>
      <tr className="blk-diff-hunk">
        <td colSpan={4}>{hunk.header}</td>
      </tr>
      {hunk.lines.map((line, index) => (
        <DiffLineRow key={index} line={line} lang={lang} />
      ))}
    </tbody>
  );
}
