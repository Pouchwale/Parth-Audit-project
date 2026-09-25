import type { LogSheetData, LogSheetRow } from "../types";

// F/SYS/07'S SUM AND AUDIT FREQUENCY ARE WORKED OUT, NOT TYPED (REQUIREMENTS
// §76). The Internal Audit Risk Assessment prints, for each section of the
// standard, the non-conformities the internal audits found (IQA NC) and those
// the last external audit found (External NCs), then their Sum and the Audit
// frequency the Sum gives by the criteria printed beside the list:
//
//     Sum of IQA + external audit NCs     Audit Frequency
//     < = 4                               Once / Year
//     5 to 15                             Twice / Year
//     > = 16                              3 times / Year
//
// Both are arithmetic on the two figures, so they are worked out here, the
// way the breakdown register works out its minutes (engine/maintenanceCalc.ts)
// — the same whoever wrote the figures: the PSTL, Mitra or sample data. The
// form's other note, that every clause is audited at least twice a year
// whatever the rating, is printed beside the list and left to be read there:
// the column holds what the criteria give.
//
// On the paper the four figures are one merged cell per section, and Excel
// keeps a merged cell's value in its first cell, so a section's figures sit on
// its first line (data/seed/sysInternalAuditLayouts.ts); a line with neither
// figure written works out to nothing.
//
// This file imports no seed layout, so the layout may import it without an
// import cycle.

/** The document id of F/SYS/07. */
export const AUDIT_RISK_ID = "sys-audit-risk";

/** A written count, or null when nothing (or nothing readable) is written. */
function count(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (text === "") return null;
  const n = Number(text);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** The Audit frequency the printed criteria give a Sum. */
export function auditFrequency(sum: number): string {
  if (sum >= 16) return "3 times / Year";
  if (sum >= 5) return "Twice / Year";
  return "Once / Year";
}

/**
 * One line's two formula cells: Sum = IQA NC + External NCs and its Audit
 * frequency, both "" while neither figure is written. A figure left blank
 * beside a written one counts as none found.
 */
export function auditRiskCells(row: Record<string, string | number | null>): Record<string, string> {
  const iqa = count(row.iqaNc);
  const external = count(row.externalNc);
  if (iqa === null && external === null) return { sum: "", frequency: "" };
  const sum = (iqa ?? 0) + (external ?? 0);
  return { sum: String(sum), frequency: auditFrequency(sum) };
}

/** The record's data with every formula cell worked out; any other document's data is returned as it is. */
export function withAuditRisk<T>(documentId: string | undefined, data: T): T {
  if (documentId !== AUDIT_RISK_ID) return data;
  const d = data as unknown as LogSheetData | undefined;
  if (!d || !Array.isArray(d.rows)) return data;
  // A line whose figures are unchanged is handed back as it was, so the sheet
  // redraws only the line that changed (components/records/LogSheetRecordView.tsx SheetRow).
  const rows: LogSheetRow[] = d.rows.map((r) => {
    const next = { ...r, ...auditRiskCells(r) };
    return Object.keys(next).every((k) => next[k] === r[k]) ? r : next;
  });
  // Nothing changed is nothing to re-render (engine/maintenanceCalc.ts).
  const same = rows.every((r, i) => r === d.rows[i]);
  return same ? data : ({ ...d, rows } as unknown as T);
}
