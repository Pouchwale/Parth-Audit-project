import type { LogSheetData, LogSheetRow, RecordInstance } from "../types";
import { documentRepository } from "../data/repositories/documentRepository";
import { hrMasterRepository } from "../data/repositories/hrMasterRepository";
import { recordRepository } from "../data/repositories/recordRepository";
import { getLogSheetLayout } from "../data/seed/logSheetLayouts";
import { mayWriteRecordsOf } from "./departmentScope";
import { fillBlanksFromMaster, hrMasterLinkFor, personNamed, searchPeople } from "./hrMaster";
import { createRecordForDocument } from "./recordCrud";
import { blankLogRow } from "./recordDefaults";
import { isEditableStatus, saveDraft } from "./recordLifecycle";
import { fieldLabels } from "./recordPatch";
import { actualKey, calendarMonth, calendarStartYear, TRAINING_CALENDAR_ID, writtenDate } from "./trainingCalendar";
import { additionalTrainingFrom, EFFECTIVENESS_ID, FEEDBACK_ID, IMPARTED_ID, type Attendee, type CalendarTraining } from "./trainingLinks";
import { generateId } from "../utils/id";
import { todayISO } from "../utils/date";
// A format the super admin made Manual, Reference only or SAP in Indexing is never filled by the system (REQUIREMENTS §304).
import { systemFills } from "../../../indexing/modes";

// THE TRAINING CHAIN MAKES AND FILLS ITS OWN RECORDS (REQUIREMENTS §337; the owner, 25-Nov-2026: "hr-09 is connected with
// hr-10 and hr-10 is connected with hr-11 and hr-11 is connected with hr-12 so basically all the name inside there and other
// fields should be fill out automatically when any one is filled and in hr-09 data will come from master data"; his choices:
// the records are made by themselves, F/HR/10's names come from F/HR/08 and HR Master Data, F/HR/09's trainer from HR
// Master Data). §165 and §168 filled a format only when HR made it and chose the training; now:
//
//   F/HR/09 -> F/HR/10   a training whose Actual date is written (on its day, when F/HR/09 is opened, §272, §289) has its
//                        Training Imparted Record made: the date, topic, trainer, duration, method and method of
//                        evaluation, and one line for everybody F/HR/08 marks X under that topic, their designation and
//                        department from HR Master Data. HR crosses out who did not come and adds who did.
//   F/HR/10 -> F/HR/11   once a person has had the record open (HR checked who attended), every name on it has its own
//                        Training Effectiveness Evaluation: the trainee, their department and designation, the date, the
//                        topic and the trainer. A name added later gets its own.
//   F/HR/10, F/HR/11 -> F/HR/12   the training's Feedback & Evaluation Record is made with a line for each of them, scored 3;
//                        a name added later, or a trainee evaluated on an F/HR/11, gets a line; an F/HR/11's answer on
//                        further training writes the line's "additional training" where it is blank.
//
// The chain runs when a person opens or leaves one of the four (pages/RecordPage.tsx, engine/assistantPrepare.ts
// prepareRecordOnOpen) - never by itself overnight (§289). Nothing a person wrote is changed: boxes are filled only where
// blank, lines only added. A record HR deletes is not made again, nor a line HR deletes put back (kept out of sight:
// the calendar line's trainingImparted<n>, the F/HR/10 line's chainEvaluation, the F/HR/10's chainFeedback, the F/HR/12's
// chainListed). A submitted or verified record, and a sheet filed from the company's paper, is not touched. The trainings before 25-Nov-2026, and the sheets filed from
// paper, are left as they are.

export const CHAIN_FROM = "2026-11-25";
export const TRAINING_CHAIN_DOCS: ReadonlySet<string> = new Set([TRAINING_CALENDAR_ID, IMPARTED_ID, EFFECTIVENESS_ID, FEEDBACK_ID]);
export const TRAINING_NEEDS_ID = "hr-training-needs";
export const CHAIN_NOTE = "Made by the training chain (REQUIREMENTS §337): F/HR/09 → F/HR/10 → F/HR/11 → F/HR/12. Every box stays yours to change.";

