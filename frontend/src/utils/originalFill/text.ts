// HOW THE FILLER FINDS DCRS'S WORDS IN THE OWNER'S FILE (REQUIREMENTS §119).
//
// DCRS's pages were built from the owner's papers word for word, so a label, a heading, a parameter's name or a title on the
// page is found in his file by its words: case, spacing, punctuation and line breaks aside. Where the plant has since
// changed a word (the format's own edits, the company's one name), the nearest match is taken, and DCRS's words replace the
// file's there.

/** Words only: lower case, every run of what is not a letter or a digit one space. "Sr. No." and "SR.NO" both read "sr no". */
export function norm(s: string): string {
  return (s ?? "")
    .normalize("NFKC")
    .toLowerCase()
    // Quotes and apostrophes, curly or straight, are no word break: "Trainee's Name" and the paper's "Trainee\u2019s Name" match.
    .replace(/[\u2018\u2019\u201c\u201d'"`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** The same words with no spaces at all ("srno"), for a heading the paper writes run together. */
export const squash = (s: string): string => norm(s).replace(/ /g, "");

const SERIAL = new Set(["srno", "slno", "sno", "serialno", "srnos", "sr", "no", "serialnumber", "srnumber"]);
/** A Sr. No. heading by any of its spellings ("#" too). */
export const isSerialHeading = (s: string): boolean => SERIAL.has(squash(s)) || s.trim() === "#";

function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>();
  const t = ` ${s} `;
  for (let i = 0; i < t.length - 1; i++) {
    const g = t.slice(i, i + 2);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

/** How alike two texts read, 0..1 (Dice on letter pairs of their words). */
export function similarity(a: string, b: string): number {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const A = bigrams(x);
  const B = bigrams(y);
  let both = 0;
  let total = 0;
  for (const [g, n] of A) {
    total += n;
    both += Math.min(n, B.get(g) ?? 0);
  }
  for (const n of B.values()) total += n;
  return total ? (2 * both) / total : 0;
}

/** Same words. */
export const same = (a: string, b: string): boolean => norm(a) === norm(b) && norm(a) !== "";

/**
 * A label at the start of a piece of text and what follows it: "PRINTING MACHINE NAME : - ____" against the label "Printing
 * machine name" gives the words up to and including the separator ("PRINTING MACHINE NAME : - ") and the rest ("____").
 * null when the text does not start with the label's words.
 */
export function afterLabel(text: string, label: string): { head: string; rest: string } | null {
  const want = norm(label);
  if (!want) return null;
  // Walk the text, matching the label's words in order, letters and digits only.
  const letters = want.replace(/ /g, "");
  let i = 0;
  let matched = 0;
  const lower = text.normalize("NFKC").toLowerCase();
  while (i < lower.length && matched < letters.length) {
    const ch = lower[i];
    if (/[\p{L}\p{N}]/u.test(ch)) {
      if (ch !== letters[matched]) return null;
      matched++;
    }
    i++;
  }
  if (matched < letters.length) return null;
  // The label must end at a word's end.
  if (i < lower.length && /[\p{L}\p{N}]/u.test(lower[i])) return null;
  // The label's own closing marks the text prints too ("Product Traced %" before " :"): the label's, never the value's place.
  const marks = /[^\p{L}\p{N}\s:.\-]+$/u.exec(label.trim())?.[0] ?? "";
  if (marks) {
    let k = i;
    while (k < text.length && /\s/.test(text[k])) k++;
    if (text.startsWith(marks, k)) i = k + marks.length;
  }
  // The separator: spaces, colons, dashes, full stops, "=", tabs.
  let j = i;
  while (j < text.length && /[\s:\-–—=.)\]]/.test(text[j])) j++;
  return { head: text.slice(0, j), rest: text.slice(j) };
}

/** Nothing written yet: only blanks, underscores, dots or dashes ("________", "......", "-"). */
export const isBlankish = (s: string): boolean => /^[\s_.\-–—:]*$/.test(s ?? "");

// ---------------------------------------------------------------------------------------------------------------------
// the header band's words

/** A format number as the papers write it: F/QC/01, F-QC-30, F/QC-09, F/QC/15-A, F/SYS/04-A, F-PRD-18, F/HR/01. */
export const FORMAT_NO_RE = /\bF\s*[-/]\s*(?:QC|HR|SYS|MNT|PRD|PUR|MKT|DISP|STR|QA)\s*[-/]\s*\d{1,3}(?:\s*[-.]\s*[A-G](?![A-Za-z]))?/i;

/** "(00/01.12.2021)", "(01 / 16.02.2022)", "(00-15.12.2024)", "/00": a revision and its date after a format number. */
export const REVISION_AFTER_RE = /\(\s*(\d{1,2})\s*[/-]\s*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})\s*\)/;

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** "16-Feb-2022" -> "16.02.2022" (the papers' way); anything else as it is. */
export function dotted(words: string): string {
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec((words ?? "").trim());
  if (!m) return words;
  const month = MONTHS.indexOf(m[2].toLowerCase()) + 1;
  return month ? `${m[1].padStart(2, "0")}.${String(month).padStart(2, "0")}.${m[3]}` : words;
}

/** A date written any of the papers' ways, as YYYY-MM-DD, or null. */
export function isoOf(words: string): string | null {
  const t = (words ?? "").trim();
  let m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/.exec(t);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(t);
  if (m) {
    const month = MONTHS.indexOf(m[2].toLowerCase()) + 1;
    return month ? `${m[3]}-${String(month).padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
  }
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** The company's name as any of the papers spell it (PRINTPACK, PRINT PACK, PUBLICATION(S), PVT. LTD., PRIVATE LIMITED, LIMITED, GUJRAT). */
export const COMPANY_RE = /GUJ\s*A?\s*R\s*A?\s*T\s+PRINT\s*-?\s*PACK(?:A\w*)?\s+PUB\w*\.?(?:\s*(?:PVT\.?|PRIVATE)?\s*(?:LTD\.?|LIMITED))?\.?/i;

export type BandWord = "formatNo" | "revNo" | "revDate" | "page" | "date";

/** What a header-band label names: "Format No.", "Format number", "Doc. No." -> formatNo; "Rev. no." -> revNo; and so on. */
export function bandWordOf(label: string): BandWord | null {
  const s = squash(label);
  if (!s) return null;
  if (/^(formatno|formatnumber|format|docno|documentno|documentnumber|formno)$/.test(s)) return "formatNo";
  if (/^(revno|revisionno|revnumber|revisionnumber|rev|revision|issueno)$/.test(s)) return "revNo";
  if (/^(revdate|revisiondate|effectivedate|issuedate|dateofissue|effdate|dateofrevision)$/.test(s)) return "revDate";
  if (/^(page|pageno|pagenumber|pagenos)$/.test(s)) return "page";
  if (/^(date|dt)$/.test(s)) return "date";
  return null;
}

/** A heading the paper writes longer ("Findings of Inspection" for "Finding", "Remarks (if any)" for "Remarks"): 0.8, else 0. */
export function headingPrefix(paper: string, dcrs: string): number {
  const a = norm(paper);
  const b = norm(dcrs);
  if (!a || !b) return 0;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 4 && (long.startsWith(`${short} `) || long.startsWith(`${short}s `) || long === `${short}s`) ? 0.8 : 0;
}
