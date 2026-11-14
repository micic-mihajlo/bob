"use client";

import type { CSSProperties, ReactNode } from "react";
import type { ComparisonTableBlock } from "./DataTable";

export function ComparisonTable(props: { table: ComparisonTableBlock; renderCell?: (text: string) => ReactNode }) {
  return (
    <section className="message-data-table-scroll message-comparison-table-scroll" aria-label="Comparison table" tabIndex={0}>
      <table className="message-data-table message-comparison-table" style={{ "--message-data-table-columns": props.table.headers.length } as CSSProperties}>
        <thead>
          <tr>
            {props.table.headers.map((header, index) => (
              <th key={index} scope="col">
                {props.renderCell?.(header) ?? header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.table.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, index) => (
                <td key={index}>
                  {index === 0 ? (
                    (props.renderCell?.(cell) ?? cell)
                  ) : (
                    <span className={cell === "✓" ? "message-comparison-table-yes" : "message-comparison-table-no"}>{cell}</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
