// F/MNT/11 ROUNDS WRITTEN ON REV 01, PINNED TO IT (REQUIREMENTS §316).
//
// The owner made the page of 15.10.2025 F/MNT/11's format on 24-Nov-2026: "(00/01.12.2021)", its 26 areas as it lists
// them. A round already on file that was written on Rev 01 (01/15.12.2024) - the 12.08.2025 page, and any written on the
// app since - keeps the page it was written on: pinned to "01" (RecordInstance.formatRevision), it is drawn, checked and
// headed with Rev 01's layout and its own area names, never redrawn on the new page. A Rev 01 round is known by its areas:
// Rev 01 lists "Ink store - Ground floor", which the new page does not. Run again it changes nothing.

import type { LogSheetData, RecordInstance } from "../types";
import { recordRepository } from "./repositories/recordRepository";
import { historyOf, makeEntry } from "../engine/recordHistory";
import { mayWriteRecordsOf } from "../engine/departmentScope";

const LUX_ID = "mnt-lux-level";
const REV01_ONLY_AREA = "ink store - ground floor";
export const LUX_REV01_PIN_NOTE = "Written on F/MNT/11 Rev 01 (01/15.12.2024): kept on that page when the owner's page of 15.10.2025 became the format (REQUIREMENTS §316)";

const areaOf = (v: unknown): string => String(v ?? "").replace(/\s+/g, " ").trim().toLowerCase();

export function pinLuxRoundsWrittenOnRev01(): number {
  if (!mayWriteRecordsOf(LUX_ID)) return 0;
  const updates: RecordInstance[] = [];
  for (const r of recordRepository.queryUnscoped({ documentId: LUX_ID })) {
    if (r.formatRevision) continue;
    const rows = (r.data as LogSheetData | undefined)?.rows;
    if (!Array.isArray(rows) || !rows.some((row) => areaOf(row?.parameter) === REV01_ONLY_AREA)) continue;
    const history = r.history && r.history.length > 0 ? r.history : historyOf(r);
    updates.push({ ...r, formatRevision: "01", history: [...history, makeEntry("edited", "System", { note: LUX_REV01_PIN_NOTE })] });
  }
  if (updates.length > 0) recordRepository.upsertMany(updates);
  return updates.length;
}
