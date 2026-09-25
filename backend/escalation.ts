// ESCALATION TO THE SUPER ADMIN, AND A WEEKLY DIGEST — WORKED OUT ON THE
// SERVER (REQUIREMENTS §75).
//
// "smarter notifications": somebody who keeps handing their records in late,
// or a department whose records are simply not done, is no longer something
// the super admin finds out by opening the Performance Scorecard on the right
// day. Every working day at ESCALATION_AT (10:00 plant time unless set) the
// server reads the plant's own records in PostgreSQL and raises it with the
// super admin; on the first working day of each week at DIGEST_AT (09:00) it
// writes the week before up for them. backend/jobs.ts decides when; this file
// is the work.
//
// THE RULE IS THE SCORECARD'S, NOT A COPY OF IT. On time, late, never done and
// whom a record counts against come from frontend/src/engine/latenessCore.ts —
// the very file the Performance Scorecard adds up (frontend/tests/
// latenessCore.test.ts holds the two to the same answers) — so "Kapila was late
// three times" here is three lates on her scorecard too. Over the last 30 days:
//
//   * a PERSON with 3 or more late submissions counted against them, or with 2
//     or more records never done in a department they answer for alone, is
//     escalated by name;
//   * a DEPARTMENT with 2 or more records never done, where it has several
//     accounts (HR has two), is escalated as the department, named with its
//     people — the scorecard counts a record nobody handed in against every one
//     of them, so no one of them is singled out. A department no account
//     answers for, or whose one account has been switched off, is escalated the
//     same way, and says so. Somebody switched off is never escalated by name:
//     they have left.
//
// Only Live records count: Demo Mode is not part of the product (§65), and a
// blank shell from before the system went live is not work (the go-live
// floor, as on the scorecard). Worked out by code — no model is asked.
//
// ONE LINE PER SUBJECT PER WEEK. Each escalation is stored against its ISO week
// (2026-W39) and upserted: the daily check writes this week's line with the
// figures and the records as they stand that day, and writes an activity-log
// line ("Escalated to the super admin") and an email only when the line is new.
// A line the super admin has acknowledged opens again only when a record is
// behind it that they have not seen — not when a figure merely moves (a record
// never done that is handed in late moves from one count to the other; an old
// late leaves the 30 days).
//
// THE SUPER ADMIN'S ALONE. The activity-log lines about escalations are filed
// under no department and carry no figures, and only the super admin reads
// them (db.ts SUPER_ADMIN_ACTIONS): a department's account must not read
// another department's counts, nor that somebody was escalated.
//
// THE APP IS THE CHANNEL. The seeded super admin is admin@gpp.local, an address
// that receives no mail (REQUIREMENTS §62), so escalations and digests are
// stored here and shown in the app — the bell, the day's notification and the
// Performance page. Email is sent as well only when the server has a mailbox
// (GMAIL_USER / GMAIL_APP_PASSWORD), to ESCALATION_EMAIL or else the active
// administrators, never to a ".local" address.
import { database, ESCALATION_ACTIONS, insertActivity, listUsers, plantTimeZone, readItem, registerSchema, transaction, withClient, type StoredItem } from "./db.ts";
import { isEmailConfigured, sendMail } from "./email.ts";
import { departmentOfDocument, PLANT_DEPARTMENTS } from "../frontend/src/data/seed/documentDepartments.ts";
import {
  addDaysISO,
  attribute,
  dateInZone,
  plantClosedDays,
  scoreOf,
  type CalendarMaster,
  type LatenessDocument,
  type LatenessPerson,
  type LatenessRecord,
  type PlantCalendar,
} from "../frontend/src/engine/latenessCore.ts";

