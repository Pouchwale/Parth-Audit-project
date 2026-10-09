// ONE NUMBER PER LINE (REQUIREMENTS §102).
//
// The owner, 9-Oct-2026, with a picture of F/HR/20 drawn "SR. NO. 1 | 1. I can
// freely speak up ...": "there is mutiple where sr no written again in document
// ... like wise there are many records i found that so fix it also".
//
// A sheet's grid numbers its lines itself, in a Sr. No. column of its own
// (components/records/LogSheetRecordView.tsx, and the format's designer). Two
// things numbered them again:
//   * printed lines that open with their own number ("1. I can freely ...":
//     F/HR/19, 20 and 21). The layouts no longer carry it; a record made before
//     keeps the words it was made with, and so does a format the plant edited,
//     so the sheet leaves the number out wherever it is the line's own — on the
//     sheet, and in the names a downloaded file gives its boxes;
//   * forms that number their lines themselves: a "#", "No.", "Sr.No.",
//     "Number" or "Index" column, or questions numbered 01 to 10 with sub-lines
//     (F/HR/04, 15, 16, F/QC/11, 25, F/PUR/02, F/SYS/07). Their layouts say so
//     (LogSheetLayout.ownLineNumbers, engine/formLineNumbers.ts), and the sheet
//     draws no Sr. No. of its own.
// Only the drawing changes: what a record holds is left exactly as it is.
// Nothing is imported here, so the lowest modules can use it.

/**
 * A line's own number at the start of its words: "1. ", "01. ", "1) ", "(1) ", or "1." straight
 * before a word ("1.Anilox line issue"). Never a figure: "5.5%" and "7.1 TOP PAPER" are left alone.
 */
const OWN_NUMBER = /^\s*\(?0*(\d{1,3})\s*[.)](?:\s+|(?=\p{L}))/u;

/** The words without the line's own number in front, which the sheet's Sr. No. already shows; anything else as it is. */
export function withoutLineNumber(text: string | number | null | undefined, lineNumber: number): string | number | null | undefined {
  if (typeof text !== "string") return text;
  const m = OWN_NUMBER.exec(text);
  return m && Number(m[1]) === lineNumber ? text.slice(m[0].length) : text;
}
