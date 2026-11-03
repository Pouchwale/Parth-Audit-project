import type { LogSheetData, LogSheetRow, RecordInstance } from "../types";
import { recordRepository } from "../data/repositories/recordRepository";
import { masterRepository } from "../data/repositories/masterRepository";
import { isCompanyHoliday } from "./holidays";
import { blankLogRow } from "./recordDefaults";
import { getLogSheetLayout } from "../data/seed/logSheetLayouts";
import { displayDay, plannedTrainings, TRAINING_CALENDAR_ID } from "./trainingCalendar";
import { todayISO } from "../utils/date";
import { generateId } from "../utils/id";

// THE TRAINING FORMATS FOLLOW ONE ANOTHER (REQUIREMENTS §165 and §168; the owner, 2 and 3-Nov-2026: "HR 10 is connected
// with HR 11 and HR 12 is connected with HR 11; many fields are the same, so the data should go into those documents as
// the user fills them; in HR 12 the data should also come from HR 10").
//
//   F/HR/09 -> F/HR/10   the Training Imparted Record's topic box offers the calendar's trainings ("GMP Principles —
//                        09-04-26"); the one chosen fills the date, who imparts it, the duration and the method. The
//                        people who attended are its lines (fetched from HR Master Data, §53).
//   F/HR/10 -> F/HR/11   the Training Effectiveness Evaluation's topic box offers the trainings imparted (and, behind
//                        them, the calendar's); the one chosen fills the Date of Training and the Trainer's name, and a
//                        trainee who attended it takes the department and designation the attendance line gave.
//   F/HR/10, F/HR/11 -> F/HR/12   the Training Feedback & Evaluation Record's topic box offers the same; the one chosen
//                        fills the date, who imparted it and the duration, and lists one line per person: everybody who
//                        attended (F/HR/10), and anybody evaluated for it on F/HR/11 - each scored 3 (the paper's best,
//                        the owner's default, every line's standard) and marked for additional training as their
//                        F/HR/11 evaluation answered. Every box and line stays the person's to change.
//
// A topic typed in words alone (no date) is the latest training of that topic. Nothing already written in a box is
// changed by a typed topic; a training CHOSEN from the list (its label, with its date) sets its date, trainer, duration
// and method, since the person named that training.

export const IMPARTED_ID = "hr-training-imparted";
export const EFFECTIVENESS_ID = "hr-training-effectiveness";
export const FEEDBACK_ID = "hr-training-feedback";
/** The <datalist> the three formats' topic boxes offer (data/seed/hrLayouts.ts `list`). */
export const TRAININGS_LIST = "hr-trainings";

export interface Attendee {
  name: string;
  department: string;
  designation: string;
}

export interface CalendarTraining {
  recordId: string;
  /** Where it is known from: the calendar's plan, or a Training Imparted Record (F/HR/10). */
  source: "calendar" | "imparted";
  topic: string;
  trainer: string;
  duration: string;
  method: string;
  /** The day it was held, or is planned for (YYYY-MM-DD). */
  date: string;
  held: boolean;
  /** Who attended, from the Training Imparted Record; none for a calendar training. */
  attendees: Attendee[];
}

const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v).trim());
const same = (a: unknown, b: unknown): boolean => str(a).replace(/\s+/g, " ").toLowerCase() === str(b).replace(/\s+/g, " ").toLowerCase();
const dayOf = (v: unknown): string => {
  const t = str(v);
  return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : t;
};

/** "GMP Principles — 09-04-26": how a training is offered and named on the formats. */
export const trainingLabel = (t: Pick<CalendarTraining, "topic" | "date">): string => `${t.topic} — ${displayDay(t.date)}`;

/** The box on each format that names the training, or null for a format that names none. */
export function trainingBoxOf(documentId: string): string | null {
  return documentId === EFFECTIVENESS_ID ? "trainingTopic" : documentId === FEEDBACK_ID || documentId === IMPARTED_ID ? "topic" : null;
}

