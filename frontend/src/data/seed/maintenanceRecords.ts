import type { LogSheetData, RecordInstance } from "../../types";
import { EQUIPMENT_LIST_2026_09_29_ROWS, EQUIPMENT_LIST_ROWS, LUX_METER, LUX_REV00_READINGS, LUX_REV01_READINGS } from "./maintenanceLayouts";

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
//   F/MNT/01  AGAIN, the full list supplied on 29-Sep-2026 (REQUIREMENTS §82):
//             the Flexo and Pouch sheets, 68 machines, as a record of its own
//             beside the 24-Sep one, which stays as it was.
//
// F/MNT/03's January marks carry no year and stay the Rev 00 specimen, not a
// record (maintenanceLayouts.ts). The other formats were supplied blank. The
// round of 15.10.2025 on F/MNT/11 fits neither of its layouts and is shown as
// supplied, not filed (§82). The made-up sample PM dates are
// maintenanceSampleRecords.ts's, never these.

const ON_FILE = "Maintenance (sheet as supplied, 24-Sep-2026)";
const SEEDED_AT = "2026-09-24T00:00:00.000Z";
const ON_FILE_29_SEP = "Maintenance (sheet as supplied, 29-Sep-2026)";

function seededOn(id: string, documentId: string, dueDate: string, data: LogSheetData, onFile: string, at: string, formatRevision?: string): RecordInstance<LogSheetData> {
  return {
    id,
    documentId,
    periodKey: `${documentId}:${dueDate}`,
    dueDate,
    status: "Verified",
    isDemo: false,
    data,
    ...(formatRevision ? { formatRevision } : {}),
    createdAt: at,
    updatedAt: at,
    submittedBy: onFile,
    submittedAt: at,
    verifiedBy: onFile,
    verifiedAt: at,
  };
}

function seeded(id: string, documentId: string, dueDate: string, data: LogSheetData, formatRevision?: string): RecordInstance<LogSheetData> {
  return seededOn(id, documentId, dueDate, data, ON_FILE, SEEDED_AT, formatRevision);
}

/** The Equipment Master's first record, the 43 machines of 24-Sep-2026 — kept as it was, the list's history. */
export const SEED_MNT_EQUIPMENT_LIST = seeded("seed-mnt-equipment-list", "mnt-equipment-list", "2026-09-24", {
  header: {},
  rows: EQUIPMENT_LIST_ROWS.map((machine, i) => ({ id: `m${String(i + 1).padStart(2, "0")}`, ...machine })),
});

/**
 * THE LIST OF 29-SEP-2026 (REQUIREMENTS §82): the Flexo and Pouch sheets, 68
 * machines. A NEW record, not a change to the 24-Sep one: the seed only ever
 * adds a record whose id is missing (recordRepository.ensureSeeded), so a new
 * id is the one way the full list reaches a database already installed, and
 * the equipment master reads the latest Verified record
 * (engine/equipmentMaster.ts currentEquipmentList) — this one. Each line's id
 * is its machine number, so a line keeps its id whatever order it is read in.
 */
export const SEED_MNT_EQUIPMENT_LIST_2026_09_29 = seededOn(
  "seed-mnt-equipment-list-2026-09-29",
  "mnt-equipment-list",
  "2026-09-29",
  {
    header: {},
    rows: EQUIPMENT_LIST_2026_09_29_ROWS.map((machine) => ({ id: `mc-${machine.machineNo.toLowerCase()}`, ...machine })),
  },
  ON_FILE_29_SEP,
  "2026-09-29T00:00:00.000Z"
);

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

export const SEED_MNT_RECORDS: RecordInstance<LogSheetData>[] = [SEED_MNT_EQUIPMENT_LIST, SEED_MNT_EQUIPMENT_LIST_2026_09_29, SEED_MNT_LUX_2025, SEED_MNT_LUX_2024];
