// ONE LATENESS RULE, FOR THE PAGE AND FOR THE SERVER (REQUIREMENTS §64, §75).
//
// What counts as on time, late and never done — and whom a record counts
// against — is decided HERE and nowhere else. The Performance Scorecard
// (engine/performance.ts, the page every person is judged by) adds these
// answers up in the browser; the server's daily escalation to the super admin
// and its weekly digest (backend/escalation.ts) add up the very same answers
// from the records stored in PostgreSQL. Two copies of the rule would one day
// disagree, and an administrator told "Kapila was late three times" by the
// escalation must find the same three on the scorecard.
//
// WITH NO IMPORTS AT ALL — like data/seed/documentDepartments.ts — because the
// server runs its .ts files with Node's type stripping, which cannot follow the
// app's extensionless imports. So everything this rule leans on is written in
// here (the few lines of date arithmetic, "still open after its day") or passed
// in (the plant's calendar, which department owns a document). The shapes below
// are the few fields the rule reads; the app's RecordInstance, DocumentDefinition
// and account fit them as they are, and so does a record parsed from the stored
// JSON on the server.
//
// frontend/tests/latenessCore.test.ts holds this file to the scorecard as it
// stood before the rule was moved here, record by record and figure by figure.

export type Outcome = "onTime" | "late" | "overdue" | "pending" | "notCounted";

/** An as-required record has no schedule to be late against: it gets this many days from the date it is for — and the last of them is never a day the plant was closed. */
export const AS_REQUIRED_DAYS = 2;

/** The fields of a record the rule reads. */
export interface LatenessRecord {
  documentId: string;
  dueDate: string;
  status: string;
  data?: unknown;
  submittedAt?: string | null;
  submittedBy?: string | null;
  history?: readonly { action: string; at: string; by?: string }[] | null;
}

/** The fields of a document definition the rule reads. */
export interface LatenessDocument {
  id: string;
  name: string;
  formatNo?: string;
  module: string;
  kind: string;
  isReferenceOnly?: boolean;
  schedule: { type: string };
}

/** An account as the rule needs it — never the email. */
export interface LatenessPerson {
  id: string;
  name: string;
  role: string;
  departments: readonly string[];
}

/**
 * The plant's calendar, as far as the score needs it. `isClosedDay` answers
 * for the weekly off and the leave calendar; `countedFrom` is the day Live
 * records start to count — before it they are the generator's leftovers, not
 * work (engine/backlogCleanup.ts). `dateOf` turns the moment a record was
 * handed in into the plant's date: left out, it is this computer's own date,
 * which in the plant's browsers IS the plant's; the server passes the plant's
 * zone (PLANT_TIMEZONE), since a hosted server's clock usually runs in UTC,
 * where a record handed in at 01:00 in the plant would count on the day before.
 */
export interface PlantCalendar {
  isClosedDay: (dateISO: string) => boolean;
  countedFrom?: string | null;
  dateOf?: (stamp: string) => string | null;
}

export const ALWAYS_OPEN: PlantCalendar = { isClosedDay: () => false };

export interface Judgement {
  outcome: Outcome;
  /** Whole days after the day it had to be in; 0 unless late. */
  daysLate: number;
  /** Who handed it in, when somebody did. */
  by?: string;
}

const NOT_COUNTED: Judgement = { outcome: "notCounted", daysLate: 0 };

// ---- The few lines of date arithmetic, written in (no imports) --------------

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const pad2 = (n: number): string => (n < 10 ? `0${n}` : `${n}`);

/** A moment as a date on this computer's own clock — utils/date.ts toISODate(new Date(stamp)). */
function localDateOf(stamp: string): string | null {
  const when = new Date(stamp);
  return Number.isNaN(when.getTime()) ? null : `${when.getFullYear()}-${pad2(when.getMonth() + 1)}-${pad2(when.getDate())}`;
}

/** A moment as a date in a named time zone ("Asia/Kolkata") — the server's `dateOf`. */
export function dateInZone(stamp: string | Date, timeZone: string): string | null {
  const when = stamp instanceof Date ? stamp : new Date(stamp);
  if (Number.isNaN(when.getTime())) return null;
  // en-CA writes a date as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(when);
}

/** An ISO date n days on (or back) — utils/date.ts addDays, worked in UTC so no clock's summer time can move it. */
export function addDaysISO(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const when = new Date(Date.UTC(y, (m ?? 1) - 1, (d ?? 1) + n));
  return `${when.getUTCFullYear()}-${pad2(when.getUTCMonth() + 1)}-${pad2(when.getUTCDate())}`;
}

/** Whole days from the day it had to be in to the day it came in — engine/reactions.ts daysLate, the count Mitra's "submitted N days late" uses. */
function daysAfter(dueDate: string, on: string): number {
  const days = Math.round((Date.parse(on) - Date.parse(dueDate)) / MS_PER_DAY);
  return Number.isFinite(days) ? days : 0;
}

