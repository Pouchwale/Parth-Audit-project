import React from "react";
import type { LogHeaderField } from "../../types";
import { boxTableRows } from "../../engine/paperLayout";

/**
 * BOXES DRAWN AS THE PAPER'S TABLE (REQUIREMENTS §111): a certificate of analysis' LABEL STOCK —
 * "Material" over Face Material, Adhesive and Release Liner, on the rows Required, Tested, Type
 * Required and Observed — its Specified Size and its Minimum Gloss line, a row of boxes at a time
 * under the paper's headings. Each cell holds the record's own box (`cells`, in the layout's order;
 * with `cornerBox` the first stands in the corner, under its own label — "Coating Done :"), so what
 * is written, checked, downloaded and read back is as before. Drawn by the record's sheet and by the
 * format's designer alike.
 */
export function BoxTable({ table, cells }: { table: NonNullable<LogHeaderField["boxTable"]>; cells: React.ReactNode[] }) {
  const corner = table.cornerBox ? cells[0] : table.corner;
  const rows = boxTableRows(table, table.cornerBox ? cells.slice(1) : cells);
  // A table whose rows the paper heads has a heading column, and its corner above it.
  const headed = table.rows.length > 0 || corner !== undefined;
  const headingRow = (
    <tr>
      {headed && <th className="paper-box-table-corner">{corner ?? ""}</th>}
      {table.columns.map((c, ci) => (
        <th key={ci}>{c}</th>
      ))}
    </tr>
  );
  return (
    <div className="doc-table" style={{ overflowX: "auto" }}>
      <table className="compact paper-box-table" data-section="box-table">
        {/* A box in the corner is a box like any other: its line is a line of the table, not a heading a
            downloaded file would keep as words only (utils/documentExport.ts reads a heading row so). */}
        {!table.cornerBox && <thead>{headingRow}</thead>}
        <tbody>
          {table.cornerBox && headingRow}
          {rows.map((row, ri) => (
            <tr key={ri}>
              {headed && (
                <th scope="row" className="paper-box-table-row">
                  {table.rows[ri] ?? ""}
                </th>
              )}
              {row.map((cell, ci) => (
                <td key={ci}>{cell ?? null}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
