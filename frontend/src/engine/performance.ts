import type { AuthUser } from "../types/auth";
import type { DailyPestMonitoringData, DocumentDefinition, MasterData, RecordInstance } from "../types";
import { departmentName, departmentOfDocument } from "../data/seed/departments";
import { isCompanyHoliday } from "./holidays";
import { daysLate } from "./reactions";
import { isOverdue } from "./recordLifecycle";
import { addDays, daysInMonth, formatDisplayDate, fromISODate, pad2, toISODate } from "../utils/date";

// THE PERFORMANCE SCORECARD (REQUIREMENTS §64).
//
// "make separate dashboard which give score to Kapila, HR's and module wise who
// is responsible for their document and decision will be taken on basis of what
// assigned task is done on time or not."
//
// One question is asked of every record that fell due in the period — was it
// handed in on time? — and the answers are added up four ways: by person, by
// department, by module and by document. People are going to be judged by the
// figure, so the rule is small enough to say in one line and is said on the
// page itself:
//
//   on time counts 1, late counts ½, never done counts 0
//   score = round(100 × (on time + ½ × late) ÷ (on time + late + never done))
//
// and everything that would make it unfair is left out of it: a day the plant
// was closed, a line the daily register marks H O L I D A Y, a reference
// document that has no records to be late with, a record that is not due yet,
// and the blank shells from before the system went live.
//
// Everything here is pure — the records, the definitions, the accounts and the
// day come in as arguments, nothing is read from storage — so the page works
// the whole scorecard out once per change (pages/PerformancePage.tsx) and a
// year of records is one pass, not one pass per person or per document.

export type Outcome = "onTime" | "late" | "overdue" | "pending" | "notCounted";

/** An as-required record has no schedule to be late against: it gets this many days from the date it is for — and the last of them is never a day the plant was closed. */
export const AS_REQUIRED_DAYS = 2;

/** An account as the scorecard needs it — never the email (backend/index.ts, GET /api/users/directory). */
export type Person = Pick<AuthUser, "id" | "name" | "role" | "departments">;

/**
 * The plant's calendar, as far as the score needs it. `isClosedDay` answers
 * for the weekly off and the leave calendar (closedDays below);
 * `countedFrom` is the day Live records start to count — before it they are
 * the generator's leftovers, not work (engine/backlogCleanup.ts).
 */
export interface PlantCalendar {
  isClosedDay: (dateISO: string) => boolean;
  countedFrom?: string | null;
}

const ALWAYS_OPEN: PlantCalendar = { isClosedDay: () => false };

/** isCompanyHoliday, asked once per date however many records share it. */
export function closedDays(master: MasterData): (dateISO: string) => boolean {
  const known = new Map<string, boolean>();
  return (dateISO) => {
    let closed = known.get(dateISO);
    if (closed === undefined) {
      closed = isCompanyHoliday(dateISO, master);
      known.set(dateISO, closed);
    }
    return closed;
  };
}

export interface Judgement {
  outcome: Outcome;
  /** Whole days after the day it had to be in; 0 unless late. */
  daysLate: number;
  /** Who handed it in, when somebody did. */
  by?: string;
}

const NOT_COUNTED: Judgement = { outcome: "notCounted", daysLate: 0 };

// WHEN IT WAS FIRST HANDED IN. A record corrected afterwards is submitted again
// and its stamp moves to that day (engine/recordLifecycle.ts), which would turn
// a record that was on time into a late one for having been put right. The
// history keeps every submission, oldest first, so the first one is the one
// that is judged — and the person who made it is the one it counts for. A
// record from before the history existed has only its stamp.
const PAST_SUBMISSION: readonly string[] = ["Submitted", "Pending Verification", "Verified", "Rejected"];

function firstSubmission(record: RecordInstance): { on: string | null; by: string } | null {
  const first = record.history?.find((h) => h.action === "submitted");
  const at = first?.at ?? record.submittedAt;
  if (at) {
    const when = new Date(at);
    return { on: Number.isNaN(when.getTime()) ? null : toISODate(when), by: first?.by ?? record.submittedBy ?? "" };
  }
  // Past submission with no stamp to say when: nothing shows it was late.
  return PAST_SUBMISSION.includes(record.status) ? { on: null, by: record.submittedBy ?? "" } : null;
}

