// WHO IS TOLD WHAT, AND WHEN — THE NOTIFICATION PLAN (REQUIREMENTS §97).
//
// The owner, 8-Oct-2026: "according to module, the responsible person for that particular document will receive a
// notification in mobile as well as in our audit software ... some documents are filled daily, some weekly, monthly,
// yearly, or in months." So every open piece of work becomes ONE notification for the people who answer for it, worded
// later (engine/notificationText.ts) and kept by the server in PostgreSQL (backend/notifications.ts):
//
//   ready         an open record that passes DCRS's checks (the assistant prepared it, or a person filled it): review, submit
//   needs_input   an open record a person must still add to (`count`: what still stops a submit, the readings to enter)
//   due           due today and not started (a sheet the assistant could not prepare)
//   upcoming      a heads-up by the document's frequency: the working day before for weekly and fortnightly documents,
//                 ADVANCE_WARNING_DAYS before for monthly, quarterly and yearly ones; never for daily or as-required ones
//   overdue       still open after its day (an as-required record: after its AS_REQUIRED_DAYS allowance), one per record
//   verify        submitted and waiting: for everybody with Write on the document but the person who submitted it
//   sent_back     sent back: for the person who submitted it, with the reason
//   boss_summary  the super admin's counts by module, in the morning and in the evening
//
// ONE RECORD, ONE TASK. A record past its day is `overdue`, not also `ready`; a record sent back is `sent_back`, not also
// overdue. Nothing is due on a closed day (the weekly off, a festival holiday): a record dated on one is not work, as
// engine/reminders.ts and latenessCore.ts judge it. Only the kinds above are this plan's; the escalations and the
// access changes are written by the server (backend/notificationJobs.ts, the access routes).
//
// WHO. The people who answer for the document AND may fill it (engine/accessRules.ts answersFor). Nobody: the super
// admin, who otherwise gets the summaries, not every record.
//
// WITH NO IMPORTS AT ALL, like engine/accessRules.ts and engine/latenessCore.ts: the server loads it with Node's type
// stripping, and the engine host runs it on the plant's records. The two rules it shares with the browser's files —
// periodDays and priorityOf (engine/notifications.ts), ADVANCE_WARNING_DAYS (engine/reminders.ts) and AS_REQUIRED_DAYS
// (engine/latenessCore.ts) — are written in here; frontend/tests/notificationPlan.test.ts holds them equal.

export type NotificationKind = "ready" | "needs_input" | "due" | "upcoming" | "overdue" | "verify" | "sent_back" | "boss_summary" | "escalation" | "access_changed";

export const NOTIFICATION_KINDS: readonly NotificationKind[] = ["ready", "needs_input", "due", "upcoming", "overdue", "verify", "sent_back", "boss_summary", "escalation", "access_changed"];

/** The kinds this plan decides: an open one of these the plan no longer has is resolved (the record moved on). */
export const PLANNED_KINDS: readonly NotificationKind[] = ["ready", "needs_input", "due", "upcoming", "overdue", "verify", "sent_back", "boss_summary"];

export type NotificationPriority = "high" | "medium" | "low";

/** How far ahead a monthly, quarterly or yearly document is told of (engine/reminders.ts ADVANCE_WARNING_DAYS). */
export const ADVANCE_WARNING_DAYS = 3;
/** An as-required record's allowance, in days from the date it is for (engine/latenessCore.ts AS_REQUIRED_DAYS). */
export const AS_REQUIRED_DAYS = 2;
/** When the super admin's two summaries are made, plant time (the morning one after the morning prepare, PREPARE_AT's default). */
export const SUMMARY_TIMES = { morning: "08:30", evening: "17:45" } as const;

export interface ModuleCounts {
  module: string;
  ready: number;
  needsInput: number;
  awaitingVerification: number;
  /** Due today and not yet submitted. */
  notSubmitted: number;
  overdue: number;
}

/** What a notification is about, in facts and never in sentences: engine/notificationText.ts words it in the language asked. Never a record's values. */
export interface NotificationData {
  documentId?: string;
  formatNo?: string;
  documentName?: string;
  /** The module's code: QC, HR, SYS, MNT, PRD, PUR, STR, MKT, DISP, QA. */
  module?: string;
  recordId?: string;
  dueDate?: string;
  count?: number;
  daysLate?: number;
  reason?: string;
  modules?: ModuleCounts[];
  subject?: string;
  late?: number;
  neverDone?: number;
  level?: "none" | "read" | "write" | "edit";
  by?: string;
  part?: "morning" | "evening";
}

