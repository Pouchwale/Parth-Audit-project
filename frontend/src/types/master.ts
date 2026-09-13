// Master / reference data. All seeded strictly from the uploaded source
// documents (see REQUIREMENTS.md for provenance of every row). The admin can
// add more rows later from the Master Data screen; nothing here is invented
// historical data.

export interface Employee {
  id: string;
  name: string;
  role: string; // e.g. "Checker", "Verifier", "Technician", "Client Contact"
  department?: string;
  active: boolean;
  email?: string; // needed to receive reminder digests — blank until an admin sets it
}

export interface AreaLocation {
  id: string;
  name: string;
  context: string; // which document's area-list this belongs to
  floor?: string;
}

export interface PCLocation {
  id: string; // "PC-01" .. "PC-13"
  location: string;
  floor: string; // "GF" | "FF" | TBC
}

export interface Chemical {
  id: string;
  name: string;
  activeIngredient?: string;
  formulation?: string;
}

export interface ServiceTypeChemical {
  id: string;
  serviceName: string; // e.g. "Rodent Control Service"
  pestCovered: string;
  chemicals: string[];
  dilutionRatio: string;
}

export interface RodentStation {
  id: string;
  location: string;
  type: "Tamper Proof Bait Station" | "Glue Board / Glue Trap" | "Bait Tray" | "TO BE CONFIRMED";
  status: "Active" | "Inactive" | "TO BE CONFIRMED";
}

export interface CompanyHoliday {
  id: string;
  date: string; // ISO "YYYY-MM-DD"
  name: string;
}

// A department of the plant, as its own "MASTER LIST OF FORMATS & RECORDS"
// (F/SYS/02) has them: the department is the middle segment of every format
// number it owns, so F-QC-30 is Quality Control's and F-HR-17 is HR's. Which
// department owns which of this system's documents is in
// src/data/seed/departments.ts; who may see them is
// src/engine/departmentScope.ts.
export interface Department {
  id: string; // "dept-qc"
  code: string; // "QC" — as it appears inside the format number
  name: string; // "Quality Control"
  /** The prefix its format numbers carry on the master list, e.g. "F-QC". */
  formatPrefix: string;
}

// "Everyone must report to the company on adjustment Day" — a date on the
// leave calendar that would normally be the weekly off but is a WORKING day,
// making up for a festival holiday. The opposite of a holiday.
export interface AdjustmentDay {
  id: string;
  date: string; // ISO "YYYY-MM-DD"
  forHoliday?: string; // the holiday it makes up for, as printed next to it
  note?: string;
}

export interface MasterData {
  employees: Employee[];
  areas: AreaLocation[];
  pcLocations: PCLocation[];
  chemicals: Chemical[];
  serviceTypeChemicals: ServiceTypeChemical[];
  rodentStations: RodentStation[];
  checkpoints: DailyCheckpointDef[];
  // Reminder assignment: DocumentDefinition.id -> a substring to match against
  // Employee.role (case-insensitive). Whoever matches is "the concerned
  // person" for that document's due-date reminders. Editable in Master Data;
  // read defensively (`?? {}`) since browsers that used the app before this
  // field existed won't have it in their stored data.
  documentRoleKeywords: Record<string, string>;
  // The company's working calendar — see src/engine/holidays.ts, the one
  // place that decides whether a date is a working day:
  //   holidays       festival holidays from the Gujarat Print Pack Leave
  //                  Calendar 2026 (closed days)
  //   weeklyOffDay   0 = Sunday … 6 = Saturday; the plant's weekly off is
  //                  Thursday (4). Undefined in data stored before this field
  //                  existed → treated as Thursday.
  //   adjustmentDays Thursdays the plant WORKS to make up for a holiday.
  // All read defensively (`?? []` / `?? 4`) for the same pre-existing-data
  // reason as documentRoleKeywords above.
  holidays: CompanyHoliday[];
  weeklyOffDay?: number;
  adjustmentDays?: AdjustmentDay[];
  // The plant's departments (F/SYS/02). Read defensively for the same reason
  // as the fields above: a browser that used the app before this existed has
  // no `departments` key, and falls back to the seed list.
  departments?: Department[];
  // Ids of seeded holiday / adjustment-day rows an admin deleted on purpose.
  // The seed merge (masterRepository.ensureSeeded) is additive by id, so
  // without this a deleted seed row — e.g. the doubtful 20-11-2026
  // adjustment day — would quietly come back on the next start.
  removedSeedIds?: string[];
}

export type CheckpointResponseType = "yesno" | "yesno-note" | "number";

export interface DailyCheckpointDef {
  no: number;
  text: string; // verbatim source wording
  responseType: CheckpointResponseType;
  notePrompt?: string; // e.g. "mention the location"
  // Which Yes/No answer represents a finding (needs a corrective action
  // logged below) — polarity differs per checkpoint, e.g. checkpoint 1
  // ("pest proofing working properly") is bad when answered "No", while
  // checkpoint 2 ("any gaps...") is bad when answered "Yes". Absent for the
  // one numeric checkpoint (#4), which has nothing to flag.
  flagWhen?: "Yes" | "No";
}
