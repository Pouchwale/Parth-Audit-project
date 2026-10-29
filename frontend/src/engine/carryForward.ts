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
// document's latest earlier one with writing on it, whatever its status: a sheet prepared and never
// touched carries nothing a person said. A page DCRS holds "as supplied" (the plant's own 2024
// calibration pages, data/seed/qcCalibrationRecords.ts, transcribed from the owner's paper) IS a
// previous page: "same should be filled automatically as per previous" — what it holds is the plant's,
// not invented (§98), so a new F/QC/12 sheet starts as the last week of the page on file, and the
// standard weights fill a line only where no earlier page exists. A sheet of one line (rowMode single)
// takes the previous sheet's LAST line — the latest calibration on a page of several weeks.
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

/** The document's latest record before `beforeISO` with writing on it — a person's in DCRS or the page on file — Live or Demo as asked. */
export function previousWrittenRecord(documentId: string, beforeISO: string, isDemo: boolean, layout: LogSheetLayout, blank: LogSheetData): RecordInstance<LogSheetData> | undefined {
  return (recordRepository.queryUnscoped({ documentId, isDemo }) as RecordInstance<LogSheetData>[])
    .filter((r) => compareISO(r.dueDate, beforeISO) < 0 && hasWriting(layout, r.data, blank))
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
    if (!written(v)) continue;
    // A calibration certificate's date (autoFill.newest, 27-Oct-2026): the later of the last sheet's and the one the
    // format starts with - dates written YYYY-MM-DD compare as text.
    const start = header[f.key] ?? "";
    header[f.key] = f.autoFill?.newest && start && String(v) < start ? start : String(v);
  }
  // A sheet whose lines start from their standards each time (F/QC/12, REQUIREMENTS §142) carries its boxes alone; its
  // lines are dated the new day, as a carried line is.
  if (layout.carryLines === false) {
    const dated = blank.rows.map((r) => {
      const row: LogSheetRow = { ...r };
      for (const c of layout.columns) if (columnKind(c) === "date") row[c.key] = dueDate;
      return row;
    });
    return { ...blank, header, rows: dated };
  }
  const allPrevious = Array.isArray(previous.rows) ? previous.rows : [];
  // A sheet of one line takes the previous sheet's last line (the latest week of a page of several); a sheet whose
  // lines the paper prints keeps the paper's count of them, and a previous sheet with another count (the format
  // changed since) carries its boxes only.
  // (A sheet that is one line unless a line is added - F/QC/12's week - is one line here too.)
  const single = layout.rowMode.kind === "single" || (layout.rowMode.kind === "free" && layout.rowMode.typicalRows === 1);
  const previousRows = single ? allPrevious.slice(-1) : allPrevious;
  const printedLines = layout.rowMode.kind !== "free" && !single;
  if (previousRows.length === 0 || (printedLines && previousRows.length !== blank.rows.length)) return { ...blank, header };
  // The last sheet's lines are a FORMER page's printed lines (layout.formerRows: F/QC/17's 600 mm page printed 50 to
  // 290 mm until 27-Oct-2026): they belong to the old paper, so its boxes are carried and its lines are not. Compared as
  // numbers ("50" is "50 mm"); master readings a person wrote over the points are not a former page's, and carry.
  const samePoint = (a: unknown, b: unknown): boolean => {
    const [x, y] = [parseFloat(String(a)), parseFloat(String(b))];
    return Number.isFinite(x) && Number.isFinite(y) ? x === y : String(a ?? "").trim() === String(b).trim();
  };
  const formerPage = (layout.formerRows ?? []).some(
    (former) => former.length === previousRows.length && former.every((starts, i) => Object.entries(starts).every(([k, v]) => samePoint(previousRows[i][k], v)))
  );
  if (formerPage) return { ...blank, header };
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
