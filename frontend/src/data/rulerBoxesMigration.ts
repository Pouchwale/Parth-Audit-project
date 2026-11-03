// F/QC/17'S NEW STARTING BOXES IN THE SHEETS ALREADY CREATED (the owner, 30-10-26: "the above changes should be applied to
// new as well as the document that is already created both").
//
// From 30-10-26 a new sheet of either scale (600 mm and 300 mm) starts with the master's Calibration report number as
// CAL/LPI/GP-23/23 (MASTER_REPORT_NO), and the ruler's Make, Serial number, Range and Least count empty for the person to
// write (data/seed/qcRulerVerificationLayouts.ts). A sheet created before that still held the old start: an empty report
// number, and Ajanta, the page's serial, its range and 1 mm. Now a Live sheet still open (Scheduled, Due, In Progress or
// sent back; never one handed in, verified or reopened for correction) and created before the change takes:
//   - CAL/LPI/GP-23/23 where its report number is empty (one a person wrote is kept);
//   - an empty box where the ruler's four boxes still hold those old starting values (anything else written is kept);
// with ONE line in its history saying so. That line is also what makes this happen once per sheet: a sheet that has it
// is never touched again, so a person who writes Ajanta back in keeps it. Only a sheet the signed-in person may fill is
// changed from their browser (REQUIREMENTS §96). Run on every start by data/bootstrap.ts: nothing to do, nothing written.
import type { LogSheetData, RecordInstance } from "../types";
import { recordRepository } from "./repositories/recordRepository";
import { FORMER_MASTER_MAKE, FORMER_MASTER_REPORT_NO, MASTER_MAKE, MASTER_REPORT_NO, MASTER_REPORT_PREFIX, RULER_LEAST_COUNT, RULER_SCALES, rulerRangeOf } from "./seed/qcRulerVerificationLayouts";
import { numberOfYears } from "../engine/carryForward";
import { appendHistory, diffRecordData, historyOf, makeEntry } from "../engine/recordHistory";
import { mayWriteRecordsOf } from "../engine/departmentScope";

/** What each changed sheet's history says. */
export const RULER_BOXES_NOTE =
  "F/QC/17's new starting boxes (the owner, 30-10-26): the master's Calibration report number CAL/LPI/GP-23/23 written in where empty, and the ruler's Make, Serial number, Range and Least count cleared where they still held the old starting values, for the person to write";

/** Sheets created from this moment on already start the new way. */
export const RULER_BOXES_CHANGED_AT = "2026-10-30T09:35:00.000Z";

const OPEN: ReadonlySet<string> = new Set(["Scheduled", "Due", "In Progress", "Rejected"]);

/** Gives the open F/QC/17 sheets created before the change the new starting boxes; returns how many sheets changed. */
export function alignRulerBoxes(): number {
  const updates: RecordInstance[] = [];
  for (const r of recordRepository.snapshot()) {
    const scale = RULER_SCALES.find((s) => s.documentId === r.documentId);
    if (!scale || r.isDemo || r.correction || !OPEN.has(r.status)) continue;
    if (!(r.createdAt < RULER_BOXES_CHANGED_AT) || !mayWriteRecordsOf(r.documentId)) continue;
    if (historyOf(r).some((e) => e.note?.includes(RULER_BOXES_NOTE))) continue;
    const d = r.data as LogSheetData | undefined;
    if (!d?.header) continue;
    // The values the four boxes started with before 30-10-26.
    // (Range and Least count are no longer cleared: they start with the page's own again since round 2 below.)
    const oldStart: Record<string, string> = { make: "Ajanta", serialNo: scale.serialNo };
    const header: Record<string, string> = { ...d.header };
    let changed = false;
    if (String(header.masterCalibrationReportNo ?? "").trim() === "") {
      header.masterCalibrationReportNo = MASTER_REPORT_NO;
      changed = true;
    }
    for (const [key, was] of Object.entries(oldStart)) {
      if (String(header[key] ?? "").trim() === was) {
        header[key] = "";
        changed = true;
      }
    }
    if (!changed) continue;
    const data: LogSheetData = { ...d, header };
    const entry = appendHistory({ ...r, history: [] }, makeEntry("edited", "System", { changes: diffRecordData(r.data, data), note: RULER_BOXES_NOTE })).history![0];
    updates.push({ ...r, data, history: [...historyOf(r), entry] });
  }
  if (updates.length) recordRepository.upsertMany(updates);
  return updates.length;
}

// ROUND 2 (the owner, later on 30-10-26: "only the first 2 details should be manual and range of qc-17 (300) should be
// 0-300mm and qc-17(600) should be 0-600 mm and the least count should be 1mm ... the name should be kristeel instead of
// kristeen ... the calibration report number should be 26/27 instead of 23/23 ... according to the calibration date year
// and calibration due date year"). A Live sheet still open and created before this change takes, once:
//   - Range: the page's own (0-600 mm, 0-300 mm) where it is empty or the 600 mm page's former "0-600mm";
//   - Least count: 1 mm where it is empty;
//   - Master Make: Kristeel where it reads Kristeen;
//   - the master's report number: the one its own calibration date and due date give, where it is empty or CAL/LPI/GP-23/23;
// with one line in its history. Make and Serial number are left as they are; anything else a person wrote is kept.
export const RULER_BOXES_NOTE_2 =
  "F/QC/17's starting boxes (the owner, 30-10-26, round 2): Range and Least count written in where empty, Master Make Kristeel for Kristeen, and the master's Calibration report number from its calibration date and due date years where empty or CAL/LPI/GP-23/23";
export const RULER_BOXES_CHANGED_AT_2 = "2026-10-30T10:45:00.000Z";

export function alignRulerBoxesRound2(): number {
  const updates: RecordInstance[] = [];
  for (const r of recordRepository.snapshot()) {
    const scale = RULER_SCALES.find((s) => s.documentId === r.documentId);
    if (!scale || r.isDemo || r.correction || !OPEN.has(r.status)) continue;
    if (!(r.createdAt < RULER_BOXES_CHANGED_AT_2) || !mayWriteRecordsOf(r.documentId)) continue;
    if (historyOf(r).some((e) => e.note?.includes(RULER_BOXES_NOTE_2))) continue;
    const d = r.data as LogSheetData | undefined;
    if (!d?.header) continue;
    const header: Record<string, string> = { ...d.header };
    const now = (key: string) => String(header[key] ?? "").trim();
    let changed = false;
    const set = (key: string, value: string) => {
      if (value && header[key] !== value) {
        header[key] = value;
        changed = true;
      }
    };
    if (now("range") === "" || now("range") === scale.range.trim()) set("range", rulerRangeOf(scale));
    if (now("leastCount") === "") set("leastCount", RULER_LEAST_COUNT);
    if (now("masterMake") === FORMER_MASTER_MAKE) set("masterMake", MASTER_MAKE);
    if (now("masterCalibrationReportNo") === "" || now("masterCalibrationReportNo") === FORMER_MASTER_REPORT_NO)
      set("masterCalibrationReportNo", numberOfYears(MASTER_REPORT_PREFIX, header.masterCalibrationDate, header.masterCalibrationDueDate) || MASTER_REPORT_NO);
    if (!changed) continue;
    const data: LogSheetData = { ...d, header };
    const entry = appendHistory({ ...r, history: [] }, makeEntry("edited", "System", { changes: diffRecordData(r.data, data), note: RULER_BOXES_NOTE_2 })).history![0];
    updates.push({ ...r, data, history: [...historyOf(r), entry] });
  }
  if (updates.length) recordRepository.upsertMany(updates);
  return updates.length;
}
