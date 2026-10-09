import type { LogColumn, LogHeaderField, LogSheetLayout } from "../types";

// WHAT A PERSON OBSERVES, AND WHAT THE PLANT ALREADY KNOWS (REQUIREMENTS §98, 8-Oct-2026).
//
// Every box and column of the 114 log-sheet layouts is one of four things:
//
//   date         the day the record is for ("Date of Inspection", "Date of Measurement"): known.
//   computed     worked out from what is written on the sheet (engine/computedCells.ts), or read from
//                another document's records (F/MNT/03's Actuals from F/MNT/02): automatic.
//   standing     the plant's standing values: the machine, the instrument and its identity, the
//                chemicals in use, the site, the standing team, a printed period or responsibility.
//                Known, and the same until somebody changes it.
//   observation  everything a person sees, measures, decides or signs: a reading, a count, a pass or
//                fail, an OK or not OK, a finding, the time of a round, a quantity used, the job or lot
//                in front of them, the shift, a signature and the name of whoever checked.
//
// The morning prepare (engine/knownParts.ts) writes only the first three; a blank sheet a person
// starts (engine/recordDefaults.ts) never arrives with an observation already answered. When a box
// is not plainly a standing value it is an observation: leaving a known thing for the person costs
// them a few seconds, writing an unknown thing as if somebody saw it is a false record.

export type SlotKind = "date" | "computed" | "standing" | "observation";

/**
 * The boxes above or below the grid that hold a standing value, by key. Equipment and instrument
 * identity, the chemicals in use, the site and its standing team, and the words a format prints as
 * its own default. A lot's identity (FG code, PO, roll, batch), a person's name and the shift are not
 * here: they change with every sheet.
 */
const STANDING_BOX_KEYS = new Set([
  // the machine or instrument the sheet is about
  "machine",
  "machineName",
  "machineNo",
  "machineIdNo",
  "machineDescription",
  "equipmentName",
  "deviceIdNo",
  "serialNo",
  "modelSerial",
  "makeModel",
  "manufacturer",
  "range",
  "minReadingCapacity",
  "maxReadingCapacity",
  "acceptableTolerance",
  "calibrationExpiry",
  "location",
  "locations",
  "locationFunction",
  // the chemicals in use (never their batch: a batch is a lot, and lots change)
  "mixingRatio",
  "adhesiveMake",
  "adhesiveCode",
  "hardenerMake",
  "hardenerCode",
  // what the format prints as its own standing words
  "responsibility",
  "period",
  "minQualification",
  "cutoff",
  // the site, and the standing product safety team
  "siteName",
  "siteAddress",
  "products",
  "haraTeamLeader",
  // the contractor's details on an agreement
  "transporterName",
]);

const STANDING_BOX_PATTERNS = [
  /^team\d+(Name|Designation)$/, // the HARA review team, a standing list (F/SYS/12, F/SYS/20)
  /^ccm\d+$/, // the CCMs and PRPs the annual HARA review verifies (printed list)
  /^item\d+(Responsibility|Reviewed)$/, // the management review's agenda and its owners
  /^(monthly|quarterly|sixMonthly|yearly)CheckPoints$/, // a machine's printed PM check points
];

/** A "Department" box names the instrument's department on an equipment sheet; anywhere else it is a person's. */
const EQUIPMENT_BOX_KEYS = ["deviceIdNo", "machineIdNo", "equipmentName"];

export function boxKind(f: LogHeaderField, layout: LogSheetLayout): SlotKind {
  if (f.computed) return "computed";
  if (f.autoFill?.dueDate) return "date";
  if (f.autoFill?.sign) return "observation";
  // A choice, a yes or no and a clock time are answers: the shift, the pass, the lot's status, a time of day.
  if (f.type === "select" || f.type === "yesno" || f.type === "time") return "observation";
  if (f.key === "department") {
    const boxes = [...layout.headerFields, ...(layout.footerFields ?? [])];
    return boxes.some((b) => EQUIPMENT_BOX_KEYS.includes(b.key)) ? "standing" : "observation";
  }
  if (STANDING_BOX_KEYS.has(f.key) || STANDING_BOX_PATTERNS.some((p) => p.test(f.key))) return "standing";
  return "observation";
}

/** A grid column: printed (fixed), worked out, the record's date, or the person's. */
export function columnKind(col: LogColumn): Exclude<SlotKind, "standing"> | "fixed" {
  if (col.fixed) return "fixed";
  if (col.computed || col.linkedFrom) return "computed";
  if (col.autoFill?.dueDate) return "date";
  return "observation";
}

/**
 * THE YEARLY LISTS. A register whose lines are the plant's people or suppliers rather than the day's
 * events: its lines carry forward from the last list a person confirmed (never from the specimen,
 * whose "Sample Supplier A" nobody approved), with only who or what each line is about. The
 * assessment on each line (a skill level, a rating, a training need, the experience a person has
 * now) is made afresh, so it is left for the person.
 */
export const LIST_COLUMNS: Record<string, string[]> = {
  "hr-competence": ["name", "department", "designation", "eduRequired", "eduAvailable", "expRequired", "dateOfJoining", "dateOfLeaving"],
  "hr-skill-matrix": ["name", "designation", "dateOfJoining"],
  "hr-training-needs": ["name", "designation"],
  "pur-approved-suppliers": ["supplierName", "productService", "manufacturerName", "contactPerson", "contactNumber", "location", "approvalDate"],
  "pur-supplier-performance": ["supplierName", "material"],
  "pur-service-provider-performance": ["serviceDescription", "supplierName"],
};

/**
 * A FIGURE ANOTHER REAL RECORD GIVES (REQUIREMENTS §98, the audit's H-10): a running stock ledger's
 * opening stock is the last sheet's closing stock. It is the only cell of a day's line that is known
 * before the day; the counts, the blades replaced and anything broken are the person's.
 */
export const CARRIED_FIGURES: Record<string, { to: string; from: string }[]> = {
  "prd-pouching-blade": [{ to: "openingStock", from: "closingOkStock" }],
  "prd-slitting-blade": [{ to: "openingStock", from: "closingOkStock" }],
};
