// Core enums / shared primitives used across the whole system.

export type Frequency =
  | "Daily"
  | "Weekly"
  | "Fortnightly"
  | "Monthly"
  | "Quarterly"
  | "Yearly"
  | "As Required";

// Record lifecycle. See section 16 of REQUIREMENTS.md.
export type RecordStatus =
  | "Scheduled"
  | "Due"
  | "In Progress"
  | "Submitted"
  | "Pending Verification"
  | "Verified"
  | "Rejected";

export const TBC = "TO BE CONFIRMED";

// Every document "kind" maps to a specific renderer/component and a specific
// typed data payload. Adding a new kind = adding a new template + payload type;
// everything else (calendar, dashboard, library, lifecycle, search) is generic.
export type DocumentKind =
  | "daily-pest-monitoring"
  | "fly-catcher"
  | "service-report"
  | "gap-inspection"
  | "training-record"
  | "chemical-master"
  | "sop-reference"
  // Generic tabular log sheet (header fields + a grid of rows), driven by a
  // per-document LogSheetLayout (src/data/seed/logSheetLayouts.ts). Covers
  // the lamination QC / production formats: F-QC-30, F-QC-32, F-QC-40.C,
  // Process Parameter Record, F-PRD-18. Adding another grid-shaped format
  // is one layout entry + one DocumentDefinition row — no new component.
  | "log-sheet"
  // Statement of Compliance / Declaration documents (F/QC-09, F/QC-38):
  // reference-only, with a validity period the app tracks for renewal.
  | "compliance-statement"
  // A licence / certificate held on file exactly as supplied (scanned pages
  // shown unaltered, plus a transcription) — the pest control service
  // provider's Government of Gujarat insecticide licence (Form III).
  | "licence"
  // Customer Complaint Handling Checklist (F/MKT/05) — the CAPA module's
  // "External" side. Sections A–E of fixed activities, each with a done
  // flag / date / comment, plus a Prepared-by / Approved-by sign-off. The
  // assistant walks the user through it section by section (see
  // src/engine/guidedChecklist.ts).
  | "complaint-checklist"
  // Complaint Acknowledgement Report (QA-CAF-00) — the CAPA module's Internal
  // side: a customer complaint explained to the employee involved, with
  // photographs, root cause, corrective / preventive action and the
  // employee's acknowledgement (components/records/ComplaintAckRecordView.tsx).
  | "complaint-ack";