/** How one record went, with the days late and who handed it in. */
export function judge(record: RecordInstance, doc: DocumentDefinition, today: string, calendar: PlantCalendar = ALWAYS_OPEN): Judgement {
  if (doc.isReferenceOnly) return NOT_COUNTED;
  // The daily register's H O L I D A Y line is a closed day written down, not work.
  if (doc.kind === "daily-pest-monitoring" && (record.data as Partial<DailyPestMonitoringData> | null)?.isHoliday) return NOT_COUNTED;
  const asRequired = doc.schedule.type === "as-required";
  // Nobody files paperwork on the weekly off or a festival holiday (engine/reminders.ts
  // says the same). An as-required record is different: somebody started it that day.
  if (!asRequired && calendar.isClosedDay(record.dueDate)) return NOT_COUNTED;
  const handedIn = firstSubmission(record);
  if (!handedIn && calendar.countedFrom && record.dueDate < calendar.countedFrom) return NOT_COUNTED;

  let deadline = record.dueDate;
  if (asRequired) {
    deadline = addDays(record.dueDate, AS_REQUIRED_DAYS);
    // Nobody can hand paperwork in on the weekly off: the allowance runs to the next day the plant is open.
    for (let i = 0; i < 14 && calendar.isClosedDay(deadline); i++) deadline = addDays(deadline, 1);
  }
  if (handedIn) {
    // The same count of days Mitra's "submitted N days late" uses (engine/reactions.ts).
    const late = handedIn.on ? Math.max(0, daysLate(deadline, handedIn.on)) : 0;
    return { outcome: late > 0 ? "late" : "onTime", daysLate: late, by: handedIn.by };
  }
  // Overdue is what it is everywhere else — still open after its day
  // (engine/recordLifecycle.ts, isOverdue) — asked of the day it had to be in by.
  const open = deadline === record.dueDate ? record : { ...record, dueDate: deadline };
  return { outcome: isOverdue(open, today) ? "overdue" : "pending", daysLate: 0 };
}

export function classify(record: RecordInstance, doc: DocumentDefinition, today: string, calendar: PlantCalendar = ALWAYS_OPEN): Outcome {
  return judge(record, doc, today, calendar).outcome;
}

// ---- The score and its grade ------------------------------------------------

export function scoreOf(onTime: number, late: number, overdue: number): number | null {
  const due = onTime + late + overdue;
  return due === 0 ? null : Math.round((100 * (onTime + 0.5 * late)) / due);
}

export type GradeKey = "excellent" | "on-track" | "needs-attention" | "falling-behind" | "nothing-due";

export interface Grade {
  key: GradeKey;
  emoji: string;
  label: string;
}

const GRADES: Record<GradeKey, Grade> = {
  excellent: { key: "excellent", emoji: "🌟", label: "Excellent" },
  "on-track": { key: "on-track", emoji: "✅", label: "On track" },
  "needs-attention": { key: "needs-attention", emoji: "⚠️", label: "Needs attention" },
  "falling-behind": { key: "falling-behind", emoji: "🔴", label: "Falling behind" },
  "nothing-due": { key: "nothing-due", emoji: "➖", label: "Nothing was due" },
};

export function grade(score: number | null): Grade {
  if (score === null) return GRADES["nothing-due"];
  if (score >= 90) return GRADES.excellent;
  if (score >= 75) return GRADES["on-track"];
  if (score >= 50) return GRADES["needs-attention"];
  return GRADES["falling-behind"];
}

// ---- Adding up ----------------------------------------------------------------

/** One record named in a decision: "F/QC/12 of 09-Sep". */
export interface Miss {
  /** The format number, or the document's name while its number is still to be confirmed. */
  what: string;
  dueDate: string;
  days: number;
}

interface Tally {
  onTime: number;
  late: number;
  overdue: number;
  pending: number;
  /** The never-done record that has waited longest. */
  oldestMissed: Miss | null;
  /** The late record that was latest. */
  worstLate: Miss | null;
}

const emptyTally = (): Tally => ({ onTime: 0, late: 0, overdue: 0, pending: 0, oldestMissed: null, worstLate: null });