// ---------------------------------------------------------------------------
// the frequency rules (engine/notifications.ts, written in)

/** How long a document's own period is, in days; null for as-required (engine/notifications.ts periodDays). */
export function periodDays(schedule: { type: string }): number | null {
  switch (schedule.type) {
    case "daily":
      return 1;
    case "weekly":
      return 7;
    case "fortnightly":
      return 15;
    case "monthly":
      return 30;
    case "quarterly":
      return 91;
    case "yearly":
      return 365;
    default:
      return null;
  }
}

/** High, medium or low from the frequency and the days until due (engine/notifications.ts priorityOf). */
export function priorityOf(schedule: { type: string }, daysUntilDue: number): NotificationPriority {
  if (daysUntilDue < 0) return "high";
  const period = periodDays(schedule);
  if (period === null) return daysUntilDue === 0 ? "medium" : "low";
  if (daysUntilDue === 0) return period <= 7 ? "high" : "medium";
  if (daysUntilDue === 1 && period <= 7) return "medium";
  return "low";
}

// ---------------------------------------------------------------------------
// dates, written in

const pad2 = (n: number): string => (n < 10 ? `0${n}` : `${n}`);
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** An ISO date n days on (or back), in UTC so no clock's summer time moves it. */
export function addDays(iso: string, n: number): string {
  const m = DAY_RE.exec(iso);
  const when = m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + n)) : new Date(NaN);
  return `${when.getUTCFullYear()}-${pad2(when.getUTCMonth() + 1)}-${pad2(when.getUTCDate())}`;
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
  return Number.isFinite(days) ? days : 0;
}

/** The last day an as-required record can come in: AS_REQUIRED_DAYS on, and never a closed day (engine/latenessCore.ts judge). */
export function asRequiredDeadline(dueDate: string, isClosedDay: (d: string) => boolean): string {
  let deadline = addDays(dueDate, AS_REQUIRED_DAYS);
  for (let i = 0; i < 14 && isClosedDay(deadline); i++) deadline = addDays(deadline, 1);
  return deadline;
}

/**
 * THE DAY A HEADS-UP STARTS for a record due on `dueDate`, or null when its frequency has none: daily documents are
 * prepared in the morning and told the same day; as-required ones only when started. Weekly and fortnightly: the
 * working day before. Monthly, quarterly and yearly: ADVANCE_WARNING_DAYS before.
 */
