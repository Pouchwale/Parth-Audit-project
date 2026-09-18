// WHICH DEPARTMENT OWNS WHICH DOCUMENT — with no imports at all, so the same
// file is read by the browser (data/seed/departments.ts re-exports it) and by
// the server, which keeps a department's records to that department's
// accounts when it hands out the stored data (backend/index.ts, REQUIREMENTS
// §40 and §55). One list, so the two can never disagree.

/** The codes of the ten departments on the company's master list (data/seed/departments.ts). */
export const DEPARTMENT_CODE_LIST: readonly string[] = ["SYS", "MKT", "PUR", "STR", "QC", "QA", "PRD", "MNT", "HR", "DISP"];

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
  "qc-weight-scale-calibration": "QC", // F-QC-12 on the list
  "qc-gsm-plate-calibration": "QC", // F-QC-11 on the list
  // --- Quality Control: the formats supplied on 18-Sep-2026 (REQUIREMENTS §57).
  // Listed here whether or not the format number resolves on its own: the two
  // Gujarati clearance checklists print no number at all, and a number that
  // resolves to nothing would put a document in front of every department.
  "qc-bopp-film": "QC", // F/QC/01
  "qc-corrugated-box": "QC", // F/QC/02
  "qc-label-stock": "QC", // F/QC/03
  "qc-paper-core": "QC", // F/QC/04
  "qc-pvc-pet-film": "QC", // F/QC/05
  "qc-offset-ink": "QC", // F/QC/18
  "qc-duplex-board": "QC", // F/QC/19
  "qc-kraft-paper": "QC", // F/QC/20
  "qc-flexo-ink": "QC", // F/QC/21
  "qc-lamination-adhesive-inspection": "QC", // F/QC/21
  "qc-side-pasting-adhesive": "QC", // F/QC/22
  "qc-starch-powder": "QC", // F/QC/23
  "qc-sheet-pasting-powder": "QC", // F/QC/24
  "qc-line-clearance-printing": "QC", // F/QC/15-A
  "qc-line-clearance-qc-machine": "QC", // F/QC/15-C
  "qc-line-clearance-qc-manual": "QC", // F/QC/15-D
  "qc-line-clearance-slitting": "QC", // F/QC/15-E
  "qc-line-clearance-sleeve-gluing": "QC", // F/QC/15-F
  "qc-line-clearance-sleeve-cutting": "QC", // F/QC/15-G
  "qc-line-clearance-materials": "QC", // TO BE CONFIRMED (Gujarati form)
  "qc-line-clearance-quality": "QC", // TO BE CONFIRMED (Gujarati form)
  "qc-calibration-master-list": "QC", // F/QC/08
  "qc-coa-label": "QC", // F/QC/06
  "qc-coa-sleeve": "QC", // F/QC/07
  "qc-coa-corrugated": "QC", // F/QC/25
  "qc-obsolete-artwork": "QC", // F/QC/16
  "qc-printing-aids-destruction": "QC", // F/QC/20
  "qc-camera-challenge-test": "QC", // F: QA/PRO/FL/CCT/01
  "qc-tolerance-card-nivea": "QC", // F-QC-19
  "qc-analysis-report": "QC", // F/QC/29
  "qc-utility-test-report": "QC", // F/QC/29 (on the MOM format)
  "qc-minutes-of-meetings": "QC", // F/QC/30

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
  return m && DEPARTMENT_CODE_LIST.includes(m[1]) ? m[1] : null;
}

/** The department code that owns this document, or null when none is assigned. */
export function departmentOfDocument(documentId: string, formatNo?: string): string | null {
  return DOCUMENT_DEPARTMENTS[documentId] ?? departmentFromFormatNo(formatNo);
}