/** Still open after its day — engine/recordLifecycle.ts isOverdue. */
const STILL_OPEN: readonly string[] = ["Scheduled", "Due", "In Progress"];
const isOverdue = (dueDate: string, status: string, today: string): boolean => dueDate < today && STILL_OPEN.includes(status);

// ---- The plant's calendar, from the master data it keeps ---------------------

/** The part of the master data that says when the plant is closed (types/master.ts). */
export interface CalendarMaster {
  weeklyOffDay?: number;
  holidays?: readonly { date: string }[] | null;
  adjustmentDays?: readonly { date: string }[] | null;
}

/** Thursday, Gujarat Printpack's weekly off (engine/holidays.ts DEFAULT_WEEKLY_OFF). */
const DEFAULT_WEEKLY_OFF = 4;

/**
 * IS THE PLANT CLOSED ON THIS DATE — engine/holidays.ts dayInfo's answer, for a
 * server that cannot load that file: a festival holiday is closed; an
 * adjustment day (a weekly off the plant works to make up for a festival) is
 * open; otherwise the weekly off is closed. Asked once per date however many
 * records share it. The browser keeps asking engine/holidays.ts itself; the
 * unit test holds the two to the same answer for every day of three years.
 */
export function plantClosedDays(master: CalendarMaster | null | undefined): (dateISO: string) => boolean {
  const festivals = new Set((master?.holidays ?? []).map((h) => h?.date).filter((d): d is string => typeof d === "string"));
  const adjustments = new Set((master?.adjustmentDays ?? []).map((a) => a?.date).filter((d): d is string => typeof d === "string"));
  const w = master?.weeklyOffDay;
  const weeklyOff = typeof w === "number" && w >= 0 && w <= 6 ? w : DEFAULT_WEEKLY_OFF;
  const known = new Map<string, boolean>();
  return (dateISO) => {
    let closed = known.get(dateISO);
    if (closed === undefined) {
      const [y, m, d] = dateISO.split("-").map(Number);
      closed = festivals.has(dateISO) ? true : adjustments.has(dateISO) ? false : new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)).getUTCDay() === weeklyOff;
      known.set(dateISO, closed);
    }
    return closed;
  };
}

// ---- One record: on time, late, never done ------------------------------------

// WHEN IT WAS FIRST HANDED IN. A record corrected afterwards is submitted again
// and its stamp moves to that day (engine/recordLifecycle.ts), which would turn
// a record that was on time into a late one for having been put right. The
// history keeps every submission, oldest first, so the first one is the one
// that is judged — and the person who made it is the one it counts for. A
// record from before the history existed has only its stamp.
const PAST_SUBMISSION: readonly string[] = ["Submitted", "Pending Verification", "Verified", "Rejected"];

function firstSubmission(record: LatenessRecord, calendar: PlantCalendar): { on: string | null; by: string } | null {
  const first = record.history?.find((h) => h.action === "submitted");
  const at = first?.at ?? record.submittedAt;
  if (at) return { on: (calendar.dateOf ?? localDateOf)(at), by: first?.by ?? record.submittedBy ?? "" };
  // Past submission with no stamp to say when: nothing shows it was late.
  return PAST_SUBMISSION.includes(record.status) ? { on: null, by: record.submittedBy ?? "" } : null;
}

/** How one record went, with the days late and who handed it in. */
export function judge(record: LatenessRecord, doc: LatenessDocument, today: string, calendar: PlantCalendar = ALWAYS_OPEN): Judgement {
  if (doc.isReferenceOnly) return NOT_COUNTED;
  // The daily register's H O L I D A Y line is a closed day written down, not work.
  if (doc.kind === "daily-pest-monitoring" && (record.data as { isHoliday?: unknown } | null | undefined)?.isHoliday) return NOT_COUNTED;
  const asRequired = doc.schedule.type === "as-required";
  // Nobody files paperwork on the weekly off or a festival holiday (engine/reminders.ts
  // says the same). An as-required record is different: somebody started it that day.
  if (!asRequired && calendar.isClosedDay(record.dueDate)) return NOT_COUNTED;
  const handedIn = firstSubmission(record, calendar);
  if (!handedIn && calendar.countedFrom && record.dueDate < calendar.countedFrom) return NOT_COUNTED;

  let deadline = record.dueDate;
  if (asRequired) {
    deadline = addDaysISO(record.dueDate, AS_REQUIRED_DAYS);
    // Nobody can hand paperwork in on the weekly off: the allowance runs to the next day the plant is open.
    for (let i = 0; i < 14 && calendar.isClosedDay(deadline); i++) deadline = addDaysISO(deadline, 1);
  }
  if (handedIn) {
    const late = handedIn.on ? Math.max(0, daysAfter(deadline, handedIn.on)) : 0;
    return { outcome: late > 0 ? "late" : "onTime", daysLate: late, by: handedIn.by };
  }
  // Overdue is what it is everywhere else — still open after its day — asked of the day it had to be in by.
  return { outcome: isOverdue(deadline, record.status, today) ? "overdue" : "pending", daysLate: 0 };
}

