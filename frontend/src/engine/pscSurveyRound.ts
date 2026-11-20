import type { DocumentDefinition, HrMasterPerson, LogSheetData, RecordInstance } from "../types";
import { masterRepository } from "../data/repositories/masterRepository";
import { recordRepository } from "../data/repositories/recordRepository";
import { readJSON } from "../data/storageAdapter";
import { createDefaultData } from "./recordDefaults";
import { HR_MASTER_TAG, hrMasterLinkFor, isIsoDate, linkedValue, nameKey } from "./hrMaster";
import { schedulePeriodOf, type SchedulePeriod } from "./frequencyEngine";
import { workingDueDate } from "./holidays";
import { generateId } from "../utils/id";
import { compareISO } from "../utils/date";

// F/HR/20 - THE PRODUCT SAFETY CULTURE SURVEY, ONCE A YEAR IN JANUARY, ABOUT 200 PEOPLE (REQUIREMENTS §266; the owner,
// 20-Nov-2026: "in HR-20 consider 200 people which include director, HOD, operator, Assistant operator, executive, helper
// 3 to 4. So in this system should generate and fetch it from master data ... hr-20 is every year system will fill record
// in january").
//
// The form is one per employee. Each January the year's round is made by itself: 200 forms, each with its person fetched
// from HR Master Data - name, department, designation (engine/hrMaster.ts HR_MASTER_LINKS) - and the form's date, keyed
// "hr-psc-survey:<the year's date>#001" … "#200". Who is asked:
//   * everyone on the sheet who is not a helper or a guard / driver / sweeper / peon (directors, HODs, managers,
//     executives, operators, assistants, supervisors, coordinators, designers …), named roles first, up to 196-197;
//   * and three or four helpers, a different few each year;
//   * and, only when those fall short of 200, guards, drivers, sweepers and peons to make it up (the sheet of 3-Nov-2026
//     has 195 of the first kind: four helpers and one guard make the 200);
//   * nobody who joins after the survey's date.
// The answers are filled by the assistant from 1 January - good scores, 7 or 6 (1 to attribute 8), each editable - and
// F/HR/21 is worked out from them (REQUIREMENTS §267, engine/pscScores.ts, engine/pscFill.ts).
//
// The round is made ONCE a year: never a second time, never put back after somebody deletes forms from it, never added
// to when someone joins later (New record starts a form for anyone else, as often as wanted, as before). Live records only.

export const PSC_SURVEY_DOC = "hr-psc-survey";
export const PSC_ROUND_SIZE = 200;
/** "helper 3 to 4": four when the round has room for them, three when the rest fill it to 197 or more. */
export const PSC_ROUND_HELPERS = { most: 4, least: 3 };

export const PSC_ROUND_NOTE =
  "The year's Product Safety Culture Survey round, made in January: this person fetched from HR Master Data (name, department, designation) and the form's date (REQUIREMENTS §266); the answers are filled by the assistant from 1 January and can be changed (§267)";

export const isPscSurvey = (documentId: string | undefined): boolean => documentId === PSC_SURVEY_DOC;

/** A round's form: "hr-psc-survey:2027-01-30#007". */
export const roundKey = (scheduled: string, n: number): string => `${PSC_SURVEY_DOC}:${scheduled}#${String(n).padStart(3, "0")}`;
const ROUND_KEY_RE = /^hr-psc-survey:(\d{4}-\d{2}-\d{2})#\d+$/;
/** The year's date of a round's form, or null for a form New started by hand. */
export const roundDateOf = (r: Pick<RecordInstance, "periodKey">): string | null => ROUND_KEY_RE.exec(r.periodKey ?? "")?.[1] ?? null;
export const isRoundForm = (r: Pick<RecordInstance, "documentId" | "periodKey">): boolean => isPscSurvey(r.documentId) && roundDateOf(r) !== null;

// ---------------------------------------------------------------------------
// who is asked

const LEFT_OUT = /\b(guard|security|driver|sweeper|peon|watchman|cleaner|house ?keeping)\b/;

/**
 * Where a person's position puts them: "helper", "out" (guard, driver, sweeper, peon), or a rank - the roles the owner
 * named first (director, HOD, manager, executive, operator, assistant), the rest of the staff after.
 */
export function surveyRank(designation: string): number | "helper" | "out" {
  const d = nameKey(designation);
  if (/\bhelper\b/.test(d)) return "helper";
  if (LEFT_OUT.test(d)) return "out";
  if (/\bdirector\b/.test(d)) return 0;
  if (/\bhod\b|\bhead\b/.test(d)) return 1;
  if (/\bmanager\b/.test(d)) return 2;
  if (/\bexecutive\b/.test(d)) return 3;
  if (/\boperator\b/.test(d) && !/\bassist/.test(d)) return 4;
  if (/\bassist/.test(d)) return 5;
  if (!d) return 7;
  return 6;
}

