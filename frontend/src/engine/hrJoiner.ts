import type { LogSheetData, LogSheetRow, RecordInstance, RecordStatus } from "../types";
import { documentRepository } from "../data/repositories/documentRepository";
import { recordRepository } from "../data/repositories/recordRepository";
import { getLogSheetLayout } from "../data/seed/logSheetLayouts";
import { SKILL_OPERATIONS, TRAINING_TOPICS } from "../data/seed/hrLayouts";
import { createRecordForDocument } from "./recordCrud";
import { isEditableStatus, reopenForCorrection, saveDraft } from "./recordLifecycle";
import { fieldLabels } from "./recordPatch";
import { generateId } from "../utils/id";
import { compareISO, todayISO } from "../utils/date";

// A NEW JOINER, WRITTEN ONCE AND FILED EVERYWHERE THE HR FORMATS ASK FOR IT
// (REQUIREMENTS §49).
//
// The person's details — read from their CV (backend/cvExtract.ts) and checked
// by HR, with the department, designation and date of joining that HR knows —
// go onto Personal Competence Records (F/HR/01) and onto every other HR format
// that carries the same facts: the operators' skill matrix, the training need
// identification, the two induction records, the mobile authorisation and the
// pre-employment health declaration. Each format gets exactly the columns it
// prints, in the date style its own register already uses.
//
// A controlled register is never changed quietly. A register that is
// submitted or verified is reopened for correction with the reason written
// ("new joiner from the CV …"), the line is added, and it goes back to be
// submitted and verified again; Cancel on the record puts it back as it was.
// A person already on a register is not added twice.

export type JoinerCategory = "staff" | "operator";

export interface NewJoiner {
  name: string;
  sex: "" | "Male" | "Female";
  /** YYYY-MM-DD or "". */
  dateOfBirth: string;
  qualification: string;
  experience: string;
  department: string;
  designation: string;
  /** YYYY-MM-DD. */
  dateOfJoining: string;
  category: JoinerCategory;
  eduRequired: string;
  expRequired: string;
  gapJustification: string;
}

export interface JoinerTarget {
  docId: string;
  formatNo: string;
  title: string;
  /** A register gets a line; a per-person format gets a record of its own. */
  kind: "register" | "record";
  what: string;
}

export const JOINER_TARGETS: JoinerTarget[] = [
  { docId: "hr-competence", formatNo: "F/HR/01", title: "Personal Competence Records", kind: "register", what: "a line: name, department, designation, education and experience required and available, the gap, date of joining" },
  { docId: "hr-skill-matrix", formatNo: "F/HR/03", title: "Skill Matrix - Operator", kind: "register", what: "a line: name, designation, date of joining (the skill points are graded later)" },
  { docId: "hr-training-needs", formatNo: "F/HR/08", title: "Training Need Identification", kind: "register", what: "a line: name and designation (the topics are ticked later)" },
  { docId: "hr-induction-operators", formatNo: "F/HR/06", title: "Induction Training Record — Operators / Workers", kind: "register", what: "a line: name, joining department & designation, date of joining & induction" },
  { docId: "hr-mobile-authorization", formatNo: "F/HR/13", title: "Authorization for Mobile Usage", kind: "register", what: "a line: name, department & designation, date of allowance (signed by the PSTL)" },
  { docId: "hr-induction-staff", formatNo: "F/HR/05", title: "Induction Training Record — Staff", kind: "record", what: "a record of their own: name, department / process, designation, date of joining" },
  { docId: "hr-pre-employment-health", formatNo: "F/HR/04", title: "Pre-Employment Medical Health Declaration", kind: "record", what: "a record of their own: name, department & designation, sex, date of birth (the questions are theirs to answer)" },
];

export function blankJoiner(): NewJoiner {
  return {
    name: "",
    sex: "",
    dateOfBirth: "",
    qualification: "",
    experience: "",
    department: "",
    designation: "",
    dateOfJoining: todayISO(),
    category: "staff",
    eduRequired: "",
    expRequired: "",
    gapJustification: "",
  };
}

const squash = (s: unknown): string =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const sameName = (a: unknown, b: unknown): boolean => !!squash(a) && squash(a) === squash(b);

// ---------------------------------------------------------------------------
// the registers on file

function hasEntries(row: LogSheetRow, docId: string): boolean {
  const layout = getLogSheetLayout(docId);
  if (!layout) return true;
  return layout.columns.some((c) => !c.fixed && String(row[c.key] ?? "").trim() !== "");
}

