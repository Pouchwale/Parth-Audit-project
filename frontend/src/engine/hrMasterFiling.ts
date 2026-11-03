import type { HrMasterPerson, LogSheetData, LogSheetRow, RecordInstance, RecordStatus } from "../types";
import { documentRepository } from "../data/repositories/documentRepository";
import { hrMasterRepository } from "../data/repositories/hrMasterRepository";
import { recordRepository } from "../data/repositories/recordRepository";
import { getLogSheetLayout } from "../data/seed/logSheetLayouts";
import { createRecordForDocument } from "./recordCrud";
import { blankLogRow } from "./recordDefaults";
import { isEditableStatus, reopenForCorrection, saveDraft } from "./recordLifecycle";
import { fieldLabels } from "./recordPatch";
import { followHeader } from "./headerFollowers";
import { categoryFor, defaultTargets, hasEntries, JOINER_TARGETS, registerOnFile, type JoinerCategory, type JoinerTarget } from "./hrJoiner";
import { describePerson, HR_MASTER_TAG, hrMasterLinkFor, lineForPerson, lineOfPerson, linkedValue, namesPerson, sameGp3, taggedFor, taggedForAnother, type HrMasterLink } from "./hrMaster";
import { generateId } from "../utils/id";
import { todayISO } from "../utils/date";

// A PERSON ON HR MASTER DATA, FILED ON THE HR FORMATS THEIR ROLE CALLS FOR
// (REQUIREMENTS §53, the owner, 2-Nov-2026: "the data should be fetched and go
// to the other HR records according to the role of the person ... without any
// mistake or confusion").
//
// The sheet names each person's Designation/Position. That decides their ROLE:
// an operator / worker (operator, helper, worker, packing, loading, machine…,
// engine/hrJoiner.ts categoryFor) or staff (everyone else) — and the role
// decides which HR formats carry them:
//
//   staff             F/HR/01 Personal Competence Records (a line), F/HR/05
//                     Induction Training Record — Staff (a record of their own),
//                     F/HR/04 Pre-Employment Medical Health Declaration (a record:
//                     supervisors, HODs, executives, assistants, managers — not
//                     a worker's or a helper's, the owner, 2-Nov-2026)
//   operator / worker F/HR/03 Skill Matrix — Operator (a line), F/HR/06
//                     Induction Training Record — Operators / Workers (a line)
//   everyone          F/HR/08 Training Need Identification (a line)
//
// — the same formats a new joiner from a CV is filed on (hrJoiner.ts
// defaultTargets), so the two ways in agree. F/HR/13 (a mobile allowed: the
// PSTL's decision) is offered but never ticked by itself; F/HR/11, 12 and 20
// are written when a training or survey happens, not when a person joins.
//
// NOTHING IS GUESSED. Each format's line or header is written through the one
// fetch map the record page uses (hrMaster.ts HR_MASTER_LINKS), in the
// register's own date style. A person already on a register (by GP3 No., or by
// name when no one else on the sheet has it) is left as they are — never a
// second line. Two people on the sheet with one name and no GP3 No. to tell
// them apart are not filed on a register at all, and the reason is said. A
// register that is submitted or verified is reopened for correction with the
// reason written, as the CV import does, and goes back to be verified.

export type Role = JoinerCategory;

export const ROLE_WORDS: Record<Role, string> = { staff: "staff", operator: "operator / worker" };

/** What the sheet says of a person that decides their role. */
export type RoleFacts = Pick<HrMasterPerson, "designation"> & Partial<Pick<HrMasterPerson, "sources">>;

