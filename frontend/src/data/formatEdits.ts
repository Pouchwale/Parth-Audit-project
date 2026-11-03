import type { LogSheetLayout } from "../types";
import { storage, writeJSON } from "./storageAdapter";

// A FORMAT THE PLANT HAS CHANGED (REQUIREMENTS §62).
//
// The formats are issued in the code, transcribed from the company's paper
// (data/seed), and every start-up puts those definitions back — which is what
// lets a newly digitized form reach a browser that already used the app. So a
// change somebody makes to a format — a column added, a box renamed, a printed
// line reworded, the name itself — is kept BESIDE the issued one, under its
// own key, with the revision it produced:
//
//   formatEdits = { [documentId]: { revisionNo, revisionDate, name?, layout?, revisions[] } }
//
// and laid over the issued format wherever it is read: the definition
// (documentRepository) and the layout (getLogSheetLayout). "Restore the issued
// format" drops the entry and the paper's own transcription is back.
//
// Every change raises the revision number and dates it, and says who made it,
// when and why — the list of those is the format's own change history, which
// is what a controlled document needs to show an auditor.

export const FORMAT_EDITS_KEY = "formatEdits";

export interface FormatRevision {
  /** What two people's histories are merged by (engine/formatOps.ts); absent on an entry from before 19-Sep-2026 until the next save. */
  id?: string;
  revisionNo: string;
  revisionDate: string; // ISO date
  by: string;
  at: string; // ISO timestamp
  reason: string;
  /** What changed, in words: "added column Batch No.; renamed Remarks to Remarks / Action". */
  summary: string;
}

export interface FormatEdit {
  revisionNo: string;
  revisionDate: string;
  /** The format's name, when it was changed. */
  name?: string;
  /** The company name the header prints, when it was changed (REQUIREMENTS §77). */
  companyName?: string;
  /** The format number the header prints, when it was changed (REQUIREMENTS §77). */
  formatNo?: string;
  /** The whole layout as it now stands, when it was changed (log sheets only). */
  layout?: LogSheetLayout;
  /**
   * THE PRINTED WORDS OF A FORM DRAWN BY ITS OWN VIEW, CHANGED ON THE FORMAT (the service reports, REQUIREMENTS §154): by
   * place ("title", "area:3", "material:9" ...), each change with the moment it took effect, oldest first. A report handed
   * in before a change keeps the words it was handed in with; every other report prints the newest.
   */
  printedWords?: Record<string, { words: string; from: string }[]>;
  /** Newest first. */
  revisions: FormatRevision[];
}

export type FormatEditStore = Record<string, FormatEdit>;

// Parsed once per stored value, not once per read: a layout is asked for on
// every render of a sheet, and it must be the SAME object each time for the
// views that remember work by it (REQUIREMENTS §56).
let cachedRaw: string | null = null;
let cached: FormatEditStore = {};

export function formatEdits(): FormatEditStore {
  const raw = storage.getItem(FORMAT_EDITS_KEY) ?? "";
  if (raw === cachedRaw) return cached;
  cachedRaw = raw;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    cached = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as FormatEditStore) : {};
  } catch {
    cached = {};
  }
  return cached;
}

export const formatEditFor = (documentId: string): FormatEdit | undefined => formatEdits()[documentId];

/** The words a form prints at `place` (REQUIREMENTS §154): the format's newest change, or the one in force when the report was handed in (`handedInAt`), else the form's own. */
export function formatWordsAt(documentId: string, place: string, original: string, handedInAt?: string): string {
  const changes = formatEditFor(documentId)?.printedWords?.[place];
  if (!changes?.length) return original;
  const held = handedInAt ? changes.filter((c) => c.from <= handedInAt) : changes;
  return held.length ? held[held.length - 1].words : original;
}

export function saveFormatEdit(documentId: string, edit: FormatEdit): boolean {
  return writeJSON(FORMAT_EDITS_KEY, { ...formatEdits(), [documentId]: edit });
}

export function dropFormatEdit(documentId: string): boolean {
  const next = { ...formatEdits() };
  delete next[documentId];
  return writeJSON(FORMAT_EDITS_KEY, next);
}

/** "01" → "02", "00" → "01", "3" → "4"; anything that is not a number ("TO BE CONFIRMED") starts at "01". */
export function nextRevisionNo(current: string | null | undefined): string {
  const text = String(current ?? "").trim();
  if (!/^\d+$/.test(text)) return "01";
  return String(Number(text) + 1).padStart(Math.max(2, text.length), "0");
}