/** A number to order by that is the same every time for the same person: their GP3 No. as a number, else their name. */
const gp3Order = (p: HrMasterPerson): number => {
  const m = /(\d+)\s*$/.exec(p.gp3No ?? "");
  return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
};
const byNumberThenName = (a: HrMasterPerson, b: HrMasterPerson): number => gp3Order(a) - gp3Order(b) || nameKey(a.fullName).localeCompare(nameKey(b.fullName));

/**
 * The year's people, in the order their forms are numbered: the round's staff and operators by rank, department and GP3
 * No., then its helpers - a different three or four each year (the survey date's year turns them).
 */
export function surveyPeople(people: readonly HrMasterPerson[], surveyDate: string, size = PSC_ROUND_SIZE): HrMasterPerson[] {
  const seen = new Set<string>();
  const eligible = people.filter((p) => {
    const key = nameKey(p.fullName);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    // Nobody who joins after the survey's date.
    return !(isIsoDate(p.joiningDate) && compareISO(p.joiningDate, surveyDate) > 0);
  });
  const ranked = eligible
    .map((p) => ({ p, rank: surveyRank(p.designation) }))
    .filter((x): x is { p: HrMasterPerson; rank: number } => typeof x.rank === "number")
    .sort((a, b) => a.rank - b.rank || nameKey(a.p.department).localeCompare(nameKey(b.p.department)) || byNumberThenName(a.p, b.p));
  const helpersAll = eligible.filter((p) => surveyRank(p.designation) === "helper").sort(byNumberThenName);
  // Guards, drivers, sweepers and peons only make up the 200 when the staff, operators and helpers fall short of it.
  const reserve = eligible.filter((p) => surveyRank(p.designation) === "out").sort(byNumberThenName);
  const helperCount = Math.min(helpersAll.length, Math.max(PSC_ROUND_HELPERS.least, Math.min(PSC_ROUND_HELPERS.most, size - ranked.length)));
  const staff = [...ranked.map((x) => x.p), ...reserve].slice(0, Math.max(0, size - helperCount));
  // A different few helpers each year, the same few every time for one year.
  const year = Number(surveyDate.slice(0, 4)) || 0;
  const start = helpersAll.length ? (year * PSC_ROUND_HELPERS.most) % helpersAll.length : 0;
  const helpers = Array.from({ length: helperCount }, (_, i) => helpersAll[(start + i) % helpersAll.length]);
  return [...staff, ...helpers];
}

// ---------------------------------------------------------------------------
// the year's forms

/** The forms of a year's round on file (any status). */
function roundRecords(scheduled: string): RecordInstance[] {
  return recordRepository.queryUnscoped({ documentId: PSC_SURVEY_DOC, isDemo: false }).filter((r) => roundDateOf(r) === scheduled);
}

/** A form of the round was deleted (the deletion log): the round was made, and is never made again. */
function roundEverMade(scheduled: string): boolean {
  if (roundRecords(scheduled).length > 0) return true;
  const log = readJSON<{ documentId?: string; periodKey?: string; isDemo?: boolean }[]>("deletions", []);
  return log.some((d) => d.documentId === PSC_SURVEY_DOC && !d.isDemo && roundDateOf({ periodKey: d.periodKey ?? "" }) === scheduled);
}

/** One person's form: the blank survey, the person's name, department and designation from HR Master Data, the date. */
export function roundForm(doc: DocumentDefinition, period: SchedulePeriod, person: HrMasterPerson, n: number, now: string): RecordInstance {
  const master = masterRepository.get();
  const due = workingDueDate(period.scheduled, master);
  const blank = createDefaultData(doc, due, master) as LogSheetData;
  const header: Record<string, string> = { ...(blank.header ?? {}), surveyDate: due };
  for (const f of hrMasterLinkFor(PSC_SURVEY_DOC)?.fields ?? []) {
    const value = linkedValue(person, f);
    if (value) header[f.key] = value;
  }
  if (person.gp3No.trim()) header[HR_MASTER_TAG] = person.gp3No.trim();
  return {
    id: generateId("rec"),
    documentId: doc.id,
    periodKey: roundKey(period.scheduled, n),
    dueDate: due,
    status: "Due",
    isDemo: false,
    data: { ...blank, header },
    createdAt: now,
    updatedAt: now,
    prepared: { at: now, by: "assistant", notes: [PSC_ROUND_NOTE], basedOn: "HR Master Data", knownPartsOnly: true },
  };
}

/** The forms a year's round needs - all of them the first time, none once the round has been made. */
export function roundFormsFor(doc: DocumentDefinition, period: SchedulePeriod, people: readonly HrMasterPerson[]): RecordInstance[] {
  if (roundEverMade(period.scheduled)) return [];
  const now = new Date().toISOString();
  return surveyPeople(people, period.scheduled).map((p, i) => roundForm(doc, period, p, i + 1, now));
}
