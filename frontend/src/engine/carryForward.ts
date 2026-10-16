import type { LogSheetData, LogSheetLayout, LogSheetRow, RecordInstance } from "../types";
import { recordRepository } from "../data/repositories/recordRepository";
import { blankLogRow } from "./recordDefaults";
import { boxKind, columnKind, isPlaceholder } from "./observations";
import { compareISO } from "../utils/date";
import { generateId } from "../utils/id";

// THE NEW SHEET IS WRITTEN AS THE LAST ONE WAS (REQUIREMENTS §117). The owner, 16-Oct-2026, on F/QC/17:
// "once I have filled the data, same should be filled automatically as per previous & I will edit
// whichever filled reqd editing" — and the same for QC's calibration records of their kind (F/QC/11,
// F/QC/12), whose layout says `carryForwardAll`.
//
// What is carried: every box above and below the grid and every cell of every line of the document's
// previous record — the person's own earlier entries, so nothing invented (§98) — and every one of
// them stays editable on the new sheet. What is not: a box or column answered with the record's day
// (it takes the new day), a box the paper prints (it stays the paper's words), and a cell worked out
// from the others (it is worked out again by engine/computedCells.ts). The previous record is the
// document's latest earlier one a person wrote on, whatever its status: a sheet prepared and never
// touched carries nothing a person said.
//
// Two paths start a new sheet, and both come here: a record started by hand, by Mitra or by the phone
// (engine/recordCrud.ts createRecordForDocument) and the morning prepare of a scheduled one
// (engine/knownParts.ts). Demo Mode's fill (engine/autoFill.ts) has its own carry and is not changed.

const written = (v: unknown): boolean => v !== null && v !== undefined && String(v).trim() !== "" && !isPlaceholder(v);

/** A person wrote on this sheet: something stands in a box or a cell that the blank sheet does not hold. */
export function hasWriting(layout: LogSheetLayout, data: Partial<LogSheetData> | undefined, blank: LogSheetData): boolean {
  if (!data) return false;
  const boxes = [...layout.headerFields, ...(layout.footerFields ?? [])];
  if (boxes.some((f) => boxKind(f, layout) !== "computed" && written(data.header?.[f.key]) && data.header?.[f.key] !== blank.header[f.key])) return true;
  const rows = Array.isArray(data.rows) ? data.rows : [];
  return rows.some((r, i) =>
    layout.columns.some((c) => {
      const kind = columnKind(c);
      return kind !== "computed" && kind !== "date" && written(r[c.key]) && r[c.key] !== blank.rows[i]?.[c.key];
    })
  );
}

/** A paper DCRS transcribed as supplied (the 2024 calibration pages, data/seed/qcCalibrationRecords.ts): nobody wrote it here. */
const transcribed = (r: RecordInstance): boolean => /as supplied/i.test(r.submittedBy ?? "");

/** The document's latest record before `beforeISO` that a person wrote on in DCRS, Live or Demo as asked. */
export function previousWrittenRecord(documentId: string, beforeISO: string, isDemo: boolean, layout: LogSheetLayout, blank: LogSheetData): RecordInstance<LogSheetData> | undefined {
  return (recordRepository.queryUnscoped({ documentId, isDemo }) as RecordInstance<LogSheetData>[])
    .filter((r) => compareISO(r.dueDate, beforeISO) < 0 && !transcribed(r) && hasWriting(layout, r.data, blank))
    .sort((a, b) => compareISO(b.dueDate, a.dueDate))[0];
}

/**
 * The new sheet's data: `blank` (the paper's blank, its printed boxes and standards written) with the
 * previous sheet's entries over it, dated `dueDate`. The computed cells are left for computedCells.ts.
 */
export function carriedFrom(layout: LogSheetLayout, previous: LogSheetData, blank: LogSheetData, dueDate: string): LogSheetData {
  const header: Record<string, string> = { ...blank.header };
  for (const f of [...layout.headerFields, ...(layout.footerFields ?? [])]) {
    if (typeof f.printed === "string") continue;
    const kind = boxKind(f, layout);
    if (kind === "date") {
      header[f.key] = dueDate;
      continue;
    }
    if (kind === "computed") continue;
    const v = previous.header?.[f.key];
    if (written(v)) header[f.key] = String(v);
  }
  const previousRows = Array.isArray(previous.rows) ? previous.rows : [];
  // A sheet whose lines the paper prints keeps the paper's count of them; a previous sheet with another count (the
  // format changed since) carries its boxes only.
  const printedLines = layout.rowMode.kind !== "free";
  if (previousRows.length === 0 || (printedLines && previousRows.length !== blank.rows.length)) return { ...blank, header };
  const rows: LogSheetRow[] = previousRows.map((p, i) => {
    const row: LogSheetRow = blank.rows[i] ? { ...blank.rows[i], id: generateId("row") } : blankLogRow(layout);
    for (const c of layout.columns) {
      const kind = columnKind(c);
      if (kind === "date") {
        row[c.key] = dueDate;
        continue;
      }
      if (kind === "computed") continue;
      // A printed line's own words stay the paper's; a standard (F/QC/12's weights) and every entry are the person's to carry.
      if (c.fixed || c.autoFill?.lineNumber) continue;
      const v = p[c.key];
      if (written(v)) row[c.key] = v;
    }
    return row;
  });
  return { ...blank, header, rows };
}