// A designation that names a position: the staff's. Looked for first, so "Manager-Pouch" and "Lab Executive" are
// staff whatever process they name.
const STAFF_WORD = /\b(?:manager|mgr|supervisor|hod|head|executive|exe?cutive|exucutive|assistant|assi\.?|asst|ceo|director|owner|proprietor|co-?ordinator|designer|caller|leader|planning|officer|engineer|accountant|admin|hr|purchase|sales|marketing|qa|trainee|incharge|in-charge)\b/i;
// A designation that names a process — F/HR/03, the operators' skill matrix, writes each operator's process where
// a designation would go (Printing, Slitting, Punching, Pouching, Lamination, Cutting…): an operator's.
const PROCESS_WORD = /\b(?:printing|slitting|punching|pouching|pouch|lamination|laminating|cutting|corrugation|pasting|gluing|reel|sheet|press|rewinding|coating|die|folding|packing|dispatch|store)\b/i;

/**
 * A person's role, from the sheet's Designation/Position: an operator / worker by its word (operator, helper,
 * worker…, hrJoiner.ts categoryFor), or by naming a process rather than a position, or by their line having been
 * set up from the operators' registers alone (F/HR/03, F/HR/06); staff otherwise, and always when the designation
 * names a position.
 */
export function roleOf(person: RoleFacts): Role {
  const designation = String(person.designation ?? "").trim();
  if (categoryFor(designation) === "operator") return "operator";
  if (STAFF_WORD.test(designation)) return "staff";
  if (designation && PROCESS_WORD.test(designation)) return "operator";
  const sources = person.sources ?? [];
  const fromOperatorRegisters = sources.some((s) => /F\/HR\/0[36]/.test(s));
  const fromStaffRegister = sources.some((s) => /F\/HR\/01/.test(s));
  if (fromOperatorRegisters && !fromStaffRegister) return "operator";
  return "staff";
}

/** The formats kept for one role only, by their own titles; the others take anybody. */
export const FORMAT_AUDIENCE: Readonly<Record<string, Role>> = {
  "hr-competence": "staff",
  "hr-induction-staff": "staff",
  "hr-pre-employment-health": "staff",
  "hr-skill-matrix": "operator",
  "hr-induction-operators": "operator",
};

export const audienceOf = (docId: string | undefined): Role | undefined => (docId ? FORMAT_AUDIENCE[docId] : undefined);

/** This format is kept for the other role than the person's — F/HR/03, the operators' matrix, for a Manager. */
export const roleMismatch = (docId: string | undefined, person: RoleFacts): boolean => {
  const audience = audienceOf(docId);
  return !!audience && audience !== roleOf(person);
};

/** "Sandeep Parekh is a Manager (staff); F/HR/03 is kept for operators / workers." — or "" when the format takes them. */
export function roleMismatchWords(docId: string | undefined, formatNo: string, person: HrMasterPerson): string {
  const audience = audienceOf(docId);
  if (!audience || audience === roleOf(person)) return "";
  const designation = person.designation.trim();
  const article = /^[aeiou]/i.test(designation) ? "an" : "a";
  const who = designation ? `is ${article} ${designation} (${ROLE_WORDS[roleOf(person)]})` : `has no designation on the sheet, so counts as ${ROLE_WORDS[roleOf(person)]}`;
  return `${person.fullName || "This person"} ${who}; ${formatNo} is kept for ${ROLE_WORDS[audience]}.`;
}

/** The formats a person of this role is filed on by default. */
export const formatsForRole = (role: Role): string[] => defaultTargets(role);

// ---------------------------------------------------------------------------
// where a person stands on each format

export type Standing =
  /** A line would be added to the register, or a record started. */
  | { kind: "add" | "start"; willReopen: boolean; recordStatus?: RecordStatus }
  /** Already there: on this line (1-based) of the register, or on this record. */
  | { kind: "already"; recordId: string; line?: number }
  /** Nothing can be written without guessing. */
  | { kind: "unclear"; why: string }
  /** Not one of the viewer's formats. */
  | { kind: "not-available" };

export interface Placement {
  target: JoinerTarget;
  link: HrMasterLink;
  /** One of the formats for their role, ticked by default. */
  byRole: boolean;
  /** Kept for the other role: offered, but said so. */
  mismatch: boolean;
  standing: Standing;
}

