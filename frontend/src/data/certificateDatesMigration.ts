// THE CALIBRATION CERTIFICATES' DATES IN THE SHEETS ALREADY OPEN (the owner, 28-Oct-2026: "you have not added date in
// format which i have given you in previous task ... in those document where you have not added till now").
//
// REQUIREMENTS §129 started every NEW F/QC/11, F/QC/12 and F/QC/17 sheet with the dates the owner gave (autoFill.newest
// boxes: 21-09-26 and 20-09-27; the ruler's 23-09-26 and 22-09-27). A sheet made before - the week's, the month's, a draft
// somebody had begun - still held its old date, F/QC/12's Calibration Expiry 27-08-2024 among them. Now a Live sheet still
// open (Scheduled, Due, In Progress or sent back, never one handed in, verified or reopened for correction) takes, in each
// such box, the later of what it holds and the certificate's date, with ONE line in its history saying so; a later date a
// person wrote is kept. Only a sheet the signed-in person may fill is changed from their browser (REQUIREMENTS §96). Run
// on every start by data/bootstrap.ts: nothing to do, nothing written.
//
// AND THE PAGE'S OWN LINES (the owner, 28-Oct-2026, F/QC/17's 600 mm page: "master calibration reading is totally
// wrong"; its last point is 490 mm, as printed, REQUIREMENTS §132). An open sheet still on a former page's printed
// lines (LogSheetLayout.formerRows: 50 to 290 mm, or 100 to 590 mm) with nothing written on them takes the page's own
// lines, in the same history line; lines a person wrote a reading on are theirs and are left as they are.
import type { LogSheetData, LogSheetLayout, RecordInstance } from "../types";
import { recordRepository } from "./repositories/recordRepository";
import { getLogSheetLayout } from "./seed/logSheetLayouts";
import { appendHistory, diffRecordData, historyOf, makeEntry } from "../engine/recordHistory";
import { mayWriteRecordsOf } from "../engine/departmentScope";
import { columnKind } from "../engine/observations";

/** What each changed sheet's history says. */
export const CERTIFICATE_NOTE = "The calibration certificates' dates the owner gave (27 and 28-Oct-2026) written in where the sheet held an earlier date (REQUIREMENTS §129, §132)";
/** ...and when a box the sheet was made without (F/QC/11's row, taken away 28 to 30-Oct-2026) holds them now. */
export const ROW_BACK_NOTE = "The certificate's dates written in the I. Calibration Date / Due Date row, which this sheet was made without while the row was taken away (28 to 30-Oct-2026; back on the owner's word, REQUIREMENTS §147)";
/** ...and when its lines are the page's own again. */
export const PAGE_LINES_NOTE = "The page's own printed lines as updated (the owner, 28-Oct-2026) written in where the sheet held a former page's, nothing written on them (REQUIREMENTS §132)";

const OPEN: ReadonlySet<string> = new Set(["Scheduled", "Due", "In Progress", "Rejected"]);

/** Brings the open sheets' certificate dates up to the certificate's, and a former page's untouched lines to the page's own; returns how many sheets changed. */
export function alignCertificateDates(): number {
  const updates: RecordInstance[] = [];
  for (const r of recordRepository.snapshot()) {
    // An open sheet: every certificate box raised to the certificate's. A sheet handed in, verified or under correction:
    // only a box it was made WITHOUT (F/QC/11's row while it was taken away, §147) - what it holds stays as handed in.
    if (r.isDemo) continue;
    const open = OPEN.has(r.status) && !r.correction;
    const layout = getLogSheetLayout(r.documentId);
    const boxes = layout?.headerFields.filter((f) => f.autoFill?.newest && f.autoFill.default) ?? [];
    if (!layout || (boxes.length === 0 && !layout.formerRows) || !mayWriteRecordsOf(r.documentId)) continue;
    const d = r.data as LogSheetData | undefined;
    if (!d?.header) continue;
    let header: Record<string, string> | null = null;
    let rowBack = false;
    for (const f of boxes) {
      const want = String(f.autoFill!.default);
      const absent = !(f.key in d.header);
      if (!open && !absent) continue;
      if (absent) rowBack = true;
      const have = String(d.header[f.key] ?? "").trim();
      // Dates are written YYYY-MM-DD and compare as text; a later one (the next certificate) is kept.
      if (have && have >= want) continue;
      header = header ?? { ...d.header };
      header[f.key] = want;
    }
    const rows = open ? pageLinesAgain(layout, d.rows) : null;
    if (!header && !rows) continue;
    const data: LogSheetData = { ...d, ...(header ? { header } : {}), ...(rows ? { rows } : {}) };
    const note = [header ? (rowBack ? ROW_BACK_NOTE : CERTIFICATE_NOTE) : "", rows ? PAGE_LINES_NOTE : ""].filter(Boolean).join(". ");
    const entry = appendHistory({ ...r, history: [] }, makeEntry("edited", "System", { changes: diffRecordData(r.data, data), note })).history![0];
    updates.push({ ...r, data, history: [...historyOf(r), entry] });
  }
  if (updates.length) recordRepository.upsertMany(updates);
  return updates.length;
}

/** A former page's printed lines with nothing written on them: the page's own lines now (their ids kept); else null. */
function pageLinesAgain(layout: LogSheetLayout, rows: LogSheetData["rows"] | undefined): LogSheetData["rows"] | null {
  const mode = layout.rowMode;
  if (mode.kind !== "fixedRows" || !Array.isArray(rows) || rows.length !== mode.rows.length) return null;
  const former = (layout.formerRows ?? []).find((page) => page.length === rows.length && page.every((starts, i) => Object.entries(starts).every(([k, v]) => String(rows[i][k] ?? "") === String(v))));
  if (!former) return null;
  const starts = new Set(former.flatMap((line) => Object.keys(line)));
  const written = rows.some((row) =>
    layout.columns.some((c) => {
      const kind = columnKind(c);
      const v = row[c.key];
      return kind !== "computed" && kind !== "date" && !starts.has(c.key) && v !== null && v !== undefined && String(v).trim() !== "";
    })
  );
  return written ? null : rows.map((row, i) => ({ ...row, ...mode.rows[i] }));
}
