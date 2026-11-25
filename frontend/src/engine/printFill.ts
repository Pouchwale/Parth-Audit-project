// A DOCUMENT OF THE QC, HR OR PURCHASE MODULE FILLS ITS A4 PAGE WHEN PRINTED (REQUIREMENTS §194; the owner, 6-Nov-2026:
// "when user click on print original copy then format is not covering whole A4 size page all this applies to all documents
// when i take print on physically A4 size paper then it not coming perfectly so fix it and do this for only three module
// which is QC, HR and Purchase"). The module decides, nothing else: the record's page marks such a document
// data-print-fill="page" (pages/RecordPage.tsx and the other pages that print a record), and the print draws it to the
// page - its words bigger, a register ruled to the foot, a form's boxes set apart (utils/print.ts, FILLS_PAGE). Every
// other module prints as it did. Import-free, so the rule can be read anywhere.
//
// EVERY MODULE'S SHEETS FILL THEIR PAGE (REQUIREMENTS §328; the owner, 25-Nov-2026, shown that the papers in his Google Drive
// rule their blank lines to the foot of the page where DCRS printed only the lines written: "Yes, shared fixes first"):
// Production, Maintenance, System / Management, Marketing, Store, Dispatch and CAPA fill their page as QC, HR and Purchase
// do. The Statements of Compliance (Quality — Compliance) are letters, with no lines to rule, and print as they did.

/**
 * The modules whose documents fill their A4 page when printed: QC - its inspection records, and the QC sheets the
 * Lamination module keeps (F-QC-30, F-QC-32, F-QC-40.C) - HR and Purchase (§194), and every other module but the
 * Statements of Compliance (§328).
 */
export const PAGE_FILL_MODULES: readonly string[] = [
  "Quality Control — Inspection Records",
  "Lamination — Quality Control",
  "Human Resources",
  "Purchase",
  "Production",
  "Maintenance",
  "System / Management",
  "Marketing",
  "Store",
  "Dispatch",
  "CAPA (Corrective & Preventive Action)",
];

/** What the record's page marks the document with: "page" for a document of one of PAGE_FILL_MODULES, nothing otherwise. */
export function printFillOf(doc: { module?: string | null } | null | undefined): "page" | undefined {
  return doc && PAGE_FILL_MODULES.includes(String(doc.module ?? "")) ? "page" : undefined;
}
