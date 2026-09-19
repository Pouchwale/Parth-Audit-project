import type { DocumentDefinition, LogColumn, LogHeaderField, LogSheetLayout } from "../types";
import { DOCUMENT_TEXT_EN } from "./documentTextEn";
import type { Language } from "./strings";

// THE DOCUMENTS FOLLOW THE CHOSEN LANGUAGE (REQUIREMENTS §58).
//
// The language box beside Today's Briefing now decides the documents too, not
// only the screens around them:
//
//   ગુજરાતી chosen  every page is handed to Google's website translator —
//                   including the forms, the registers and their printed
//                   instructions (i18n/googleTranslate.ts). A form printed in
//                   Gujarati already reads in Gujarati and is left alone.
//   English chosen  Google is not loaded at all, so the three forms the
//                   department issues IN GUJARATI would otherwise stay
//                   Gujarati on an English screen. This file is their English:
//                   every printed word of theirs, rendered once, written down
//                   (documentTextEn.ts) rather than fetched from a service.
//
// What is NEVER rewritten, in either language: a record's own contents — the
// names signed, the readings typed, the dates, the format number and the
// revision. Those carry translate="no" where they are shown, so an auditor
// reading a record sees exactly what was written into it. This file only
// touches the words the PAPER prints: instructions, box labels, column
// headings, the parameter and material lines a form prints down its left, and
// the grade chart beside them.

/** The formats the department issues in Gujarati (REQUIREMENTS §57). */
export const GUJARATI_DOCUMENT_IDS: readonly string[] = ["qc-inprocess-printing", "qc-line-clearance-materials", "qc-line-clearance-quality"];

export const isGujaratiDocument = (documentId: string): boolean => GUJARATI_DOCUMENT_IDS.includes(documentId);

/**
 * True when this form must be kept away from Google's translator: it is
 * already written in the chosen language, and a controlled form reads as it
 * was issued. (With English chosen there is nothing to keep it from — Google
 * is not loaded at all — and the form reads from the English below.)
 */
export const keepFormAsIssued = (documentId: string, lang: Language): boolean => lang !== "en" && isGujaratiDocument(documentId);

/** A document's own name in the chosen language: the three Gujarati formats carry a Gujarati title. */
export const documentNameIn = (doc: Pick<DocumentDefinition, "name">, lang: Language): string => documentTextIn(doc.name, lang);

/**
 * One printed line, in the chosen language: the English rendering of a
 * Gujarati form's own text when English is chosen, and the text itself
 * otherwise. Anything that is not a printed line of one of those forms —
 * every typed value, every English form's text — is returned untouched.
 */
export function documentTextIn(text: string | number | null | undefined, lang: Language): string {
  if (text === null || text === undefined) return "";
  const s = String(text);
  if (lang !== "en") return s;
  return DOCUMENT_TEXT_EN[s] ?? s;
}

const en = (s: string): string => DOCUMENT_TEXT_EN[s] ?? s;

// ONLY THE WORDS THE PAPER PRINTS are rewritten, and they are named here one
// by one rather than found by walking the layout. What a layout also holds is
// record data — a choice box's options ("A", "B", "ACCEPTED"), the default a
// box starts with, the values of the supplied page kept as the specimen — and
// rewriting any of that would leave a saved record's value matching none of
// the choices, or put the display language into a new record.
const field = <T extends LogHeaderField>(f: T): T => ({ ...f, label: en(f.label) });
const column = (c: LogColumn): LogColumn => ({ ...c, label: en(c.label) });
type PrintedRow = Record<string, string | number | null>;
const row = (r: PrintedRow): PrintedRow => {
  const out: PrintedRow = { ...r };
  for (const [k, v] of Object.entries(r)) if (typeof v === "string") out[k] = en(v);
  return out;
};

function printedTextIn(layout: LogSheetLayout): LogSheetLayout {
  const out: LogSheetLayout = {
    ...layout,
    instructions: layout.instructions?.map(en),
    headerFields: layout.headerFields.map(field),
    columns: layout.columns.map(column),
    footerFields: layout.footerFields?.map(field),
    referenceTables: layout.referenceTables?.map((t) => ({ ...t, title: en(t.title), columns: t.columns.map(en), rows: t.rows.map((r) => r.map(en)) })),
    specimenSource: layout.specimenSource ? en(layout.specimenSource) : layout.specimenSource,
  };
  // The lines the form prints down its side are printed text, so they read in
  // the chosen language; they are also what a NEW record starts from, and that
  // comes from the layout as issued (engine/autoFill.ts reads it, not this).
  if (layout.rowMode.kind === "fixedRows") out.rowMode = { ...layout.rowMode, rows: layout.rowMode.rows.map(row) };
  return out;
}

// Rendered once per form, not once per render: a sheet of 15 lines × 5 columns
// asked for its layout on every keystroke (REQUIREMENTS §56).
const cache = new Map<string, { issued: LogSheetLayout; read: LogSheetLayout }>();

/**
 * A form's layout as it should READ in the chosen language. The same object is
 * returned for every other form and for Gujarati, so nothing is copied for the
 * documents this does not apply to.
 */
export function documentLayoutIn<T extends LogSheetLayout | undefined>(layout: T, lang: Language): T {
  if (!layout || lang !== "en" || !isGujaratiDocument(layout.documentId)) return layout;
  // Remembered for THIS layout: a format the plant has since changed is a
  // different object and is rendered afresh (data/formatEdits.ts).
  const hit = cache.get(layout.documentId);
  if (hit && hit.issued === layout) return hit.read as T;
  const out = printedTextIn(layout);
  cache.set(layout.documentId, { issued: layout, read: out });
  return out as T;
}