function count(t: Tally, j: Judgement, what: string, dueDate: string): void {
  if (j.outcome === "onTime") t.onTime += 1;
  else if (j.outcome === "pending") t.pending += 1;
  else if (j.outcome === "late") {
    t.late += 1;
    if (!t.worstLate || j.daysLate > t.worstLate.days) t.worstLate = { what, dueDate, days: j.daysLate };
  } else if (j.outcome === "overdue") {
    t.overdue += 1;
    if (!t.oldestMissed || dueDate < t.oldestMissed.dueDate) t.oldestMissed = { what, dueDate, days: 0 };
  }
}

function merge(into: Tally, from: Tally): void {
  into.onTime += from.onTime;
  into.late += from.late;
  into.overdue += from.overdue;
  into.pending += from.pending;
  if (from.oldestMissed && (!into.oldestMissed || from.oldestMissed.dueDate < into.oldestMissed.dueDate)) into.oldestMissed = from.oldestMissed;
  if (from.worstLate && (!into.worstLate || from.worstLate.days > into.worstLate.days)) into.worstLate = from.worstLate;
}

/**
 * THE DECISION, as a plain sentence built from the numbers. `summary` is the
 * app's own words; `named` is the record it points at — a format number and a
 * date, shown as written (REQUIREMENTS §58) — with the words that lead to it.
 */
export interface Decision {
  summary: string;
  lead?: string;
  named?: string;
}

export const decisionText = (d: Decision): string => (d.named ? `${d.summary}; ${d.lead} ${d.named}.` : `${d.summary}.`);

export interface ScoreLine {
  /** Records that fell due and are counted: on time + late + never done. */
  due: number;
  onTime: number;
  late: number;
  overdue: number;
  /** Not due yet — shown, never counted. */
  pending: number;
  score: number | null;
  grade: Grade;
  decision: Decision;
}

/** "09-Sep" within the year being looked at from, the whole date otherwise. */
function shortDate(iso: string, today: string): string {
  const full = formatDisplayDate(iso);
  return iso.slice(0, 4) === today.slice(0, 4) ? full.slice(0, 6) : full;
}

function decide(t: Tally, g: Grade, today: string): Decision {
  const due = t.onTime + t.late + t.overdue;
  if (due === 0) return { summary: t.pending > 0 ? `Nothing has fallen due yet — ${t.pending} still to come` : "Nothing was due in this period" };
  const parts = [`${t.onTime} of ${due} on time`];
  if (t.late > 0) parts.push(`${t.late} late`);
  if (t.overdue > 0) parts.push(`${t.overdue} never done`);
  const summary = `${parts.join(", ")} — ${g.label.toLowerCase()}`;
  if (t.oldestMissed) {
    const lead = t.overdue === 1 ? "the one never done is" : "the oldest never done is";
    return { summary, lead, named: `${t.oldestMissed.what} of ${shortDate(t.oldestMissed.dueDate, today)}` };
  }
  if (t.worstLate) {
    const days = `${t.worstLate.days} day${t.worstLate.days === 1 ? "" : "s"} late`;
    const lead = t.late === 1 ? `the late one came in ${days}:` : `the latest came in ${days}:`;
    return { summary, lead, named: `${t.worstLate.what} of ${shortDate(t.worstLate.dueDate, today)}` };
  }
  return { summary };
}

function line(t: Tally, today: string): ScoreLine {
  const score = scoreOf(t.onTime, t.late, t.overdue);
  const g = grade(score);
  return { due: t.onTime + t.late + t.overdue, onTime: t.onTime, late: t.late, overdue: t.overdue, pending: t.pending, score, grade: g, decision: decide(t, g, today) };
}

/** Worst first: the lowest score, then the most never done, then the most due; nothing due goes last. */
function worstFirst(a: ScoreLine, b: ScoreLine): number {
  if (a.score === null || b.score === null) return a.score === b.score ? 0 : a.score === null ? 1 : -1;
  return a.score - b.score || b.overdue - a.overdue || b.due - a.due;
}

// ---- The period -----------------------------------------------------------------

export type PeriodKey = "this-month" | "last-month" | "last-3-months" | "this-year";

export const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "this-month", label: "This month" },
  { key: "last-month", label: "Last month" },
  { key: "last-3-months", label: "The last 3 months" },
  { key: "this-year", label: "This year" },
];

export interface Period {
  key: PeriodKey;
  /** First and last due date counted, ISO. */
  from: string;
  to: string;
}

