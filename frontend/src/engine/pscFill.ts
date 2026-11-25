import type { LogSheetData, LogSheetRow, RecordInstance } from "../types";
import { documentRepository } from "../data/repositories/documentRepository";
import { recordRepository } from "../data/repositories/recordRepository";
import { settingsRepository } from "../data/repositories/settingsRepository";
import { mayWriteRecordsOf } from "./departmentScope";
import { waitsUntil } from "./notBeforeDay";
import { diffRecordData, makeEntry } from "./recordHistory";
import { fieldLabels } from "./recordPatch";
import { untouchedByPeople } from "./calendarMigration";
import { PSC_SURVEY_DOC, roundDateOf } from "./pscSurveyRound";
import { pscAnalysis, pscFormAnswers, pscRoundAnswers, scoreOf } from "./pscScores";
import { compareISO, todayISO } from "../utils/date";

// F/HR/20's ROUND ANSWERED AND F/HR/21 WORKED OUT, BY THE ASSISTANT (REQUIREMENTS §267; engine/pscScores.ts says how).
// Run with the morning prepare and at every start (engine/assistantPrepare.ts prepareDueRecords), from 1 January - the
// first day the year's survey may be written (engine/notBeforeDay.ts), never before:
//   * every form of the year's round still blank and still the assistant's own is answered (7 / 6; 1 / 2 on attribute 8);
//     a form a person has answered, changed or submitted is never touched;
//   * a form started by hand with New opens answered the same way (newRecord.ts answerHandMadeForm), and one already on
//     file with no answer at all, still open, is answered (nothing of the person's is written over);
//   * the year's analysis is worked out from the year's forms - the round's and any started with New - and worked out
//     again whenever they change, while it is still the assistant's own; once a person writes on it, it is theirs.

export const PSC_ANALYSIS_DOC = "hr-psc-survey-analysis";

export const PSC_ANSWERS_NOTE =
  "Answered by the assistant (REQUIREMENTS §267): good scores - 7 Strongly Agree or 6 Moderately Agree, and 1 Strongly Disagree to attribute 8 - each answer can be changed in its dropdown.";
export const PSC_ANALYSIS_REWORK_NOTE =
  "Worked out again from the year's 200 Product Safety Culture Survey forms made and answered by the system, on the owner's choice (REQUIREMENTS §356): the figures before were the paper's";
export const PSC_ANALYSIS_NOTE =
  "Worked out by the assistant from the year's Product Safety Culture Survey forms (F/HR/20), as the company's analysis sheet works it out (REQUIREMENTS §267): it follows the forms as they change.";

const OPEN = ["Scheduled", "Due", "In Progress"];

/** Still only the assistant's work: made or filled by it, nobody's since. */
function assistantsOwn(r: RecordInstance): boolean {
  if (r.submittedAt || r.verifiedAt || r.rejectedAt || !OPEN.includes(r.status)) return false;
  if (untouchedByPeople(r)) return true;
  const p = r.prepared;
  return !!p && p.by === "assistant" && p.at === r.updatedAt;
}

