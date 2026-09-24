// ONE LATENESS RULE, PROVED THE SAME AS BEFORE IT MOVED (REQUIREMENTS §64, §75).
//
// The rule that decides on time, late and never done — and whom a record
// counts against, the shared-department rule included — was moved out of
// engine/performance.ts into engine/latenessCore.ts, a file with no imports,
// so the server's escalation to the super admin and its weekly digest
// (backend/escalation.ts) apply the very same rule as the Performance
// Scorecard. People are judged by that scorecard, so the move must change
// NOTHING it says. This file holds the scorecard exactly as it was worked out
// before the move (REFERENCE below, copied from performance.ts of 24-Sep-2026,
// with its own imports) and asks both the same questions:
//
//   * every record's judgement — outcome, days late, who handed it in — over the
//     plant's seeded records, six months of the demo year, a month of blank
//     sheets and records built for the purpose (late, never done, a shared
//     department, the administrator handing one in, an as-required allowance
//     that runs over the weekly off, a correction, a H O L I D A Y line, a stamp
//     that is not a date), judged on several days with and without the plant's
//     calendar and the go-live floor;
//   * every scorecard — by person, department, module and document, with the
//     grades and the sentences — for all four periods and a month given as a
//     range (the monthly summary's), for people who share a department, one who
//     answers for two, the administrator and an account with no departments;
//   * the plant's closed days as the server reads them (plantClosedDays) against
//     engine/holidays.ts for every day of three years, on the seeded calendar and
//     on one built to catch a wrong weekly off or an adjustment day missed;
//   * the plant's date of a moment (dateInZone), which the server uses because
//     its own clock may not be the plant's.
//
// "Today" is fixed here, not the clock, wherever the rule is given it.
import test from "node:test";
import assert from "node:assert/strict";
import type { AuthUser } from "../src/types/auth";
import type { DailyPestMonitoringData, DocumentDefinition, MasterData, RecordInstance } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { masterRepository, ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { recordRepository, ensureSeeded as ensureRecordsSeeded } from "../src/data/repositories/recordRepository";
import { generateDemoRecordsForMonth } from "../src/data/demoGenerator";
import { ensureRecordsGeneratedForMonth } from "../src/engine/recordGenerator";
import { departmentName, departmentOfDocument } from "../src/data/seed/departments";
import { isCompanyHoliday } from "../src/engine/holidays";
import { daysLate } from "../src/engine/reactions";
import { isOverdue } from "../src/engine/recordLifecycle";
import { addDays, formatDisplayDate, toISODate } from "../src/utils/date";
import {
  PERIODS,
  closedDays,
  grade,
  judge,
  monthRange,
  periodFor,
  scorecards,
  type Decision,
  type PeriodKey,
  type PeriodRange,
  type Scorecards,
  type ScoreLine,
} from "../src/engine/performance";
import { attribute, dateInZone, plantClosedDays, type PlantCalendar } from "../src/engine/latenessCore";

// =============================================================================
// REFERENCE: the scorecard's rule as engine/performance.ts had it before the
// move, kept here word for word (only renamed, and gathered in one place) so the
// new one can be held to it. Not used by the app.
// =============================================================================
namespace REFERENCE {
  type Outcome = "onTime" | "late" | "overdue" | "pending" | "notCounted";
  export const AS_REQUIRED_DAYS = 2;
  export type Person = Pick<AuthUser, "id" | "name" | "role" | "departments">;
  export interface Calendar {
    isClosedDay: (dateISO: string) => boolean;
    countedFrom?: string | null;
  }
  const ALWAYS_OPEN: Calendar = { isClosedDay: () => false };
  export interface Judgement {
    outcome: Outcome;
    daysLate: number;
    by?: string;
  }
  const NOT_COUNTED: Judgement = { outcome: "notCounted", daysLate: 0 };
  const PAST_SUBMISSION: readonly string[] = ["Submitted", "Pending Verification", "Verified", "Rejected"];

  function firstSubmission(record: RecordInstance): { on: string | null; by: string } | null {
    const first = record.history?.find((h) => h.action === "submitted");
    const at = first?.at ?? record.submittedAt;
    if (at) {
      const when = new Date(at);
      return { on: Number.isNaN(when.getTime()) ? null : toISODate(when), by: first?.by ?? record.submittedBy ?? "" };
    }
    return PAST_SUBMISSION.includes(record.status) ? { on: null, by: record.submittedBy ?? "" } : null;
  }

  export function judgeRef(record: RecordInstance, doc: DocumentDefinition, today: string, calendar: Calendar = ALWAYS_OPEN): Judgement {
    if (doc.isReferenceOnly) return NOT_COUNTED;
    if (doc.kind === "daily-pest-monitoring" && (record.data as Partial<DailyPestMonitoringData> | null)?.isHoliday) return NOT_COUNTED;
    const asRequired = doc.schedule.type === "as-required";
    if (!asRequired && calendar.isClosedDay(record.dueDate)) return NOT_COUNTED;
    const handedIn = firstSubmission(record);
    if (!handedIn && calendar.countedFrom && record.dueDate < calendar.countedFrom) return NOT_COUNTED;
    let deadline = record.dueDate;
    if (asRequired) {
      deadline = addDays(record.dueDate, AS_REQUIRED_DAYS);
      for (let i = 0; i < 14 && calendar.isClosedDay(deadline); i++) deadline = addDays(deadline, 1);
    }
    if (handedIn) {
      const late = handedIn.on ? Math.max(0, daysLate(deadline, handedIn.on)) : 0;
      return { outcome: late > 0 ? "late" : "onTime", daysLate: late, by: handedIn.by };
    }
    const open = deadline === record.dueDate ? record : { ...record, dueDate: deadline };
    return { outcome: isOverdue(open, today) ? "overdue" : "pending", daysLate: 0 };
  }

  function scoreOf(onTime: number, late: number, overdue: number): number | null {
    const due = onTime + late + overdue;
    return due === 0 ? null : Math.round((100 * (onTime + 0.5 * late)) / due);
  }

  interface Miss {
    what: string;
    dueDate: string;
    days: number;
  }
  interface Tally {
    onTime: number;
    late: number;
    overdue: number;
    pending: number;
    oldestMissed: Miss | null;
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
  function shortDate(iso: string, today: string): string {
    const full = formatDisplayDate(iso);
    return iso.slice(0, 4) === today.slice(0, 4) ? full.slice(0, 6) : full;
  }
  function decide(t: Tally, g: ReturnType<typeof grade>, today: string): Decision {
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
  function worstFirst(a: ScoreLine, b: ScoreLine): number {
    if (a.score === null || b.score === null) return a.score === b.score ? 0 : a.score === null ? 1 : -1;
    return a.score - b.score || b.overdue - a.overdue || b.due - a.due;
  }
  const NO_DEPARTMENT = "";
  const sameName = (s: string): string => s.trim().replace(/\s+/g, " ").toLowerCase();
  function keptTo(person: Person): string[] {
    if (person.role === "admin") return [];
    return Array.from(new Set(person.departments.map((c) => c.trim().toUpperCase()).filter(Boolean)));
  }
  const calledBy = (doc: DocumentDefinition): string => (doc.formatNo && !doc.formatNo.toUpperCase().startsWith("TO BE") ? doc.formatNo : doc.name);

  export function scorecardsRef(
    records: readonly RecordInstance[],
    docs: readonly DocumentDefinition[],
    people: readonly Person[],
    periodKey: PeriodKey | PeriodRange,
    today: string,
    calendar: Calendar = ALWAYS_OPEN
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
      const j = judgeRef(r, doc, today, calendar);
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
    const documentScore = (doc: DocumentDefinition, t: Tally) => ({ ...line(t, today), doc, department: departmentOf.get(doc.id) ?? NO_DEPARTMENT });
    const byDocument: Scorecards["byDocument"] = [];
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
    const byDepartment: Scorecards["byDepartment"] = Array.from(departments, ([code, g]) => ({
      ...line(g.tally, today),
      code,
      name: code === NO_DEPARTMENT ? "No department assigned" : departmentName(code),
      documents: g.documents,
      people: (accountsOf.get(code) ?? []).map((p) => p.name),
    })).sort((a, b) => worstFirst(a, b) || a.name.localeCompare(b.name));
    const byModule: Scorecards["byModule"] = Array.from(modules, ([module, g]) => ({ ...line(g.tally, today), module, documents: g.documents })).sort(
      (a, b) => worstFirst(a, b) || a.module.localeCompare(b.module)
    );
    const byPerson: Scorecards["byPerson"] = people
      .map((person) => {
        const kept = keptTo(person);
        const total = emptyTally();
        const theirs: Scorecards["byDocument"] = [];
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
      .sort((a, b) => Number(b.answers) - Number(a.answers) || worstFirst(a, b) || a.person.name.localeCompare(b.person.name));
    return { period, byPerson, byDepartment, byModule, byDocument };
  }
}

// =============================================================================
// The records both are asked about.
// =============================================================================
ensureDocumentsSeeded();
ensureMasterSeeded();
ensureRecordsSeeded();

const documents: DocumentDefinition[] = documentRepository.getAll();
const master: MasterData = masterRepository.get();
const docById = new Map(documents.map((d) => [d.id, d]));
const firstOf = (pred: (d: DocumentDefinition) => boolean): DocumentDefinition => {
  const d = documents.find((x) => !x.isReferenceOnly && pred(x));
  assert.ok(d, "a document of the kind a synthetic case needs is in the catalogue");
  return d;
};
const hrDaily = firstOf((d) => d.id === "daily-pest-monitoring");
const qcDaily = firstOf((d) => departmentOfDocument(d.id, d.formatNo) === "QC" && d.schedule.type === "daily");
const asRequired = firstOf((d) => d.schedule.type === "as-required" && departmentOfDocument(d.id, d.formatNo) === "QC");
const monthly = firstOf((d) => d.schedule.type === "monthly" && departmentOfDocument(d.id, d.formatNo) === "HR");
const reference = documents.find((d) => d.isReferenceOnly);

// Six months of the demo year (records handed in on the day, late, sent back,
// verified days later) and a month of blank sheets nobody touched.
for (let month = 2; month <= 7; month++) generateDemoRecordsForMonth(2026, month);
ensureRecordsGeneratedForMonth(2026, 8, { isDemo: true });

let n = 0;
function rec(doc: DocumentDefinition, dueDate: string, extra: Partial<RecordInstance> = {}): RecordInstance {
  n += 1;
  return {
    id: `syn-${n}`,
    documentId: doc.id,
    periodKey: `${doc.id}:${dueDate}:${n}`,
    dueDate,
    status: "Due",
    isDemo: true,
    data: {},
    createdAt: `${dueDate}T03:00:00.000Z`,
    updatedAt: `${dueDate}T03:00:00.000Z`,
    ...extra,
  };
}
const handedIn = (on: string, by: string, status: RecordInstance["status"] = "Submitted"): Partial<RecordInstance> => ({ status, submittedAt: `${on}T06:30:00.000Z`, submittedBy: by });

// Records built for the purpose: each is a case the rule must get right.
const SYNTHETIC: RecordInstance[] = [
  rec(qcDaily, "2026-09-07", handedIn("2026-09-10", "Yogesh Rathod")), // 3 days late
  rec(qcDaily, "2026-09-08", handedIn("2026-09-08", "Yogesh Rathod")), // on time
  rec(qcDaily, "2026-09-09"), // never done
  rec(qcDaily, "2026-09-26"), // not due yet
  rec(hrDaily, "2026-09-07", { ...handedIn("2026-09-09", "  roshni  "), data: { isHoliday: false } }), // shared HR: counts for Roshni alone
  rec(hrDaily, "2026-09-08", { ...handedIn("2026-09-08", "VIJAY"), data: { isHoliday: false } }), // shared HR: for Vijay alone
  rec(hrDaily, "2026-09-09", { data: { isHoliday: false } }), // shared HR, never done: against both
  rec(hrDaily, "2026-09-11", { ...handedIn("2026-09-15", "Super Admin"), data: { isHoliday: false } }), // handed in by the administrator: for both
  rec(hrDaily, "2026-09-12", { ...handedIn("2026-09-12", "Roshni"), data: { isHoliday: true } }), // the H O L I D A Y line: not counted
  rec(monthly, "2026-09-05", handedIn("2026-09-06", "Priya Solanki")), // HR, by somebody not among its accounts: for both
  rec(asRequired, "2026-09-07", handedIn("2026-09-09", "Yogesh Rathod")), // on the last day of the 2-day allowance
  rec(asRequired, "2026-09-07", handedIn("2026-09-10", "Yogesh Rathod")), // one day past it
  rec(asRequired, "2026-09-15", handedIn("2026-09-18", "Roshni")), // the allowance ends on Thursday the 17th, the weekly off: with the calendar it runs to Friday
  rec(asRequired, "2026-09-01", handedIn("2026-09-04", "Roshni")), // the same over Thursday the 3rd
  rec(asRequired, "2026-09-02"), // never done, the allowance long gone
  rec(qcDaily, "2026-09-14", {
    status: "Submitted",
    submittedAt: "2026-09-20T06:00:00.000Z", // re-submitted after a correction...
    submittedBy: "Somebody Else",
    history: [
      { id: "h1", at: "2026-09-14T09:00:00.000Z", by: "Yogesh Rathod", action: "submitted" }, // ...but first handed in on the day
      { id: "h2", at: "2026-09-19T09:00:00.000Z", by: "Kapila Barad", action: "reopened" },
      { id: "h3", at: "2026-09-20T06:00:00.000Z", by: "Somebody Else", action: "submitted" },
    ],
  }),
  rec(qcDaily, "2026-09-15", { status: "Verified" }), // handed in long ago, no stamp: on time
  rec(qcDaily, "2026-09-16", { status: "Pending Verification", submittedAt: "not a date", submittedBy: "Yogesh Rathod" }),
  rec(qcDaily, "2026-09-17"), // a Thursday, the weekly off: not counted
  rec(qcDaily, "2026-09-18", { status: "In Progress" }),
  rec(qcDaily, "2026-09-19", { status: "Rejected", submittedBy: "Yogesh Rathod", submittedAt: "2026-09-21T23:10:00.000Z" }), // 04:40 on the 22nd in the plant
  rec(qcDaily, "2026-07-01"), // before the system went live (with a floor): not counted
  ...(reference ? [rec(reference, "2026-09-10")] : []),
];

const ALL: RecordInstance[] = [...recordRepository.queryUnscoped({}), ...SYNTHETIC];

// The accounts: HR shared by two (named like the demo's own submitters), QC's
// one, a person answering for two departments, the administrator, and an
// account with no departments.
const PEOPLE: REFERENCE.Person[] = [
  { id: "u-yogesh", name: "Yogesh Rathod", role: "staff", departments: ["QC"] },
  { id: "u-roshni", name: "Roshni", role: "staff", departments: ["HR"] },
  { id: "u-vijay", name: "  Vijay ", role: "staff", departments: ["hr"] },
  { id: "u-priya", name: "Priya Solanki", role: "staff", departments: ["PRD", "MNT"] },
  { id: "u-admin", name: "Super Admin", role: "admin", departments: [] },
  { id: "u-mr", name: "Management Rep", role: "staff", departments: [] },
];

const TODAYS = ["2026-09-24", "2026-08-15", "2026-10-02"];
const calendars = (): { label: string; ref: REFERENCE.Calendar; now: PlantCalendar }[] => [
  { label: "always open", ref: { isClosedDay: () => false }, now: { isClosedDay: () => false } },
  { label: "the plant's calendar", ref: { isClosedDay: closedDays(master) }, now: { isClosedDay: closedDays(master) } },
  { label: "the calendar and a go-live floor", ref: { isClosedDay: closedDays(master), countedFrom: "2026-08-01" }, now: { isClosedDay: closedDays(master), countedFrom: "2026-08-01" } },
];

test("the catalogue and the records give the rule something to decide", () => {
  const outcomes = new Set<string>();
  for (const r of ALL) {
    const doc = docById.get(r.documentId);
    if (doc) outcomes.add(REFERENCE.judgeRef(r, doc, "2026-09-24", { isClosedDay: closedDays(master), countedFrom: "2026-08-01" }).outcome);
  }
  assert.ok(ALL.length > 1000, `a real volume of records (${ALL.length})`);
  for (const o of ["onTime", "late", "overdue", "pending", "notCounted"]) assert.ok(outcomes.has(o), `the records include one that is ${o}`);
});

test("every record is judged exactly as before: outcome, days late and who handed it in", () => {
  let compared = 0;
  for (const today of TODAYS) {
    for (const c of calendars()) {
      for (const r of ALL) {
        const doc = docById.get(r.documentId);
        if (!doc) continue;
        assert.deepEqual(judge(r, doc, today, c.now), REFERENCE.judgeRef(r, doc, today, c.ref), `${r.id} (${doc.id}, due ${r.dueDate}) judged on ${today}, ${c.label}`);
        compared += 1;
      }
    }
  }
  assert.ok(compared > 10000, `${compared} judgements compared`);
});

test("every scorecard is the same as before — people, departments, modules, documents, grades and sentences", () => {
  const periods: (PeriodKey | PeriodRange)[] = [...PERIODS.map((p) => p.key), monthRange(2026, 8, "September 2026"), monthRange(2026, 6), { from: "2026-07-15", to: "2026-09-20" }];
  let compared = 0;
  for (const today of TODAYS) {
    for (const c of calendars()) {
      for (const period of periods) {
        for (const isDemo of [true, false]) {
          const side = ALL.filter((r) => r.isDemo === isDemo);
          const now = scorecards(side, documents, PEOPLE, period, today, c.now);
          const before = REFERENCE.scorecardsRef(side, documents, PEOPLE, period, today, c.ref);
          assert.deepEqual(now, before, `${typeof period === "string" ? period : `${period.from}..${period.to}`} judged on ${today}, ${c.label}, ${isDemo ? "demo" : "live"}`);
          compared += 1;
        }
      }
    }
  }
  assert.equal(compared, TODAYS.length * 3 * 7 * 2);
});

test("the shared-department rule, said outright: who a record counts for", () => {
  const cards = scorecards(SYNTHETIC, documents, PEOPLE, monthRange(2026, 8), "2026-09-24", { isClosedDay: closedDays(master) });
  const person = (id: string) => cards.byPerson.find((p) => p.person.id === id)!;
  // HR has two accounts. Roshni handed in one late (2 days) and one of the monthly
  // records was handed in by somebody who is not an HR account, late — for both.
  // Vijay's own was on time; the daily one nobody handed in is against both, and so
  // is the one the administrator handed in, 4 days late.
  assert.deepEqual([person("u-roshni").onTime, person("u-roshni").late, person("u-roshni").overdue], [0, 3, 1]);
  assert.deepEqual([person("u-vijay").onTime, person("u-vijay").late, person("u-vijay").overdue], [1, 2, 1]);
  assert.deepEqual(person("u-roshni").shared, ["HR"]);
  // QC has one account: everything QC's is Yogesh's.
  // Roshni's two as-required QC records ran over a closed day (the weekly off, and
  // Janmashtami on 04-Sep) and so were in on time.
  const qc = cards.byDepartment.find((d) => d.code === "QC")!;
  const yogesh = person("u-yogesh");
  assert.equal(yogesh.due, qc.due);
  assert.deepEqual([yogesh.onTime, yogesh.late, yogesh.overdue], [7, 3, 3]);
  // The administrator and an account with no departments are listed, never scored.
  assert.equal(person("u-admin").answers, false);
  assert.equal(person("u-mr").answers, false);

  // The same answers straight from the walk the server uses.
  const late = new Map<string, number>();
  attribute(SYNTHETIC, documents, PEOPLE, { from: "2026-09-01", to: "2026-09-30" }, "2026-09-24", { isClosedDay: closedDays(master) }, (d) => departmentOfDocument(d.id, d.formatNo), (c) => {
    if (c.judgement.outcome === "late") for (const a of c.answering) late.set(a.id, (late.get(a.id) ?? 0) + 1);
  });
  assert.equal(late.get("u-roshni"), 3);
  assert.equal(late.get("u-vijay"), 2);
});

test("the plant's date of a moment: the server's clock need not be the plant's", () => {
  assert.equal(dateInZone("2026-09-23T20:00:00.000Z", "Asia/Kolkata"), "2026-09-24");
  assert.equal(dateInZone("2026-09-23T20:00:00.000Z", "UTC"), "2026-09-23");
  assert.equal(dateInZone("not a date", "Asia/Kolkata"), null);
  // Handed in at 04:40 plant time on the 22nd for the 19th — three days late in the
  // plant, whatever zone the machine judging it keeps.
  const r = SYNTHETIC.find((x) => x.submittedAt === "2026-09-21T23:10:00.000Z")!;
  const inPlant = judge(r, qcDaily, "2026-09-24", { isClosedDay: () => false, dateOf: (s) => dateInZone(s, "Asia/Kolkata") });
  assert.deepEqual(inPlant, { outcome: "late", daysLate: 3, by: "Yogesh Rathod" });
  const inUtc = judge(r, qcDaily, "2026-09-24", { isClosedDay: () => false, dateOf: (s) => dateInZone(s, "UTC") });
  assert.equal(inUtc.daysLate, 2);
});

test("the plant's closed days as the server reads them agree with engine/holidays.ts for three years", () => {
  const altered: MasterData = {
    ...master,
    weeklyOffDay: 0,
    holidays: [...(master.holidays ?? []), { id: "hol-test", date: "2026-12-24", name: "Test festival on a Thursday" }],
    adjustmentDays: [...(master.adjustmentDays ?? []), { id: "adj-test", date: "2026-11-15", forHoliday: "Test festival" }],
  };
  const noCalendar = { weeklyOffDay: undefined, holidays: undefined, adjustmentDays: undefined } as unknown as MasterData;
  for (const [label, m] of [["the seeded master data", master], ["a Sunday weekly off with an extra festival and adjustment day", altered], ["no calendar at all (Thursday off)", noCalendar]] as const) {
    const server = plantClosedDays(m);
    let day = "2025-01-01";
    let closed = 0;
    while (day <= "2027-12-31") {
      const expected = isCompanyHoliday(day, m);
      assert.equal(server(day), expected, `${label}: ${day}`);
      if (expected) closed += 1;
      day = addDays(day, 1);
    }
    assert.ok(closed > 150, `${label}: ${closed} closed days in three years`);
  }
});
