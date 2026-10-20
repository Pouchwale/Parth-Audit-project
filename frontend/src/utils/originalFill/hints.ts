import type { FillHints } from "./types";

// PER-DOCUMENT HELP FOR THE FILLER, ONLY WHERE THE GENERIC MATCHER CANNOT TELL (REQUIREMENTS §119). Each with its reason.
// Kept few: every other document is placed by its words alone (utils/originalFill/xlsxFill.ts, docxFill.ts).
export const FILL_HINTS: Record<string, FillHints> = {
  // F/HR/07: the paper prints no heading over the position's responsibilities - one to a row of its first table, under the
  // Position row (rows 2 to 11); and the owner's Word file holds five filled position sheets of the one form, the first being
  // the paper and the other four his examples (REQUIREMENTS §98), left out from the third table on.
  "hr-job-responsibility": {
    gridRows: { 0: { table: 0, from: 1, to: 10, cols: { 1: 0 } } },
    cutFromTable: 2,
  },
  // F/HR/21: the paper works the overall result out in N20, under its Achieved column after the last attribute, and prints
  // no label for it; DCRS's "Overall achieved" goes there.
  "hr-psc-survey-analysis": { cellOf: { "Overall achieved": "N20" } },
  // F/SYS/12: DCRS heads its meeting date with the record's title; the paper's place for it is its "Review date: -".
  "sys-hara-monthly": { labelAs: { "MONTHLY REVIEW & HARA VERIFICATION MEETING RECORD –": "Review date" } },
  // F/DISP/01: the agreement's period is written inside its own sentence ("valid for the period of 01.04.2025 to 31.03.2026"),
  // the owner's dates being his example: DCRS's contract dates take their place.
  "disp-safe-transporter-agreement": { exampleOf: { "01.04.2025": "Contract valid from", "31.03.2026": "Contract valid to" } },
};

export const hintsOf = (documentId: string): FillHints | undefined => FILL_HINTS[documentId];