const formNumber = (r: RecordInstance): number => Number(/#(\d+)$/.exec(r.periodKey ?? "")?.[1] ?? 0);
const blankAnswers = (data: LogSheetData | undefined): boolean => (data?.rows ?? []).every((row) => scoreOf(row.response) === null);

/** The year a survey form belongs to: its round's, else its own date's. */
function surveyYear(r: RecordInstance): string {
  const header = (r.data as LogSheetData | undefined)?.header ?? {};
  return (roundDateOf(r) || String(header.surveyDate ?? "").slice(0, 10) || r.dueDate).slice(0, 4);
}

function stamped(record: RecordInstance, data: LogSheetData, note: string, basedOn: string, now: string): RecordInstance | null {
  const doc = documentRepository.getByIdUnscoped(record.documentId);
  const changes = diffRecordData(record.data, data, fieldLabels(doc?.kind ?? "log-sheet", record.documentId));
  if (!changes?.length) return null;
  return {
    ...record,
    data,
    status: "In Progress",
    updatedAt: now,
    prepared: { at: now, by: "assistant", notes: [note], basedOn, knownPartsOnly: true },
    history: [...(record.history ?? []), { ...makeEntry("prepared", "Assistant", { note, changes }), at: now }],
  };
}

/** A Live form started by hand, open, with no answer marked yet: answered with good scores. Null when it is not one. */
function answeredHandMade(r: RecordInstance, now: string): RecordInstance | null {
  if (r.isDemo || roundDateOf(r) || r.documentId !== PSC_SURVEY_DOC) return null;
  if (r.submittedAt || r.verifiedAt || r.rejectedAt || !OPEN.includes(r.status)) return null;
  const data = r.data as LogSheetData | undefined;
  if (!data || !blankAnswers(data)) return null;
  const answers = pscFormAnswers(Number(surveyYear(r)), r.id);
  const rows = data.rows.map((row, i): LogSheetRow => (answers[i] ? { ...row, response: answers[i] } : row));
  return stamped(r, { ...data, rows }, PSC_ANSWERS_NOTE, "the year's survey figure", now);
}

/** F/HR/20's New: the form just started, answered at once (stored); the form as it was when it is not one to answer. */
export function answerHandMadeForm(record: RecordInstance): RecordInstance {
  const surveyDoc = documentRepository.getByIdUnscoped(PSC_SURVEY_DOC);
  if (!surveyDoc || !mayWriteRecordsOf(surveyDoc.id)) return record;
  const next = answeredHandMade(record, new Date().toISOString());
  if (!next) return record;
  recordRepository.upsertMany([next]);
  return next;
}

/** Answers the year's round and works out the year's analysis. Returns the records changed. Run again it changes nothing. */
/** `analysisOf`: only that F/HR/21 record, worked out from the forms as they stand, as it is opened (§289); no form is answered. */
export function fillPscSurveyDue(referenceISO = todayISO(), opts: { analysisOf?: string } = {}): RecordInstance[] {
  const { liveStartDate } = settingsRepository.get();
  const now = new Date().toISOString();
  const changed: RecordInstance[] = [];
  const surveyDoc = documentRepository.getByIdUnscoped(PSC_SURVEY_DOC);
  const forms = recordRepository.queryUnscoped({ documentId: PSC_SURVEY_DOC, isDemo: false });

  // 1. The round's forms, answered.
  if (!opts.analysisOf && surveyDoc && mayWriteRecordsOf(surveyDoc.id)) {
    const rounds = new Map<string, RecordInstance[]>();
    for (const r of forms) {
      const date = roundDateOf(r);
      if (date) rounds.set(date, [...(rounds.get(date) ?? []), r]);
    }
    for (const [date, round] of rounds) {
      // The answers depend on the round's size - its highest form number - so a form deleted changes nobody else's.
      const size = Math.max(...round.map(formNumber));
      const answers = pscRoundAnswers(Number(date.slice(0, 4)), size);
      for (const r of round) {
        if (waitsUntil(surveyDoc, r, referenceISO) !== null) continue;
        // (no launch-date floor: a round is only ever made on purpose - the owner's 2026 round is before the plant went live, §356)
        const data = r.data as LogSheetData | undefined;
        const mine = answers[formNumber(r) - 1];
        if (!data || !mine || !assistantsOwn(r) || !blankAnswers(data)) continue;
        const rows = data.rows.map((row, i): LogSheetRow => (mine[i] ? { ...row, response: mine[i] } : row));
        const next = stamped(r, { ...data, rows }, PSC_ANSWERS_NOTE, "the year's survey round", now);
        if (next) changed.push(next);
      }
    }
  }

  // ...and the forms started by hand that nobody has answered yet.
  if (!opts.analysisOf && surveyDoc && mayWriteRecordsOf(surveyDoc.id)) {
    // (no launch-date floor: a form started by hand is a person's, never backlog noise)
    for (const r of forms) {
      if (waitsUntil(surveyDoc, r, referenceISO) !== null) continue;
      const next = answeredHandMade(r, now);
      if (next) changed.push(next);
    }
  }

  // 2. The year's analysis, from the year's forms as they now stand.
  const analysisDoc = documentRepository.getByIdUnscoped(PSC_ANALYSIS_DOC);
  if (analysisDoc && mayWriteRecordsOf(analysisDoc.id)) {
    const current = new Map(forms.map((r) => [r.id, r] as const));
    for (const r of changed) current.set(r.id, r);
    for (const record of recordRepository.queryUnscoped({ documentId: PSC_ANALYSIS_DOC, isDemo: false })) {
      if (opts.analysisOf && record.id !== opts.analysisOf) continue;
      if (waitsUntil(analysisDoc, record, referenceISO) !== null) continue;
      const year = record.dueDate.slice(0, 4);
      // An analysis on file from before the plant went live (the paper's January 2026) is worked out again from its year's round
      // once that round is made (the owner's choice, §356), and follows the forms after that while it is the assistant's own.
      const preLive = !!liveStartDate && compareISO(record.dueDate, liveStartDate) < 0;
      const reworked = (record.history ?? []).some((h) => h.note === PSC_ANALYSIS_REWORK_NOTE);
      const firstRework = preLive && !reworked && [...current.values()].some((f) => roundDateOf(f)?.slice(0, 4) === year);
      if (preLive && !reworked && !firstRework) continue;
      if (!firstRework && !assistantsOwn(record)) continue;
      const yearForms = [...current.values()].filter((f) => f.status !== "Rejected" && surveyYear(f) === year);
      if (yearForms.length === 0) continue;
      const answered = yearForms.map((f) => ((f.data as LogSheetData | undefined)?.rows ?? []).map((row) => row.response));
      const { rows: figures, overall, respondents } = pscAnalysis(answered);
      if (respondents === 0) continue;
      const data = record.data as LogSheetData | undefined;
      if (!data) continue;
      const rows = data.rows.map((row, i): LogSheetRow => (figures[i] ? { ...row, ...figures[i] } : row));
      const header = { ...(data.header ?? {}), surveyPeriod: `JANUARY ${year}`, overallAchieved: overall };
      // The paper's figures were submitted and verified; the figures now differ, so the sheet is verified again (§356) - the history
      // keeps who signed the paper's.
      const base: RecordInstance = firstRework
        ? { ...record, submittedAt: undefined, submittedBy: undefined, verifiedAt: undefined, verifiedBy: undefined, rejectedAt: undefined }
        : record;
      const next = stamped(base, { ...data, header, rows }, firstRework ? PSC_ANALYSIS_REWORK_NOTE : PSC_ANALYSIS_NOTE, `${respondents} survey forms of ${year}`, now);
      if (next) changed.push(next);
    }
  }

  if (changed.length > 0) recordRepository.upsertMany(changed);
  return changed;
}
