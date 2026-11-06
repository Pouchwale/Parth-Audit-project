// A DOCUMENT OF THE QC, HR OR PURCHASE MODULE FILLS ITS A4 PAGE WHEN PRINTED (REQUIREMENTS §194; the owner, 6-Nov-2026:
// "when user click on print original copy then format is not covering whole A4 size page all this applies to all documents
// when i take print on physically A4 size paper then it not coming perfectly so fix it and do this for only three module
// which is QC, HR and Purchase"). The module decides, nothing else: the record's page marks such a document
// data-print-fill="page" (pages/RecordPage.tsx and the other pages that print a record), and the print draws it to the
// page - its words bigger, a register ruled to the foot, a form's boxes set apart (utils/print.ts, FILLS_PAGE). Every
// other module prints as it did. Import-free, so the rule can be read anywhere.

/**
 * The modules whose documents fill their A4 page when printed: QC - its inspection records, and the QC sheets the
 * Lamination module keeps (F-QC-30, F-QC-32, F-QC-40.C) - HR and Purchase.
 */
export const PAGE_FILL_MODULES: readonly string[] = ["Quality Control — Inspection Records", "Lamination — Quality Control", "Human Resources", "Purchase"];

/** What the record's page marks the document with: "page" for a document of one of PAGE_FILL_MODULES, nothing otherwise. */
export function printFillOf(doc: { module?: string | null } | null | undefined): "page" | undefined {
  return doc && PAGE_FILL_MODULES.includes(String(doc.module ?? "")) ? "page" : undefined;
}
