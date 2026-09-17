import type { HrMasterColumnKey, HrMasterPerson, LogSheetData, LogSheetRow } from "../types";
import { getLogSheetLayout } from "../data/seed/logSheetLayouts";
import { serialToIso } from "../utils/xlsx";
import { todayISO } from "../utils/date";

// HR MASTER DATA — THE EMPLOYEE MASTER SHEET THE HR FORMATS FETCH FROM
// (REQUIREMENTS §53).
//
// Human Resources keeps one sheet of its people in six columns — GP3 No.,
// Joining Date, Full Name, Department, Designation/Position, Date of Birth
// (data/repositories/hrMasterRepository.ts). Ten of the sixteen F/HR formats
// write those same facts about a person, each in its own place and its own
// way: a header for the one person a form is about (F/HR/04, 05, 11, 20), or
// a line per person on a register (F/HR/01, 03, 06, 08, 12, 13); dates as a
// date field, or as text in the register's own style (01.04.2014 on F/HR/01,
// 5/13/2008 on F/HR/03, 01/06/2025 on F/HR/06); department and designation
// in two boxes, or in one ("Department & Designation"). HR_MASTER_LINKS below
// is that map, written out per format, and everything that fetches a person —
// the record page, Mitra, the CV import — goes through it.
//
// A fetch COPIES: a controlled record keeps what was fetched even if the
// master sheet changes later, as the paper form would. Blank boxes are filled
// straight away; a box that already holds something different is only ever
// replaced when the person says so.

export const HR_MASTER_SHEET_NAME = "HR Master Data";

export const HR_MASTER_COLUMNS: { key: HrMasterColumnKey; label: string; kind: "text" | "date"; width: number }[] = [
  { key: "gp3No", label: "GP3 No.", kind: "text", width: 12 },
  { key: "joiningDate", label: "Joining Date", kind: "date", width: 14 },
  { key: "fullName", label: "Full Name", kind: "text", width: 32 },
  { key: "department", label: "Department", kind: "text", width: 22 },
  { key: "designation", label: "Designation/Position", kind: "text", width: 26 },
  { key: "dateOfBirth", label: "Date of Birth", kind: "date", width: 14 },
];

export const hrMasterColumnLabel = (key: HrMasterColumnKey): string => HR_MASTER_COLUMNS.find((c) => c.key === key)?.label ?? key;

// ---------------------------------------------------------------------------
// names and numbers

const TITLE_RE = /^(?:mr|mrs|ms|miss|dr|shri|smt)\.?\s+/i;