/** Every training the training plan calendars on file plan, the latest first: Live or Demo as asked. */
export function trainingsOnCalendar(isDemo: boolean, today: string = todayISO()): CalendarTraining[] {
  const master = masterRepository.get();
  const closed = (d: string) => isCompanyHoliday(d, master);
  const out: CalendarTraining[] = [];
  for (const r of recordRepository.queryUnscoped({ documentId: TRAINING_CALENDAR_ID, isDemo }) as RecordInstance<LogSheetData>[]) {
    const rows = Array.isArray(r.data?.rows) ? r.data.rows : [];
    const byId = new Map(rows.map((row, i) => [str(row.id) || String(i), row] as const));
    for (const t of plannedTrainings(rows, r.dueDate, today, closed)) {
      const row = byId.get(t.key.split("|")[0]);
      if (!t.topic) continue;
      out.push({ recordId: r.id, source: "calendar", topic: t.topic, trainer: t.by, duration: str(row?.duration), method: str(row?.method), date: t.date, held: t.held, attendees: [] });
    }
  }
  return latestFirst(out);
}

/** Every training a Training Imparted Record (F/HR/10) holds, with the people who attended, the latest first. */
export function trainingsImparted(isDemo: boolean): CalendarTraining[] {
  const out: CalendarTraining[] = [];
  for (const r of recordRepository.queryUnscoped({ documentId: IMPARTED_ID, isDemo }) as RecordInstance<LogSheetData>[]) {
    if (r.status === "Rejected") continue;
    const h = r.data?.header ?? {};
    const topic = str(h.topic);
    const date = dayOf(h.trainingDate) || r.dueDate;
    if (!topic) continue;
    const attendees = (Array.isArray(r.data?.rows) ? r.data.rows : [])
      .filter((row) => str(row.name))
      .map((row) => ({ name: str(row.name), department: str(row.department), designation: str(row.designation) }));
    out.push({ recordId: r.id, source: "imparted", topic, trainer: str(h.impartedBy), duration: str(h.duration), method: str(h.method), date, held: true, attendees });
  }
  return latestFirst(out);
}