/** on time counts 1, late ½, never done 0: score = round(100 × (on time + ½ × late) ÷ (on time + late + never done)). */
export function scoreOf(onTime: number, late: number, overdue: number): number | null {
  const due = onTime + late + overdue;
  return due === 0 ? null : Math.round((100 * (onTime + 0.5 * late)) / due);
}

// ---- Whom a record counts against ----------------------------------------------

/** The departments an account is kept to, as the app applies them (store/AuthContext.tsx): the administrator covers every one, so answers for none. */
export function keptTo(person: LatenessPerson): string[] {
  if (person.role === "admin") return [];
  return Array.from(new Set(person.departments.map((c) => c.trim().toUpperCase()).filter(Boolean)));
}

/** A name however it was typed: "  kapila  BARAD" is Kapila Barad. */
export const sameName = (s: string): string => s.trim().replace(/\s+/g, " ").toLowerCase();

/** One record that counts, with whom it counts against. */
export interface Counted<R, D, P> {
  record: R;
  doc: D;
  judgement: Judgement;
  /** The department code that owns the document, "" when none is assigned. */
  department: string;
  /** The accounts it counts for or against — empty when no account answers for its department. */
  answering: readonly P[];
}

/** What the walk worked out on the way, for the caller to add up with. */
export interface Attribution<D, P> {
  /** The documents that can be scored (never a reference document), by id. */
  docsById: Map<string, D>;
  /** Each scored document's department code, "" when none is assigned. */
  departmentOf: Map<string, string>;
  /** The accounts kept to each department, in the order they were given. */
  accountsOf: Map<string, P[]>;
}

/**
 * EVERY RECORD DUE IN THE RANGE THAT COUNTS, AND WHOM IT COUNTS AGAINST — in
 * one pass, in the order the records were given.
 *
 * WHO ANSWERS FOR A RECORD: the accounts kept to the department that owns its
 * document. Where a department has more than one account (HR has two), a
 * record that was handed in counts for the person who handed it in — matched
 * by name, however it was typed — and a record nobody handed in counts against
 * every account of the department, because it was each one's to do. So does
 * one handed in by somebody who is not one of those accounts (the
 * administrator, an operator): the department's work was done, and neither of
 * them did it more than the other. An account with no departments works across
 * the plant and answers for no document of its own.
 *
 * `records` are the side being looked at (Live, or the demo) and `docs` the
 * documents in view; a record of a document not among them is left out.
 * `range` is a span of DUE dates, both ends counted; `today` is the day every
 * record is judged on, so a record of an earlier month handed in afterwards is
 * late, and one still not handed in is never done.
 */
export function attribute<R extends LatenessRecord, D extends LatenessDocument, P extends LatenessPerson>(
  records: readonly R[],
  docs: readonly D[],
  people: readonly P[],
  range: { from: string; to: string },
  today: string,
  calendar: PlantCalendar,
  departmentOfDocument: (doc: D) => string | null,
  visit: (counted: Counted<R, D, P>) => void
): Attribution<D, P> {
  const docsById = new Map<string, D>();
  const departmentOf = new Map<string, string>();
  for (const d of docs) {
    if (d.isReferenceOnly) continue;
    docsById.set(d.id, d);
    departmentOf.set(d.id, departmentOfDocument(d) ?? "");
  }

  const accountsOf = new Map<string, P[]>();
  const nameOf = new Map<string, string>();
  for (const p of people) {
    nameOf.set(p.id, sameName(p.name));
    for (const code of keptTo(p)) {
      const list = accountsOf.get(code);
      if (list) list.push(p);
      else accountsOf.set(code, [p]);
    }
  }

  const nobody: readonly P[] = [];
  for (const r of records) {
    if (r.dueDate < range.from || r.dueDate > range.to) continue;
    const doc = docsById.get(r.documentId);
    if (!doc) continue;
    const judgement = judge(r, doc, today, calendar);
    if (judgement.outcome === "notCounted") continue;
    const department = departmentOf.get(doc.id) ?? "";
    const accounts = accountsOf.get(department);
    let answering: readonly P[] = accounts ?? nobody;
    if (accounts && accounts.length > 1 && judgement.by) {
      const by = sameName(judgement.by);
      const theirs = accounts.filter((a) => nameOf.get(a.id) === by);
      if (theirs.length > 0) answering = theirs;
    }
    visit({ record: r, doc, judgement, department, answering });
  }
  return { docsById, departmentOf, accountsOf };
}
