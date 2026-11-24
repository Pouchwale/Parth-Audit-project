// THE LINES OF THE INDEX, WORKED OUT FROM WHAT THE APP ALREADY HOLDS.
//
// Formats: every format DCRS holds (its definitions, as changed by the plant) joined with every line of the company's
// Master List of Formats & Records (F/SYS/02, the 141-line workbook), matched by format number — so a format on the
// list that DCRS does not hold yet is a line too, and a DCRS format not on the list is one as well.
// Documents: every line of the Master List of Documents (F/SYS/01, 173 manuals, SOPs, procedures).
//
// For each value: its DEFAULT (what the paper / the issued format says) and its CURRENT value (the format as it stands,
// or the index's own change). A line marks every value that differs from its default.

import type { DocumentDefinition, Frequency, MasterData, RecordInstance } from "../frontend/src/types";
import { SEED_DOCUMENTS } from "../frontend/src/data/seed/documentDefinitions";
import { SEED_MASTER_DATA, COMPANY } from "../frontend/src/data/seed/masterData";
import { DOCUMENT_LIST_REVISION_KEYS, DOCUMENT_LIST_ROWS, FORMAT_LIST_REVISION_KEYS, FORMAT_LIST_ROWS } from "../frontend/src/data/seed/sysDocumentControlLayouts";
import { documentRepository } from "../frontend/src/data/repositories/documentRepository";
import { masterRepository } from "../frontend/src/data/repositories/masterRepository";
import { recordRepository } from "../frontend/src/data/repositories/recordRepository";
import { masterListFormats } from "../frontend/src/engine/documentFinder";
import { departmentOfDocument } from "../frontend/src/data/seed/documentDepartments";
import { departmentName } from "../frontend/src/data/seed/departments";
import { scheduleLabel } from "../frontend/src/engine/frequencyEngine";
import { resolveResponsibleEmployees } from "../frontend/src/engine/documentInfo";
import { BUILT_IN_RULES, formulaSlotsOf, type FormulaSlot } from "./formulas";
import { PUSHED_FORMAT_FIELDS, readIndexState, type DocumentField, type FormatField, type IndexSnapshot } from "./indexState";
import { MODE_HELP, modeOptions, type IndexMode } from "./modes";
import { allComplianceStatements } from "../frontend/src/data/repositories/referenceRepository";
import { complianceValidUntil } from "../frontend/src/data/seed/complianceStatements";
import { formatDisplayDate } from "../frontend/src/utils/date";

export const FREQUENCIES: Frequency[] = ["Daily", "Weekly", "Fortnightly", "Monthly", "Quarterly", "Half-yearly", "Yearly", "As Required"];
export const STATUSES = ["Active", "Not in DCRS yet", "Obsolete", "On hold"];

export interface FormatLine {
  key: string;
  srNo: number;
  /** The DCRS format, when DCRS holds it. */
  doc?: DocumentDefinition;
  onMasterList: boolean;
  addedInIndex: boolean;
  module: string;
  defaults: Record<FormatField, string>;
  values: Record<FormatField, string>;
  /** Fields that differ from their default. */
  changed: Set<FormatField>;
  /** Fields that can be changed for this line (a format DCRS does not hold has nothing to push to). */
  editable: Set<FormatField>;
  automation: AutomationInfo;
  records: { filled: number; open: number; first: string; last: string };
  responsiblePeople: string;
  scheduleText: string;
}

export interface AutomationInfo {
  /** "Automatic", "Manual", "Manual start", "Reference only", "SAP", "Not in DCRS" (indexing/modes.ts). */
  mode: string;
  /** What it is as issued (before the super admin's switch). */
  baseMode: string;
  /** The modes it may be switched to. */
  options: IndexMode[];
  tags: string[];
  formulas: FormulaSlot[];
  rules: string[];
}

export interface DocumentLine {
  key: string;
  srNo: number;
  addedInIndex: boolean;
  defaults: Record<DocumentField, string>;
  values: Record<DocumentField, string>;
  changed: Set<DocumentField>;
}

