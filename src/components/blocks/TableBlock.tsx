"use client";

import { useMemo } from "react";
import { parseInline } from "@/lib/blocks/inline";
import { isComparison, tableToCsv } from "@/lib/blocks/table";
import type { TableBlock as TableData } from "@/lib/blocks/types";
import { CopyButton } from "./CopyButton";
import { InlineView } from "./InlineView";
import { TableMark } from "./TableMark";

export function TableBlock({ table }: { table: TableData }) {
  const comparison = useMemo(() => isComparison(table), [table]);
  const rows = table.rows.length;

  return (
    <figure className="blk-table" data-comparison={comparison ? "" : undefined}>
      <div className="blk-table-scroll" tabIndex={0} role="region" aria-label="Table">
        <table>
          <thead>
            <tr>
              {table.header.map((cell, column) => (
                <th key={column} scope="col" data-align={table.align[column] ?? undefined}>
                  <InlineView nodes={parseInline(cell)} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, column) =>
                  column === 0 && comparison ? (
                    <th key={column} scope="row">
                      <InlineView nodes={parseInline(cell)} />
                    </th>
                  ) : (
                    <td key={column} data-align={table.align[column] ?? undefined}>
                      {comparison ? <TableMark cell={cell} /> : <InlineView nodes={parseInline(cell)} />}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <figcaption className="blk-table-footer">
        <span>
          {rows} {rows === 1 ? "row" : "rows"}
        </span>
        <CopyButton text={() => tableToCsv(table)} label="Copy as CSV" />
      </figcaption>
    </figure>
  );
}
