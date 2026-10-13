import React from "react";
import type { ReferenceTable } from "../../types";

/**
 * A TABLE THE PAPER PRINTS IN ITS OWN PLACE AMONG THE BOXES, drawn open on the sheet and in its print
 * (REQUIREMENTS §111): the certificates of analysis' TOLERANCE, headed as the paper heads it, between
 * the FINISHING boxes and the notes; F/QC/25's letterhead, three cells with no title and no heading row
 * (`untitled`, part 4), each cell's lines as the paper breaks them. Never filled in, never stored. Drawn
 * by the record's sheet and by the format's designer alike.
 */
export function PrintedTable({ table }: { table: ReferenceTable }) {
  return (
    <div className="mb-3" data-section="printed-table" data-table={table.title}>
      {!table.untitled && <p className="text-sm font-semibold mb-1">{table.title}</p>}
      <div className="doc-table" style={{ overflowX: "auto" }}>
        <table className="compact">
          {table.columns.length > 0 && (
            <thead>
              <tr>
                {table.columns.map((c, ci) => (
                  <th key={ci}>{c}</th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {table.rows.map((r, ri) => (
              <tr key={ri}>
                {r.map((cell, ci) => (
                  <td key={ci} className="text-xs" style={{ verticalAlign: "top", whiteSpace: "pre-line" }}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