/** The calendar line's memory that this month's training has had its F/HR/10 made. */
export const impartedMadeKey = (monthIndex: number): string => `trainingImparted${monthIndex}`;
/** An F/HR/10 line's memory of the name its F/HR/11 was made for. */
export const EVALUATION_MADE = "chainEvaluation";
/** F/HR/10's memory that its training's F/HR/12 was made; and that a person has checked who attended. */
export const FEEDBACK_MADE = "chainFeedback";
export const ATTENDANCE_CHECKED = "chainChecked";
/** F/HR/12's memory of the names the chain listed on it, one a line. */
export const LISTED = "chainListed";
const YES = "yes";

const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v).trim());
const same = (a: unknown, b: unknown): boolean => str(a).replace(/\s+/g, " ").toLowerCase() === str(b).replace(/\s+/g, " ").toLowerCase();
const dayOf = (v: unknown): string => {
  const t = str(v);
  return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : t;
};

// ---------------------------------------------------------------------------
// F/HR/09's trainer from HR Master Data

/**
 * The words typed under Source of Training with the trainer's post, as the calendar writes it ("Ajay Vaghela (Flexo
 * Manager)"): a person on HR Master Data - named in full as typed, or by the start of the one name it can be (then written
 * out in full) - is followed by their designation. Anything else (an external trainer, words with a bracket already, a name several people share)
 * stays as typed.
 */
export function trainerWithPost(words: string, people = hrMasterRepository.all()): string {
  const typed = str(words);
  if (!typed || /[()]/.test(typed) || /\n/.test(typed)) return words;
  // A name written in full (or another spelling the sheet knows for the person) is kept as written; the start of a name
  // is written out as the sheet has it.
  const named = personNamed(typed, people);
  const found = named ? null : searchPeople(typed, people, 2);
  const person = named ?? (found && found.candidates.length === 1 ? found.candidates[0] : null);
  if (!person || !person.fullName.trim()) return words;
  const name = named ? typed.replace(/\s+/g, " ") : person.fullName.trim();
  const post = person.designation.trim();
  return post ? `${name} (${post})` : name;
}

// ---------------------------------------------------------------------------
// F/HR/08's people for a training