/** The people on the sheet who could be mistaken for this one: the same name, or another spelling of it. */
function namesakes(person: HrMasterPerson, people: HrMasterPerson[]): HrMasterPerson[] {
  return people.filter((p) => p.id !== person.id && (namesPerson(person.fullName, p) || (person.aliases ?? []).some((a) => namesPerson(a, p))));
}

/** The record of a one-person format that is this person's: by the sheet's mark, by a GP3 No. in the name box, or by name. */
function recordOfPerson(link: HrMasterLink, records: RecordInstance<LogSheetData>[], person: HrMasterPerson, namesake: boolean): RecordInstance<LogSheetData> | undefined {
  const marked = records.find((r) => taggedFor(r.data?.header ?? {}, person));
  if (marked) return marked;
  return records.find((r) => {
    const header = r.data?.header ?? {};
    if (taggedForAnother(header, person)) return false;
    const box = header[link.nameField];
    return (!namesake && namesPerson(box, person)) || (!!person.gp3No && sameGp3(box, person.gp3No));
  });
}

/** The lines of a register that bear this person's name but no mark of the sheet's — somebody's, written by hand. */
const unmarkedNamesakeLines = (link: HrMasterLink, rows: LogSheetRow[], person: HrMasterPerson): number[] =>
  rows.flatMap((row, i) => (!String(row[HR_MASTER_TAG] ?? "").trim() && namesPerson(row[link.nameField], person) ? [i + 1] : []));

/** Where this person stands on every format the sheet can file them on, in the order the formats are offered. */
export function placementsFor(person: HrMasterPerson, people: HrMasterPerson[], isDemo: boolean): Placement[] {
  const role = roleOf(person);
  const byRole = new Set(formatsForRole(role));
  const sharedName = namesakes(person, people);
  const namesake = sharedName.length > 0;
  const noNumber = !person.gp3No.trim();
  return JOINER_TARGETS.flatMap((target) => {
    const link = hrMasterLinkFor(target.docId);
    if (!link) return [];
    const base = { target, link, byRole: byRole.has(target.docId), mismatch: roleMismatch(target.docId, person) };
    const standing = ((): Standing => {
      if (!person.fullName.trim()) return { kind: "unclear", why: "The line has no Full Name." };
      if (!documentRepository.getById(target.docId)) return { kind: "not-available" };
      if (namesake && noNumber) {
        return { kind: "unclear", why: `${sharedName.length + 1} people on the sheet are named ${person.fullName}, and this line has no GP3 No. to tell them apart.` };
      }
      if (target.kind === "register") {
        const register = registerOnFile(target.docId, isDemo);
        if (!register) return { kind: "add", willReopen: false };
        const rows = register.data?.rows ?? [];
        const match = lineOfPerson(link, rows, person, people);
        if (match.kind === "line") return { kind: "already", recordId: register.id, line: match.index + 1 };
        if (match.kind === "several") return { kind: "unclear", why: `${person.fullName} could be line ${match.indexes.map((i) => i + 1).join(" or line ")} of ${target.formatNo} — nothing written; see the register.` };
        // Two people of one name: a line of that name written by hand could be either's, so nothing is added or guessed.
        const unmarked = namesake ? unmarkedNamesakeLines(link, rows, person) : [];
        if (unmarked.length > 0) {
          return {
            kind: "unclear",
            why: `Line ${unmarked.join(" and line ")} of ${target.formatNo} ${unmarked.length === 1 ? "is" : "are"} named ${person.fullName}, and ${sharedName.length + 1} people on the sheet have that name — nothing written; check the register.`,
          };
        }
        return { kind: "add", willReopen: !isEditableStatus(register.status), recordStatus: register.status };
      }
      const records = recordRepository.query({ documentId: target.docId, isDemo }) as RecordInstance<LogSheetData>[];
      const theirs = recordOfPerson(link, records, person, namesake);
      return theirs ? { kind: "already", recordId: theirs.id } : { kind: "start", willReopen: false };
    })();
    return [{ ...base, standing }];
  });
}