// THE TABLES (DEPLOYMENT.md). Run with the rest of the schema when the database
// is opened (db.ts registerSchema).
//   job_runs        one row per scheduled run a server has claimed: which job,
//                   for which period (a day, or an ISO week), when and how it
//                   ended. The primary key is the claim — backend/jobs.ts.
//   escalations     one row per person or department per ISO week; the counts,
//                   the records behind them, and who acknowledged it when.
//                   subject_key is never NULL ('dept:HR' for a department):
//                   NULLs never collide in a UNIQUE constraint.
//                   record_ids: the id of EVERY record behind the counts that
//                   day (evidence lists ten at most); seen_ids: every one the
//                   super admin had in front of them when they acknowledged
//                   it. A line acknowledged opens again only for a record
//                   outside seen_ids. Added to a table already in use: a line
//                   from before them takes its record ids from its evidence,
//                   and one acknowledged then takes them as seen — once, here.
//   weekly_digests  the super admin's digest of each week, as JSON.
registerSchema(`
  CREATE TABLE IF NOT EXISTS job_runs (
    job TEXT NOT NULL,
    period TEXT NOT NULL,
    claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ,
    outcome TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (job, period)
  );
  CREATE TABLE IF NOT EXISTS escalations (
    id BIGSERIAL PRIMARY KEY,
    raised_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    kind TEXT NOT NULL,
    subject_key TEXT NOT NULL,
    subject_name TEXT NOT NULL DEFAULT '',
    department TEXT NOT NULL DEFAULT '',
    period TEXT NOT NULL,
    late INTEGER NOT NULL DEFAULT 0,
    never_done INTEGER NOT NULL DEFAULT 0,
    evidence JSONB NOT NULL DEFAULT '{}',
    acknowledged_by TEXT,
    acknowledged_at TIMESTAMPTZ,
    UNIQUE (kind, subject_key, period)
  );
  CREATE INDEX IF NOT EXISTS escalations_open_idx ON escalations (raised_at DESC) WHERE acknowledged_at IS NULL;
  CREATE INDEX IF NOT EXISTS escalations_updated_idx ON escalations (updated_at DESC);
  ALTER TABLE escalations ADD COLUMN IF NOT EXISTS record_ids TEXT[] NOT NULL DEFAULT '{}';
  ALTER TABLE escalations ADD COLUMN IF NOT EXISTS seen_ids TEXT[];
  UPDATE escalations
     SET record_ids = ARRAY(SELECT r->>'id' FROM jsonb_array_elements(CASE WHEN jsonb_typeof(evidence->'records') = 'array' THEN evidence->'records' ELSE '[]'::jsonb END) AS r WHERE r->>'id' IS NOT NULL)
   WHERE cardinality(record_ids) = 0;
  UPDATE escalations SET seen_ids = record_ids WHERE acknowledged_at IS NOT NULL AND seen_ids IS NULL;
  CREATE TABLE IF NOT EXISTS weekly_digests (
    period TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    body JSONB NOT NULL
  );
`);

/** The escalation rule's three numbers, sent to the browser with the escalations so the screens say the same thing. */
export const ESCALATION_RULE = { late: 3, neverDone: 2, windowDays: 30 } as const;

// ---------------------------------------------------------------------------
// The plant's clock and calendar

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const pad2 = (n: number): string => String(n).padStart(2, "0");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const isDay = (v: unknown): v is string => typeof v === "string" && DAY_RE.test(v) && !Number.isNaN(Date.parse(v));

/** The plant's date and time now ("2026-09-24", "10:05") — PLANT_TIMEZONE, not this machine's clock. */
export function plantClock(now: Date = new Date()): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: plantTimeZone(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return { date: `${part("year")}-${part("month")}-${part("day")}`, time: `${part("hour")}:${part("minute")}` };
}

/** 1 for Monday … 7 for Sunday. */
function isoDayOfWeek(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7;
}

/** The Monday of the ISO week a date falls in. */
export const mondayOf = (iso: string): string => addDaysISO(iso, 1 - isoDayOfWeek(iso));

/** The ISO week a date falls in, "2026-W39" — a year's weeks run Monday to Sunday, and week 1 holds its first Thursday. */
export function isoWeek(iso: string): string {
  const thursday = addDaysISO(iso, 4 - isoDayOfWeek(iso));
  const year = Number(thursday.slice(0, 4));
  const week = Math.floor((Date.parse(thursday) - Date.UTC(year, 0, 1)) / 86_400_000 / 7) + 1;
  return `${year}-W${pad2(week)}`;
}

