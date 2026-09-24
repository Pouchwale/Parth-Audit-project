import type { Department } from "../../types";
import { PLANT_DEPARTMENTS } from "./documentDepartments";

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

// The list itself lives in data/seed/documentDepartments.ts, with no imports, so
// the server reads the same one (backend/escalation.ts names departments by it).
export const DEPARTMENTS: Department[] = PLANT_DEPARTMENTS.map((d) => ({ ...d }));

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

// WHICH DEPARTMENT OWNS EACH OF THIS SYSTEM'S DOCUMENTS: data/seed/documentDepartments.ts,
// shared with the server.
export { DOCUMENT_DEPARTMENTS, departmentFromFormatNo, departmentOfDocument } from "./documentDepartments";