const clean = (v: unknown): string => String(v ?? "").replace(/^_+/, "").replace(/\s+/g, " ").trim();
const latestOf = (row: Record<string, string>, keys: readonly string[]): string => {
  for (let i = keys.length - 1; i >= 0; i--) if (clean(row[keys[i]])) return clean(row[keys[i]]);
  return "";
};

export const formatLineKey = (docId: string | null, listFormatNo: string | null): string => (docId ? `doc:${docId}` : `list:${listFormatNo}`);

/** What a format is as issued: from its own definition and the frequency set for it, never the index's switch. */
function baseModeOf(doc: DocumentDefinition | undefined, seed: DocumentDefinition | undefined, master: MasterData): string {
  if (!doc) return "Not in DCRS";
  const own = seed ?? doc;
  if (own.isReferenceOnly) return "Reference only";
  const schedule = master.scheduleOverrides?.[doc.id]?.schedule ?? own.schedule;
  return schedule.type === "as-required" ? "Manual start" : "Automatic";
}

export const NO_FORMAT_TAG = "No format in DCRS";

function automationOf(doc: DocumentDefinition | undefined, status: string, mode: string, baseMode: string): AutomationInfo {
  const renewable = doc?.kind === "compliance-statement";
  const options = modeOptions(baseMode, renewable);
  // A Master List line DCRS holds no format for, marked Automatic (§305): it says so, and that there is no format yet.
  if (!doc && mode === "Automatic") return { mode, baseMode, options, tags: [NO_FORMAT_TAG, "Marked Automatic in the index", "Nothing falls due until its format is made"], formulas: [], rules: [] };
  // A Statement of Compliance made Automatic (§305): still read only, its renewal reminded.
  if (doc && renewable && baseMode === "Reference only" && mode === "Automatic") {
    const statement = allComplianceStatements().find((s) => s.documentId === doc.id);
    const until = statement ? complianceValidUntil(statement) : "";
    return {
      mode,
      baseMode,
      options,
      tags: ["Read only, not filled", until ? `Valid until ${formatDisplayDate(until)}` : "Validity date to be confirmed", "Renewal reminded 90 days before (daily briefing)", `Switched in Indexing (was ${baseMode})`],
      formulas: [],
      rules: [],
    };
  }
  if (!doc || mode === "Not in DCRS" || mode === "SAP") {
    const tags = mode === "SAP" ? ["Kept in SAP", "Not filled in DCRS"] : ["Kept on paper / SAP", "Filled by hand"];
    if (!doc) tags.push(NO_FORMAT_TAG);
    if (doc && mode === "SAP") tags.push("Records already filled stay");
    return { mode, baseMode, options, tags, formulas: doc ? formulaSlotsOf(doc.id) : [], rules: [] };
  }
  const formulas = formulaSlotsOf(doc.id);
  const rules = BUILT_IN_RULES.filter((r) => r.documentIds.includes(doc.id)).map((r) => r.rule);
  const tags: string[] = [];
  if (mode === "Reference only") {
    tags.push("Read only, not filled");
  } else if (mode === "Manual start") {
    tags.push("Started by a person when needed");
  } else if (mode === "Manual") {
    tags.push(`Falls due on its own (${scheduleLabel(doc)})`, "Nothing filled by the system", "Every box typed by a person");
  } else {
    tags.push(`Falls due on its own (${scheduleLabel(doc)})`, "The system fills the known parts when opened", "Reminders sent to the responsible person");
  }
  if (formulas.length) tags.push(`${formulas.length} worked-out cell${formulas.length === 1 ? "" : "s"}`);
  if (rules.length) tags.push("Built-in rule");
  if (mode !== "Reference only") tags.push("Readings and signatures by a person");
  if (mode !== baseMode) tags.push(`Switched in Indexing (was ${baseMode})`);
  if (status === "Obsolete") tags.push("Marked obsolete in the index");
  return { mode, baseMode, options, tags, formulas, rules };
}

export { MODE_HELP };