/** "24-Sep-2026", as the app writes a date (utils/date.ts formatDisplayDate). */
export function displayDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${pad2(d)}-${MONTHS[(m ?? 1) - 1] ?? "?"}-${y}`;
}

// ---------------------------------------------------------------------------
// What the plant has stored — read from PostgreSQL, checked for shape

interface StoredRecord extends LatenessRecord {
  id: string;
}

interface StoredDocument extends LatenessDocument {
  formatNo?: string;
}

interface Account extends LatenessPerson {
  email: string;
  active: boolean;
}

interface StoredMaster extends CalendarMaster {
  departments?: unknown;
}

export interface Plant {
  /** Live records only. */
  records: StoredRecord[];
  documents: StoredDocument[];
  master: StoredMaster | null;
  /** The day the system went live; blank sheets before it are not work. */
  liveStart: string | null;
  accounts: Account[];
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

function parsed(item: StoredItem | null): unknown {
  if (!item) return null;
  try {
    return JSON.parse(item.value);
  } catch {
    return null;
  }
}

/** Live records with the fields the rule reads, each checked — one malformed record must not stop the check for the plant. */
function liveRecords(value: unknown): StoredRecord[] {
  if (!Array.isArray(value)) return [];
  const out: StoredRecord[] = [];
  for (const r of value) {
    if (!isObject(r) || r.isDemo === true) continue;
    const id = str(r.id);
    const documentId = str(r.documentId);
    const status = str(r.status);
    if (!id || !documentId || !status || !isDay(r.dueDate)) continue;
    const history = Array.isArray(r.history)
      ? r.history.filter((h): h is Record<string, unknown> => isObject(h) && typeof h.action === "string" && typeof h.at === "string").map((h) => ({ action: h.action as string, at: h.at as string, by: str(h.by) }))
      : undefined;
    out.push({ id, documentId, dueDate: r.dueDate, status, data: r.data, submittedAt: str(r.submittedAt), submittedBy: str(r.submittedBy), history });
  }
  return out;
}

/** The document definitions as issued, with a revised format's new name laid over (data/formatEdits.ts). */
function documentDefinitions(value: unknown, edits: unknown): StoredDocument[] {
  if (!Array.isArray(value)) return [];
  const out: StoredDocument[] = [];
  for (const d of value) {
    if (!isObject(d) || !isObject(d.schedule)) continue;
    const id = str(d.id);
    const name = str(d.name);
    const type = str(d.schedule.type);
    if (!id || !name || !type) continue;
    const edit = isObject(edits) && Object.prototype.hasOwnProperty.call(edits, id) && isObject(edits[id]) ? (edits[id] as Record<string, unknown>) : null;
    out.push({
      id,
      name: str(edit?.name) || name,
      formatNo: str(d.formatNo),
      module: str(d.module) ?? "",
      kind: str(d.kind) ?? "",
      isReferenceOnly: d.isReferenceOnly === true,
      schedule: { type },
    });
  }
  return out;
}

/** Everything the rule needs, read once for a run. */
export async function loadPlant(): Promise<Plant> {
  const [records, documents, master, liveStart, formatEdits, users] = await Promise.all([
    readItem("company", "records"),
    readItem("company", "documents"),
    readItem("company", "master"),
    readItem("company", "live-start"),
    readItem("company", "formatEdits"),
    listUsers(),
  ]);
  const start = parsed(liveStart);
  const masterValue = parsed(master);
  return {
    records: liveRecords(parsed(records)),
    documents: documentDefinitions(parsed(documents), parsed(formatEdits)),
    master: isObject(masterValue) ? (masterValue as StoredMaster) : null,
    liveStart: isObject(start) && isDay(start.date) ? start.date : null,
    accounts: users.map((u) => ({
      id: u.id,
      name: u.name,
      role: u.role,
      departments: String(u.departments ?? "")
        .split(",")
        .map((c) => c.trim().toUpperCase())
        .filter(Boolean),
      email: u.email,
      active: u.active,
    })),
  };
}

/** The plant's calendar for a run: its closed days, its go-live floor, and its clock for "the day it was handed in". */
function calendarOf(plant: Plant): PlantCalendar {
  const zone = plantTimeZone();
  return { isClosedDay: plantClosedDays(plant.master), countedFrom: plant.liveStart, dateOf: (stamp) => dateInZone(stamp, zone) };
}

/** Whether the plant is closed on a date, from the master data it stores — for backend/jobs.ts. */
export async function plantClosedOn(): Promise<(dateISO: string) => boolean> {
  const master = parsed(await readItem("company", "master"));
  return plantClosedDays(isObject(master) ? (master as StoredMaster) : null);
}

/**
 * "Human Resources" for "HR": the master data's own list of departments where it
 * names them, else the plant's ten as the app names them (data/seed/documentDepartments.ts)
 * — a store whose master data carries no department list must still read
 * "Human Resources (Vinay Bhojak, Sandeep Parekh)", never "HR (…)". The code itself
 * only for a code neither knows.
 */
function departmentNamer(plant: Plant): (code: string) => string {
  const names = new Map<string, string>(PLANT_DEPARTMENTS.map((d) => [d.code.toUpperCase(), d.name]));
  if (Array.isArray(plant.master?.departments)) {
    for (const d of plant.master.departments) {
      if (isObject(d) && typeof d.code === "string" && typeof d.name === "string") names.set(d.code.toUpperCase(), d.name);
    }
  }
  return (code) => (code ? (names.get(code) ?? code) : "No department assigned");
}

/** The name a record is called by: its format number, or its name while the number is still to be confirmed (engine/performance.ts calledBy). */
const calledBy = (doc: StoredDocument): string => (doc.formatNo && !doc.formatNo.toUpperCase().startsWith("TO BE") ? doc.formatNo : doc.name);

const departmentOfDoc = (d: StoredDocument): string | null => departmentOfDocument(d.id, d.formatNo);

// ---------------------------------------------------------------------------
// The escalation: who, and on what evidence

/** One record behind an escalation. */
export interface EscalationRecord {
  id: string;
  documentId: string;
  what: string;
  dueDate: string;
  outcome: "late" | "never done";
  daysLate: number;
}

/** What an escalation stands on, kept with it (escalations.evidence). */
export interface EscalationEvidence {
  window: { from: string; to: string };
  rule: typeof ESCALATION_RULE;
  /** A department's accounts, by name. */
  people?: string[];
  /** Up to three documents with the most late or never done. */
  worst: { documentId: string; what: string; late: number; neverDone: number }[];
  /** Up to ten of the records: never done, oldest first; then late, latest first. */
  records: EscalationRecord[];
}

export interface Subject {
  kind: "person" | "department";
  /** The account's id, or "dept:HR". */
  key: string;
  name: string;
  department: string;
  late: number;
  neverDone: number;
  evidence: EscalationEvidence;
  /** The id of every record behind the counts, sorted — the evidence lists ten at most. */
  recordIds: string[];
}

interface Tally {
  kind: Subject["kind"];
  key: string;
  late: number;
  neverDone: number;
  misses: (EscalationRecord & { department: string })[];
}

/**
 * WHO IS ESCALATED ON `today`: the rule above applied to the 30 days of due
 * dates up to and including it, every record judged as of `today`. Pure — the
 * plant comes in as an argument.
 */
export function findEscalations(plant: Plant, today: string): { window: { from: string; to: string }; subjects: Subject[] } {
  const window = { from: addDaysISO(today, 1 - ESCALATION_RULE.windowDays), to: today };
  const persons = new Map<string, Tally>();
  const departments = new Map<string, Tally>();
  const tallyOf = (map: Map<string, Tally>, kind: Tally["kind"], key: string): Tally => {
    let t = map.get(key);
    if (!t) {
      t = { kind, key, late: 0, neverDone: 0, misses: [] };
      map.set(key, t);
    }
    return t;
  };

  const accountById = new Map(plant.accounts.map((a) => [a.id, a]));
  const { accountsOf } = attribute(plant.records, plant.documents, plant.accounts, window, today, calendarOf(plant), departmentOfDoc, (c) => {
    const { record, doc, judgement, department, answering } = c;
    if (judgement.outcome !== "late" && judgement.outcome !== "overdue") return;
    const miss = {
      id: record.id,
      documentId: doc.id,
      what: calledBy(doc),
      dueDate: record.dueDate,
      outcome: judgement.outcome === "late" ? ("late" as const) : ("never done" as const),
      daysLate: judgement.daysLate,
      department,
    };
    if (judgement.outcome === "late") {
      // Late counts against whoever the scorecard counts it against: the person who
      // handed it in, in a shared department; every account of the department otherwise.
      for (const a of answering) {
        const t = tallyOf(persons, "person", a.id);
        t.late += 1;
        t.misses.push(miss);
      }
      return;
    }
    // Never done. One account answers for the department: it is that person's.
    // Several (or none): it is the department's — the scorecard counts it against
    // every one of them, so the escalation names the department and its people.
    // So is it when the one account has been switched off: the work is still not
    // done, and there is nobody else to name.
    if (answering.length === 1 && accountById.get(answering[0].id)?.active) {
      const t = tallyOf(persons, "person", answering[0].id);
      t.neverDone += 1;
      t.misses.push(miss);
    } else if (department) {
      const t = tallyOf(departments, "department", `dept:${department}`);
      t.neverDone += 1;
      t.misses.push(miss);
    }
  });

  const deptName = departmentNamer(plant);
  const evidenceOf = (t: Tally, people?: string[]): EscalationEvidence => {
    const perDoc = new Map<string, { documentId: string; what: string; late: number; neverDone: number }>();
    for (const m of t.misses) {
      const d = perDoc.get(m.documentId) ?? { documentId: m.documentId, what: m.what, late: 0, neverDone: 0 };
      if (m.outcome === "late") d.late += 1;
      else d.neverDone += 1;
      perDoc.set(m.documentId, d);
    }
    const worst = Array.from(perDoc.values())
      .sort((a, b) => b.late + b.neverDone - (a.late + a.neverDone) || b.neverDone - a.neverDone || a.what.localeCompare(b.what))
      .slice(0, 3);
    const records = t.misses
      .slice()
      .sort((a, b) =>
        a.outcome !== b.outcome ? (a.outcome === "never done" ? -1 : 1) : a.outcome === "never done" ? a.dueDate.localeCompare(b.dueDate) : b.daysLate - a.daysLate || b.dueDate.localeCompare(a.dueDate)
      )
      .slice(0, 10)
      .map(({ department: _d, ...r }) => r);
    return { window, rule: ESCALATION_RULE, ...(people ? { people } : {}), worst, records };
  };
  /** The department most of a person's misses belong to — the one the escalation is filed under. */
  const mainDepartment = (t: Tally): string => {
    const counts = new Map<string, number>();
    for (const m of t.misses) if (m.department) counts.set(m.department, (counts.get(m.department) ?? 0) + 1);
    return Array.from(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? "";
  };
  const recordIdsOf = (t: Tally): string[] => Array.from(new Set(t.misses.map((m) => m.id))).sort();

  const subjects: Subject[] = [];
  for (const t of persons.values()) {
    if (t.late < ESCALATION_RULE.late && t.neverDone < ESCALATION_RULE.neverDone) continue;
    const account = accountById.get(t.key);
    // Somebody whose account is switched off has left: there is nobody to speak to.
    if (!account || !account.active) continue;
    subjects.push({
      kind: "person",
      key: t.key,
      name: account.name,
      department: mainDepartment(t),
      late: t.late,
      neverDone: t.neverDone,
      evidence: evidenceOf(t),
      recordIds: recordIdsOf(t),
    });
  }
  for (const t of departments.values()) {
    if (t.neverDone < ESCALATION_RULE.neverDone) continue;
    const code = t.key.slice("dept:".length);
    const people = (accountsOf.get(code) ?? []).map((p) => (p.active ? p.name : `${p.name} (switched off)`));
    const name = people.length ? `${deptName(code)} (${people.join(", ")})` : `${deptName(code)} (no account answers for it)`;
    subjects.push({ kind: "department", key: t.key, name, department: code, late: t.late, neverDone: t.neverDone, evidence: evidenceOf(t, people), recordIds: recordIdsOf(t) });
  }
  subjects.sort((a, b) => b.neverDone + b.late - (a.neverDone + a.late) || a.name.localeCompare(b.name));
  return { window, subjects };
}

/** "3 late and 2 never done in the 30 days to 24-Sep-2026 — F/QC/12: 2 late" */
export function escalationSentence(s: { late: number; neverDone: number; evidence: EscalationEvidence }): string {
  const counts = [s.late ? `${s.late} late` : "", s.neverDone ? `${s.neverDone} never done` : ""].filter(Boolean).join(" and ");
  const worst = s.evidence.worst.map((w) => `${w.what}: ${[w.late ? `${w.late} late` : "", w.neverDone ? `${w.neverDone} never done` : ""].filter(Boolean).join(", ")}`).join("; ");
  return `${counts} in the ${s.evidence.rule.windowDays} days to ${displayDate(s.evidence.window.to)}${worst ? ` — ${worst}` : ""}`;
}

/** An escalation as the API hands it out. */
export interface EscalationRow {
  id: string;
  raisedAt: string;
  updatedAt: string;
  kind: string;
  subjectKey: string;
  subjectName: string;
  department: string;
  period: string;
  late: number;
  neverDone: number;
  evidence: EscalationEvidence;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
}

interface EscalationDbRow {
  id: string;
  raised_at: Date;
  updated_at: Date;
  kind: string;
  subject_key: string;
  subject_name: string;
  department: string;
  period: string;
  late: number;
  never_done: number;
  evidence: EscalationEvidence;
  acknowledged_by: string | null;
  acknowledged_at: Date | null;
}

export const ESCALATION_COLUMNS = "id::text AS id, raised_at, updated_at, kind, subject_key, subject_name, department, period, late, never_done, evidence, acknowledged_by, acknowledged_at";

export function toEscalationRow(r: EscalationDbRow): EscalationRow {
  return {
    id: r.id,
    raisedAt: r.raised_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
    kind: r.kind,
    subjectKey: r.subject_key,
    subjectName: r.subject_name,
    department: r.department,
    period: r.period,
    late: r.late,
    neverDone: r.never_done,
    evidence: r.evidence,
    acknowledgedBy: r.acknowledged_by,
    acknowledgedAt: r.acknowledged_at ? r.acknowledged_at.toISOString() : null,
  };
}

/** Open escalations first (newest first), or the last 30 days' of them all. */
export async function listEscalations(open: boolean): Promise<EscalationRow[]> {
  const { rows } = await database().query<EscalationDbRow>(
    open
      ? `SELECT ${ESCALATION_COLUMNS} FROM escalations WHERE acknowledged_at IS NULL ORDER BY raised_at DESC, id DESC LIMIT 200`
      : `SELECT ${ESCALATION_COLUMNS} FROM escalations WHERE updated_at >= now() - interval '30 days' ORDER BY raised_at DESC, id DESC LIMIT 200`
  );
  return rows.map(toEscalationRow);
}

/**
 * Marks one as seen by the super admin. null when there is no such escalation; `already` when somebody had.
 * The records behind it are kept as seen (seen_ids, with any seen before it opened again): the daily
 * check opens it again only for a record outside them.
 */
export async function acknowledgeEscalation(id: string, by: string): Promise<{ row: EscalationRow; already: boolean } | null> {
  const done = await database().query<EscalationDbRow>(
    `UPDATE escalations
        SET acknowledged_by = $2, acknowledged_at = now(),
            seen_ids = ARRAY(SELECT DISTINCT unnest(COALESCE(seen_ids, '{}') || record_ids) ORDER BY 1)
      WHERE id = $1::bigint AND acknowledged_at IS NULL RETURNING ${ESCALATION_COLUMNS}`,
    [id, by]
  );
  if (done.rows[0]) return { row: toEscalationRow(done.rows[0]), already: false };
  const found = await database().query<EscalationDbRow>(`SELECT ${ESCALATION_COLUMNS} FROM escalations WHERE id = $1::bigint`, [id]);
  return found.rows[0] ? { row: toEscalationRow(found.rows[0]), already: true } : null;
}

// ---------------------------------------------------------------------------
// Email — only when the server has a mailbox; the app is the channel either way

const escapeHtml = (s: unknown): string =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
const PLAIN_EMAIL_RE = /^[^\s@,;<>"'()]+@[^\s@,;<>"'()]+\.[^\s@,;<>"'()]+$/;

/**
 * WHO IS WRITTEN TO: ESCALATION_EMAIL (one address, or several separated by
 * commas), or else every active administrator. An address at ".local" is
 * left out — no such domain delivers mail, and the seeded super admin's is one.
 */
async function recipients(): Promise<string[]> {
  const set = process.env.ESCALATION_EMAIL?.trim();
  const wanted = set ? set.split(",") : (await listUsers()).filter((u) => u.role === "admin" && u.active).map((u) => u.email);
  return Array.from(new Set(wanted.map((a) => a.trim().toLowerCase()).filter((a) => PLAIN_EMAIL_RE.test(a) && !a.endsWith(".local"))));
}

/** Sends one message to every recipient. Says what happened, in words for the job's outcome; never throws. */
async function mailOut(subject: string, html: string): Promise<string> {
  if (!isEmailConfigured()) return "no email (the server has no mailbox; shown in the app)";
  const to = await recipients();
  if (to.length === 0) return "no email (no address that receives mail; shown in the app)";
  let sent = 0;
  for (const address of to) {
    try {
      await sendMail({ to: address, subject, html });
      sent += 1;
    } catch (err) {
      console.error(`[escalation] could not email ${address}:`, err instanceof Error ? err.message : err);
    }
  }
  return `emailed ${sent} of ${to.length}`;
}

// ---------------------------------------------------------------------------
// The escalation run

export interface EscalationResult {
  today: string;
  period: string;
  window: { from: string; to: string };
  /** Escalations new this run. */
  raised: EscalationRow[];
  /** Escalations of this week that were already on file and were looked at again. */
  updated: number;
  email: string;
  outcome: string;
}

/**
 * THE DAILY CHECK: works the escalations out as of `today`, stores each one
 * against today's ISO week, writes an activity-log line and sends an email for
 * each that is new. Safe to run again the same day or week — the line is
 * updated, not repeated.
 */
export async function runEscalation(today: string): Promise<EscalationResult> {
  const plant = await loadPlant();
  const { window, subjects } = findEscalations(plant, today);
  const period = isoWeek(today);
  // Stored in the order of their keys, so two runs at once (a hand run beside
  // the schedule's) take the rows' locks in the same order and never deadlock;
  // handed back in the rule's order, the most behind first.
  const order = new Map(subjects.map((s, i) => [`${s.kind}|${s.key}`, i]));
  const byKey = subjects.slice().sort((a, b) => a.kind.localeCompare(b.kind) || a.key.localeCompare(b.key));

  // ONE TRANSACTION: the lines stored AND the activity-log lines for the new
  // ones. A new line is known by being inserted rather than updated, so were the
  // activity-log line to fail after the lines were stored — a dropped
  // connection — the retry would find them "already on file" and the super
  // admin would never be told. Now the lines go back with it, and the retry
  // raises them afresh.
  const { raised, updated } = await withClient((client) =>
    transaction(client, async () => {
      const raised: EscalationRow[] = [];
      let updated = 0;
      for (const s of byKey) {
        // THE DAY'S FIGURES, NOT THE MOST THEY EVER REACHED: the 30 days roll
        // forward, so a late leaves them as a new one comes in, and a record never
        // done that is handed in late moves from one count to the other. The
        // counts, the evidence and the records behind them are the day's own,
        // every run. An acknowledged line opens again only when a record is behind
        // it that the super admin has not seen (record_ids outside seen_ids) — a
        // new late whatever the counts say, and never for a figure that fell. A
        // line whose subject no longer meets the rule is not in this list and is
        // left as it stood: the figures of the last day it did (evidence.window.to).
        const { rows } = await client.query<EscalationDbRow & { inserted: boolean }>(
          `INSERT INTO escalations (kind, subject_key, subject_name, department, period, late, never_done, evidence, record_ids)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::text[])
           ON CONFLICT (kind, subject_key, period) DO UPDATE SET
             subject_name = EXCLUDED.subject_name,
             department = EXCLUDED.department,
             late = EXCLUDED.late,
             never_done = EXCLUDED.never_done,
             evidence = EXCLUDED.evidence,
             record_ids = EXCLUDED.record_ids,
             acknowledged_by = CASE WHEN EXCLUDED.record_ids <@ COALESCE(escalations.seen_ids, '{}') THEN escalations.acknowledged_by END,
             acknowledged_at = CASE WHEN EXCLUDED.record_ids <@ COALESCE(escalations.seen_ids, '{}') THEN escalations.acknowledged_at END,
             updated_at = now()
           RETURNING ${ESCALATION_COLUMNS}, (xmax = 0) AS inserted`,
          [s.kind, s.key, s.name, s.department, period, s.late, s.neverDone, JSON.stringify(s.evidence), s.recordIds]
        );
        const row = rows[0];
        if (!row) continue;
        if (row.inserted) raised.push(toEscalationRow(row));
        else updated += 1;
      }
      raised.sort((a, b) => (order.get(`${a.kind}|${a.subjectKey}`) ?? 0) - (order.get(`${b.kind}|${b.subjectKey}`) ?? 0));

      // One line in the activity log for each NEW escalation (REQUIREMENTS §62),
      // for the super admin alone: under no department, and with no figures —
      // the counts and the format numbers are on the escalation itself, which
      // only the super admin is handed (db.ts SUPER_ADMIN_ACTIONS).
      if (raised.length > 0) {
        await client.query(
          `INSERT INTO activity_log (user_id, user_name, user_email, action, target, detail, department)
           SELECT NULL, 'System', '', $1, target, detail, ''
             FROM unnest($2::text[], $3::text[]) WITH ORDINALITY AS line (target, detail, n)
            ORDER BY n`,
          [ESCALATION_ACTIONS.raised, raised.map((e) => e.subjectName), raised.map((e) => `${e.period} — the figures and the records are with the escalation`)]
        );
      }
      return { raised, updated };
    })
  );

  // The email after the lines are in: the app is the channel, and a message
  // sent for lines that then failed to be stored would be about nothing.
  const email = raised.length
    ? await mailOut(
        `Escalated to you: ${raised.length} ${raised.length === 1 ? "person or department" : "people or departments"} behind with their records`,
        `<p>The Digital Controlled Record System raises these with the super admin: ${ESCALATION_RULE.late} or more late submissions, or ${ESCALATION_RULE.neverDone} or more records never done, in the last ${ESCALATION_RULE.windowDays} days.</p><ul>` +
          raised.map((e) => `<li><strong>${escapeHtml(e.subjectName)}</strong> — ${escapeHtml(escalationSentence(e))}</li>`).join("") +
          `</ul><p style="color:#6b7280;font-size:12px;">Acknowledge each one from the bell in the app. The Performance Scorecard has the records.</p>`
      )
    : "nothing new to email";
  const outcome = `${raised.length} raised, ${updated} already on file for ${period}; ${email}`;
  return { today, period, window, raised, updated, email, outcome };
}

// ---------------------------------------------------------------------------
// The weekly digest

interface Counts {
  due: number;
  onTime: number;
  late: number;
  neverDone: number;
  /** Not due yet on the day the digest was made — shown, never counted. */
  pending: number;
}

/** The super admin's digest of one week, as stored (weekly_digests.body) and sent to the browser. */
export interface DigestBody {
  period: string;
  /** Monday and Sunday of the week. */
  from: string;
  to: string;
  /** The day it was worked out: every record is judged as of it. */
  judgedOn: string;
  totals: Counts & { score: number | null };
  departments: (Counts & { code: string; name: string; score: number | null; people: string[] })[];
  worstDocuments: (Counts & { documentId: string; what: string; department: string; score: number | null })[];
  capa: { internalOpen: number; internalOverdue: number; oldestOverdue: { finding: string; targetDate: string | null } | null; externalOpen: number; externalAwaiting: number };
  escalations: { raised: number; open: number; list: { id: string; kind: string; subjectName: string; department: string; late: number; neverDone: number; acknowledged: boolean }[] };
}

const emptyCounts = (): Counts => ({ due: 0, onTime: 0, late: 0, neverDone: 0, pending: 0 });

/** Worst first — the scorecard's order: the lowest score, then the most never done, then the most due; nothing due last. */
function worstFirst(a: Counts & { score: number | null }, b: Counts & { score: number | null }): number {
  if (a.score === null || b.score === null) return a.score === b.score ? 0 : a.score === null ? 1 : -1;
  return a.score - b.score || b.neverDone - a.neverDone || b.due - a.due;
}

/** CAPA as it stands on `today`: the internal findings open and past target (the records of gap-inspection), and the customer complaints (capa-customer-complaint). */
function capaNow(plant: Plant, today: string): DigestBody["capa"] {
  let internalOpen = 0;
  let internalOverdue = 0;
  let oldest: { finding: string; targetDate: string | null } | null = null;
  let externalOpen = 0;
  let externalAwaiting = 0;
  for (const r of plant.records) {
    if (r.documentId === "gap-inspection" && isObject(r.data) && Array.isArray(r.data.findings)) {
      for (const f of r.data.findings) {
        if (!isObject(f) || (f.status !== "Open" && f.status !== "Overdue")) continue;
        internalOpen += 1;
        const target = isDay(f.targetDate) ? f.targetDate : null;
        if (f.status === "Overdue" || (target !== null && target < today)) {
          internalOverdue += 1;
          if (!oldest || (target ?? "9999-12-31") < (oldest.targetDate ?? "9999-12-31")) oldest = { finding: String(f.findingOfInspection ?? "").slice(0, 160), targetDate: target };
        }
      }
    } else if (r.documentId === "capa-customer-complaint") {
      if (["Scheduled", "Due", "In Progress", "Rejected"].includes(r.status)) externalOpen += 1;
      else if (r.status === "Submitted" || r.status === "Pending Verification") externalAwaiting += 1;
    }
  }
  return { internalOpen, internalOverdue, oldestOverdue: oldest, externalOpen, externalAwaiting };
}

/** THE WEEK BEFORE `today`, worked out and stored — the job runs on the first working day of each week. */
export async function runWeeklyDigest(today: string): Promise<{ period: string; body: DigestBody; email: string; outcome: string }> {
  const plant = await loadPlant();
  const from = addDaysISO(mondayOf(today), -7);
  const to = addDaysISO(from, 6);
  const period = isoWeek(from);
  const deptName = departmentNamer(plant);

  const totals = emptyCounts();
  const perDepartment = new Map<string, Counts>();
  const perDocument = new Map<string, Counts & { documentId: string; what: string; department: string }>();
  const add = (c: Counts, outcome: string) => {
    if (outcome === "onTime") c.onTime += 1;
    else if (outcome === "late") c.late += 1;
    else if (outcome === "overdue") c.neverDone += 1;
    else if (outcome === "pending") c.pending += 1;
    c.due = c.onTime + c.late + c.neverDone;
  };
  const { accountsOf } = attribute(plant.records, plant.documents, plant.accounts, { from, to }, today, calendarOf(plant), departmentOfDoc, ({ doc, judgement, department }) => {
    add(totals, judgement.outcome);
    const d = perDepartment.get(department) ?? emptyCounts();
    add(d, judgement.outcome);
    perDepartment.set(department, d);
    const byDoc = perDocument.get(doc.id) ?? { ...emptyCounts(), documentId: doc.id, what: calledBy(doc), department };
    add(byDoc, judgement.outcome);
    perDocument.set(doc.id, byDoc);
  });
  const scored = <T extends Counts>(c: T): T & { score: number | null } => ({ ...c, score: scoreOf(c.onTime, c.late, c.neverDone) });

  const departments = Array.from(perDepartment, ([code, c]) => ({ ...scored(c), code, name: deptName(code), people: (accountsOf.get(code) ?? []).map((p) => p.name) })).sort(
    (a, b) => worstFirst(a, b) || a.name.localeCompare(b.name)
  );
  const worstDocuments = Array.from(perDocument.values())
    .filter((d) => d.late + d.neverDone > 0)
    .map(scored)
    .sort((a, b) => worstFirst(a, b) || a.what.localeCompare(b.what))
    .slice(0, 5);

  const { rows: raisedRows } = await database().query<EscalationDbRow>(`SELECT ${ESCALATION_COLUMNS} FROM escalations WHERE period = $1 ORDER BY never_done + late DESC, subject_name`, [period]);
  const { rows: openRows } = await database().query<{ n: string }>("SELECT COUNT(*)::text AS n FROM escalations WHERE acknowledged_at IS NULL");
  const body: DigestBody = {
    period,
    from,
    to,
    judgedOn: today,
    totals: scored(totals),
    departments,
    worstDocuments,
    capa: capaNow(plant, today),
    escalations: {
      raised: raisedRows.length,
      open: Number(openRows[0]?.n ?? 0),
      list: raisedRows.slice(0, 20).map((r) => ({ id: r.id, kind: r.kind, subjectName: r.subject_name, department: r.department, late: r.late, neverDone: r.never_done, acknowledged: r.acknowledged_at !== null })),
    },
  };

  await database().query(
    `INSERT INTO weekly_digests (period, body) VALUES ($1, $2::jsonb)
     ON CONFLICT (period) DO UPDATE SET body = EXCLUDED.body, created_at = now()`,
    [period, JSON.stringify(body)]
  );

  const week = `${period} (${displayDate(from)} to ${displayDate(to)})`;
  const summary =
    `${totals.due} due: ${totals.onTime} on time, ${totals.late} late, ${totals.neverDone} never done; ` +
    `${body.capa.internalOpen} CAPA finding${body.capa.internalOpen === 1 ? "" : "s"} open (${body.capa.internalOverdue} past target); ` +
    `${body.escalations.raised} escalation${body.escalations.raised === 1 ? "" : "s"}`;
  await insertActivity([{ userId: null, userName: "System", userEmail: "", action: "Weekly digest prepared", target: week, detail: summary }]);

  const cell = 'style="padding:4px 10px;border-bottom:1px solid #e5e7eb;"';
  const email = await mailOut(
    `Weekly digest — ${week}`,
    `<p>${escapeHtml(summary)}.</p>` +
      `<table style="border-collapse:collapse;font-family:sans-serif;font-size:13px;"><thead><tr><th ${cell}>Department</th><th ${cell}>Due</th><th ${cell}>On time</th><th ${cell}>Late</th><th ${cell}>Never done</th><th ${cell}>Score</th></tr></thead><tbody>` +
      departments.map((d) => `<tr><td ${cell}>${escapeHtml(d.name)}</td><td ${cell}>${d.due}</td><td ${cell}>${d.onTime}</td><td ${cell}>${d.late}</td><td ${cell}>${d.neverDone}</td><td ${cell}>${d.score ?? "—"}</td></tr>`).join("") +
      `</tbody></table>` +
      (worstDocuments.length ? `<p>Most behind: ${worstDocuments.map((d) => escapeHtml(`${d.what} (${[d.late ? `${d.late} late` : "", d.neverDone ? `${d.neverDone} never done` : ""].filter(Boolean).join(", ")})`)).join("; ")}.</p>` : "") +
      `<p style="color:#6b7280;font-size:12px;">The same digest is on the Performance page for the super admin.</p>`
  );
  return { period, body, email, outcome: `${week}: ${summary}; ${email}` };
}

/** The newest digest on file, or null. */
export async function latestDigest(): Promise<{ period: string; createdAt: string; body: DigestBody } | null> {
  const { rows } = await database().query<{ period: string; created_at: Date; body: DigestBody }>("SELECT period, created_at, body FROM weekly_digests ORDER BY period DESC LIMIT 1");
  const r = rows[0];
  return r ? { period: r.period, createdAt: r.created_at.toISOString(), body: r.body } : null;
}
