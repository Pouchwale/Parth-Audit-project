import type { HrMasterPerson, LogSheetData, LogSheetRow, RecordInstance, RecordStatus } from "../types";
import { documentRepository } from "../data/repositories/documentRepository";
import { hrMasterRepository } from "../data/repositories/hrMasterRepository";
import { recordRepository } from "../data/repositories/recordRepository";
import { getLogSheetLayout } from "../data/seed/logSheetLayouts";
import { isDocumentIdVisible } from "./departmentScope";
import { registerOnFile } from "./hrJoiner";
import { HR_MASTER_LINKS, applyFills, describePerson, lineForPerson, lineOfPerson, linkedValue, namesPerson, personFill, sameGp3, type FieldFill, type HrMasterLink } from "./hrMaster";
import { blankLogRow } from "./recordDefaults";
import { createRecordForDocument } from "./recordCrud";
import { isEditableStatus, reopenForCorrection, saveDraft } from "./recordLifecycle";
import { fieldLabels } from "./recordPatch";
import { compareISO, todayISO } from "../utils/date";
import { generateId } from "../utils/id";

// ONE EMPLOYEE, FILED ONTO THE HR FORMATS THAT NAME THEM — FROM THE MASTER
// SHEET (REQUIREMENTS §160).
//
// The fetch on a record brings one person onto the form that is open (§53).
// This is the same fetch the other way round: from the person's line on HR
// Master Data, onto every format HR ticks, in one go, with the six details read
// once. Each format gets exactly what HR_MASTER_LINKS says it prints, in its own
// style (engine/hrMaster.ts): a register gets the person's line — or, when they
// are already on it, their blank boxes filled; a one-person form gets a record
// of their own, or its blanks filled when they already have one. Nothing
// written is changed, nothing the sheet lacks is made up, and a submitted or
// verified register is reopened for correction with the reason written, as the
// CV import does (engine/hrJoiner.ts).

export type FileResult = "started" | "added" | "filled" | "already-there" | "several-lines" | "not-available";

export interface FileTargetState {
  link: HrMasterLink;
  title: string;
  /** The format exists and is one of the viewer's. */
  available: boolean;
  /** The person already has a line on the register, or a record of this form. */
  alreadyThere: boolean;
  /** Where they already are, the blank boxes the sheet can fill — 0 when nothing would change. */
  blanks: number;
  /** Where they already are, the boxes that say something else than the sheet — never replaced from here (the record's Fetch asks first, §53). */
  conflicts: number;
  /** On more than one line of the register, so nothing can be filled by name. */
  severalLines: boolean;
  recordStatus?: RecordStatus;
  /** A submitted or verified record, reopened for correction to take the fill. */
  willReopen: boolean;
}

export interface FileOutcome {
  docId: string;
  formatNo: string;
  title: string;
  recordId: string | null;
  result: FileResult;
  reopened: boolean;
  /** The boxes written, by the format's own labels. */
  written: string[];
}

const people = () => hrMasterRepository.all();

/** The box names the person — by their name (or another spelling the registers use), or by their GP3 No. */
const isTheirs = (box: unknown, person: HrMasterPerson) => namesPerson(box, person) || (!!person.gp3No && sameGp3(box, person.gp3No));

/** The person's own record of a one-person form — the newest, when they have more than one. */
function recordOfPerson(link: HrMasterLink, person: HrMasterPerson, isDemo: boolean): RecordInstance<LogSheetData> | undefined {
  return (recordRepository.query({ documentId: link.docId, isDemo }) as RecordInstance<LogSheetData>[])
    .filter((r) => isTheirs(r.data?.header?.[link.nameField], person))
    .sort((a, b) => compareISO(b.dueDate, a.dueDate) || b.updatedAt.localeCompare(a.updatedAt))[0];
}

function hasEntries(row: LogSheetRow, docId: string): boolean {
  const layout = getLogSheetLayout(docId);
  if (!layout) return true;
  return layout.columns.some((c) => !c.fixed && String(row[c.key] ?? "").trim() !== "");
}

/** The header of a one-person form with the person's details in its boxes. */
function headerForPerson(link: HrMasterLink, person: HrMasterPerson, header: LogSheetData["header"]): LogSheetData["header"] {
  const next: LogSheetData["header"] = { ...header };
  for (const f of link.fields) {
    const value = linkedValue(person, f);
    if (value) next[f.key] = value;
  }
  return next;
}

/** What filing this person onto each of the ten formats would do, for HR to tick. */
export function fileTargetStates(person: HrMasterPerson, isDemo: boolean): FileTargetState[] {
  const everyone = people();
  return HR_MASTER_LINKS.map((link) => {
    const doc = documentRepository.getById(link.docId);
    const available = !!doc && isDocumentIdVisible(link.docId);
    const base = { link, title: doc?.name ?? link.formatNo, available, alreadyThere: false, blanks: 0, conflicts: 0, severalLines: false, willReopen: false };
    if (!available) return base;
    if (link.where === "header") {
      const record = recordOfPerson(link, person, isDemo);
      if (!record) return base;
      const { fills, conflicts } = personFill(link, person, record.data?.header ?? {});
      return { ...base, alreadyThere: true, blanks: fills.length, conflicts: conflicts.length, recordStatus: record.status, willReopen: fills.length > 0 && !isEditableStatus(record.status) };
    }
    const register = registerOnFile(link.docId, isDemo);
    if (!register) return base;
    const match = lineOfPerson(link, register.data?.rows ?? [], person, everyone);
    const willReopen = !isEditableStatus(register.status);
    if (match.kind === "several") return { ...base, severalLines: true, recordStatus: register.status, willReopen: false };
    if (match.kind === "none") return { ...base, recordStatus: register.status, willReopen };
    const { fills, conflicts } = personFill(link, person, (register.data?.rows ?? [])[match.index]);
    return { ...base, alreadyThere: true, blanks: fills.length, conflicts: conflicts.length, recordStatus: register.status, willReopen: fills.length > 0 && willReopen };
  });
}

