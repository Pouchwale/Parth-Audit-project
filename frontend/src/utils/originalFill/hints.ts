import type { FillHints } from "./types";

// PER-DOCUMENT HELP FOR THE FILLER, ONLY WHERE THE GENERIC MATCHER CANNOT TELL (REQUIREMENTS §119). Each with its reason.
// Kept few: every other document is placed by its words alone (utils/originalFill/xlsxFill.ts, docxFill.ts).
export const FILL_HINTS: Record<string, FillHints> = {};

export const hintsOf = (documentId: string): FillHints | undefined => FILL_HINTS[documentId];