/** The formats ticked when the dialog opens: the role's, and only where there is something to write. */
export const defaultChoice = (placements: Placement[]): string[] =>
  placements.filter((p) => p.byRole && (p.standing.kind === "add" || p.standing.kind === "start")).map((p) => p.target.docId);

// ---------------------------------------------------------------------------
// writing

export interface FilingOutcome {
  docId: string;
  formatNo: string;
  title: string;
  recordId: string | null;
  /** added: a line on the register; started: a record of their own; already: left as they were; unclear: nothing written. */
  result: "added" | "started" | "already" | "unclear" | "not-available";
  /** The line's number on the register (1-based), when a line was added or found. */
  line?: number;
  reopened: boolean;
  why?: string;
}

/** The header of a new one-person record, holding what the sheet has: every linked box, written outright (the record is new). */
function headerFor(link: HrMasterLink, person: HrMasterPerson, blank: Record<string, string>): Record<string, string> {
  // Written outright rather than "filled where blank": a new record's Name box
  // may already hold the signed-in person (its sign autoFill), and the record
  // is this person's, not theirs.
  const header = { ...blank };
  for (const f of link.fields) {
    const value = linkedValue(person, f);
    if (value) header[f.key] = value;
  }
  if (person.gp3No.trim()) header[HR_MASTER_TAG] = person.gp3No.trim();
  return header;
}

/**
 * Files one person from the sheet on the formats chosen — a line on each
 * register, a record of their own on each one-person form — and says what
 * was done on each. Nothing is written on a format where they already are, or
 * where it could not be done without guessing (placementsFor says which).
 */
export function filePerson(person: HrMasterPerson, targetIds: string[], opts: { actorName: string; isDemo: boolean }): FilingOutcome[] {
  const people = hrMasterRepository.all();
  const note = `Filed from HR Master Data: ${describePerson(person)}`;
  const outcomes: FilingOutcome[] = [];
  for (const placement of placementsFor(person, people, opts.isDemo)) {
    const { target, link, standing } = placement;
    if (!targetIds.includes(target.docId)) continue;
    const base = { docId: target.docId, formatNo: target.formatNo, title: target.title };
    if (standing.kind === "not-available") {
      outcomes.push({ ...base, recordId: null, result: "not-available", reopened: false });
      continue;
    }
    if (standing.kind === "unclear") {
      outcomes.push({ ...base, recordId: null, result: "unclear", reopened: false, why: standing.why });
      continue;
    }
    if (standing.kind === "already") {
      outcomes.push({ ...base, recordId: standing.recordId, result: "already", reopened: false, ...(standing.line ? { line: standing.line } : {}) });
      continue;
    }
    const doc = documentRepository.getById(target.docId);
    const layout = getLogSheetLayout(target.docId);
    if (!doc || !layout) {
      outcomes.push({ ...base, recordId: null, result: "not-available", reopened: false });
      continue;
    }
    const labels = fieldLabels(doc.kind, doc.id);

    if (standing.kind === "add") {
      let register = registerOnFile(doc.id, opts.isDemo) ?? (createRecordForDocument(doc, { dateISO: todayISO(), isDemo: opts.isDemo }).record as RecordInstance<LogSheetData>);
      let reopened = false;
      if (!isEditableStatus(register.status)) {
        register = reopenForCorrection(register as RecordInstance, opts.actorName, `${note} — line added; submit and verify the register again`) as RecordInstance<LogSheetData>;
        reopened = true;
      }
      // A free register's blank lines (the sheet's starting lines, never written in) make way for the person's.
      const rows = (register.data?.rows ?? []).filter((row) => layout.rowMode.kind !== "free" || hasEntries(row, doc.id));
      const line: LogSheetRow = lineForPerson(link, person, blankLogRow(layout, generateId("row")));
      const data: LogSheetData = { header: { ...(register.data?.header ?? {}) }, rows: [...rows, line] };
      const saved = saveDraft(register, data, opts.actorName, { action: "edited", note: `${note} — line ${rows.length + 1}`, labels });
      outcomes.push({ ...base, recordId: saved.id, result: "added", line: rows.length + 1, reopened });
      continue;
    }

    const started = createRecordForDocument(doc, { dateISO: todayISO(), isDemo: opts.isDemo }).record as RecordInstance<LogSheetData>;
    // The lines follow the header the person's row gave (F/HR/05's Planned Date from the Date of Joining, §159).
    const data: LogSheetData = followHeader(layout, undefined, { header: headerFor(link, person, started.data?.header ?? {}), rows: started.data?.rows ?? [] });
    const saved = saveDraft(started, data, opts.actorName, { action: "edited", note, labels });
    outcomes.push({ ...base, recordId: saved.id, result: "started", reopened: false });
  }
  return outcomes;
}