const STOP = new Set(["of", "the", "and", "on", "for", "in", "a", "an", "to", "with"]);
const topicWords = (s: unknown): string[] => [...new Set(str(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter((w) => w && !STOP.has(w)))];

/** How well two topics agree: the share of the shorter one's words the other has. */
export function topicMatch(a: unknown, b: unknown): number {
  const x = topicWords(a);
  const y = topicWords(b);
  if (x.length === 0 || y.length === 0) return 0;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.filter((w) => long.includes(w)).length / short.length;
}

/** F/HR/08's column for a training topic: the one whose words agree best, if they agree enough (0.6). */
export function needsColumnFor(topic: unknown, columns: readonly { key: string; label: string }[]): string | null {
  let best: { key: string; score: number } | null = null;
  for (const c of columns) {
    const score = topicMatch(topic, c.label);
    if (score >= 0.6 && (!best || score > best.score)) best = { key: c.key, score };
  }
  return best?.key ?? null;
}

const marked = (v: unknown): boolean => {
  const t = str(v).toLowerCase();
  return !!t && t !== "no" && t !== "-" && t !== "n" && t !== "nil";
};

/** "01-04-2026 ~ 31-03-2027" (or with dots or slashes, day first): the two days, or null. */
function periodOf(text: unknown): { from: string; to: string } | null {
  const m = str(text).match(/(\d{1,2})[-./](\d{1,2})[-./](\d{4})\D+(\d{1,2})[-./](\d{1,2})[-./](\d{4})/);
  if (!m) return null;
  const iso = (d: string, mo: string, y: string) => `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  return { from: iso(m[1], m[2], m[3]), to: iso(m[4], m[5], m[6]) };
}

/** The F/HR/08 sheet for a day: the one whose period holds it, else the latest begun by it, else the latest. */
function needsSheetFor(date: string, isDemo: boolean): RecordInstance<LogSheetData> | undefined {
  const sheets = (recordRepository.queryUnscoped({ documentId: TRAINING_NEEDS_ID, isDemo }) as RecordInstance<LogSheetData>[])
    .filter((r) => r.status !== "Rejected" && (r.data?.rows ?? []).some((row) => str(row.name)))
    .sort((a, b) => (a.dueDate < b.dueDate ? 1 : a.dueDate > b.dueDate ? -1 : 0));
  return (
    sheets.find((r) => {
      const p = periodOf(r.data?.header?.period);
      return !!p && p.from <= date && date <= p.to;
    }) ??
    sheets.find((r) => r.dueDate <= date) ??
    sheets[0]
  );
}

/** Everybody F/HR/08 marks for this training's topic (X under its column), as F/HR/10 lines name them. */
export function peopleNeeding(topic: unknown, date: string, isDemo: boolean): Attendee[] {
  const layout = getLogSheetLayout(TRAINING_NEEDS_ID);
  const sheet = needsSheetFor(date, isDemo);
  if (!layout || !sheet) return [];
  const columns = layout.columns.filter((c) => /^t\d+$/.test(c.key)).map((c) => ({ key: c.key, label: c.label }));
  const key = needsColumnFor(topic, columns);
  if (!key) return [];
  const out: Attendee[] = [];
  for (const row of sheet.data?.rows ?? []) {
    const name = str(row.name);
    if (!name || !marked(row[key]) || out.some((a) => same(a.name, name))) continue;
    out.push({ name, department: "", designation: str(row.designation) });
  }
  return out;
}

/** F/HR/10 lines for these people, their blank department and designation from HR Master Data. */
export function attendanceLines(people: readonly Attendee[], newRowId: () => string = () => generateId("row")): LogSheetRow[] {
  const layout = getLogSheetLayout(IMPARTED_ID);
  const link = hrMasterLinkFor(IMPARTED_ID);
  const rows = people.map((p) => ({ ...(layout ? blankLogRow(layout, newRowId()) : { id: newRowId() }), name: p.name, department: p.department, designation: p.designation }) as LogSheetRow);
  if (!link || rows.length === 0) return rows;
  return fillBlanksFromMaster(link, { header: {}, rows }, hrMasterRepository.all()).data.rows;
}

/**
 * A Training Imparted Record whose training was just chosen (the topic box, §168) and that names nobody yet: everybody
 * F/HR/08 marks for that topic, one line each, for HR to strike out who did not come.
 */
export function withPeopleNeeding(data: LogSheetData, isDemo: boolean): LogSheetData {
  const topic = str(data.header?.topic);
  const date = dayOf(data.header?.trainingDate);
  if (!topic || !date || (data.rows ?? []).some((r) => str(r.name))) return data;
  const people = peopleNeeding(topic, date, isDemo);
  return people.length ? { ...data, rows: attendanceLines(people) } : data;
}

// ---------------------------------------------------------------------------
// the chain

export interface ChainOutcome {
  imparted: string[];
  evaluations: string[];
  feedback: string[];
  updated: string[];
}

const mayFill = (docId: string): boolean => mayWriteRecordsOf(docId) && systemFills(docId);

/** Written out of sight (no line in the history: nothing on the sheet changed), on any status. */
function remember<T>(record: RecordInstance<T>, data: T): RecordInstance<T> {
  return recordRepository.upsert({ ...record, data, updatedAt: new Date().toISOString() } as RecordInstance) as RecordInstance<T>;
}

function labelsOf(docId: string): Record<string, string> {
  const doc = documentRepository.getByIdUnscoped(docId);
  return doc ? fieldLabels(doc.kind, doc.id) : {};
}

function startRecord(docId: string, dateISO: string): RecordInstance<LogSheetData> | null {
  const doc = documentRepository.getByIdUnscoped(docId);
  if (!doc) return null;
  // A record of its own every time (the four are As Required); never one already on file - a format someone made
  // scheduled in Indexing hands back the day's sheet, which is somebody else's.
  const { record, existed } = createRecordForDocument(doc, { dateISO, isDemo: false });
  return existed ? null : (record as RecordInstance<LogSheetData>);
}

/** The training an F/HR/10 records, as the formats name it. */
function trainingOf(r: RecordInstance<LogSheetData>): CalendarTraining {
  const h = r.data?.header ?? {};
  const attendees = (r.data?.rows ?? []).filter((row) => str(row.name)).map((row) => ({ name: str(row.name), department: str(row.department), designation: str(row.designation) }));
  return { recordId: r.id, source: "imparted", topic: str(h.topic), trainer: str(h.impartedBy), duration: str(h.duration), method: str(h.method), evaluation: str(h.evaluationMethod), date: dayOf(h.trainingDate) || r.dueDate, held: true, attendees };
}

/** An F/HR/10 the chain follows: the system's or a person's since 25-Nov-2026, not a sheet filed from paper, not rejected. */
function followed(r: RecordInstance<LogSheetData>): boolean {
  if (r.isDemo || r.filedFromPaper || r.status === "Rejected") return false;
  const date = dayOf(r.data?.header?.trainingDate) || r.dueDate;
  return (str(r.createdAt).slice(0, 10) >= CHAIN_FROM || date >= CHAIN_FROM) && !!str(r.data?.header?.topic);
}

const ofTraining = (r: RecordInstance<LogSheetData>, topicKey: string, t: CalendarTraining): boolean =>
  r.status !== "Rejected" && same(r.data?.header?.[topicKey], t.topic) && dayOf(r.data?.header?.trainingDate) === t.date;

/** F/HR/09 -> F/HR/10: every training held since 25-Nov-2026 (its Actual date written, the day come) has its record. */
function impartedFromCalendar(today: string, out: ChainOutcome): void {
  if (!mayFill(IMPARTED_ID)) return;
  const imparted = recordRepository.queryUnscoped({ documentId: IMPARTED_ID, isDemo: false }) as RecordInstance<LogSheetData>[];
  for (const cal of recordRepository.queryUnscoped({ documentId: TRAINING_CALENDAR_ID, isDemo: false }) as RecordInstance<LogSheetData>[]) {
    if (cal.status === "Rejected" || !Array.isArray(cal.data?.rows)) continue;
    const start = calendarStartYear(cal.dueDate);
    let rows = cal.data.rows;
    for (let ri = 0; ri < rows.length; ri++) {
      const row = rows[ri];
      for (let i = 0; i < 12; i++) {
        if (str(row[impartedMadeKey(i)])) continue;
        const { year, month } = calendarMonth(start, i);
        const date = writtenDate(row[actualKey(i)], year, month);
        const topic = str(row.parameter);
        if (!date || !topic || date < CHAIN_FROM || date > today) continue;
        const already = imparted.some((r) => r.status !== "Rejected" && same(r.data?.header?.topic, topic) && (dayOf(r.data?.header?.trainingDate) || r.dueDate) === date);
        if (!already) {
          const started = startRecord(IMPARTED_ID, date);
          if (!started) continue;
          const people = peopleNeeding(topic, date, false);
          const header = {
            ...(started.data?.header ?? {}),
            trainingDate: date,
            topic,
            impartedBy: str(row.source),
            duration: str(row.duration),
            method: str(row.method),
            evaluationMethod: str(row.evaluation) || str(started.data?.header?.evaluationMethod),
            venue: "",
            evaluationDate: "",
          };
          const data: LogSheetData = { ...started.data, header, rows: people.length ? attendanceLines(people) : started.data?.rows ?? [] };
          const saved = saveDraft(started, data, "DCRS", { action: "edited", note: `${CHAIN_NOTE} From F/HR/09: ${topic}, ${date}${people.length ? `; ${people.length} people from F/HR/08` : ""}.`, labels: labelsOf(IMPARTED_ID) });
          imparted.push(saved as RecordInstance<LogSheetData>);
          out.imparted.push(saved.id);
        }
        rows = rows.map((r, k) => (k === ri ? { ...r, [impartedMadeKey(i)]: YES } : r));
      }
    }
    if (rows !== cal.data.rows) remember(cal, { ...cal.data, rows });
  }
}

/** F/HR/10 -> F/HR/11: one evaluation per person named, once HR has had the record open. */
function evaluationsFromImparted(f10: RecordInstance<LogSheetData>, t: CalendarTraining, out: ChainOutcome): RecordInstance<LogSheetData> {
  if (!mayFill(EFFECTIVENESS_ID)) return f10;
  const all = (recordRepository.queryUnscoped({ documentId: EFFECTIVENESS_ID, isDemo: false }) as RecordInstance<LogSheetData>[]).filter((r) => ofTraining(r, "trainingTopic", t));
  let rows = f10.data.rows;
  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    const name = str(row.name);
    if (!name) continue;
    const own = all.find((r) => same(r.data?.header?.traineeName, name));
    if (own) {
      // Its blank boxes take what F/HR/10 says (the trainer written in later, the person's post).
      if (isEditableStatus(own.status) && !own.filedFromPaper) {
        const h = own.data.header ?? {};
        const fills: Record<string, string> = {};
        const put = (key: string, value: string) => {
          if (value && !str(h[key])) fills[key] = value;
        };
        put("department", str(row.department));
        put("designation", str(row.designation));
        put("trainerName", t.trainer);
        if (Object.keys(fills).length) {
          saveDraft(own, { ...own.data, header: { ...h, ...fills } }, "DCRS", { action: "edited", note: `${CHAIN_NOTE} Filled from F/HR/10.`, labels: labelsOf(EFFECTIVENESS_ID) });
          out.updated.push(own.id);
        }
      }
      if (!same(row[EVALUATION_MADE], name)) rows = rows.map((r, k) => (k === ri ? { ...r, [EVALUATION_MADE]: name } : r));
      continue;
    }
    // (made once for this name: an evaluation HR deleted is not made again; a name corrected gets its own)
    if (same(row[EVALUATION_MADE], name)) continue;
    const started = startRecord(EFFECTIVENESS_ID, t.date);
    if (!started) continue;
    const header = {
      ...(started.data?.header ?? {}),
      traineeName: name,
      department: str(row.department),
      designation: str(row.designation),
      trainingDate: t.date,
      trainingTopic: t.topic,
      trainerName: t.trainer,
    };
    let data: LogSheetData = { ...started.data, header };
    const link = hrMasterLinkFor(EFFECTIVENESS_ID);
    if (link) data = fillBlanksFromMaster(link, data, hrMasterRepository.all()).data;
    const saved = saveDraft(started, data, "DCRS", { action: "edited", note: `${CHAIN_NOTE} From F/HR/10: ${name}, ${t.topic}, ${t.date}.`, labels: labelsOf(EFFECTIVENESS_ID) });
    out.evaluations.push(saved.id);
    all.push(saved as RecordInstance<LogSheetData>);
    rows = rows.map((r, k) => (k === ri ? { ...r, [EVALUATION_MADE]: name } : r));
  }
  return rows === f10.data.rows ? f10 : remember(f10, { ...f10.data, rows });
}

/** The lines of F/HR/12 for these people, each scored 3 (§165) and marked for more training as their F/HR/11 answered. */
function feedbackLines(rows: LogSheetRow[], names: readonly string[], further: ReadonlyMap<string, string>): LogSheetRow[] {
  const layout = getLogSheetLayout(FEEDBACK_ID);
  const next = [...rows];
  for (const name of names) {
    const line: LogSheetRow = { ...(layout ? blankLogRow(layout, generateId("row")) : { id: generateId("row") }), name, rating: "3", additionalTraining: further.get(name.toLowerCase()) ?? "", remarks: "" };
    const blankAt = next.findIndex((r) => !str(r.name) && !str(r.remarks));
    if (blankAt >= 0) next[blankAt] = { ...next[blankAt], ...line, id: next[blankAt].id };
    else next.push(line);
  }
  return next;
}

/** F/HR/10 and F/HR/11 -> F/HR/12: the training's record, with a line for everybody who attended or was evaluated. */
function feedbackFromImparted(f10: RecordInstance<LogSheetData>, t: CalendarTraining, out: ChainOutcome): RecordInstance<LogSheetData> {
  if (!mayFill(FEEDBACK_ID)) return f10;
  const evaluations = (recordRepository.queryUnscoped({ documentId: EFFECTIVENESS_ID, isDemo: false }) as RecordInstance<LogSheetData>[]).filter((r) => ofTraining(r, "trainingTopic", t) && str(r.data?.header?.traineeName));
  const further = new Map(evaluations.map((ev) => [str(ev.data.header.traineeName).toLowerCase(), additionalTrainingFrom(ev.data.header.furtherTraining)] as const));
  const people: string[] = [];
  for (const a of t.attendees) if (!people.some((n) => same(n, a.name))) people.push(a.name);
  for (const ev of evaluations) {
    const name = str(ev.data.header.traineeName);
    if (!people.some((n) => same(n, name))) people.push(name);
  }
  const existing = (recordRepository.queryUnscoped({ documentId: FEEDBACK_ID, isDemo: false }) as RecordInstance<LogSheetData>[]).find((r) => ofTraining(r, "topic", t));
  if (existing) {
    if (!str(f10.data.header?.[FEEDBACK_MADE])) f10 = remember(f10, { ...f10.data, header: { ...f10.data.header, [FEEDBACK_MADE]: YES } });
    // (a submitted or verified record, or a sheet filed from the company's paper, is left as it is)
    if (!isEditableStatus(existing.status) || existing.filedFromPaper) return f10;
    const h = existing.data.header ?? {};
    const listed = str(h[LISTED]).split("\n").filter(Boolean);
    const rows0 = existing.data.rows ?? [];
    const newcomers = people.filter((n) => !rows0.some((r) => same(r.name, n)) && !listed.some((l) => same(l, n)));
    let rows = feedbackLines(rows0, newcomers, further);
    // An F/HR/11 answered on further training: the line's "additional training", where it is blank.
    rows = rows.map((r) => {
      const said = further.get(str(r.name).toLowerCase());
      return said && !str(r.additionalTraining) ? { ...r, additionalTraining: said } : r;
    });
    const header = { ...h };
    if (!str(header.impartedBy) && t.trainer) header.impartedBy = t.trainer;
    if (!str(header.duration) && t.duration) header.duration = t.duration;
    const changed = newcomers.length > 0 || rows.some((r, k) => r !== rows0[k]) || header.impartedBy !== h.impartedBy || header.duration !== h.duration;
    if (!changed) return f10;
    const saved = saveDraft(existing, { ...existing.data, header, rows }, "DCRS", { action: "edited", note: `${CHAIN_NOTE} From F/HR/10 and F/HR/11${newcomers.length ? `: ${newcomers.join(", ")} listed` : ""}.`, labels: labelsOf(FEEDBACK_ID) });
    remember(saved as RecordInstance<LogSheetData>, { ...saved.data, header: { ...(saved.data as LogSheetData).header, [LISTED]: [...listed, ...newcomers].join("\n") } } as LogSheetData);
    out.updated.push(existing.id);
    return f10;
  }
  if (str(f10.data.header?.[FEEDBACK_MADE]) || people.length === 0) return f10;
  const started = startRecord(FEEDBACK_ID, t.date);
  if (!started) return f10;
  const header = { ...(started.data?.header ?? {}), trainingDate: t.date, topic: t.topic, impartedBy: t.trainer, duration: t.duration };
  const blank = (started.data?.rows ?? []).filter((r) => !str(r.name) && !str(r.remarks));
  const saved = saveDraft(started, { ...started.data, header, rows: feedbackLines(blank, people, further) }, "DCRS", { action: "edited", note: `${CHAIN_NOTE} From F/HR/10: ${t.topic}, ${t.date}; ${people.length} people, each scored 3.`, labels: labelsOf(FEEDBACK_ID) });
  remember(saved as RecordInstance<LogSheetData>, { ...saved.data, header: { ...(saved.data as LogSheetData).header, [LISTED]: people.join("\n") } } as LogSheetData);
  out.feedback.push(saved.id);
  return remember(f10, { ...f10.data, header: { ...f10.data.header, [FEEDBACK_MADE]: YES } });
}

/**
 * The training chain, run when a person opens or leaves F/HR/09, 10, 11 or 12 (Live records only). `left` names the
 * record the person has just left: an F/HR/10 left once has had its people checked, and feeds F/HR/11 and F/HR/12 from
 * then on.
 */
export function syncTrainingChain(opts: { today?: string; left?: string } = {}): ChainOutcome {
  const today = opts.today ?? todayISO();
  const out: ChainOutcome = { imparted: [], evaluations: [], feedback: [], updated: [] };
  impartedFromCalendar(today, out);
  if (opts.left) {
    const left = recordRepository.getById(opts.left) as RecordInstance<LogSheetData> | undefined;
    if (left && !left.isDemo && left.documentId === IMPARTED_ID && left.data && !str(left.data.header?.[ATTENDANCE_CHECKED])) {
      remember(left, { ...left.data, header: { ...left.data.header, [ATTENDANCE_CHECKED]: YES } });
    }
  }
  for (const r of recordRepository.queryUnscoped({ documentId: IMPARTED_ID, isDemo: false }) as RecordInstance<LogSheetData>[]) {
    if (!followed(r) || !str(r.data?.header?.[ATTENDANCE_CHECKED])) continue;
    let f10 = r;
    const t = trainingOf(f10);
    if (!t.date || t.date > today) continue;
    f10 = evaluationsFromImparted(f10, t, out);
    feedbackFromImparted(f10, t, out);
  }
  return out;
}
