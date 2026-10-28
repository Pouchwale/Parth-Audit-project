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
import type { LogSheetData, RecordInstance } from "../types";
import { recordRepository } from "./repositories/recordRepository";
import { getLogSheetLayout } from "./seed/logSheetLayouts";
import { appendHistory, diffRecordData, historyOf, makeEntry } from "../engine/recordHistory";
import { mayWriteRecordsOf } from "../engine/departmentScope";

/** What each changed sheet's history says. */
export const CERTIFICATE_NOTE = "The calibration certificate's dates the owner gave (27-Oct-2026) written in where the sheet held an earlier date (REQUIREMENTS §129)";

const OPEN: ReadonlySet<string> = new Set(["Scheduled", "Due", "In Progress", "Rejected"]);

/** Brings the open sheets' certificate dates up to the certificate's; returns how many sheets changed. */
export function alignCertificateDates(): number {
  const updates: RecordInstance[] = [];
  for (const r of recordRepository.snapshot()) {
    if (r.isDemo || r.correction || !OPEN.has(r.status)) continue;
    const boxes = getLogSheetLayout(r.documentId)?.headerFields.filter((f) => f.autoFill?.newest && f.autoFill.default) ?? [];
    if (boxes.length === 0 || !mayWriteRecordsOf(r.documentId)) continue;
    const d = r.data as LogSheetData | undefined;
    if (!d?.header) continue;
    let header: Record<string, string> | null = null;
    for (const f of boxes) {
      const want = String(f.autoFill!.default);
      const have = String(d.header[f.key] ?? "").trim();
      // Dates are written YYYY-MM-DD and compare as text; a later one (the next certificate) is kept.
      if (have && have >= want) continue;
      header = header ?? { ...d.header };
      header[f.key] = want;
    }
    if (!header) continue;
    const data: LogSheetData = { ...d, header };
    const entry = appendHistory({ ...r, history: [] }, makeEntry("edited", "System", { changes: diffRecordData(r.data, data), note: CERTIFICATE_NOTE })).history![0];
    updates.push({ ...r, data, history: [...historyOf(r), entry] });
  }
  if (updates.length) recordRepository.upsertMany(updates);
  return updates.length;
}