// ---------------------------------------------------------------------------
// everyone on the sheet

export interface EveryoneLine {
  docId: string;
  formatNo: string;
  title: string;
  toAdd: number;
  already: number;
  unclear: number;
}

export interface EveryonePlan {
  people: number;
  /** People with nothing left to file. */
  settled: number;
  /** People left off every register: no name, or a name shared with no GP3 No. */
  unclear: { person: HrMasterPerson; why: string }[];
  lines: EveryoneLine[];
}

/** What "file everyone" would do: each person on the formats for their role, counted per format. */
export function planEveryone(people: HrMasterPerson[], isDemo: boolean): EveryonePlan {
  const lines = new Map<string, EveryoneLine>();
  const unclear: EveryonePlan["unclear"] = [];
  let settled = 0;
  for (const person of people) {
    const placements = placementsFor(person, people, isDemo).filter((p) => p.byRole);
    const blocked = placements.find((p) => p.standing.kind === "unclear" && /no Full Name|no GP3 No/.test(p.standing.why));
    if (blocked && blocked.standing.kind === "unclear") {
      unclear.push({ person, why: blocked.standing.why });
      continue;
    }
    let left = 0;
    for (const p of placements) {
      const line = lines.get(p.target.docId) ?? { docId: p.target.docId, formatNo: p.target.formatNo, title: p.target.title, toAdd: 0, already: 0, unclear: 0 };
      if (p.standing.kind === "add" || p.standing.kind === "start") {
        line.toAdd++;
        left++;
      } else if (p.standing.kind === "already") line.already++;
      else if (p.standing.kind === "unclear") line.unclear++;
      lines.set(p.target.docId, line);
    }
    // Settled: on every format for their role, with nothing left waiting on HR.
    if (left === 0 && !placements.some((p) => p.standing.kind === "unclear")) settled++;
  }
  return { people: people.length, settled, unclear, lines: JOINER_TARGETS.flatMap((t) => (lines.has(t.docId) ? [lines.get(t.docId)!] : [])) };
}

export interface EveryoneOutcome {
  filed: { person: HrMasterPerson; outcomes: FilingOutcome[] }[];
  /** Per format: lines added or records started. */
  written: EveryoneLine[];
}

/** Files everyone on the sheet on the formats for their role. Each person's lines go through filePerson, one at a time, so the registers are read afresh for each. */
export function fileEveryone(people: HrMasterPerson[], opts: { actorName: string; isDemo: boolean }): EveryoneOutcome {
  const filed: EveryoneOutcome["filed"] = [];
  const written = new Map<string, EveryoneLine>();
  for (const person of people) {
    const outcomes = filePerson(person, formatsForRole(roleOf(person)), opts);
    filed.push({ person, outcomes });
    for (const o of outcomes) {
      const line = written.get(o.docId) ?? { docId: o.docId, formatNo: o.formatNo, title: o.title, toAdd: 0, already: 0, unclear: 0 };
      if (o.result === "added" || o.result === "started") line.toAdd++;
      else if (o.result === "already") line.already++;
      else if (o.result === "unclear") line.unclear++;
      written.set(o.docId, line);
    }
  }
  return { filed, written: JOINER_TARGETS.flatMap((t) => (written.has(t.docId) ? [written.get(t.docId)!] : [])) };
}