function recordStats(all: readonly RecordInstance[]): Map<string, { filled: number; open: number; first: string; last: string }> {
  const out = new Map<string, { filled: number; open: number; first: string; last: string }>();
  for (const r of all) {
    if (r.isDemo) continue;
    const s = out.get(r.documentId) ?? { filled: 0, open: 0, first: "", last: "" };
    if (r.status === "Submitted" || r.status === "Pending Verification" || r.status === "Verified") {
      s.filled++;
      if (!s.first || r.dueDate < s.first) s.first = r.dueDate;
      if (!s.last || r.dueDate > s.last) s.last = r.dueDate;
    } else if (r.status === "In Progress" || r.status === "Rejected" || r.status === "Due") {
      s.open++;
    }
    out.set(r.documentId, s);
  }
  return out;
}

/** Every format line of the index, as it stands now (with `snapshot`'s index-only values, the stored one by default). */
export function buildFormatLines(snapshot: IndexSnapshot = readIndexState().current): FormatLine[] {
  const master: MasterData = masterRepository.get();
  const docs = documentRepository.getAllUnscoped();
  const stats = recordStats(recordRepository.getAll());
  const listRows = new Map<string, Record<string, string>>();
  for (const row of FORMAT_LIST_ROWS) listRows.set(clean(row.formatNumber), row);

  const lines: FormatLine[] = [];
  const seenDocs = new Set<string>();
  let srNo = 0;

  const make = (doc: DocumentDefinition | undefined, listFormatNo: string | null, listName: string, added?: Record<string, string>): FormatLine => {
    const key = added ? added.key : formatLineKey(doc?.id ?? null, listFormatNo);
    const seed = doc ? SEED_DOCUMENTS.find((d) => d.id === doc.id) : undefined;
    const listRow = listFormatNo ? listRows.get(listFormatNo) : undefined;
    const deptCode = doc ? departmentOfDocument(doc.id, doc.formatNo) : listFormatNo ? departmentOfDocument("", listFormatNo) : null;
    const listObsolete = listRow ? Object.values(listRow).some((v) => /obsol/i.test(String(v))) : false;
    const defaults: Record<FormatField, string> = {
      formatNo: added ? clean(added.formatNo) : clean(seed?.formatNo ?? doc?.formatNo ?? listFormatNo),
      name: added ? clean(added.name) : clean(seed?.name ?? doc?.name ?? listName),
      companyName: doc ? clean(seed?.companyName ?? COMPANY.name) : "",
      revisionNo: doc ? clean(seed?.revisionNo ?? doc.revisionNo) : "",
      revisionDate: doc ? clean(seed?.revisionDate ?? doc.revisionDate) : "",
      frequency: doc ? (seed?.frequency ?? doc.frequency) : "",
      responsibleRole: doc ? clean(SEED_MASTER_DATA.documentRoleKeywords[doc.id]) : "",
      department: added ? clean(added.department) : deptCode ? departmentName(deptCode) : "",
      listRevision: listRow ? latestOf(listRow, FORMAT_LIST_REVISION_KEYS) : "",
      methodOfRecording: listRow ? clean(listRow.methodOfRecording) : doc ? "Digital (DCRS)" : "",
      retentionPeriod: listRow ? clean(listRow.retentionPeriod) : "",
      methodOfDisposition: listRow ? clean(listRow.methodOfDisposition) : "",
      fileLocation: "",
      status: listObsolete ? "Obsolete" : doc ? "Active" : "Not in DCRS yet",
      remarks: "",
      mode: added ? "Not in DCRS" : baseModeOf(doc, seed, master),
    };
    // The format's own values as they stand now (the plant's format edits and frequencies laid over the issued ones).
    const live: Partial<Record<FormatField, string>> = doc
      ? {
          formatNo: clean(doc.formatNo),
          name: clean(doc.name),
          companyName: clean(doc.companyName ?? COMPANY.name),
          revisionNo: clean(doc.revisionNo),
          revisionDate: clean(doc.revisionDate),
          frequency: doc.frequency,
          responsibleRole: clean(master.documentRoleKeywords?.[doc.id]),
        }
      : {};
    const own = snapshot.formats[key] ?? {};
    const values = { ...defaults } as Record<FormatField, string>;
    const editable = new Set<FormatField>();
    for (const f of Object.keys(defaults) as FormatField[]) {
      const pushed = PUSHED_FORMAT_FIELDS.includes(f);
      if (doc && pushed) {
        values[f] = live[f] ?? defaults[f];
        if (f !== "frequency" || !doc.isReferenceOnly) editable.add(f);
      } else {
        if (own[f] !== undefined) values[f] = own[f] as string;
        // A format DCRS does not hold has no frequency, revision or responsible person to keep.
        if (!pushed || f === "formatNo" || f === "name") editable.add(f);
      }
    }
    const changed = new Set<FormatField>((Object.keys(values) as FormatField[]).filter((f) => values[f] !== defaults[f]));
    srNo++;
    return {
      key,
      srNo,
      doc,
      onMasterList: !!listRow,
      addedInIndex: !!added,
      module: doc ? doc.module : "",
      defaults,
      values,
      changed,
      editable,
      automation: automationOf(doc, values.status, values.mode, defaults.mode),
      records: (doc && stats.get(doc.id)) || { filled: 0, open: 0, first: "", last: "" },
      responsiblePeople: doc ? resolveResponsibleEmployees({ ...doc }, master).map((e) => e.name).join(", ") : "",
      scheduleText: doc ? (doc.isReferenceOnly ? "—" : scheduleLabel(doc)) : "",
    };
  };

  // In F/SYS/02's order first, each line with the DCRS format that holds it.
  for (const line of masterListFormats()) {
    const doc = line.heldBy ? docs.find((d) => d.id === line.heldBy) : undefined;
    if (doc && seenDocs.has(doc.id)) continue;
    if (doc) seenDocs.add(doc.id);
    lines.push(make(doc, clean(line.formatNo), line.name));
  }
  // Then the DCRS formats the list does not name.
  for (const doc of docs) {
    if (seenDocs.has(doc.id)) continue;
    seenDocs.add(doc.id);
    lines.push(make(doc, null, doc.name));
  }
  // Then the lines added in the index itself.
  for (const a of snapshot.addedFormats) lines.push(make(undefined, null, "", { key: a.key, ...a.values }));
  return lines;
}