/**
 * Files the person onto the chosen formats. Every box written is listed in the
 * outcome; a format the person is already on with nothing blank is left as it
 * is and said so.
 */
export function fileFromMaster(person: HrMasterPerson, docIds: string[], opts: { actorName: string; isDemo: boolean }): FileOutcome[] {
  const everyone = people();
  const note = `Filed from HR Master Data: ${describePerson(person)}`;
  const outcomes: FileOutcome[] = [];
  for (const link of HR_MASTER_LINKS.filter((l) => docIds.includes(l.docId))) {
    const doc = documentRepository.getById(link.docId);
    const base = { docId: link.docId, formatNo: link.formatNo, title: doc?.name ?? link.formatNo };
    if (!doc || !isDocumentIdVisible(link.docId)) {
      outcomes.push({ ...base, recordId: null, result: "not-available", reopened: false, written: [] });
      continue;
    }
    const layout = getLogSheetLayout(doc.id);
    const labels = fieldLabels(doc.kind, doc.id);
    const names = (fills: FieldFill[]) => fills.map((f) => labels[f.key] ?? f.key);
    const reopenIfNeeded = (record: RecordInstance<LogSheetData>, what: string): { record: RecordInstance<LogSheetData>; reopened: boolean } => {
      if (isEditableStatus(record.status)) return { record, reopened: false };
      return { record: reopenForCorrection(record as RecordInstance, opts.actorName, `${note} — ${what}; submit and verify it again`) as RecordInstance<LogSheetData>, reopened: true };
    };

    if (link.where === "header") {
      const existing = recordOfPerson(link, person, opts.isDemo);
      if (existing) {
        const { fills } = personFill(link, person, existing.data?.header ?? {});
        if (fills.length === 0) {
          outcomes.push({ ...base, recordId: existing.id, result: "already-there", reopened: false, written: [] });
          continue;
        }
        const { record, reopened } = reopenIfNeeded(existing, "blank boxes filled");
        const data: LogSheetData = { header: applyFills(record.data?.header ?? {}, fills), rows: record.data?.rows ?? [] };
        const saved = saveDraft(record, data, opts.actorName, { action: "edited", note, labels });
        outcomes.push({ ...base, recordId: saved.id, result: "filled", reopened, written: names(fills) });
        continue;
      }
      const started = createRecordForDocument(doc, { dateISO: todayISO(), isDemo: opts.isDemo }).record as RecordInstance<LogSheetData>;
      const header = headerForPerson(link, person, started.data?.header ?? {});
      const saved = saveDraft(started, { header, rows: started.data?.rows ?? [] }, opts.actorName, { action: "edited", note, labels });
      outcomes.push({ ...base, recordId: saved.id, result: "started", reopened: false, written: link.fields.filter((f) => linkedValue(person, f)).map((f) => labels[f.key] ?? f.key) });
      continue;
    }

    let register = registerOnFile(doc.id, opts.isDemo);
    if (!register) register = createRecordForDocument(doc, { dateISO: todayISO(), isDemo: opts.isDemo }).record as RecordInstance<LogSheetData>;
    const rows = register.data?.rows ?? [];
    const match = lineOfPerson(link, rows, person, everyone);
    if (match.kind === "several") {
      outcomes.push({ ...base, recordId: register.id, result: "several-lines", reopened: false, written: [] });
      continue;
    }
    if (match.kind === "line") {
      const { fills } = personFill(link, person, rows[match.index]);
      if (fills.length === 0) {
        outcomes.push({ ...base, recordId: register.id, result: "already-there", reopened: false, written: [] });
        continue;
      }
      const { record, reopened } = reopenIfNeeded(register, `line ${match.index + 1}'s blank boxes filled`);
      const data: LogSheetData = { header: { ...(record.data?.header ?? {}) }, rows: (record.data?.rows ?? []).map((r, i) => (i === match.index ? applyFills(r, fills) : r)) };
      const saved = saveDraft(record, data, opts.actorName, { action: "edited", note, labels });
      outcomes.push({ ...base, recordId: saved.id, result: "filled", reopened, written: names(fills) });
      continue;
    }
    const { record, reopened } = reopenIfNeeded(register, "line added");
    // A free register's untouched blank lines make way for the person's, as the CV import's line does.
    const kept = (record.data?.rows ?? []).filter((row) => layout?.rowMode.kind !== "free" || hasEntries(row, doc.id));
    const line = layout ? lineForPerson(link, person, blankLogRow(layout, generateId("row"))) : lineForPerson(link, person, { id: generateId("row") });
    const saved = saveDraft(record, { header: { ...(record.data?.header ?? {}) }, rows: [...kept, line] }, opts.actorName, { action: "edited", note, labels });
    outcomes.push({ ...base, recordId: saved.id, result: "added", reopened, written: link.fields.filter((f) => linkedValue(person, f)).map((f) => labels[f.key] ?? f.key) });
  }
  return outcomes;
}
