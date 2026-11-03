import type { LogSheetData, RecordInstance } from "../types";
import { recordRepository } from "./repositories/recordRepository";
import { appendHistory, diffRecordData, historyOf, makeEntry } from "../engine/recordHistory";
import { mayWriteRecordsOf } from "../engine/departmentScope";
import { untouchedByPeople } from "../engine/calendarMigration";

// F/HR/19 OPENS AT YES ON EVERY POINT, ON THE SHEETS ALREADY MADE TOO (REQUIREMENTS §170; the owner, 3-Nov-2026:
// "whenever HR opens any new record the answer of all those questions present in that format will be Yes by default,
// but make that editable"). A new sheet has started at Yes since §165 - but the month's sheet the calendar had already
// made (or the morning prepare had already filled) before that still held the earlier answers (§162's No on the
// handful of points asked the other way round, or nothing), and that is the sheet HR opens as "new" for the month.
//
// So at every start, as §146 does for F/QC/12's weights: every open F/HR/19 sheet nobody has touched (data/
// calendarMigration.ts untouchedByPeople: made or prepared, and nothing written since) has every point's Compliance
// answered Yes, with a line in its history. A sheet a person has written on, handed in, verified or sent back is left
// exactly as it is: the answer is theirs. Runs again and finds nothing to do.

export const GMP_DOC_ID = "hr-gmp-checklist";

/** What each changed sheet's history says. */
export const GMP_YES_NOTE = "Every point answered Yes to start with, as the format opens since 3-Nov-2026 (REQUIREMENTS §170); each answer is yours to change";

const OPEN: ReadonlySet<string> = new Set(["Scheduled", "Due", "In Progress"]);

/** The sheet's lines with every point at Yes; the same lines when they are already. */
export function withEveryPointYes(rows: LogSheetData["rows"]): LogSheetData["rows"] {
  let changed = false;
  const next = rows.map((row) => {
    if (!("compliance" in row) || String(row.compliance ?? "") === "Yes") return row;
    changed = true;
    return { ...row, compliance: "Yes" };
  });
  return changed ? next : rows;
}

/** Every open, untouched F/HR/19 sheet answered Yes on every point; returns how many sheets changed. */
export function gmpYesOnOpenSheets(): number {
  if (!mayWriteRecordsOf(GMP_DOC_ID)) return 0;
  const updates: RecordInstance[] = [];
  for (const r of recordRepository.snapshot()) {
    if (r.documentId !== GMP_DOC_ID || r.isDemo || r.correction || !OPEN.has(r.status) || !untouchedByPeople(r)) continue;
    const d = r.data as LogSheetData | undefined;
    if (!d || !Array.isArray(d.rows)) continue;
    const rows = withEveryPointYes(d.rows);
    if (rows === d.rows) continue;
    const data: LogSheetData = { ...d, rows };
    const entry = appendHistory({ ...r, history: [] }, makeEntry("edited", "System", { changes: diffRecordData(r.data, data), note: GMP_YES_NOTE })).history![0];
    updates.push({ ...r, data, history: [...historyOf(r), entry] });
  }
  if (updates.length) recordRepository.upsertMany(updates);
  return updates.length;
}
