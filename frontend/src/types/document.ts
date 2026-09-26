import type { DocumentKind, Frequency } from "./common";

// A "DocumentDefinition" is the digital equivalent of one controlled paper
// format (Format No. / Rev No. / etc.). It is master/config data, not a filled
// record. The Document Library, Calendar, Dashboard and Frequency Engine are
// all driven from this list — adding the next of the ~141 formats means adding
// one more DocumentDefinition (+ a payload type/renderer for genuinely new
// structures, or reusing an existing renderer such as service-report).
export interface DocumentDefinition {
  id: string;
  kind: DocumentKind;
  name: string; // source document title, verbatim
  formatNo: string; // e.g. "F/HR/17" or "TO BE CONFIRMED"
  revisionNo: string; // e.g. "00" or "TO BE CONFIRMED"
  revisionDate: string | null; // ISO date, or null if TBC
  /**
   * The company's name as THIS format's header prints it, when the plant has
   * changed it on the format (Edit format, REQUIREMENTS §77) — laid over the
   * issued definition from data/formatEdits.ts. Absent, the header prints the
   * company's registered name (data/seed/masterData.ts COMPANY.name).
   */
  companyName?: string;
  department: string;
  module: string; // grouping shown on dashboard, e.g. "Pest Control"
  frequency: Frequency;
  status: "Configured" | "Draft";
  description: string;
  sourceFile: string; // which uploaded source file this was digitized from
  // Scheduling configuration consumed by the frequency engine.
  schedule: ScheduleConfig;
  // Optional: for documents that come in several variants sharing one renderer
  // (e.g. Service Report has 3 service types), each variant is its own
  // DocumentDefinition with a distinguishing `variantKey`.
  variantKey?: string;
  // Reference-only documents (the Chemical Master, a Statement of Compliance,
  // the licence) have no due dates / record
  // lifecycle — they open straight into a reference viewer.
  isReferenceOnly?: boolean;
  // Optional sub-grouping inside a module, the way the department itself
  // talks about its paperwork — e.g. Pest Control's "Daily Report",
  // "Service Reports", "Trend Analysis", "Training & Reference". Drives the
  // Document Library's ordering and the module overview pages.
  section?: string;
}

export type ScheduleConfig =
  | { type: "daily" }
  | { type: "weekly"; weekday: number } // 0=Sunday
  | { type: "fortnightly"; anchorDayOfMonth: number } // e.g. 4 -> 4th & 18th
  | { type: "monthly"; dayOfMonth: number }
  | { type: "quarterly"; anchorMonth: number; dayOfMonth: number } // anchorMonth 0-11, first quarter month
  | { type: "yearly"; month: number; dayOfMonth: number }
  | { type: "as-required" };
