import type { DiffLine } from "@/lib/client/diff";

/** Past this, a file shows a note instead of more rows, so one huge file can't stall the panel. */
const MAX_LINES = 1500;

const SIGN: Record<DiffLine["kind"], string> = { add: "+", del: "−", context: " ", hunk: "", note: "" };

export function DiffLines({ lines }: { lines: readonly DiffLine[] }) {
  if (lines.length === 0) return <p className="diff-empty">No line changes, only the file mode or name.</p>;
  const shown = lines.slice(0, MAX_LINES);
  return (
    <table className="diff-table">
      <tbody>
        {shown.map((line, index) =>
          line.kind === "hunk" || line.kind === "note" ? (
            <tr key={index} className="diff-row" data-kind={line.kind}>
              <td className="diff-meta" colSpan={3}>
                {line.text}
              </td>
            </tr>
          ) : (
            <tr key={index} className="diff-row" data-kind={line.kind}>
              <td className="diff-num">{line.oldNumber ?? ""}</td>
              <td className="diff-num">{line.newNumber ?? ""}</td>
              <td className="diff-code">
                <span className="diff-sign" aria-hidden="true">
                  {SIGN[line.kind]}
                </span>
                <span className="sr-only">{line.kind === "add" ? "Added: " : line.kind === "del" ? "Removed: " : ""}</span>
                {line.text}
              </td>
            </tr>
          ),
        )}
        {lines.length > MAX_LINES ? (
          <tr className="diff-row" data-kind="note">
            <td className="diff-meta" colSpan={3}>
              {lines.length - MAX_LINES} more lines not shown.
            </td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}
