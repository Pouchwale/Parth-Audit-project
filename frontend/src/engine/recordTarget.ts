import type { DocumentDefinition, RecordInstance } from "../types";
import type { AssistantTarget } from "../store/AssistantContext";
import { documentRepository } from "../data/repositories/documentRepository";
import { recordRepository } from "../data/repositories/recordRepository";
import { matchDocuments } from "./assistantLocal";
import { documentsByFormatNumber } from "./formatNumbers";
import { recordCoveringDate } from "./recordCrud";
import { isCorrectableStatus, isEditableStatus, reopenForCorrection, saveDraft } from "./recordLifecycle";
import { fieldLabels, normDate } from "./recordPatch";
import { withComputedCells } from "./computedCells";
import { mayDo } from "./departmentScope";
import { formatDisplayDate } from "../utils/date";

// THE RECORD A REQUEST IS ABOUT, AND HOW A CHANGE TO IT IS SAVED (REQUIREMENTS §113).
//
// Mitra's record tools (engine/mitraTools.ts) act on an AssistantTarget — the
// open record as its page registers it (store/AssistantContext.tsx). Two hosts
// have no page open: the engine host answering the phone (engineHost/entry.ts,
// whose targetFor / commitOn this is lifted from) and the website's Ask Mitra
// page (pages/AssistantPage.tsx), where "add a row to F-QC-30 of today" names
// the record in words. Here, once, is how the record named is found — the
// document by its number as its paper prints it, or by the words people use
// for it, the date by its own words — and how a change to a record no page is
// showing is committed exactly as that record's page would commit it: through
// saveDraft with the page's history labels, a correction through
// reopenForCorrection with the person's reason, below Edit never (§96).

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

/** Which of DCRS's pages a record opens on — and so which page's own commit saves a change to it. */
export type PageKind = "record" | "gap" | "training" | "complaint";

export function pageOf(doc: DocumentDefinition): PageKind | null {
  if (doc.isReferenceOnly) return null;
  if (doc.kind === "gap-inspection") return "gap";
  if (doc.kind === "training-record") return "training";
  if (doc.kind === "complaint-checklist") return "complaint";
  return "record";
}

/** The kind Mitra's patch checker is told the record is: what each page registers ("gap", "training", else the document's kind). */
export const patchKindOf = (doc: DocumentDefinition): string => (doc.kind === "gap-inspection" ? "gap" : doc.kind === "training-record" ? "training" : doc.kind);

/** The labels a record's history is written in: a log sheet's printed ones (pages/RecordPage.tsx); none on the other pages. */
export const labelsFor = (doc: DocumentDefinition, record: RecordInstance): Record<string, string> => (pageOf(doc) === "record" ? fieldLabels(doc.kind, doc.id, record) : {});

/**
 * Saves a change to the record's data exactly as its page's commit does (pages/RecordPage.tsx, GapPage.tsx,
 * TrainingPage.tsx, CapaPage.tsx): a log sheet with its computed cells, a checklist whole, the rest merged over
 * what is stored. False, and nothing written, when the record is no longer open for writing.
 */
export function commitRecord(doc: DocumentDefinition, recordId: string, next: unknown, note: string, action: "assistant-edit" | "imported", userName: string, opts: CommitOptions = {}): boolean {
  const base = recordRepository.getById(recordId);
  if (!base || !isEditableStatus(base.status)) return false;
  const page = pageOf(doc) ?? "record";
  const data = page === "record" ? withComputedCells(doc.id, next, base.data) : page === "complaint" ? next : { ...(isObj(base.data) ? base.data : {}), ...(isObj(next) ? next : {}) };
  const save = (b: RecordInstance): RecordInstance => saveDraft(b, data, userName, { action, note, ...(page === "record" ? { labels: labelsFor(doc, base) } : {}) });
  if (opts.save) opts.save(base, save);
  else recordRepository.upsert(save(base));
  return true;
}

export interface CommitOptions {
  /**
   * How the saved record is stored: the repository's upsert when left out. The engine host (engineHost/entry.ts
   * savedApart) stores it with a mark that keeps each change through the phone as its own history entry.
   */
  save?: (base: RecordInstance, save: (record: RecordInstance) => RecordInstance) => RecordInstance;
}

/** How a record is called in a sentence: "the Lamination Adhesive Viscosity Record of 11-Oct-2026". */
export const recordCalled = (doc: DocumentDefinition, record: Pick<RecordInstance, "dueDate">): string => `the ${doc.name} of ${formatDisplayDate(record.dueDate)}`;

/**
 * The record as Mitra's tools see it, for a change made where no page is showing it. `reopen` is handed over only
 * where the status allows a correction and the person's level does (Edit, §96), so a tool never offers one it
 * would then refuse; `correction` says the record is already open under correction.
 */
export function targetForRecord(doc: DocumentDefinition, record: RecordInstance, userName: string, opts: { bump?: () => void; noteFor?: (toolNote: string) => string } & CommitOptions = {}): AssistantTarget {
  const noteFor = opts.noteFor ?? ((n: string) => n);
  return {
    documentKind: patchKindOf(doc),
    documentId: doc.id,
    recordId: record.id,
    status: record.status,
    editable: isEditableStatus(record.status),
    correction: !!record.correction,
    currentData: record.data,
    getData: () => recordRepository.getById(record.id)?.data,
    labels: labelsFor(doc, record),
    commit: (next, toolNote, action) => {
      commitRecord(doc, record.id, next, noteFor(toolNote), action ?? "assistant-edit", userName, { save: opts.save });
      opts.bump?.();
    },
    reopen:
      isCorrectableStatus(record.status) && mayDo(doc.id, "correct")
        ? (reason) => {
            const base = recordRepository.getById(record.id);
            if (!base) return;
            recordRepository.upsert(reopenForCorrection(base, userName, reason));
            opts.bump?.();
          }
        : undefined,
    title: recordCalled(doc, record),
  };
}

