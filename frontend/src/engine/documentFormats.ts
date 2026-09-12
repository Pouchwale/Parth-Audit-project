import { todayISO } from "../utils/date";

// THE CODES THIS PLANT WRITES ON ITS PAPERWORK, in one place — so a person
// typing one, the assistant filling one in, and the check that runs at Submit
// all agree (the department's rule, 12-Sep-2026):
//
//   FG code / Job Code   FG, two letters for the job type, four digits —
//                        eight characters in all: FGSL3877, FGPO1234, FGLA0042
//   PO No.               eight digits: 10004321
//   Complaint No.        the two calendar years, then a three-digit count that
//                        starts again at 001 each January: 26-27/001
//
// The lamination and QC log sheets are deliberately NOT covered: their FG / PO
// columns hold the short codes the company's own specimens use ("7204",
// "88825"), so only an entry there that starts with FG is checked at all.

export const FG_CODE_EXAMPLE = "FGSL3877";
export const PO_NUMBER_EXAMPLE = "10004321";
export const COMPLAINT_NO_EXAMPLE = "26-27/001";

const FG_CODE_RE = /^FG[A-Z]{2}\d{4}$/;
const PO_NUMBER_RE = /^\d{8}$/;
const COMPLAINT_NO_RE = /^\d{2}-\d{2}\/\d{3}$/;

export interface CodeRule {
  label: string;
  example: string;
  /** Tidies what was typed ("fgsl 3877" -> "FGSL3877"); never rejects. */
  normalise: (value: string) => string;
  /** Why the value doesn't fit the format, or null when it does. Blank is always allowed — "required" is the form's own check. */
  problem: (value: string) => string | null;
}

const isBlank = (v: string) => v.trim() === "";

const tidyFgCode = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, "");

export function fgCodeRule(label = "FG code"): CodeRule {
  return {
    label,
    example: FG_CODE_EXAMPLE,
    normalise: tidyFgCode,
    problem: (value) =>
      isBlank(value) || FG_CODE_RE.test(tidyFgCode(value))
        ? null
        : `${label} reads like ${FG_CODE_EXAMPLE} — FG, two letters for the job type (SL, PO, LA …), then four digits.`,
  };
}

export const poNumberRule: CodeRule = {
  label: "PO No.",
  example: PO_NUMBER_EXAMPLE,
  normalise: (value) => value.replace(/\D/g, ""),
  problem: (value) => (isBlank(value) || PO_NUMBER_RE.test(value.replace(/\D/g, "")) ? null : `PO No. is eight digits, like ${PO_NUMBER_EXAMPLE}.`),
};

/** "26-27" for any date in 2026 — it changes on 1 January. */
export function complaintYearPart(dateISO: string = todayISO()): string {
  const year = Number(dateISO.slice(0, 4));
  const two = (y: number) => String(y % 100).padStart(2, "0");
  return Number.isFinite(year) && year > 0 ? `${two(year)}-${two(year + 1)}` : complaintYearPart(todayISO());
}

function tidyComplaintNo(value: string, dateISO: string = todayISO()): string {
  const v = value.trim();
  if (!v) return v;
  const full = v.match(/^(\d{2})\s*[-/]\s*(\d{2})\s*[/\\-]\s*(\d{1,3})$/);
  if (full) return `${full[1]}-${full[2]}/${full[3].padStart(3, "0")}`;
  const countOnly = v.match(/^\d{1,3}$/);
  if (countOnly) return `${complaintYearPart(dateISO)}/${v.padStart(3, "0")}`;
  return v;
}

export const complaintNoRule: CodeRule = {
  label: "Complaint No.",
  example: COMPLAINT_NO_EXAMPLE,
  normalise: (value) => tidyComplaintNo(value),
  problem: (value) =>
    isBlank(value) || COMPLAINT_NO_RE.test(tidyComplaintNo(value))
      ? null
      : `Complaint No. reads like ${COMPLAINT_NO_EXAMPLE} — the two years, then a three-digit number.`,
};

/** The next free complaint number for this year: 26-27/001, /002, … */
export function nextComplaintNo(existing: Iterable<string>, dateISO: string = todayISO()): string {
  const year = complaintYearPart(dateISO);
  let highest = 0;
  for (const raw of existing) {
    const v = tidyComplaintNo(String(raw ?? ""), dateISO);
    if (!v.startsWith(`${year}/`)) continue;
    const n = Number(v.slice(year.length + 1));
    if (Number.isFinite(n) && n > highest) highest = n;
  }
  return `${year}/${String(highest + 1).padStart(3, "0")}`;
}

// Which fields of which document carry which code. A document not listed here
// has no coded fields (see the log-sheet note at the top).
const RULES_BY_KIND: Record<string, Record<string, CodeRule>> = {
  "complaint-checklist": { complaintNo: complaintNoRule, jobCode: fgCodeRule("Job Code"), poNo: poNumberRule },
  "complaint-ack": { fgCode: fgCodeRule("FG code") },
};

export function codeRulesFor(kind: string): Record<string, CodeRule> {
  return RULES_BY_KIND[kind] ?? {};
}

/**
 * A log sheet's FG / Job Code column: the company's own specimens write short
 * codes there ("7204"), so only something typed as an FG code is held to the
 * FG format.
 */
export function softFgCodeProblem(value: string): string | null {
  const v = tidyFgCode(value);
  return v.startsWith("FG") && !FG_CODE_RE.test(v) ? fgCodeRule("FG code").problem(v) : null;
}
