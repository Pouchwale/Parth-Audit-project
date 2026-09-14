import type { Department } from "../../types";

// THE PLANT'S DEPARTMENTS, AND WHICH DEPARTMENT OWNS WHICH DOCUMENT.
//
// Taken from the company's own "MASTER LIST OF FORMATS & RECORDS"
// (F/SYS/02, 00/01.12.2021 — "F-SYS-02-Master List of Formats. (R-2025).xlsx",
// supplied 13-Sep-2026). Every format number on that list carries its
// department in the middle segment, and that is the department that owns the
// record:
//
//   F-SYS-…   System / Management (the MR's own formats)
//   F-MKT-…   Marketing            F-PUR-…   Purchase
//   F-STR-…   Store                F-QC-…    Quality Control
//   F-QA-…    Quality Assurance    F-PRD-…   Production
//   F-MNT-…   Maintenance          F-HR-…    Human Resources
//   F-DISP-…  Dispatch
//
// So F-QC-30 (Lamination Adhesive Viscosity) is Quality Control's, F-PRD-18
// (Solvent Base Lamination ALC & Production) is Production's, F-MKT-05 (the
// customer complaint handling checklist) is Marketing's — and, perhaps
// unexpectedly but exactly as the list has it, the pest control paperwork is
// HR's: F-HR-17 is the Daily Pest Control Monitoring Record and F-HR-18 the
// Fly Catcher Inspection & Cleaning Record, filed alongside F-HR-15 / F-HR-16
// (the cleaning records) and F-HR-19 (Monthly GMP Inspection).
//
// All ten departments are listed, not only the six that own a document today:
// it is the plant's own list, and a Store or Maintenance user should be told
// that nothing has been assigned to them yet rather than be left out of the
// system.

export const DEPARTMENTS: Department[] = [
  { id: "dept-sys", code: "SYS", name: "System / Management", formatPrefix: "F-SYS" },
  { id: "dept-mkt", code: "MKT", name: "Marketing", formatPrefix: "F-MKT" },
  { id: "dept-pur", code: "PUR", name: "Purchase", formatPrefix: "F-PUR" },
  { id: "dept-str", code: "STR", name: "Store", formatPrefix: "F-STR" },
  { id: "dept-qc", code: "QC", name: "Quality Control", formatPrefix: "F-QC" },
  { id: "dept-qa", code: "QA", name: "Quality Assurance", formatPrefix: "F-QA" },
  { id: "dept-prd", code: "PRD", name: "Production", formatPrefix: "F-PRD" },
  { id: "dept-mnt", code: "MNT", name: "Maintenance", formatPrefix: "F-MNT" },
  { id: "dept-hr", code: "HR", name: "Human Resources", formatPrefix: "F-HR" },
  { id: "dept-disp", code: "DISP", name: "Dispatch", formatPrefix: "F-DISP" },
];

export const DEPARTMENT_CODES: string[] = DEPARTMENTS.map((d) => d.code);

/** A department by its code ("QC"), however it was typed. */
export function departmentByCode(code: string | undefined): Department | undefined {
  const c = String(code ?? "").trim().toUpperCase();
  return DEPARTMENTS.find((d) => d.code === c);
}

/** "Quality Control" for "QC" — the code itself if it isn't one of the ten. */
export function departmentName(code: string): string {
  return departmentByCode(code)?.name ?? code;
}

