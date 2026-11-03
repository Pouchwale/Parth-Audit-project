// WHAT THE INDEX KEEPS: one company item, "indexing", in PostgreSQL like every other (backend/storageRoutes.ts; only the
// super admin may write it). Everybody's browser reads it, because a formula the super admin changed must be worked
// out the same way on every computer and phone.
//
//   indexing = {
//     schema: 1,
//     current:  the index as it stands now (IndexSnapshot),
//     versions: every saved version, newest first — who, when, why, exactly what changed, and the index as it then stood,
//     formulas: each changed formula's timeline, oldest first — which formula was in force from when.
//   }
//
// "Version 0" is the index as issued: nothing in `current`, every value its default. Nothing is ever removed from
// `versions` or `formulas`; restoring an old version is saved as a new version.

import { readJSONCached, writeJSON } from "../frontend/src/data/storageAdapter";
import type { RangeValue } from "./ranges";
import type { TextEdit, TextEntry } from "./textLayout";

export const INDEXING_KEY = "indexing";

/** The fields of a format's line. Those marked in PUSHED_FORMAT_FIELDS are the format's own, and change it. */
export type FormatField =
  | "formatNo"
  | "name"
  | "companyName"
  | "revisionNo"
  | "revisionDate"
  | "frequency"
  | "responsibleRole"
  | "department"
  | "listRevision"
  | "methodOfRecording"
  | "retentionPeriod"
  | "methodOfDisposition"
  | "fileLocation"
  | "status"
  | "remarks";

export const PUSHED_FORMAT_FIELDS: readonly FormatField[] = ["formatNo", "name", "companyName", "revisionNo", "revisionDate", "frequency", "responsibleRole"];

/** The fields of a line of the Master List of Documents (F/SYS/01). All are the index's own. */
export type DocumentField = "documentNumber" | "description" | "documentControl" | "latestRevision" | "retentionPeriod" | "fileLocation" | "status" | "remarks";

export interface AddedRow {
  key: string;
  /** For a format: formatNo, name, department; for a document: documentNumber, description. */
  values: Record<string, string>;
  at: string;
  by: string;
}

export interface IndexSnapshot {
  /** Per line ("doc:<id>" or "list:<format no>"): only the values that differ from the default. */
  formats: Record<string, Partial<Record<FormatField, string>>>;
  /** Per line ("sys01:<n>" or an added line's key). */
  documents: Record<string, Partial<Record<DocumentField, string>>>;
  addedFormats: AddedRow[];
  addedDocuments: AddedRow[];
  /** Per formula: its expression, only where it differs from the default. */
  formulas: Record<string, string>;
  /**
   * Kept with each saved version (not in `current`, where the formats themselves hold them): per DCRS format id, its
   * own values (number, name, revision, frequency, responsible role…) that differed from the issued ones at that version.
   */
  pushed?: Record<string, Partial<Record<FormatField, string>>>;
  /** Per range or limit (indexing/ranges.ts): its value, only where it differs from the default. */
  ranges?: Record<string, RangeValue>;
  /** Per DCRS format id: the printed words changed, hidden, styled or moved (indexing/textLayout.ts). */
  texts?: Record<string, TextEdit[]>;
}

export interface IndexChange {
  area: "format" | "document" | "formula" | "range" | "text" | "added-format" | "added-document";
  /** The line or formula it is about. */
  key: string;
  /** What a person reads: "F/QC/12 Weighing balance…", "F/PUR/05 Grade". */
  label: string;
  field: string;
  before: string;
  after: string;
}

export interface IndexVersion {
  no: number;
  at: string;
  by: string;
  reason: string;
  /** "edit", "reset" or "restore of v3". */
  kind: string;
  changes: IndexChange[];
  snapshot: IndexSnapshot;
}

export interface FormulaEntry {
  /** null = back to the default formula. */
  expr: string | null;
  /** In force from this moment. */
  since: string;
  by: string;
  version: number;
}

export interface RangeEntry {
  /** null = back to the default range. */
  value: RangeValue | null;
  /** In force from this moment. */
  since: string;
  by: string;
  version: number;
}

export interface IndexState {
  schema: 1;
  current: IndexSnapshot;
  versions: IndexVersion[];
  formulas: Record<string, FormulaEntry[]>;
  /** Each changed range's timeline, oldest first — which range was in force from when. */
  ranges: Record<string, RangeEntry[]>;
  /** Each format's text changes over time, oldest first (signed records keep the words they were signed with). */
  texts?: Record<string, TextEntry[]>;
}

export const emptySnapshot = (): IndexSnapshot => ({ formats: {}, documents: {}, addedFormats: [], addedDocuments: [], formulas: {}, ranges: {}, texts: {} });

const EMPTY: IndexState = { schema: 1, current: emptySnapshot(), versions: [], formulas: {}, ranges: {}, texts: {} };

function normalise(raw: unknown): IndexState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return EMPTY;
  const r = raw as Partial<IndexState>;
  const cur = (r.current ?? {}) as Partial<IndexSnapshot>;
  return {
    schema: 1,
    current: {
      formats: cur.formats && typeof cur.formats === "object" ? cur.formats : {},
      documents: cur.documents && typeof cur.documents === "object" ? cur.documents : {},
      addedFormats: Array.isArray(cur.addedFormats) ? cur.addedFormats : [],
      addedDocuments: Array.isArray(cur.addedDocuments) ? cur.addedDocuments : [],
      formulas: cur.formulas && typeof cur.formulas === "object" ? cur.formulas : {},
      ranges: cur.ranges && typeof cur.ranges === "object" ? cur.ranges : {},
      texts: cur.texts && typeof cur.texts === "object" ? cur.texts : {},
    },
    versions: Array.isArray(r.versions) ? r.versions : [],
    formulas: r.formulas && typeof r.formulas === "object" ? r.formulas : {},
    ranges: r.ranges && typeof r.ranges === "object" ? r.ranges : {},
    texts: r.texts && typeof r.texts === "object" ? r.texts : {},
  };
}

let lastRaw: unknown = undefined;
let lastState: IndexState = EMPTY;

/** The index as stored (the same object until it changes). */
export function readIndexState(): IndexState {
  const raw = readJSONCached<unknown>(INDEXING_KEY, null);
  if (raw === lastRaw) return lastState;
  lastRaw = raw;
  lastState = normalise(raw);
  return lastState;
}

export function writeIndexState(state: IndexState): boolean {
  return writeJSON(INDEXING_KEY, state);
}

/** The latest version number (0 when the index is as issued). */
export const currentVersionNo = (state: IndexState = readIndexState()): number => state.versions[0]?.no ?? 0;