export function headsUpFrom(schedule: { type: string }, dueDate: string, isClosedDay: (d: string) => boolean): string | null {
  switch (schedule.type) {
    case "weekly":
    case "fortnightly": {
      let day = addDays(dueDate, -1);
      for (let i = 0; i < 14 && isClosedDay(day); i++) day = addDays(day, -1);
      return day;
    }
    case "monthly":
    case "quarterly":
    case "yearly":
      return addDays(dueDate, -ADVANCE_WARNING_DAYS);
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// what the plan reads

export interface PlanDocument {
  id: string;
  formatNo: string;
  name: string;
  /** The module's code (QC, HR, ...), or null for a document in none. */
  module: string | null;
  schedule: { type: string };
  /** Kept as issued (a licence, the chemical chart): no records, nobody told. */
  reference?: boolean;
}

export interface PlanRecord {
  id: string;
  documentId: string;
  dueDate: string;
  status: string;
  /** Stored in the database. A sheet the calendar made in memory only has no lasting id, so it is told of by its document and date. */
  stored: boolean;
  /** Carries the assistant's `prepared` stamp. */
  prepared: boolean;
  /** What still stops a submit (DCRS's validation): 0 when it passes. Asked only of an open record due by today. */
  problems: number;
  submittedBy?: string | null;
  rejectedBy?: string | null;
  rejectionReason?: string | null;
  /** How many times it has been sent back so far: each time is a notification of its own. */
  rejections?: number;
}

export interface PlanPerson {
  id: string;
  name: string;
  /** The super admin. */
  boss: boolean;
  /** The documents this person answers for and may fill (engine/accessRules.ts answersFor). */
  answersFor: ReadonlySet<string>;
  /** Whether this person may verify a record of the document (Write or more). */
  mayVerify: (documentId: string) => boolean;
}

export interface PlanInput {
  /** The plant's date, YYYY-MM-DD. */
  today: string;
  /** The plant's time, HH:MM. */
  time: string;
  documents: readonly PlanDocument[];
  records: readonly PlanRecord[];
  /** The active accounts. */
  people: readonly PlanPerson[];
  isClosedDay: (dateISO: string) => boolean;
  /** The day the system went live: an open sheet dated before it is the generator's leftover, not work. */
  countedFrom?: string | null;
  summaryTimes?: { morning: string; evening: string };
}

export interface PlannedItem {
  userId: string;
  kind: NotificationKind;
  /** Unique per person: "ready|<recordId>", "due|<documentId>|<date>" ... — the ledger's upsert key. */
  key: string;
  priority: NotificationPriority;
  data: NotificationData;
}

const OPEN: readonly string[] = ["Scheduled", "Due", "In Progress"];
const WAITING: readonly string[] = ["Submitted", "Pending Verification"];
const sameName = (s: string | null | undefined): string => (s ?? "").trim().replace(/\s+/g, " ").toLowerCase();

/** The task kind of one open record today, or null when it is not one (yet). */
type Task = { kind: "ready" | "needs_input" | "due" | "upcoming" | "overdue"; daysLate?: number; daysUntil: number };

function taskOf(r: PlanRecord, doc: PlanDocument, today: string, isClosedDay: (d: string) => boolean): Task | null {
  const asRequired = doc.schedule.type === "as-required";
  const deadline = asRequired ? asRequiredDeadline(r.dueDate, isClosedDay) : r.dueDate;
  if (today > deadline) return { kind: "overdue", daysLate: daysBetween(deadline, today), daysUntil: daysBetween(today, deadline) };
  if (r.dueDate > today) {
    const from = headsUpFrom(doc.schedule, r.dueDate, isClosedDay);
    return from !== null && today >= from ? { kind: "upcoming", daysUntil: daysBetween(today, r.dueDate) } : null;
  }
  const daysUntil = daysBetween(today, deadline);
  if (r.status === "In Progress") return { kind: r.problems === 0 ? "ready" : "needs_input", daysUntil };
  return { kind: "due", daysUntil };
}

/**
 * THE PLAN: every notification each person should have now, with its key. Pure: the same input gives the same items,
 * in the same order. The server upserts them by key and resolves the ones of PLANNED_KINDS it no longer has.
 */
export function planNotifications(input: PlanInput): PlannedItem[] {
  const { today, isClosedDay } = input;
  const docs = new Map(input.documents.map((d) => [d.id, d] as const));
  const people = input.people;
  const bosses = people.filter((p) => p.boss);
  const staff = people.filter((p) => !p.boss);
  const items: PlannedItem[] = [];
  const seen = new Set<string>();
  const add = (userId: string, kind: NotificationKind, key: string, priority: NotificationPriority, data: NotificationData): void => {
    const k = `${userId}\u0000${key}`;
    if (seen.has(k)) return;
    seen.add(k);
    items.push({ userId, kind, key, priority, data });
  };

  const answering = new Map<string, PlanPerson[]>();
  const responsible = (documentId: string): PlanPerson[] => {
    let list = answering.get(documentId);
    if (!list) {
      list = staff.filter((p) => p.answersFor.has(documentId));
      if (list.length === 0) list = bosses;
      answering.set(documentId, list);
    }
    return list;
  };

  const counts = new Map<string, ModuleCounts>();
  const countFor = (module: string | null): ModuleCounts | null => {
    if (!module) return null;
    let c = counts.get(module);
    if (!c) counts.set(module, (c = { module, ready: 0, needsInput: 0, awaitingVerification: 0, notSubmitted: 0, overdue: 0 }));
    return c;
  };

  const ordered = [...input.records].sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const r of ordered) {
    const doc = docs.get(r.documentId);
    if (!doc || doc.reference) continue;
    const asRequired = doc.schedule.type === "as-required";
    const base: NotificationData = {
      documentId: doc.id,
      formatNo: doc.formatNo,
      documentName: doc.name,
      ...(doc.module ? { module: doc.module } : {}),
      ...(r.stored ? { recordId: r.id } : {}),
      dueDate: r.dueDate,
    };
    // A record's own key, or its document and date when it is not stored (its id would change at every reading).
    const ref = r.stored ? r.id : `${doc.id}|${r.dueDate}`;
    const module = countFor(doc.module);

    if (WAITING.includes(r.status)) {
      if (!r.stored) continue;
      if (module) module.awaitingVerification += 1;
      const submitter = sameName(r.submittedBy);
      let verifiers = staff.filter((p) => p.mayVerify(doc.id) && sameName(p.name) !== submitter);
      if (verifiers.length === 0) verifiers = bosses.filter((p) => sameName(p.name) !== submitter);
      if (verifiers.length === 0) verifiers = bosses;
      for (const p of verifiers) add(p.id, "verify", `verify|${r.id}`, "medium", { ...base, ...(r.submittedBy ? { by: r.submittedBy } : {}) });
      continue;
    }

    if (r.status === "Rejected") {
      if (!r.stored) continue;
      const submitter = sameName(r.submittedBy);
      const own = submitter ? people.filter((p) => sameName(p.name) === submitter) : [];
      const to = own.length > 0 ? own : responsible(doc.id);
      const n = Math.max(1, r.rejections ?? 1);
      for (const p of to) {
        add(p.id, "sent_back", `sent_back|${r.id}|${n}`, "high", { ...base, ...(r.rejectionReason ? { reason: r.rejectionReason } : {}), ...(r.rejectedBy ? { by: r.rejectedBy } : {}) });
      }
      continue;
    }

    if (!OPEN.includes(r.status)) continue;
    // Nobody files paperwork on the weekly off or a festival holiday; an as-required record was started that day.
    if (!asRequired && isClosedDay(r.dueDate)) continue;
    // A sheet left from before the system went live is the generator's leftover, not work (engine/backlogCleanup.ts).
    if (input.countedFrom && r.dueDate < input.countedFrom) continue;
    const task = taskOf(r, doc, today, isClosedDay);
    if (!task) continue;

    let key: string;
    let priority: NotificationPriority;
    const data: NotificationData = { ...base };
    switch (task.kind) {
      case "overdue":
        key = `overdue|${ref}`;
        priority = "high";
        data.daysLate = task.daysLate ?? 0;
        if (module) module.overdue += 1;
        break;
      case "upcoming":
        key = `upcoming|${doc.id}|${r.dueDate}`;
        priority = priorityOf(doc.schedule, task.daysUntil);
        break;
      case "due":
        key = `due|${doc.id}|${r.dueDate}`;
        priority = priorityOf(doc.schedule, task.daysUntil);
        if (module && r.dueDate === today) module.notSubmitted += 1;
        break;
      case "ready":
        if (!r.stored) continue;
        key = `ready|${r.id}`;
        priority = priorityOf(doc.schedule, task.daysUntil);
        if (module) {
          module.ready += 1;
          if (r.dueDate === today) module.notSubmitted += 1;
        }
        break;
      case "needs_input":
        if (!r.stored) continue;
        key = `needs_input|${r.id}`;
        priority = priorityOf(doc.schedule, task.daysUntil);
        data.count = r.problems;
        if (module) {
          module.needsInput += 1;
          if (r.dueDate === today) module.notSubmitted += 1;
        }
        break;
    }
    for (const p of responsible(doc.id)) add(p.id, task.kind, key, priority, data);
  }

  // THE SUPER ADMIN'S TWO SUMMARIES, on a working day: after the morning prepare, and at the last call.
  const times = input.summaryTimes ?? SUMMARY_TIMES;
  if (!isClosedDay(today) && bosses.length > 0) {
    const modules = [...counts.values()]
      .filter((c) => c.ready + c.needsInput + c.awaitingVerification + c.notSubmitted + c.overdue > 0)
      .sort((a, b) => (a.module < b.module ? -1 : a.module > b.module ? 1 : 0));
    const parts: ("morning" | "evening")[] = [];
    if (input.time >= times.morning) parts.push("morning");
    if (input.time >= times.evening) parts.push("evening");
    for (const part of parts) {
      for (const b of bosses) add(b.id, "boss_summary", `boss_summary|${today}|${part}`, "medium", { modules, part, dueDate: today });
    }
  }
  return items;
}