// WHICH DEPARTMENT OWNS EACH OF THIS SYSTEM'S DOCUMENTS.
//
// Kept here, in one auditable place, rather than as a field on each of the
// definitions: every line can be checked against the master list in one read.
// Where the document has a format number the department follows from it and
// the reason is that number. The formats this system holds that are still
// "TO BE CONFIRMED" on the master list are assigned to the department that
// owns the process, with the reason stated — to be confirmed with the MR like
// every other TBC in REQUIREMENTS.md.
export const DOCUMENT_DEPARTMENTS: Record<string, string> = {
  // --- Human Resources: the pest control file (F-HR-15..19 on the master list)
  "daily-pest-monitoring": "HR", // F/HR/17 on the list
  "fly-catcher": "HR", // F/HR/18 on the list
  "service-report-rodent": "HR", // TBC — the provider's visit reports are filed with F-HR-17/18
  "service-report-general": "HR", // TBC — as above
  "service-report-fly": "HR", // TBC — as above
  "pest-responsibilities": "HR", // TBC — the site/provider responsibilities behind the pest control file
  "training-record": "HR", // TBC — training is HR's (F-HR-05..F-HR-12)
  "chemical-master": "HR", // TBC — the pesticide application chart the pest control file works to
  "gurudev-insecticide-licence": "HR", // TBC — the provider's licence, held in the pest control file

  // --- Human Resources: the department's own formats (F-HR-01 … F-HR-22 on the master list; REQUIREMENTS §46)
  "hr-competence": "HR", // F/HR/01
  "hr-skill-matrix": "HR", // F/HR/03
  "hr-pre-employment-health": "HR", // F/HR/04
  "hr-induction-staff": "HR", // F/HR/05
  "hr-induction-operators": "HR", // F/HR/06
  "hr-job-responsibility": "HR", // F/HR/07
  "hr-training-needs": "HR", // F/HR/08
  "hr-training-calendar": "HR", // F/HR/09
  "hr-training-effectiveness": "HR", // F/HR/11
  "hr-training-feedback": "HR", // F/HR/12
  "hr-mobile-authorization": "HR", // F/HR/13
  "hr-visitor-health": "HR", // F/HR/14
  "hr-gmp-checklist": "HR", // F/HR/19
  "hr-psc-survey": "HR", // F/HR/20
  "hr-psc-survey-analysis": "HR", // F/HR/21
  "hr-hygiene-report": "HR", // F/HR/22

  // --- Purchase: the contract with the service provider
  "service-agreement": "PUR", // TBC — Purchase signs it (Manager, Purchase) and owns F-PUR-06, service provider performance

  // --- Marketing: customer complaints
  "capa-customer-complaint": "MKT", // F/MKT/05 on the list
  "capa-complaint-ack": "MKT", // F-MKT-06 "Complaint Acknowldgement form" on the list (the form itself is headed QA-CAF-00)

  // --- Quality Assurance: the internal inspection findings
  "gap-inspection": "QA", // TBC — an internal findings/corrective-action report, QA's to close out

  // --- Quality Control: the lamination and inspection registers
  "qc-viscosity": "QC", // F-QC-30
  "qc-adhesive-mixing": "QC", // F-QC-32
  "qc-temperature": "QC", // F-QC-40.C
  "qc-inspection-pouching": "QC", // F/QC/37
  "qc-inspection-slitting": "QC", // F/QC/35
  "qc-inspection-printed-film": "QC", // F/QC/34
  "qc-inprocess-printing": "QC", // F/QC/13
  "soc-labels": "QC", // F/QC-09
  "soc-flexible-packaging": "QC", // F/QC-38

  // --- Production: the lamination production registers
  "prd-process-parameter": "PRD", // F-PRD-19 on the list
  "prd-alc-production": "PRD", // F-PRD-18
};

/**
 * The department code a format number implies — "F-QC-30", "F/QC/37" and
 * "F/QC-09" all read as QC. Null when the number carries no department (a
 * TO BE CONFIRMED, or the provider's Form III licence number).
 */
export function departmentFromFormatNo(formatNo: string | undefined): string | null {
  const m = String(formatNo ?? "").toUpperCase().match(/^F[-/]([A-Z]{2,4})[-/]/);
  return m && departmentByCode(m[1]) ? m[1] : null;
}

/** The department code that owns this document, or null when none is assigned. */
export function departmentOfDocument(documentId: string, formatNo?: string): string | null {
  return DOCUMENT_DEPARTMENTS[documentId] ?? departmentFromFormatNo(formatNo);
}
