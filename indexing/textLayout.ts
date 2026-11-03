// THE WORDS A FORMAT PRINTS, AND WHERE THEY SIT — CHANGED FROM INDEXING (the owner, 30-Oct-2026).
//
// Every format is fully editable from the index: the super admin opens a format, clicks any printed word on the sheet
// and types it new, hides it, makes it bold or bigger or smaller, lines it up left / centre / right, or drags it (or
// nudges it with the arrows) to where it should sit. indexing/TextDesigner.tsx is that screen; indexing/paperTextLayer.ts
// lays the saved changes over the sheet wherever the format is drawn — on screen, in print and in the downloads.
//
// One change is known by the words as the format prints them (`orig`), the place on the sheet they are printed in
// (`path`: the chain of elements above them), and which of the same words in the same place it is (`occ`, 0 = the
// first). That is what lets the same thing work for every kind of format — a log sheet, a certificate, a pest
// control register — without each one being rebuilt.
//
// SAVED AS AN INDEX VERSION like every other change (indexing/indexActions.ts), so it can be compared, restored and
// reset to the issued format. A SIGNED RECORD KEEPS THE WORDS IT WAS SIGNED WITH: each format's changes have a
// timeline, and a record is drawn with the ones in force when it was submitted (data-format-asof on its sheet).

import { readIndexState, type IndexState } from "./indexState";

export type TextAlign = "left" | "center" | "right";

export interface TextEdit {
  /** The words as the format prints them as issued. */
  orig: string;
  /** Where on the sheet they are printed (paperTextLayer.ts pathOf). */
  path: string;
  /** Which of the same words in the same place (0 = the first). */
  occ: number;
  /** The new words; "" hides them. Absent: the words stay as issued. */
  text?: string;
  /** Moved by this many pixels (on an A4 sheet as drawn). */
  dx?: number;
  dy?: number;
  align?: TextAlign;
  bold?: boolean;
  /** Size in per cent of the issued size (100 = as issued). */
  size?: number;
}

/** A format's text changes from a moment on (null = back to the issued words). */
export interface TextEntry {
  edits: TextEdit[] | null;
  since: string;
  by: string;
  version: number;
}

export const textEditId = (e: Pick<TextEdit, "orig" | "path" | "occ">): string => `${e.path}|${e.orig}|${e.occ}`;

/** A change that changes nothing (every value as issued) is no change. */
export function isEmptyEdit(e: TextEdit): boolean {
  return (e.text === undefined || e.text === e.orig) && !e.dx && !e.dy && !e.align && !e.bold && (e.size === undefined || e.size === 100);
}

/** The edits tidied: no empty ones, no duplicates (the last wins), in a steady order — what is stored and compared. */
export function cleanEdits(edits: readonly TextEdit[]): TextEdit[] {
  const byId = new Map<string, TextEdit>();
  for (const e of edits) {
    const clean: TextEdit = { orig: e.orig, path: e.path, occ: e.occ };
    if (e.text !== undefined && e.text !== e.orig) clean.text = e.text;
    if (e.dx) clean.dx = Math.round(e.dx);
    if (e.dy) clean.dy = Math.round(e.dy);
    if (e.align) clean.align = e.align;
    if (e.bold) clean.bold = true;
    if (e.size !== undefined && e.size !== 100) clean.size = Math.round(e.size);
    if (isEmptyEdit(clean)) byId.delete(textEditId(clean));
    else byId.set(textEditId(clean), clean);
  }
  return [...byId.values()].sort((a, b) => textEditId(a).localeCompare(textEditId(b)));
}

export const sameEdits = (a: readonly TextEdit[] | null | undefined, b: readonly TextEdit[] | null | undefined): boolean =>
  JSON.stringify(cleanEdits(a ?? [])) === JSON.stringify(cleanEdits(b ?? []));

/** The text changes of a format in force at `asOf` (now when not given); [] when it prints as issued. */
export function textEditsFor(documentId: string, asOf?: string, state: IndexState = readIndexState()): TextEdit[] {
  const timeline = state.texts?.[documentId];
  if (!timeline || timeline.length === 0) return [];
  const when = asOf || new Date().toISOString();
  let found: TextEntry | undefined;
  for (const e of timeline) if (e.since <= when) found = e;
  return found?.edits ?? [];
}

/** One change in words, for the version's change list: `"Checked By" → "Verified By"; moved 12px right; bold`. */
export function describeTextEdit(e: TextEdit): string {
  const parts: string[] = [];
  if (e.text !== undefined && e.text !== e.orig) parts.push(e.text === "" ? "hidden" : `→ "${e.text}"`);
  if (e.dx) parts.push(`moved ${Math.abs(e.dx)}px ${e.dx > 0 ? "right" : "left"}`);
  if (e.dy) parts.push(`moved ${Math.abs(e.dy)}px ${e.dy > 0 ? "down" : "up"}`);
  if (e.align) parts.push(`aligned ${e.align === "center" ? "centre" : e.align}`);
  if (e.bold) parts.push("bold");
  if (e.size !== undefined && e.size !== 100) parts.push(`size ${e.size}%`);
  return parts.join("; ");
}

/** Each difference between two sets of changes of one format: [the words, before, after]. */
export function diffEdits(before: readonly TextEdit[], after: readonly TextEdit[]): { words: string; before: string; after: string }[] {
  const a = new Map(cleanEdits(before).map((e) => [textEditId(e), e]));
  const b = new Map(cleanEdits(after).map((e) => [textEditId(e), e]));
  const out: { words: string; before: string; after: string }[] = [];
  for (const id of new Set([...a.keys(), ...b.keys()])) {
    const ea = a.get(id);
    const eb = b.get(id);
    const da = ea ? describeTextEdit(ea) : "as issued";
    const db = eb ? describeTextEdit(eb) : "as issued";
    if (da !== db) out.push({ words: `"${(ea ?? eb)!.orig}"${(ea ?? eb)!.occ ? ` (#${(ea ?? eb)!.occ + 1})` : ""}`, before: da, after: db });
  }
  return out;
}