/**
 * The register a line is added to: the newest issue that has lines written in
 * it — so a blank sheet the calendar generated for a later period is not
 * mistaken for the register — or, when none has, the newest record at all.
 */
export function registerOnFile(docId: string, isDemo: boolean): RecordInstance<LogSheetData> | undefined {
  const records = (recordRepository.query({ documentId: docId, isDemo }) as RecordInstance<LogSheetData>[])
    .slice()
    .sort((a, b) => compareISO(b.dueDate, a.dueDate) || b.updatedAt.localeCompare(a.updatedAt));
  return records.find((r) => (r.data?.rows ?? []).some((row) => hasEntries(row, docId))) ?? records[0];
}

function mostCommon(values: string[]): string {
  const counts = new Map<string, number>();
  for (const v of values.map((x) => x.trim()).filter(Boolean)) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = "";
  let top = 0;
  for (const [v, n] of counts) {
    if (n > top) {
      best = v;
      top = n;
    }
  }
  return best;
}

export interface ChartLine {
  eduRequired: string;
  expRequired: string;
  department: string;
  lines: number;
}

export interface CompetenceChart {
  departments: string[];
  designations: string[];
  forDesignation: (designation: string) => ChartLine | null;
}

/**
 * What each position requires, as the plant's own competence register has it
 * — the F/HR/01 lines for the same designation, their most common entries —
 * and the departments and designations already in use, for the form's lists.
 */