const monthStart = (year: number, month0: number): string => toISODate(new Date(year, month0, 1));
function monthEnd(year: number, month0: number): string {
  const first = new Date(year, month0, 1);
  return `${first.getFullYear()}-${pad2(first.getMonth() + 1)}-${pad2(daysInMonth(first.getFullYear(), first.getMonth()))}`;
}

/** The due dates a period covers. "The last 3 months" is this month and the two before it. */
export function periodFor(key: PeriodKey, today: string): Period {
  const now = fromISODate(today);
  const y = now.getFullYear();
  const m = now.getMonth();
  if (key === "last-month") return { key, from: monthStart(y, m - 1), to: monthEnd(y, m - 1) };
  if (key === "last-3-months") return { key, from: monthStart(y, m - 2), to: monthEnd(y, m) };
  if (key === "this-year") return { key, from: `${y}-01-01`, to: `${y}-12-31` };
  return { key: "this-month", from: monthStart(y, m), to: monthEnd(y, m) };
}

// ---- The scorecards -----------------------------------------------------------

export interface DocumentScore extends ScoreLine {
  doc: DocumentDefinition;
  /** The department code that owns it, "" when none is assigned. */
  department: string;
}

export interface DepartmentScore extends ScoreLine {
  code: string;
  name: string;
  documents: number;
  /** The accounts that answer for it, by name. */
  people: string[];
}

export interface ModuleScore extends ScoreLine {
  module: string;
  documents: number;
}

export interface PersonScore extends ScoreLine {
  person: Person;
  /** The departments whose documents this person answers for; none for management and the administrator. */
  departments: string[];
  /** False for an account with no departments: listed, never scored. */
  answers: boolean;
  /** Departments this person shares with another account — where a submitted record counts for whoever submitted it. */
  shared: string[];
  /** Up to three documents with something late or never done, worst first. */
  worst: DocumentScore[];
}

export interface Scorecards {
  period: Period;
  byPerson: PersonScore[];
  byDepartment: DepartmentScore[];
  byModule: ModuleScore[];
  byDocument: DocumentScore[];
}

const NO_DEPARTMENT = "";
const sameName = (s: string): string => s.trim().replace(/\s+/g, " ").toLowerCase();

/** The departments an account is kept to, as the app applies them (store/AuthContext.tsx): the administrator covers every one, so answers for none. */
function keptTo(person: Person): string[] {
  if (person.role === "admin") return [];
  return Array.from(new Set(person.departments.map((c) => c.trim().toUpperCase()).filter(Boolean)));
}

/** The name a record is called by in a decision. */
const calledBy = (doc: DocumentDefinition): string => (doc.formatNo && !doc.formatNo.toUpperCase().startsWith("TO BE") ? doc.formatNo : doc.name);

/**
 * Every scorecard for one period, in one pass over the records.
 *
 * WHO ANSWERS FOR A RECORD: the accounts kept to the department that owns its
 * document. Where a department has more than one account (HR has two), a
 * record that was handed in counts for the person who handed it in — matched
 * by name, however it was typed — and a record nobody handed in counts against
 * every account of the department, because it was each one's to do. So does
 * one handed in by somebody who is not one of those accounts (the
 * administrator, an operator): the department's work was done, and neither of
 * them did it more than the other. An account with no departments works across
 * the plant and answers for no document of its own: it is listed without a
 * score.
 *
 * `records` are the side being looked at (Demo or Live) and `docs` the
 * documents the viewer may see; a record of a document not among them is left
 * out, which is what keeps a department's scorecard to its own paperwork.
 */