const DOCUMENT_FIELDS: DocumentField[] = ["documentNumber", "description", "documentControl", "latestRevision", "retentionPeriod", "fileLocation", "status", "remarks"];

/** Every line of the Master List of Documents (F/SYS/01), and those added in the index. */
export function buildDocumentLines(snapshot: IndexSnapshot = readIndexState().current): DocumentLine[] {
  const lines: DocumentLine[] = [];
  const make = (key: string, srNo: number, base: Record<string, string>, added: boolean): DocumentLine => {
    const defaults: Record<DocumentField, string> = {
      documentNumber: clean(base.documentNumber),
      description: clean(base.description),
      documentControl: clean(base.documentControl),
      latestRevision: latestOf(base, DOCUMENT_LIST_REVISION_KEYS),
      retentionPeriod: clean(base.retentionPeriod),
      fileLocation: "",
      status: "Active",
      remarks: "",
    };
    const own = snapshot.documents[key] ?? {};
    const values = { ...defaults };
    for (const f of DOCUMENT_FIELDS) if (own[f] !== undefined) values[f] = own[f] as string;
    const changed = new Set<DocumentField>(DOCUMENT_FIELDS.filter((f) => values[f] !== defaults[f]));
    return { key, srNo, addedInIndex: added, defaults, values, changed };
  };
  DOCUMENT_LIST_ROWS.forEach((row, i) => {
    if (!clean(row.documentNumber) && !clean(row.description)) return;
    lines.push(make(`sys01:${i}`, lines.length + 1, row, false));
  });
  for (const a of snapshot.addedDocuments) lines.push(make(a.key, lines.length + 1, a.values, true));
  return lines;
}

export { DOCUMENT_FIELDS };