// ---------------------------------------------------------------------------
// the record named in words

export type RecordResolution =
  | { kind: "found"; doc: DocumentDefinition; record: RecordInstance; target: AssistantTarget }
  /** A document was named but not one record: the question to put, in words the person (or the model) reads. */
  | { kind: "ask"; question: string; doc?: DocumentDefinition }
  /** No document named: nothing here is about a record. */
  | { kind: "none" };

const MONTHS = "jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec";
const DATE_WORDS = [
  /\b(today|yesterday|tomorrow)\b/i,
  /\b(\d{4}-\d{2}-\d{2})\b/,
  // 11/10/2026, 11-10-26, 11.10 — digits both sides, so a format number's "-30" is never a date.
  /\b(\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?)\b/,
  // 11-Oct, 11 Oct 2026, 11th October, Oct 11
  new RegExp(`\\b(\\d{1,2}(?:st|nd|rd|th)?[\\s-]*(?:${MONTHS})[a-z]*\\.?(?:[\\s,-]*\\d{4})?)\\b`, "i"),
  new RegExp(`\\b((?:${MONTHS})[a-z]*\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?(?:[\\s,]*\\d{4})?)\\b`, "i"),
];

/** The date the words name, as ISO — "of today", "11-Oct", "11/10/2026" — or null when they name none. */
export function dateInWords(words: string, today: string): string | null {
  for (const re of DATE_WORDS) {
    const m = words.match(re);
    if (!m) continue;
    const iso = normDate(m[1].replace(/(\d)(?:st|nd|rd|th)\b/i, "$1").replace(/-/g, " ").replace(/\s+/g, " "), today) ?? normDate(m[1], today);
    if (iso) return iso;
  }
  return null;
}

const called = (d: DocumentDefinition): string => (d.formatNo && !d.formatNo.startsWith("TO BE") ? `${d.formatNo} ${d.name}` : d.name);

/**
 * The document the words name: by its format number as its paper prints it ("F-QC-30" is the viscosity record,
 * "F/QC/30" the minutes; "F QC 30" could be either, and the person is asked which — REQUIREMENTS §111), else by the
 * words people use for it (engine/assistantLocal.ts DOC_KEYWORDS) when exactly one answers.
 */
export function documentInWords(words: string): { doc: DocumentDefinition } | { question: string } | null {
  const byNumber = documentsByFormatNumber(words);
  if (byNumber.length === 1) return { doc: byNumber[0] };
  if (byNumber.length > 1) {
    const lower = words.toLowerCase();
    const asPrinted = byNumber.filter((d) => lower.includes(d.formatNo.toLowerCase()));
    if (asPrinted.length === 1) return { doc: asPrinted[0] };
    return { question: `${byNumber.length} documents carry that number — which one: ${byNumber.map(called).join(", or ")}? Say its number as the paper prints it.` };
  }
  const ids = matchDocuments(words.toLowerCase())
    .map((id) => documentRepository.getById(id))
    .filter((d): d is DocumentDefinition => !!d);
  if (ids.length === 1) return { doc: ids[0] };
  if (ids.length > 1) return { question: `Which document: ${ids.slice(0, 6).map(called).join(", ")}? Say its format number.` };
  return null;
}

/**
 * THE RECORD A REQUEST IS ABOUT, from its words alone (the Ask Mitra page): the document and the date, then the
 * record covering that date — a scheduled document's sheet for the period, an as-required document's record of the
 * day. Without a date, with no record for it, or with several, Mitra asks rather than guesses.
 */
export function resolveRecordTarget(words: string, opts: { today: string; isDemo: boolean; userName: string; bump?: () => void }): RecordResolution {
  const named = documentInWords(words);
  if (!named) return { kind: "none" };
  if ("question" in named) return { kind: "ask", question: named.question };
  const doc = named.doc;
  if (!pageOf(doc)) return { kind: "ask", question: `${called(doc)} is kept as issued — there is no record of it to change.`, doc };
  const date = dateInWords(words, opts.today);
  if (!date) return { kind: "ask", question: `Which ${called(doc)}? Say its date — "of today", "of 11-Oct" — or open the record and ask me there.`, doc };
  const covering = recordCoveringDate(doc, date, opts.isDemo);
  const onDay = covering ? [covering] : (recordRepository.query({ documentId: doc.id, isDemo: opts.isDemo, dueDate: date }) as RecordInstance[]);
  if (onDay.length === 0) return { kind: "ask", question: `There is no ${called(doc)} for ${formatDisplayDate(date)} yet. Say "start one" and I will open it.`, doc };
  if (onDay.length > 1) return { kind: "ask", question: `${called(doc)} has ${onDay.length} records for ${formatDisplayDate(date)} — open the one you mean and ask me there.`, doc };
  const record = onDay[0];
  return { kind: "found", doc, record, target: targetForRecord(doc, record, opts.userName, { bump: opts.bump }) };
}