/** One per topic and day, the latest first; where two name the same training the one listed first stays. */
function latestFirst(list: CalendarTraining[]): CalendarTraining[] {
  const seen = new Set<string>();
  return list
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .filter((t) => {
      const k = `${t.topic.toLowerCase()}|${t.date}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

/**
 * The trainings a format's topic box offers: F/HR/10 the calendar's (it records one of them being held); F/HR/11 and
 * F/HR/12 the trainings imparted first - they carry the people - and the calendar's behind them.
 */
export function trainingsFor(documentId: string, isDemo: boolean, today: string = todayISO()): CalendarTraining[] {
  if (documentId === IMPARTED_ID) return trainingsOnCalendar(isDemo, today);
  if (documentId === EFFECTIVENESS_ID || documentId === FEEDBACK_ID) return latestFirst([...trainingsImparted(isDemo), ...trainingsOnCalendar(isDemo, today)]);
  return [];
}

/**
 * The training a box names: by its label ("GMP Principles — 09-04-26"), or by its topic alone - then the latest one held
 * by `today`, else the next one planned. `chosen` says whether the words were a label (the person picked that training).
 */
export function trainingNamed(text: unknown, trainings: readonly CalendarTraining[], today: string = todayISO()): { training: CalendarTraining; chosen: boolean } | null {
  const t = str(text);
  if (!t) return null;
  const byLabel = trainings.find((x) => same(trainingLabel(x), t));
  if (byLabel) return { training: byLabel, chosen: true };
  const ofTopic = trainings.filter((x) => same(x.topic, t));
  if (ofTopic.length === 0) return null;
  const held = ofTopic.filter((x) => x.date <= today).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  const next = ofTopic.filter((x) => x.date > today).sort((a, b) => (a.date < b.date ? -1 : 1))[0];
  return { training: held ?? next ?? ofTopic[0], chosen: false };
}

/** "Yes, very much" / "Partly" on F/HR/11's further-training question is a Yes on F/HR/12; "No, not at all" a No; unanswered, blank. */
export function additionalTrainingFrom(furtherTraining: unknown): string {
  const v = str(furtherTraining).toLowerCase();
  if (!v) return "";
  if (v.startsWith("no")) return "No";
  return "Yes";
}

/** The F/HR/11 evaluations on file for this training: the same topic, the same date. */
export function evaluationsFor(training: Pick<CalendarTraining, "topic" | "date">, isDemo: boolean): RecordInstance<LogSheetData>[] {
  return (recordRepository.queryUnscoped({ documentId: EFFECTIVENESS_ID, isDemo }) as RecordInstance<LogSheetData>[])
    .filter((r) => same(r.data?.header?.trainingTopic, training.topic) && dayOf(r.data?.header?.trainingDate) === training.date && str(r.data?.header?.traineeName))
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
}

export interface TrainingFill {
  data: LogSheetData;
  /** The boxes filled, by key, and the people listed. */
  filled: string[];
  listed: string[];
  training: CalendarTraining;
}

/**
 * The record with its training's details written in, after the topic box was written: null when the words name no
 * training the formats know. A chosen training (picked from the list) sets its date, trainer, duration and method; a
 * typed topic fills only the boxes still blank. On F/HR/11 a trainee who attended takes the department and designation
 * the attendance gave; on F/HR/12 everybody who attended, and anybody evaluated on F/HR/11, is listed on a line of their
 * own (one not yet on the sheet), scored 3.
 */
export function trainingFill(documentId: string, data: LogSheetData, trainings: readonly CalendarTraining[], isDemo: boolean, today: string = todayISO(), newRowId: () => string = () => generateId("row")): TrainingFill | null {
  const box = trainingBoxOf(documentId);
  if (!box) return null;
  const named = trainingNamed(data.header?.[box], trainings, today);
  if (!named) return null;
  const { training, chosen } = named;
  const header: Record<string, string> = { ...(data.header ?? {}), [box]: training.topic };
  const filled: string[] = [];
  const put = (key: string, value: string) => {
    if (!value) return;
    if (chosen || !str(header[key])) {
      if (str(header[key]) !== value) filled.push(key);
      header[key] = value;
    }
  };
  put("trainingDate", training.date);
  if (documentId === EFFECTIVENESS_ID) {
    put("trainerName", training.trainer);
    // The trainee who attended it: the attendance line's department and designation, where the form's boxes are blank.
    const who = training.attendees.find((a) => same(a.name, header.traineeName));
    if (who) {
      if (!str(header.department) && who.department) {
        header.department = who.department;
        filled.push("department");
      }
      if (!str(header.designation) && who.designation) {
        header.designation = who.designation;
        filled.push("designation");
      }
    }
  } else {
    put("impartedBy", training.trainer);
    put("duration", training.duration);
    if (documentId === IMPARTED_ID) put("method", training.method);
  }
  let rows = data.rows;
  const listed: string[] = [];
  if (documentId === FEEDBACK_ID) {
    const layout = getLogSheetLayout(FEEDBACK_ID);
    const next = [...rows];
    const evaluations = evaluationsFor(training, isDemo);
    const further = new Map(evaluations.map((ev) => [str(ev.data.header.traineeName).toLowerCase(), additionalTrainingFrom(ev.data.header.furtherTraining)] as const));
    const people: string[] = [];
    for (const a of training.attendees) if (!people.some((n) => same(n, a.name))) people.push(a.name);
    for (const ev of evaluations) {
      const name = str(ev.data.header.traineeName);
      if (!people.some((n) => same(n, name))) people.push(name);
    }
    for (const name of people) {
      if (next.some((r) => same(r.name, name))) continue;
      const line: LogSheetRow = { ...(layout ? blankLogRow(layout, newRowId()) : { id: newRowId() }), name, rating: "3", additionalTraining: further.get(name.toLowerCase()) ?? "", remarks: "" };
      // The sheet's first blank line takes the first person; the rest are added.
      const blankAt = next.findIndex((r) => !str(r.name) && !str(r.remarks));
      if (blankAt >= 0) next[blankAt] = { ...next[blankAt], ...line, id: next[blankAt].id };
      else next.push(line);
      listed.push(name);
    }
    if (listed.length) rows = next;
  }
  if (filled.length === 0 && listed.length === 0 && str(data.header?.[box]) === training.topic) return null;
  return { data: { ...data, header, rows }, filled, listed, training };
}