export function scorecards(
  records: readonly RecordInstance[],
  docs: readonly DocumentDefinition[],
  people: readonly Person[],
  periodKey: PeriodKey,
  today: string,
  calendar: PlantCalendar = ALWAYS_OPEN
): Scorecards {
  const period = periodFor(periodKey, today);
  const docsById = new Map<string, DocumentDefinition>();
  const departmentOf = new Map<string, string>();
  const called = new Map<string, string>();
  for (const d of docs) {
    if (d.isReferenceOnly) continue;
    docsById.set(d.id, d);
    departmentOf.set(d.id, departmentOfDocument(d.id, d.formatNo) ?? NO_DEPARTMENT);
    called.set(d.id, calledBy(d));
  }

  const accountsOf = new Map<string, Person[]>();
  const nameOf = new Map<string, string>();
  for (const p of people) {
    nameOf.set(p.id, sameName(p.name));
    for (const code of keptTo(p)) {
      const list = accountsOf.get(code);
      if (list) list.push(p);
      else accountsOf.set(code, [p]);
    }
  }

  const perDocument = new Map<string, Tally>();
  const perPerson = new Map<string, Map<string, Tally>>();
  const tallyIn = (map: Map<string, Tally>, key: string): Tally => {
    let t = map.get(key);
    if (!t) {
      t = emptyTally();
      map.set(key, t);
    }
    return t;
  };

  for (const r of records) {
    if (r.dueDate < period.from || r.dueDate > period.to) continue;
    const doc = docsById.get(r.documentId);
    if (!doc) continue;
    const j = judge(r, doc, today, calendar);
    if (j.outcome === "notCounted") continue;
    const what = called.get(doc.id) ?? doc.name;
    count(tallyIn(perDocument, doc.id), j, what, r.dueDate);

    const accounts = accountsOf.get(departmentOf.get(doc.id) ?? NO_DEPARTMENT);
    if (!accounts) continue;
    let answering = accounts;
    if (accounts.length > 1 && j.by) {
      const by = sameName(j.by);
      const theirs = accounts.filter((a) => nameOf.get(a.id) === by);
      if (theirs.length > 0) answering = theirs;
    }
    for (const a of answering) {
      let mine = perPerson.get(a.id);
      if (!mine) {
        mine = new Map();
        perPerson.set(a.id, mine);
      }
      count(tallyIn(mine, doc.id), j, what, r.dueDate);
    }
  }

  const documentScore = (doc: DocumentDefinition, t: Tally): DocumentScore => ({ ...line(t, today), doc, department: departmentOf.get(doc.id) ?? NO_DEPARTMENT });

  const byDocument: DocumentScore[] = [];
  const departments = new Map<string, { tally: Tally; documents: number }>();
  const modules = new Map<string, { tally: Tally; documents: number }>();
  for (const doc of docsById.values()) {
    const t = perDocument.get(doc.id) ?? emptyTally();
    byDocument.push(documentScore(doc, t));
    for (const [map, key] of [
      [departments, departmentOf.get(doc.id) ?? NO_DEPARTMENT],
      [modules, doc.module],
    ] as const) {
      const group = map.get(key) ?? { tally: emptyTally(), documents: 0 };
      merge(group.tally, t);
      group.documents += 1;
      map.set(key, group);
    }
  }
  byDocument.sort((a, b) => worstFirst(a, b) || a.doc.name.localeCompare(b.doc.name));

  const byDepartment: DepartmentScore[] = Array.from(departments, ([code, g]) => ({
    ...line(g.tally, today),
    code,
    name: code === NO_DEPARTMENT ? "No department assigned" : departmentName(code),
    documents: g.documents,
    people: (accountsOf.get(code) ?? []).map((p) => p.name),
  })).sort((a, b) => worstFirst(a, b) || a.name.localeCompare(b.name));

  const byModule: ModuleScore[] = Array.from(modules, ([module, g]) => ({ ...line(g.tally, today), module, documents: g.documents })).sort(
    (a, b) => worstFirst(a, b) || a.module.localeCompare(b.module)
  );

  const byPerson: PersonScore[] = people
    .map((person): PersonScore => {
      const kept = keptTo(person);
      const total = emptyTally();
      const theirs: DocumentScore[] = [];
      for (const [docId, t] of perPerson.get(person.id) ?? []) {
        merge(total, t);
        const doc = docsById.get(docId);
        if (doc && t.late + t.overdue > 0) theirs.push(documentScore(doc, t));
      }
      const scored = line(total, today);
      return {
        ...scored,
        decision: kept.length === 0 ? { summary: "Works across every department and answers for no document of their own, so there is no score" } : scored.decision,
        person,
        departments: kept,
        answers: kept.length > 0,
        shared: kept.filter((code) => (accountsOf.get(code)?.length ?? 0) > 1),
        worst: theirs.sort((a, b) => worstFirst(a, b) || a.doc.name.localeCompare(b.doc.name)).slice(0, 3),
      };
    })
    // The people who are scored first, worst first; the ones who are only listed after them.
    .sort((a, b) => Number(b.answers) - Number(a.answers) || worstFirst(a, b) || a.person.name.localeCompare(b.person.name));

  return { period, byPerson, byDepartment, byModule, byDocument };
}