export function competenceChart(isDemo: boolean): CompetenceChart {
  const competence = registerOnFile("hr-competence", isDemo)?.data?.rows ?? [];
  const tni = registerOnFile("hr-training-needs", isDemo)?.data?.rows ?? [];
  const unique = (values: unknown[]) => Array.from(new Set(values.map((v) => String(v ?? "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  return {
    departments: unique(competence.map((r) => r.department)),
    designations: unique([...competence.map((r) => r.designation), ...tni.map((r) => r.designation)]),
    forDesignation: (designation: string) => {
      const key = squash(designation);
      if (!key) return null;
      const same = competence.filter((r) => squash(r.designation) === key);
      if (same.length === 0) return null;
      return {
        eduRequired: mostCommon(same.map((r) => String(r.eduRequired ?? ""))),
        expRequired: mostCommon(same.map((r) => String(r.expRequired ?? ""))),
        department: mostCommon(same.map((r) => String(r.department ?? ""))),
        lines: same.length,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// the gap between what the position requires and what the person has

const QUALIFICATION_RANKS: [number, RegExp][] = [
  [7, /ph\.?\s?d|doctorate/i],
  [6, /\bm\.?\s?b\.?\s?a\b|\bpgdm\b|\bm\.?\s?tech\b|\bmca\b|\bm\.?\s?com\b|\bm\.?\s?sc\b|\bm\.?\s?pharm\b|\bm\.\s?e\b|\bm\.\s?a\b|post\s*graduat|\bmaster/i],
  [5, /\bb\.?\s?tech\b|\bb\.?\s?com\b|\bb\.?\s?sc\b|\bbba\b|\bbca\b|\bb\.?\s?pharm\b|\bb\.\s?e\b|\bb\.\s?a\b|\bbe\b|graduat|bachelor|engineering|fine\s*art/i],
  [4, /diploma|\ba\.?\s?t\.?\s?d\b/i],
  [3, /\bi\.?\s?t\.?\s?i\b/i],
  [2, /\b12\b|12th|\bh\.?\s?s\.?\s?c\b|higher\s*secondary/i],
  [1, /\b10\b|10th|\bs\.?\s?s\.?\s?c\b|matric/i],
];

/** Where a qualification stands on the ladder (10 Pass = 1 … Ph.D = 7), or null when it names none. */
export function qualificationRank(text: string): number | null {
  for (const [rank, pattern] of QUALIFICATION_RANKS) if (pattern.test(text)) return rank;
  return null;
}

/** Experience as months: "3 Years" 36, "8 Months" 8, "Fresher" / "NA" 0, null when unreadable. */
export function experienceMonths(text: string): number | null {
  const s = text.trim().toLowerCase();
  if (!s) return null;
  if (/^(na|n\/a|nil|none)$/.test(s) || /fresher/.test(s)) return 0;
  const m = /(\d+(?:\.\d+)?)\s*(years?|yrs?|months?)?/.exec(s);
  if (!m) return null;
  const n = Number(m[1]);
  return /^m/.test(m[2] ?? "") ? Math.round(n) : Math.round(n * 12);
}

export interface GapCheck {
  /** "NA" when the person meets both requirements; "" when there is a gap to justify or it couldn't be compared. */
  justification: string;
  issues: string[];
  compared: boolean;
}

export function gapFor(j: Pick<NewJoiner, "qualification" | "experience" | "eduRequired" | "expRequired">): GapCheck {
  const issues: string[] = [];
  let compared = true;
  const eduRequired = j.eduRequired.trim();
  if (!eduRequired) compared = false;
  else if (!/^na$/i.test(eduRequired)) {
    const need = qualificationRank(eduRequired);
    const have = qualificationRank(j.qualification);
    if (need === null || have === null) compared = false;
    else if (have < need) issues.push(`education — the position needs ${eduRequired}, the CV shows ${j.qualification}`);
  }
  const expRequired = j.expRequired.trim();
  if (!expRequired) compared = false;
  else {
    const need = experienceMonths(expRequired);
    const have = experienceMonths(j.experience);
    if (need === null || have === null) compared = false;
    else if (have < need) issues.push(`experience — the position needs ${expRequired}, the CV shows ${j.experience || "none"}`);
  }
  return { justification: compared && issues.length === 0 ? "NA" : "", issues, compared };
}

/** Operators and workers go on the skill matrix and the operators' induction; everyone else is staff. */
export function categoryFor(designation: string): JoinerCategory {
  return /operator|helper|worker|swipper|sweeper|loading|packing|machine/i.test(designation) ? "operator" : "staff";
}

/** Whether the designation is one of those on F/HR/13's department-wise matrix of who may be allowed a mobile. */
export function mobileAllowedByMatrix(designation: string): boolean {
  return /\b(ceo|director|manager|ink\s*in-?charge|supervisor|co-?ordinator|lab\s*executive|designer)\b/i.test(designation);
}

/**
 * Where a new joiner is filed by default. The mobile authorisation is never
 * ticked for them: allowing a phone in the plant is the PSTL's decision.
 */
export function defaultTargets(category: JoinerCategory): string[] {
  return category === "operator"
    ? ["hr-skill-matrix", "hr-induction-operators", "hr-training-needs", "hr-pre-employment-health"]
    : ["hr-competence", "hr-induction-staff", "hr-training-needs", "hr-pre-employment-health"];
}

export interface TargetState {
  target: JoinerTarget;
  /** Within the viewer's departments. */
  available: boolean;
  alreadyThere: boolean;
  recordStatus?: RecordStatus;
  /** A submitted or verified register, which is reopened for correction to take the line. */
  willReopen: boolean;
}

export function targetStates(name: string, isDemo: boolean): TargetState[] {
  return JOINER_TARGETS.map((target) => {
    const available = documentRepository.getById(target.docId) !== undefined;
    if (target.kind === "register") {
      const register = available ? registerOnFile(target.docId, isDemo) : undefined;
      return {
        target,
        available,
        alreadyThere: !!register && (register.data?.rows ?? []).some((r) => sameName(r.name, name)),
        recordStatus: register?.status,
        willReopen: !!register && !isEditableStatus(register.status),
      };
    }
    const records = available ? (recordRepository.query({ documentId: target.docId, isDemo }) as RecordInstance<LogSheetData>[]) : [];
    return { target, available, alreadyThere: records.some((r) => sameName(r.data?.header?.name, name)), willReopen: false };
  });
}

// ---------------------------------------------------------------------------
// the line, or the record, each format gets — in its own register's date style

const parts = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return { y, m, d };
};
/** 05.07.2024 — F/HR/01's style. */
const dotted = (iso: string) => (iso ? `${parts(iso).d}.${parts(iso).m}.${parts(iso).y}` : "");
/** 7/5/2024 — F/HR/03's style (month first, no leading zeros). */
const monthFirst = (iso: string) => (iso ? `${Number(parts(iso).m)}/${Number(parts(iso).d)}/${parts(iso).y}` : "");
/** 05/07/2024 — F/HR/06's and F/HR/13's style. */
const dayFirst = (iso: string) => (iso ? `${parts(iso).d}/${parts(iso).m}/${parts(iso).y}` : "");

function lineFor(docId: string, j: NewJoiner): Record<string, string> {
  const position = [j.designation, j.department].filter(Boolean).join(" - ");
  switch (docId) {
    case "hr-competence":
      return {
        name: j.name,
        department: j.department,
        designation: j.designation,
        eduRequired: j.eduRequired,
        eduAvailable: j.qualification,
        expRequired: j.expRequired,
        expAvailable: j.experience,
        gapJustification: j.gapJustification,
        dateOfJoining: dotted(j.dateOfJoining),
        dateOfLeaving: "",
      };
    case "hr-skill-matrix":
      return { name: j.name, designation: j.designation, dateOfJoining: monthFirst(j.dateOfJoining), ...Object.fromEntries(SKILL_OPERATIONS.map((o) => [o.key, ""])), remarks: "" };
    case "hr-training-needs":
      return { name: j.name, designation: j.designation, ...Object.fromEntries(TRAINING_TOPICS.map((t) => [t.key, ""])) };
    case "hr-induction-operators":
      return { name: j.name, joining: position, dateOfJoiningInduction: dayFirst(j.dateOfJoining), signHod: "", signHeadHr: "", signOperator: "" };
    case "hr-mobile-authorization":
      return { name: j.name, deptDesignation: position, signature: "", dateOfAllowance: dayFirst(todayISO()), authorizedBy: "" };
    default:
      return { name: j.name };
  }
}

function headerFor(docId: string, j: NewJoiner): Record<string, string> {
  if (docId === "hr-induction-staff") return { name: j.name, deptProcess: j.department, designation: j.designation, dateOfJoining: j.dateOfJoining };
  if (docId === "hr-pre-employment-health") return { name: j.name, deptDesignation: [j.department, j.designation].filter(Boolean).join(" - "), sex: j.sex, dateOfBirth: j.dateOfBirth };
  return { name: j.name };
}

export interface JoinerOutcome {
  docId: string;
  formatNo: string;
  title: string;
  recordId: string | null;
  result: "added" | "started" | "already-there" | "not-available";
  reopened: boolean;
}

export function addNewJoiner(joiner: NewJoiner, targetIds: string[], opts: { actorName: string; isDemo: boolean; source: string }): JoinerOutcome[] {
  const j: NewJoiner = { ...joiner, name: joiner.name.trim(), department: joiner.department.trim(), designation: joiner.designation.trim() };
  const who = `${j.name} (${[j.designation, j.department].filter(Boolean).join(", ")})`;
  const note = `New joiner from ${opts.source}: ${who}`;
  const outcomes: JoinerOutcome[] = [];

  for (const target of JOINER_TARGETS.filter((t) => targetIds.includes(t.docId))) {
    const base = { docId: target.docId, formatNo: target.formatNo, title: target.title };
    const doc = documentRepository.getById(target.docId);
    if (!doc) {
      outcomes.push({ ...base, recordId: null, result: "not-available", reopened: false });
      continue;
    }
    const labels = fieldLabels(doc.kind, doc.id);

    if (target.kind === "register") {
      let register = registerOnFile(doc.id, opts.isDemo);
      if (register && (register.data?.rows ?? []).some((r) => sameName(r.name, j.name))) {
        outcomes.push({ ...base, recordId: register.id, result: "already-there", reopened: false });
        continue;
      }
      if (!register) register = createRecordForDocument(doc, { dateISO: todayISO(), isDemo: opts.isDemo }).record as RecordInstance<LogSheetData>;
      let reopened = false;
      if (!isEditableStatus(register.status)) {
        register = reopenForCorrection(register as RecordInstance, opts.actorName, `${note} — line added; submit and verify the register again`) as RecordInstance<LogSheetData>;
        reopened = true;
      }
      const rows = (register.data?.rows ?? []).filter((row) => getLogSheetLayout(doc.id)?.rowMode.kind !== "free" || hasEntries(row, doc.id));
      const data: LogSheetData = { header: { ...(register.data?.header ?? {}) }, rows: [...rows, { id: generateId("row"), ...lineFor(doc.id, j) }] };
      const saved = saveDraft(register, data, opts.actorName, { action: "edited", note, labels });
      outcomes.push({ ...base, recordId: saved.id, result: "added", reopened });
      continue;
    }

    const existing = (recordRepository.query({ documentId: doc.id, isDemo: opts.isDemo }) as RecordInstance<LogSheetData>[]).find((r) => sameName(r.data?.header?.name, j.name));
    if (existing) {
      outcomes.push({ ...base, recordId: existing.id, result: "already-there", reopened: false });
      continue;
    }
    const started = createRecordForDocument(doc, { dateISO: todayISO(), isDemo: opts.isDemo }).record as RecordInstance<LogSheetData>;
    const data: LogSheetData = { header: { ...(started.data?.header ?? {}), ...headerFor(doc.id, j) }, rows: started.data?.rows ?? [] };
    const saved = saveDraft(started, data, opts.actorName, { action: "edited", note, labels });
    outcomes.push({ ...base, recordId: saved.id, result: "started", reopened: false });
  }
  return outcomes;
}
