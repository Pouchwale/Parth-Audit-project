import type { LogSheetData, RecordInstance } from "../../types";
import { EQUIPMENT_LIST_ROWS, LUX_METER, LUX_REV00_READINGS, LUX_REV01_READINGS } from "./maintenanceLayouts";

// THE MAINTENANCE PAGES SUPPLIED FILLED IN (REQUIREMENTS §74), on file as LIVE
// records (isDemo: false) the way the Quality Control pages are
// (qcRegisterRecords.ts), so the formats open with the plant's own entries.
//
// Read from the supplied pages, cell for cell, and nothing else invented:
//   F/MNT/01  List of Equipments & Utilities — the 43 machines. The page
//             carries no date; it names a machine made in June 2025 (M-85), so
//             it is at least that recent, and it is filed under the day it was
//             supplied, 24.09.2026. Row M-68 stays as printed — one column out
//             of step — for the department to confirm.
//   F/MNT/11  Lux Level Measurement Record, TWICE: the 12.08.2025 round on the
//             current Rev 01 (one Lux Level, 26 areas), and the 11.05.2024
//             round on the superseded Rev 00 (Day and Night, 19 areas). The
//             older record is PINNED to revision "00" (formatRevision), so it
//             is drawn and headed with the layout it was actually written on —
//             redrawn on Rev 01 its night readings would vanish and six of its
//             lines would be blank.
//
// F/MNT/03's January marks carry no year and stay the format's specimen, not a
// record (maintenanceLayouts.ts). The other five formats were supplied blank.

const ON_FILE = "Maintenance (sheet as supplied, 24-Sep-2026)";
const SEEDED_AT = "2026-09-24T00:00:00.000Z";

function seeded(id: string, documentId: string, dueDate: string, data: LogSheetData, formatRevision?: string): RecordInstance<LogSheetData> {
  return {
    id,
    documentId,
    periodKey: `${documentId}:${dueDate}`,
    dueDate,
    status: "Verified",
    isDemo: false,
    data,
    ...(formatRevision ? { formatRevision } : {}),
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
    submittedBy: ON_FILE,
    submittedAt: SEEDED_AT,
    verifiedBy: ON_FILE,
    verifiedAt: SEEDED_AT,
  };
}

/** The Equipment Master's record: engine/equipmentMaster.ts reads the machines from it. */
export const SEED_MNT_EQUIPMENT_LIST = seeded("seed-mnt-equipment-list", "mnt-equipment-list", "2026-09-24", {
  header: {},
  rows: EQUIPMENT_LIST_ROWS.map((machine, i) => ({ id: `m${String(i + 1).padStart(2, "0")}`, ...machine })),
});

export const SEED_MNT_LUX_2025 = seeded("seed-mnt-lux-2025", "mnt-lux-level", "2025-08-12", {
  header: { ...LUX_METER },
  rows: LUX_REV01_READINGS.map(([parameter, luxLevel], i) => ({ id: `a${i + 1}`, parameter, measurementDate: "2025-08-12", luxLevel })),
});

export const SEED_MNT_LUX_2024 = seeded(
  "seed-mnt-lux-2024",
  "mnt-lux-level",
  "2024-05-11",
  {
    header: { ...LUX_METER },
    rows: LUX_REV00_READINGS.map(([parameter, luxDay, luxNight], i) => ({ id: `a${i + 1}`, parameter, measurementDate: "2024-05-11", luxDay, luxNight })),
  },
  "00"
);

export const SEED_MNT_RECORDS: RecordInstance<LogSheetData>[] = [SEED_MNT_EQUIPMENT_LIST, SEED_MNT_LUX_2025, SEED_MNT_LUX_2024];