/** A name as compared: no title, no case, no punctuation — "Ms. Kapila Barad" and "kapila barad" are one. */
export function nameKey(name: unknown): string {
  return String(name ?? "")
    .trim()
    .replace(TITLE_RE, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export const sameName = (a: unknown, b: unknown): boolean => {
  const key = nameKey(a);
  return !!key && key === nameKey(b);
};

/** A GP3 No. as compared: "GP3 No. 0101", "gp3-0101" and "0101" are one. */
export function gp3Key(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/^gp\s*-?\s*3\s*(?:no\.?|number|#)?\s*[:#./-]?\s*/i, "")
    .replace(/\s+/g, "")
    .toUpperCase();
}

/** Two GP3 Nos. are the same number — a spreadsheet that dropped a leading zero still matches. */
export function sameGp3(a: unknown, b: unknown): boolean {
  const x = gp3Key(a);
  const y = gp3Key(b);
  if (!x || !y) return false;
  if (x === y) return true;
  return /^\d+$/.test(x) && /^\d+$/.test(y) && Number(x) === Number(y);
}

// ---------------------------------------------------------------------------
// dates

const pad = (n: number) => String(n).padStart(2, "0");

function isoDate(y: number, m: number, d: number): string | null {
  if (!Number.isInteger(y) || y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
}

export function isIsoDate(value: unknown): value is string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ""));
  return !!m && isoDate(+m[1], +m[2], +m[3]) === m[0];
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const monthOf = (word: string): number | null => {
  const i = MONTHS.indexOf(word.slice(0, 3).toLowerCase());
  return i < 0 ? null : i + 1;
};
const fullYear = (y: string) => (y.length === 2 ? (Number(y) > 30 ? 1900 : 2000) + Number(y) : Number(y));

/** How a register writes a date with slashes: day first (01/06/2025) or month first (6/23/2025). */
export type SlashOrder = "dmy" | "mdy";

/**
 * A date as somebody wrote it, as YYYY-MM-DD — or null when it is not a date.
 * A dotted date is always day first (01.04.2014). A slashed or dashed one is
 * read in `slash` order unless the numbers leave no choice (21/07/2010 can only
 * be day first). Also: 2014-04-01, 1 Apr 2014, 01-Apr-2014, April 1, 2014, and
 * an Excel date serial (41730).
 */
export function parseWrittenDate(value: unknown, slash: SlashOrder = "dmy"): string | null {
  const s = String(value ?? "").trim();
  if (!s) return null;
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (m) return isoDate(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})([./-])(\d{1,2})\2(\d{4}|\d{2})$/.exec(s);
  if (m) {
    const a = +m[1];
    const b = +m[3];
    const y = fullYear(m[4]);
    let order: SlashOrder = m[2] === "." ? "dmy" : slash;
    if (a > 12 && b <= 12) order = "dmy";
    else if (b > 12 && a <= 12) order = "mdy";
    return order === "dmy" ? isoDate(y, b, a) : isoDate(y, a, b);
  }
  m = /^(\d{1,2})(?:st|nd|rd|th)?[\s-]+([A-Za-z]{3,9})\.?[\s,-]+(\d{4}|\d{2})$/.exec(s);
  if (m) {
    const month = monthOf(m[2]);
    return month ? isoDate(fullYear(m[3]), month, +m[1]) : null;
  }
  m = /^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/.exec(s);
  if (m) {
    const month = monthOf(m[1]);
    return month ? isoDate(+m[3], month, +m[2]) : null;
  }
  if (/^\d{5}(?:\.0+)?$/.test(s)) {
    const serial = Number(s);
    if (serial >= 20000 && serial <= 80000) return serialToIso(serial);
  }
  return null;
}

/** The date styles the HR registers write in. */
export type DateStyle = "iso" | "dotted" | "monthFirst" | "dayFirst";

/** An ISO date in a register's own style: dotted 05.07.2024 (F/HR/01), monthFirst 7/5/2024 (F/HR/03), dayFirst 05/07/2024 (F/HR/06). */
export function writeDate(iso: string, style: DateStyle): string {
  if (!isIsoDate(iso)) return "";
  const [y, m, d] = iso.split("-");
  if (style === "dotted") return `${d}.${m}.${y}`;
  if (style === "monthFirst") return `${Number(m)}/${Number(d)}/${y}`;
  if (style === "dayFirst") return `${d}/${m}/${y}`;
  return iso;
}

// F/HR/01's slashed dates are month first like F/HR/03's; F/HR/06's are day first.
const slashOrderOf = (style: DateStyle): SlashOrder => (style === "dotted" || style === "monthFirst" ? "mdy" : "dmy");

const ROLE_WORD = /\b(?:operator|manager|exe?cutive|exucutive|helper|assi|assistant|hod|head|caller|supervisor|engineer|co-?ordinator|trainee)\b/i;

/**
 * "POUCH-Manager", "OPERATOR- POUCH", "IT - ASSISTANT" — F/HR/06 writes the
 * joining department and designation in one box, in either order. The part
 * that names a role is the designation.
 */
export function splitDepartmentDesignation(text: string): { department: string; designation: string } {
  const whole = String(text ?? "").trim();
  const parts = whole.split(/\s*-\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length !== 2) return { department: "", designation: whole };
  const [a, b] = parts;
  return ROLE_WORD.test(a) && !ROLE_WORD.test(b) ? { department: b, designation: a } : { department: a, designation: b };
}

// ---------------------------------------------------------------------------
// which box of which format takes which column

export type MasterSource = HrMasterColumnKey | "departmentThenDesignation" | "designationThenDepartment";

export interface LinkedField {
  /** The header field's or column's key on the format. */
  key: string;
  from: MasterSource;
  /** For a date: how this format writes it. */
  style?: DateStyle;
}

export interface HrMasterLink {
  docId: string;
  formatNo: string;
  /** One person per record, in the header — or one person per line of a register. */
  where: "header" | "rows";
  /** The box that names the person. */
  nameField: string;
  fields: LinkedField[];
}

// F/HR/06's "Joining department & designation" and F/HR/13's "Department &
// Designation" are written designation first, as the CV import has always
// written them (engine/hrJoiner.ts) and as F/HR/13's own lines read ("Manager -
// HR"); F/HR/04's is department first, as its specimen reads ("HR & Admin –
// Manager"). The formats not here name nobody (F/HR/09, 21, 22), name a
// position rather than a person (F/HR/07), name only an inspection team
// (F/HR/19), or are about visitors, who are not on the sheet (F/HR/14).
export const HR_MASTER_LINKS: HrMasterLink[] = [
  {
    docId: "hr-competence",
    formatNo: "F/HR/01",
    where: "rows",
    nameField: "name",
    fields: [
      { key: "name", from: "fullName" },
      { key: "department", from: "department" },
      { key: "designation", from: "designation" },
      { key: "dateOfJoining", from: "joiningDate", style: "dotted" },
    ],
  },
  {
    docId: "hr-skill-matrix",
    formatNo: "F/HR/03",
    where: "rows",
    nameField: "name",
    fields: [
      { key: "name", from: "fullName" },
      { key: "designation", from: "designation" },
      { key: "dateOfJoining", from: "joiningDate", style: "monthFirst" },
    ],
  },
  {
    docId: "hr-pre-employment-health",
    formatNo: "F/HR/04",
    where: "header",
    nameField: "name",
    fields: [
      { key: "name", from: "fullName" },
      { key: "deptDesignation", from: "departmentThenDesignation" },
      { key: "dateOfBirth", from: "dateOfBirth", style: "iso" },
    ],
  },
  {
    docId: "hr-induction-staff",
    formatNo: "F/HR/05",
    where: "header",
    nameField: "name",
    fields: [
      { key: "name", from: "fullName" },
      { key: "deptProcess", from: "department" },
      { key: "designation", from: "designation" },
      { key: "dateOfJoining", from: "joiningDate", style: "iso" },
    ],
  },
  {
    docId: "hr-induction-operators",
    formatNo: "F/HR/06",
    where: "rows",
    nameField: "name",
    fields: [
      { key: "name", from: "fullName" },
      { key: "joining", from: "designationThenDepartment" },
      { key: "dateOfJoiningInduction", from: "joiningDate", style: "dayFirst" },
    ],
  },
  {
    docId: "hr-training-needs",
    formatNo: "F/HR/08",
    where: "rows",
    nameField: "name",
    fields: [
      { key: "name", from: "fullName" },
      { key: "designation", from: "designation" },
    ],
  },
  {
    docId: "hr-training-effectiveness",
    formatNo: "F/HR/11",
    where: "header",
    nameField: "traineeName",
    fields: [
      { key: "traineeName", from: "fullName" },
      { key: "department", from: "department" },
      { key: "designation", from: "designation" },
    ],
  },
  {
    docId: "hr-training-feedback",
    formatNo: "F/HR/12",
    where: "rows",
    nameField: "name",
    fields: [{ key: "name", from: "fullName" }],
  },
  {
    docId: "hr-mobile-authorization",
    formatNo: "F/HR/13",
    where: "rows",
    nameField: "name",
    fields: [
      { key: "name", from: "fullName" },
      { key: "deptDesignation", from: "designationThenDepartment" },
    ],
  },
  {
    docId: "hr-psc-survey",
    formatNo: "F/HR/20",
    where: "header",
    nameField: "employeeName",
    fields: [
      { key: "employeeName", from: "fullName" },
      { key: "department", from: "department" },
      { key: "designation", from: "designation" },
    ],
  },
];

export const hrMasterLinkFor = (docId: string | undefined): HrMasterLink | undefined => (docId ? HR_MASTER_LINKS.find((l) => l.docId === docId) : undefined);

/** "Department / Process ← Department": the format's own box, and the column it takes. */
export function linkedFieldLabel(docId: string, field: LinkedField): string {
  const layout = getLogSheetLayout(docId);
  const label = [...(layout?.headerFields ?? []), ...(layout?.footerFields ?? []), ...(layout?.columns ?? [])].find((f) => f.key === field.key)?.label ?? field.key;
  const from =
    field.from === "departmentThenDesignation" ? "Department - Designation" : field.from === "designationThenDepartment" ? "Designation - Department" : hrMasterColumnLabel(field.from);
  return label.toLowerCase() === from.toLowerCase() ? label : `${label} ← ${from}`;
}

const isDateSource = (f: LinkedField): f is LinkedField & { from: "joiningDate" | "dateOfBirth" } => f.from === "joiningDate" || f.from === "dateOfBirth";

/** What a box of the format gets for this person — "" when the sheet has nothing for it. */
export function linkedValue(person: HrMasterPerson, field: LinkedField): string {
  const joined = (...parts: string[]) =>
    parts
      .map((p) => String(p ?? "").trim())
      .filter(Boolean)
      .join(" - ");
  if (field.from === "departmentThenDesignation") return joined(person.department, person.designation);
  if (field.from === "designationThenDepartment") return joined(person.designation, person.department);
  if (isDateSource(field)) return writeDate(person[field.from], field.style ?? "iso");
  return String(person[field.from] ?? "").trim();
}

// ---------------------------------------------------------------------------
// finding a person

/** The one person a box names — by full name, or by a GP3 No. typed into it — or null when it names nobody on the sheet, or several. */
/** The name names this person: their full name, or another spelling the registers use for them. */
export const namesPerson = (value: unknown, person: HrMasterPerson): boolean => sameName(value, person.fullName) || (person.aliases ?? []).some((a) => sameName(value, a));

export function personNamed(value: unknown, people: HrMasterPerson[]): HrMasterPerson | null {
  if (!String(value ?? "").trim()) return null;
  const byName = people.filter((p) => namesPerson(value, p));
  if (byName.length === 1) return byName[0];
  if (byName.length > 1) return null;
  const byNumber = people.filter((p) => sameGp3(p.gp3No, value));
  return byNumber.length === 1 ? byNumber[0] : null;
}

export interface PersonSearch {
  /** The one person the words name without doubt: a GP3 No., or a full name. */
  exact: HrMasterPerson | null;
  /** Everyone they could mean (the exact person included). */
  candidates: HrMasterPerson[];
}

/** People for a GP3 No. or a name, or the start of one ("Sandeep", "vishnu jad"). */
export function searchPeople(query: unknown, people: HrMasterPerson[], limit = 8): PersonSearch {
  const q = String(query ?? "").trim();
  if (!q) return { exact: null, candidates: [] };
  const byNumber = people.filter((p) => sameGp3(p.gp3No, q));
  if (byNumber.length > 0) return { exact: byNumber.length === 1 ? byNumber[0] : null, candidates: byNumber.slice(0, limit) };
  const byName = people.filter((p) => namesPerson(q, p));
  if (byName.length > 0) return { exact: byName.length === 1 ? byName[0] : null, candidates: byName.slice(0, limit) };
  const tokens = nameKey(q).split(" ").filter(Boolean);
  if (tokens.length === 0) return { exact: null, candidates: [] };
  const partial = people.filter((p) => {
    const words = nameKey(p.fullName).split(" ");
    return tokens.every((t) => words.some((w) => w.startsWith(t)));
  });
  return { exact: null, candidates: partial.slice(0, limit) };
}

/** "Sandeep Parekh · GP3 No. 1024 · HR & Admin · Manager" */
export function describePerson(person: HrMasterPerson): string {
  return [person.fullName || "(no name)", person.gp3No ? `GP3 No. ${person.gp3No}` : "", person.department, person.designation].filter(Boolean).join(" · ");
}

// ---------------------------------------------------------------------------
// fetching a person onto a format

export interface FieldFill {
  key: string;
  before: string;
  after: string;
}

export interface PersonFill {
  /** Boxes that are blank, or hold the person's own GP3 No. — filled without asking. */
  fills: FieldFill[];
  /** Boxes that already hold something else — replaced only when the person says so. */
  conflicts: FieldFill[];
}

/** What fetching this person onto a header, or onto one line of a register, would write. */
export function personFill(link: HrMasterLink, person: HrMasterPerson, current: Record<string, unknown>): PersonFill {
  const fills: FieldFill[] = [];
  const conflicts: FieldFill[] = [];
  for (const f of link.fields) {
    const after = linkedValue(person, f);
    if (!after) continue;
    const before = String(current[f.key] ?? "").trim();
    if (before === after) continue;
    if (!before) {
      fills.push({ key: f.key, before, after });
      continue;
    }
    if (f.key === link.nameField) {
      // The same name written another way is the register's own spelling, and
      // stays; a GP3 No. typed where the name goes becomes the name.
      if (namesPerson(before, person)) continue;
      if (person.gp3No && sameGp3(before, person.gp3No)) {
        fills.push({ key: f.key, before, after });
        continue;
      }
    } else if (isDateSource(f)) {
      if (parseWrittenDate(before, slashOrderOf(f.style ?? "iso")) === person[f.from]) continue;
    } else if (f.from === "departmentThenDesignation" || f.from === "designationThenDepartment") {
      // "POUCH-Manager" and "Manager - POUCH" say the same thing.
      const written = before.split(/\s*-\s*/).map(nameKey).filter(Boolean).sort();
      const sheet = [person.department, person.designation].map(nameKey).filter(Boolean).sort();
      if (written.length === sheet.length && written.every((w, i) => w === sheet[i])) continue;
    } else if (nameKey(before) === nameKey(after)) continue;
    conflicts.push({ key: f.key, before, after });
  }
  return { fills, conflicts };
}

export function applyFills<T extends Record<string, unknown>>(current: T, fills: FieldFill[]): T {
  if (fills.length === 0) return current;
  return { ...current, ...Object.fromEntries(fills.map((f) => [f.key, f.after])) } as T;
}

export type LineMatch = { kind: "none" } | { kind: "line"; index: number } | { kind: "several"; indexes: number[] };

/**
 * The line of a register that is this person's. A line is theirs by a GP3 No.
 * typed in its name box, or by name — but by name only when no one else on
 * the sheet has that name. Of several such lines, one with a Date of Leaving is
 * someone who has left (F/HR/01 has two Anil Ravals), and one that already
 * agrees with the sheet is preferred; if that still leaves more than one, the
 * answer is "several" and nothing is guessed.
 */
export function lineOfPerson(link: HrMasterLink, rows: LogSheetRow[], person: HrMasterPerson, people: HrMasterPerson[]): LineMatch {
  const namesake = people.some((p) => p.id !== person.id && (namesPerson(person.fullName, p) || (person.aliases ?? []).some((a) => namesPerson(a, p))));
  const candidates = rows
    .map((_, i) => i)
    .filter((i) => {
      const box = rows[i][link.nameField];
      return (!namesake && namesPerson(box, person)) || (!!person.gp3No && sameGp3(box, person.gp3No));
    });
  if (candidates.length === 0) return { kind: "none" };
  if (candidates.length === 1) return { kind: "line", index: candidates[0] };
  const current = candidates.filter((i) => !String(rows[i].dateOfLeaving ?? "").trim());
  const pool = current.length > 0 ? current : candidates;
  if (pool.length === 1) return { kind: "line", index: pool[0] };
  const agreeing = pool.filter((i) => personFill(link, person, rows[i]).conflicts.length === 0);
  if (agreeing.length === 1) return { kind: "line", index: agreeing[0] };
  return { kind: "several", indexes: pool };
}

/** A new line for this person on a register, starting from the register's blank line. */
export function lineForPerson(link: HrMasterLink, person: HrMasterPerson, blank: LogSheetRow): LogSheetRow {
  const line: LogSheetRow = { ...blank };
  for (const f of link.fields) {
    const value = linkedValue(person, f);
    if (value) line[f.key] = value;
  }
  return line;
}

export interface BlankFill {
  data: LogSheetData;
  /** Each person something was filled for: the line (null for the header) and the boxes. */
  filled: { index: number | null; name: string; fills: FieldFill[] }[];
  /** Names written on the form that are not on the sheet (or are on it more than once). */
  notOnSheet: string[];
  /** Names on more than one line of the register that could each be the person — left alone. */
  onSeveralLines: string[];
}

/**
 * "Fill blanks from HR Master Data": every person the form already names who
 * is on the sheet gets their blank boxes filled. Nothing written is changed.
 */
export function fillBlanksFromMaster(link: HrMasterLink, data: LogSheetData, people: HrMasterPerson[]): BlankFill {
  const filled: BlankFill["filled"] = [];
  const notOnSheet: string[] = [];
  const onSeveralLines: string[] = [];
  let header = data.header ?? {};
  let rows = data.rows ?? [];
  if (link.where === "header") {
    const name = String(header[link.nameField] ?? "").trim();
    if (name) {
      const person = personNamed(name, people);
      if (!person) notOnSheet.push(name);
      else {
        const { fills } = personFill(link, person, header);
        if (fills.length > 0) {
          header = applyFills(header, fills);
          filled.push({ index: null, name: person.fullName, fills });
        }
      }
    }
  } else {
    const source = rows;
    const named = source.map((row) => {
      const name = String(row[link.nameField] ?? "").trim();
      return name ? { name, person: personNamed(name, people) } : null;
    });
    const count = new Map<string, number>();
    for (const n of named) if (n?.person) count.set(n.person.id, (count.get(n.person.id) ?? 0) + 1);
    // A person named on several lines fills only the one line that is theirs.
    const theirLine = new Map<string, number | null>();
    for (const [id, n] of count) {
      if (n < 2) continue;
      const person = people.find((p) => p.id === id);
      const match = person ? lineOfPerson(link, source, person, people) : { kind: "none" as const };
      theirLine.set(id, match.kind === "line" ? match.index : null);
    }
    rows = source.map((row, index) => {
      const entry = named[index];
      if (!entry) return row;
      const { name, person } = entry;
      if (!person) {
        notOnSheet.push(name);
        return row;
      }
      if (theirLine.has(person.id) && theirLine.get(person.id) !== index) {
        if (theirLine.get(person.id) === null && !onSeveralLines.includes(name)) onSeveralLines.push(name);
        return row;
      }
      const { fills } = personFill(link, person, row);
      if (fills.length === 0) return row;
      filled.push({ index, name: person.fullName, fills });
      return applyFills(row, fills);
    });
  }
  return { data: filled.length > 0 ? { ...data, header, rows } : data, filled, notOnSheet, onSeveralLines };
}

// ---------------------------------------------------------------------------
// checking a line of the sheet

export interface PersonProblem {
  field: HrMasterColumnKey;
  message: string;
}

export function personProblems(person: HrMasterPerson, people: HrMasterPerson[], today = todayISO()): PersonProblem[] {
  const out: PersonProblem[] = [];
  if (!person.fullName.trim()) out.push({ field: "fullName", message: "Full Name is required." });
  if (person.gp3No.trim()) {
    const other = people.find((p) => p.id !== person.id && sameGp3(p.gp3No, person.gp3No));
    if (other) out.push({ field: "gp3No", message: `GP3 No. ${person.gp3No} is also given to ${other.fullName || "another line"}.` });
  }
  for (const key of ["joiningDate", "dateOfBirth"] as const) {
    if (person[key] && !isIsoDate(person[key])) out.push({ field: key, message: `${hrMasterColumnLabel(key)} is not a date.` });
  }
  if (isIsoDate(person.dateOfBirth) && person.dateOfBirth > today) out.push({ field: "dateOfBirth", message: "Date of Birth is in the future." });
  if (isIsoDate(person.dateOfBirth) && isIsoDate(person.joiningDate) && person.dateOfBirth >= person.joiningDate) {
    out.push({ field: "dateOfBirth", message: "Date of Birth is not before the Joining Date." });
  }
  return out;
}

// ---------------------------------------------------------------------------
// reading an uploaded sheet

const HEADER_ALIASES: Record<HrMasterColumnKey, RegExp> = {
  gp3No: /^(?:gp\s*-?\s*3(?:\s*(?:no|number|#))?|emp(?:loyee)?\s*(?:no|code|number|id)|token\s*no|card\s*no)$/,
  joiningDate: /^(?:joining\s*date|date\s*of\s*joining|doj|joined(?:\s*on)?|join\s*date)$/,
  fullName: /^(?:full\s*name|name|employee\s*name|name\s*of\s*(?:the\s*)?employee)$/,
  department: /^(?:department|dept|department\s*name)$/,
  designation: /^(?:designation|position|designation\s*(?:\/|&|and|or)\s*position|post)$/,
  dateOfBirth: /^(?:date\s*of\s*birth|dob|d\s*o\s*b|birth\s*date)$/,
};

const headerText = (cell: unknown) =>
  String(cell ?? "")
    .toLowerCase()
    .replace(/[.:*]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Which column of a header row holds which of the six. */
export function headerColumns(cells: string[]): Partial<Record<HrMasterColumnKey, number>> {
  const out: Partial<Record<HrMasterColumnKey, number>> = {};
  cells.forEach((cell, i) => {
    const text = headerText(cell);
    if (!text) return;
    for (const { key } of HR_MASTER_COLUMNS) {
      if (out[key] === undefined && HEADER_ALIASES[key].test(text)) {
        out[key] = i;
        break;
      }
    }
  });
  return out;
}

export type HrMasterValues = Record<HrMasterColumnKey, string>;

export const blankHrMasterValues = (): HrMasterValues => ({ gp3No: "", joiningDate: "", fullName: "", department: "", designation: "", dateOfBirth: "" });

export interface ImportChange {
  key: HrMasterColumnKey;
  before: string;
  after: string;
}

export interface ImportPlan {
  /** 1-based line of the file that holds the column headings. */
  headerLine: number;
  columns: HrMasterColumnKey[];
  additions: { line: number; values: HrMasterValues }[];
  updates: { line: number; personId: string; fullName: string; changes: ImportChange[] }[];
  unchanged: number;
  skipped: { line: number; reason: string }[];
  /** Lines taken in, with something in them left out (a date that is not a date). */
  warnings: { line: number; message: string }[];
  /** About the file as a whole — how its slashed dates were read. */
  notes: string[];
}

/**
 * What uploading a sheet would do. A line is matched to the sheet by its GP3
 * No., or — when it has none, or the number is new and the name is on the
 * sheet without one — by its full name. A matched line's filled cells update
 * that person; a blank cell leaves what the sheet has. Anything else with a
 * Full Name is added.
 */
export function planImport(grid: string[][], people: HrMasterPerson[]): ImportPlan | { error: string } {
  let headerIndex = -1;
  let map: Partial<Record<HrMasterColumnKey, number>> = {};
  for (let i = 0; i < Math.min(grid.length, 30); i++) {
    const found = headerColumns(grid[i] ?? []);
    if ((found.fullName !== undefined || found.gp3No !== undefined) && Object.keys(found).length >= 2) {
      headerIndex = i;
      map = found;
      break;
    }
  }
  if (headerIndex < 0) {
    return { error: "No heading row was found. The first row should read: GP3 No., Joining Date, Full Name, Department, Designation/Position, Date of Birth." };
  }
  const columns = HR_MASTER_COLUMNS.map((c) => c.key).filter((k) => map[k] !== undefined);
  const plan: ImportPlan = { headerLine: headerIndex + 1, columns, additions: [], updates: [], unchanged: 0, skipped: [], warnings: [], notes: [] };
  const seenNumbers = new Map<string, number>();
  const seenNames = new Map<string, number>();
  const additionNames = new Map<string, { line: number; numbered: boolean }>();
  const touched = new Set<string>();
  const numberKey = (value: string) => gp3Key(value).replace(/^0+(?=\d)/, "");

  // Slashed dates are read in one order for the whole file: day first unless a
  // date in it can only be month first (5/13/1990). A file with both kinds
  // cannot be read either way, so its ambiguous dates are left out.
  const SLASHED = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/;
  let dayOver12 = false;
  let monthOver12 = false;
  let ambiguous = false;
  for (const row of grid.slice(headerIndex + 1)) {
    for (const key of ["joiningDate", "dateOfBirth"] as const) {
      if (map[key] === undefined) continue;
      const m = SLASHED.exec(String(row?.[map[key] as number] ?? "").trim());
      if (!m) continue;
      if (+m[1] > 12) dayOver12 = true;
      else if (+m[2] > 12) monthOver12 = true;
      else if (m[1] !== m[2]) ambiguous = true;
    }
  }
  const mixed = dayOver12 && monthOver12;
  const slashOrder: SlashOrder = monthOver12 && !dayOver12 ? "mdy" : "dmy";
  if (mixed) plan.notes.push("The file writes slashed dates both day first and month first, so a date that could be either (like 04/05/2020) is left out.");
  else if (ambiguous) {
    plan.notes.push(
      slashOrder === "mdy"
        ? "Slashed dates are read month first (mm/dd/yyyy), as the file's own dates like 5/13/1990 show — check them before applying."
        : dayOver12
          ? "Slashed dates are read day first (dd/mm/yyyy), as the file's own dates like 21/07/2010 show — check them before applying."
          : "No slashed date in the file settles day-first or month-first, so they are read day first (dd/mm/yyyy) — check them before applying."
    );
  }

  for (let r = headerIndex + 1; r < grid.length; r++) {
    const line = r + 1;
    const row = grid[r] ?? [];
    const cell = (key: HrMasterColumnKey) => (map[key] === undefined ? "" : String(row[map[key] as number] ?? "").replace(/\s+/g, " ").trim());
    if (columns.every((k) => !cell(k))) continue;
    const values = blankHrMasterValues();
    for (const key of columns) {
      const raw = cell(key);
      if (key === "joiningDate" || key === "dateOfBirth") {
        if (!raw) continue;
        const slashed = SLASHED.exec(raw);
        if (mixed && slashed && +slashed[1] <= 12 && +slashed[2] <= 12 && slashed[1] !== slashed[2]) {
          plan.warnings.push({ line, message: `${hrMasterColumnLabel(key)} "${raw}" could be day first or month first, so it was left out.` });
          continue;
        }
        const iso = isIsoDate(raw) ? raw : parseWrittenDate(raw, slashOrder);
        if (iso) values[key] = iso;
        else plan.warnings.push({ line, message: `${hrMasterColumnLabel(key)} "${raw}" is not a date, so it was left out.` });
      } else values[key] = key === "gp3No" ? raw.replace(/\.0+$/, "") : raw;
    }
    if (!values.fullName && !values.gp3No) {
      plan.skipped.push({ line, reason: "It has no Full Name and no GP3 No." });
      continue;
    }
    if (values.gp3No) {
      const key = numberKey(values.gp3No);
      const earlier = seenNumbers.get(key);
      if (earlier !== undefined) {
        plan.skipped.push({ line, reason: `GP3 No. ${values.gp3No} is already on line ${earlier} of the file.` });
        continue;
      }
      seenNumbers.set(key, line);
    } else {
      const key = nameKey(values.fullName);
      const earlier = seenNames.get(key);
      if (earlier !== undefined) {
        plan.skipped.push({ line, reason: `${values.fullName} is already on line ${earlier} of the file, and neither line has a GP3 No.` });
        continue;
      }
      seenNames.set(key, line);
    }

    let match: HrMasterPerson | undefined;
    if (values.gp3No) {
      match = people.find((p) => sameGp3(p.gp3No, values.gp3No));
      if (!match && values.fullName) {
        const unnumbered = people.filter((p) => !p.gp3No.trim() && namesPerson(values.fullName, p));
        if (unnumbered.length === 1) match = unnumbered[0];
      }
      if (!match && !values.fullName) {
        plan.skipped.push({ line, reason: `GP3 No. ${values.gp3No} is not on the sheet, and the line has no Full Name to add.` });
        continue;
      }
    } else {
      const named = people.filter((p) => namesPerson(values.fullName, p));
      if (named.length > 1) {
        plan.skipped.push({ line, reason: `${named.length} people on the sheet are named ${values.fullName} — give the line a GP3 No.` });
        continue;
      }
      match = named[0];
    }

    if (!match) {
      // The same new person twice in the file — once without a GP3 No.
      const nameKeyOf = nameKey(values.fullName);
      const earlier = additionNames.get(nameKeyOf);
      if (earlier && (!values.gp3No || !earlier.numbered)) {
        plan.skipped.push({ line, reason: `${values.fullName} is already added from line ${earlier.line} of the file.` });
        continue;
      }
      additionNames.set(nameKeyOf, { line, numbered: !!values.gp3No });
      plan.additions.push({ line, values });
      continue;
    }
    if (touched.has(match.id)) {
      plan.skipped.push({ line, reason: `${match.fullName} is already updated by an earlier line of the file.` });
      continue;
    }
    touched.add(match.id);
    const person = match;
    const changes: ImportChange[] = columns
      // A GP3 No. the file writes without its leading zero is the number the sheet already has.
      .filter((key) => values[key] && values[key] !== person[key].trim() && !(key === "gp3No" && sameGp3(values[key], person[key])))
      .map((key) => ({ key, before: person[key], after: values[key] }));
    if (changes.length === 0) plan.unchanged++;
    else plan.updates.push({ line, personId: person.id, fullName: person.fullName || values.fullName, changes });
  }
  return plan;
}
