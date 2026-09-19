import type { DocumentDefinition, LogColumn, LogFieldType, LogHeaderField, LogSheetLayout } from "../types";
import { getLogSheetLayout } from "../data/seed/logSheetLayouts";
import { SEED_DOCUMENTS } from "../data/seed/documentDefinitions";
import { dropFormatEdit, formatEditFor, nextRevisionNo, saveFormatEdit, type FormatRevision } from "../data/formatEdits";
import { logActivity } from "../utils/activityLog";
import { todayISO } from "../utils/date";

// WHAT CAN BE DONE TO A FORMAT, AND THE ONE WAY A CHANGE IS SAVED
// (REQUIREMENTS §62, §64).
//
// Three things change a format: the Edit format dialog
// (components/documents/FormatEditor.tsx), designing it on the sheet itself
// the way a spreadsheet is edited (components/documents/SheetDesigner.tsx), and
// telling Mitra in words — "add a column Batch No. after Remarks", "delete the
// line Special ink" (engine/formatCommands.ts). All three work on a DRAFT with
// the operations below, which are pure — each returns a new layout and touches
// nothing — and all three save through commitFormatChange, so however a format
// was changed it gets one revision, dated, with who, what and why, and one line
// in the activity log.
//
// KEYS ARE NEVER RENAMED OR REUSED. A record on file keeps every value under
// the key it was written with; a column taken off a format is simply not drawn
// any more, and one added is blank on the older records. So a new box or column
// gets a key nothing else has ever had on this layout, and renaming changes the
// label only.

/** A format being changed: its name, and its layout when the layout is what draws it. */
export interface FormatDraft {
  name: string;
  /** Absent for a form the program draws by hand — its name and revision are all that can change here. */
  layout?: LogSheetLayout;
}

export type BoxArea = "header" | "footer";

export const FIELD_TYPE_LABELS: Record<LogFieldType, string> = { text: "Text", number: "Number", date: "Date", time: "Time", yesno: "Yes / No", select: "Choice" };

/** Whether this format's grid is drawn from a layout, and so can be designed on the sheet. */
export function canDesignGrid(doc: Pick<DocumentDefinition, "id" | "kind">): boolean {
  return doc.kind === "log-sheet" && !!getLogSheetLayout(doc.id);
}

/** The format as it stands now, ready to be changed. */
export function draftOf(doc: DocumentDefinition): FormatDraft {
  return { name: doc.name, layout: doc.kind === "log-sheet" ? getLogSheetLayout(doc.id) : undefined };
}

// ---------------------------------------------------------------------------
// keys

const slug = (label: string): string => {
  const words = label.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").trim().split(/\s+/).filter(Boolean).slice(0, 4);
  return words.map((w, i) => (i === 0 ? w : w[0].toUpperCase() + w.slice(1))).join("") || "field";
};

const allKeys = (layout: LogSheetLayout): Set<string> => new Set([...layout.headerFields, ...layout.columns, ...(layout.footerFields ?? [])].map((x) => x.key));

let minted = 0;

/**
 * A key for a new box or column that nothing on this format has EVER had.
 *
 * The words alone would not do: take "Remarks" off in Rev 02 and add a
 * "Remarks" in Rev 03 and the new column would get the old key — and show, on
 * every record written before, what was entered under the old one. Looking the
 * key up in the format's past would not do either, because "Restore the issued
 * format" throws that past away. So a key carries the moment it was made, which
 * never comes again: `remarks_mfk2p9c0`. The label is all anybody ever sees.
 */
export function newKey(layout: LogSheetLayout, label: string): string {
  const taken = allKeys(layout);
  // "id" is what a row is told apart by (LogSheetRow.id), so no column may take it.
  taken.add("id");
  const base = slug(label);
  let key: string;
  do key = `${base}_${Date.now().toString(36)}${(minted++).toString(36)}`;
  while (taken.has(key));
  return key;
}

/** "Remarks" → "Remarks (2)", "Remarks (2)" → "Remarks (3)" — a name no other item in `labels` has. */
export function copyLabel(label: string, labels: string[]): string {
  const base = label.replace(/\s*\(\d+\)$/, "");
  let n = 2;
  while (labels.includes(`${base} (${n})`)) n++;
  return `${base} (${n})`;
}

// ---------------------------------------------------------------------------
// columns

/** `item` put after `afterKey`, or before `beforeKey`, or at the end when neither is on the list. */
function placed<T extends { key: string }>(list: T[], item: T, where?: { afterKey?: string; beforeKey?: string }): T[] {
  let at = list.length;
  const after = where?.afterKey ? list.findIndex((x) => x.key === where.afterKey) : -1;
  const before = where?.beforeKey ? list.findIndex((x) => x.key === where.beforeKey) : -1;
  if (after >= 0) at = after + 1;
  else if (before >= 0) at = before;
  return [...list.slice(0, at), item, ...list.slice(at)];
}

export interface NewItemOptions {
  type?: LogFieldType;
  options?: string[];
  required?: boolean;
  afterKey?: string;
  beforeKey?: string;
}

export function addColumn(layout: LogSheetLayout, label: string, opts: NewItemOptions = {}): { layout: LogSheetLayout; key: string } {
  const key = newKey(layout, label);
  const column: LogColumn = { key, label: label.trim(), type: opts.type ?? "text", ...(opts.options?.length ? { options: opts.options } : {}), ...(opts.required ? { required: true } : {}) };
  return { layout: { ...layout, columns: placed(layout.columns, column, opts) }, key };
}

/** A copy of a column, beside it. A printed column's printed words are copied down its lines with it. */
export function duplicateColumn(layout: LogSheetLayout, key: string): { layout: LogSheetLayout; key: string } | null {
  const source = layout.columns.find((c) => c.key === key);
  if (!source) return null;
  const label = copyLabel(source.label, layout.columns.map((c) => c.label));
  const copyKey = newKey(layout, label);
  // Worked-out columns are worked out by key (engine/calibration.ts), so a copy is an ordinary column.
  const { computed: _computed, fixed: printed, ...rest } = source;
  void _computed;
  // Only a form that prints its lines has printed words to copy down them. On any other
  // sheet a copy that stayed "printed" would be a column nobody could ever write in.
  const keepsPrinted = !!printed && layout.rowMode.kind === "fixedRows";
  const copy: LogColumn = { ...rest, ...(keepsPrinted ? { fixed: true } : {}), key: copyKey, label };
  let next: LogSheetLayout = { ...layout, columns: placed(layout.columns, copy, { afterKey: key }) };
  if (keepsPrinted && layout.rowMode.kind === "fixedRows") {
    next = { ...next, rowMode: { ...layout.rowMode, rows: layout.rowMode.rows.map((r) => ({ ...r, [copyKey]: r[key] ?? "" })) } };
  }
  return { layout: next, key: copyKey };
}

export function removeColumn(layout: LogSheetLayout, key: string): LogSheetLayout {
  const next: LogSheetLayout = { ...layout, columns: layout.columns.filter((c) => c.key !== key) };
  if (layout.rowMode.kind !== "fixedRows") return next;
  return {
    ...next,
    rowMode: {
      ...layout.rowMode,
      rows: layout.rowMode.rows.map((r) => {
        const { [key]: _gone, ...rest } = r;
        void _gone;
        return rest;
      }),
    },
  };
}

const patchColumn = (layout: LogSheetLayout, key: string, patch: Partial<LogColumn>): LogSheetLayout => ({ ...layout, columns: layout.columns.map((c) => (c.key === key ? { ...c, ...patch } : c)) });

export const renameColumn = (layout: LogSheetLayout, key: string, label: string): LogSheetLayout => patchColumn(layout, key, { label: label.trim() });

export function setColumnType(layout: LogSheetLayout, key: string, type: LogFieldType, options?: string[]): LogSheetLayout {
  return patchColumn(layout, key, { type, options: type === "select" ? (options ?? layout.columns.find((c) => c.key === key)?.options ?? []) : undefined });
}

export const setColumnRequired = (layout: LogSheetLayout, key: string, required: boolean): LogSheetLayout => patchColumn(layout, key, { required: required || undefined });

function moved<T extends { key: string }>(list: T[], key: string, by: number): T[] {
  const i = list.findIndex((x) => x.key === key);
  const j = i + by;
  if (i < 0 || j < 0 || j >= list.length) return list;
  const next = list.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

export const moveColumn = (layout: LogSheetLayout, key: string, by: number): LogSheetLayout => ({ ...layout, columns: moved(layout.columns, key, by) });

// ---------------------------------------------------------------------------
// the boxes above and below the grid

const boxesOf = (layout: LogSheetLayout, area: BoxArea): LogHeaderField[] => (area === "header" ? layout.headerFields : (layout.footerFields ?? []));

function withBoxes(layout: LogSheetLayout, area: BoxArea, boxes: LogHeaderField[]): LogSheetLayout {
  return area === "header" ? { ...layout, headerFields: boxes } : { ...layout, footerFields: boxes.length ? boxes : undefined };
}

export function addBox(layout: LogSheetLayout, area: BoxArea, label: string, opts: NewItemOptions = {}): { layout: LogSheetLayout; key: string } {
  const key = newKey(layout, label);
  const box: LogHeaderField = { key, label: label.trim(), type: opts.type ?? "text", ...(opts.options?.length ? { options: opts.options } : {}), ...(opts.required ? { required: true } : {}) };
  return { layout: withBoxes(layout, area, placed(boxesOf(layout, area), box, opts)), key };
}

export function duplicateBox(layout: LogSheetLayout, area: BoxArea, key: string): { layout: LogSheetLayout; key: string } | null {
  const boxes = boxesOf(layout, area);
  const source = boxes.find((b) => b.key === key);
  if (!source) return null;
  const label = copyLabel(source.label, boxes.map((b) => b.label));
  const copyKey = newKey(layout, label);
  return { layout: withBoxes(layout, area, placed(boxes, { ...source, key: copyKey, label }, { afterKey: key })), key: copyKey };
}

export const removeBox = (layout: LogSheetLayout, area: BoxArea, key: string): LogSheetLayout => withBoxes(layout, area, boxesOf(layout, area).filter((b) => b.key !== key));

export const renameBox = (layout: LogSheetLayout, area: BoxArea, key: string, label: string): LogSheetLayout =>
  withBoxes(layout, area, boxesOf(layout, area).map((b) => (b.key === key ? { ...b, label: label.trim() } : b)));

export const setBoxType = (layout: LogSheetLayout, area: BoxArea, key: string, type: LogFieldType, options?: string[]): LogSheetLayout =>
  withBoxes(layout, area, boxesOf(layout, area).map((b) => (b.key === key ? { ...b, type, options: type === "select" ? (options ?? b.options ?? []) : undefined } : b)));

export const moveBox = (layout: LogSheetLayout, area: BoxArea, key: string, by: number): LogSheetLayout => withBoxes(layout, area, moved(boxesOf(layout, area), key, by));

// ---------------------------------------------------------------------------
// the lines a form prints down its side (rowMode "fixedRows" only — on any
// other sheet the lines are what a person writes, which is the record's, not
// the format's)

export type PrintedRow = Record<string, string | number | null>;

export const printedRowsOf = (layout: LogSheetLayout): PrintedRow[] | null => (layout.rowMode.kind === "fixedRows" ? layout.rowMode.rows : null);

function withPrintedRows(layout: LogSheetLayout, rows: PrintedRow[]): LogSheetLayout {
  return layout.rowMode.kind === "fixedRows" ? { ...layout, rowMode: { ...layout.rowMode, rows } } : layout;
}

/** A new printed line at `index` (the end when left out). */
export function addPrintedRow(layout: LogSheetLayout, index?: number, values: PrintedRow = {}): LogSheetLayout {
  const rows = printedRowsOf(layout);
  if (!rows) return layout;
  const blank: PrintedRow = {};
  for (const c of layout.columns) if (c.fixed) blank[c.key] = "";
  const at = index === undefined ? rows.length : Math.max(0, Math.min(index, rows.length));
  return withPrintedRows(layout, [...rows.slice(0, at), { ...blank, ...values }, ...rows.slice(at)]);
}

export function duplicatePrintedRow(layout: LogSheetLayout, index: number): LogSheetLayout {
  const rows = printedRowsOf(layout);
  return rows && rows[index] ? withPrintedRows(layout, [...rows.slice(0, index + 1), { ...rows[index] }, ...rows.slice(index + 1)]) : layout;
}

export function removePrintedRow(layout: LogSheetLayout, index: number): LogSheetLayout {
  const rows = printedRowsOf(layout);
  return rows ? withPrintedRows(layout, rows.filter((_, i) => i !== index)) : layout;
}

export function movePrintedRow(layout: LogSheetLayout, index: number, by: number): LogSheetLayout {
  const rows = printedRowsOf(layout);
  const j = index + by;
  if (!rows || j < 0 || j >= rows.length) return layout;
  const next = rows.slice();
  [next[index], next[j]] = [next[j], next[index]];
  return withPrintedRows(layout, next);
}

/** The printed words of one cell of one printed line. */
export function setPrintedCell(layout: LogSheetLayout, index: number, key: string, value: string): LogSheetLayout {
  const rows = printedRowsOf(layout);
  return rows ? withPrintedRows(layout, rows.map((r, i) => (i === index ? { ...r, [key]: value } : r))) : layout;
}

export const setInstructions = (layout: LogSheetLayout, lines: string[]): LogSheetLayout => {
  const kept = lines.map((l) => l.trim()).filter(Boolean);
  return { ...layout, instructions: kept.length ? kept : undefined };
};

// ---------------------------------------------------------------------------
// what changed, in words

type Item = LogHeaderField | LogColumn;

function describeItems(what: string, before: Item[], after: Item[]): string[] {
  const out: string[] = [];
  const was = new Map(before.map((b) => [b.key, b]));
  const now = new Map(after.map((a) => [a.key, a]));
  for (const a of after) {
    const b = was.get(a.key);
    if (!b) out.push(`added ${what} “${a.label}”`);
    else {
      if (b.label !== a.label) out.push(`renamed ${what} “${b.label}” to “${a.label}”`);
      if (b.type !== a.type) out.push(`${what} “${a.label}” is now ${FIELD_TYPE_LABELS[a.type] ?? a.type}`);
      if (!!b.required !== !!a.required) out.push(`${what} “${a.label}” is ${a.required ? "now required" : "no longer required"}`);
      if ((b.options ?? []).join("|") !== (a.options ?? []).join("|")) out.push(`changed the choices of ${what} “${a.label}”`);
    }
  }
  for (const b of before) if (!now.has(b.key)) out.push(`removed ${what} “${b.label}”`);
  const kept = after.filter((a) => was.has(a.key)).map((a) => a.key);
  const keptBefore = before.filter((b) => now.has(b.key)).map((b) => b.key);
  if (kept.join("|") !== keptBefore.join("|")) out.push(`reordered the ${what}${what.endsWith("x") ? "es" : "s"}`);
  return out;
}

/** Every difference between two states of a format, as the change history words it. Empty when nothing differs. */
export function describeFormatChange(before: FormatDraft, after: FormatDraft): string[] {
  const out: string[] = [];
  if (after.name.trim() !== before.name) out.push(`renamed the format from “${before.name}” to “${after.name.trim()}”`);
  const a = before.layout;
  const b = after.layout;
  if (!a || !b) return out;
  out.push(...describeItems("box", a.headerFields, b.headerFields));
  out.push(...describeItems("column", a.columns, b.columns));
  out.push(...describeItems("footer box", a.footerFields ?? [], b.footerFields ?? []));
  if ((a.instructions ?? []).join("\n") !== (b.instructions ?? []).join("\n")) out.push("reworded the printed instructions");
  const rowsA = printedRowsOf(a);
  const rowsB = printedRowsOf(b);
  if (rowsA && rowsB && JSON.stringify(rowsA) !== JSON.stringify(rowsB)) {
    out.push(rowsA.length === rowsB.length ? "reworded the printed lines" : `changed the printed lines (${rowsA.length} → ${rowsB.length})`);
  }
  return out;
}

// ---------------------------------------------------------------------------
// saving a change — the only way one is saved

export type CommitResult = { ok: true; revision: FormatRevision } | { ok: false; error: string };

export function validateDraft(draft: FormatDraft): string | null {
  if (!draft.name.trim()) return "The format needs a name.";
  const l = draft.layout;
  if (!l) return null;
  if ([...l.headerFields, ...l.columns, ...(l.footerFields ?? [])].some((x) => !x.label.trim())) return "Every box and column needs a name.";
  if (l.columns.length === 0) return "A sheet needs at least one column.";
  return null;
}

/**
 * Saves `draft` as the format's next revision: numbered (the next one, unless
 * `revisionNo` says otherwise), dated today, with who changed what and why at
 * the head of its change history, and a line in the activity log. Refused,
 * with the reason, when nothing has changed or something is missing.
 */
export function commitFormatChange(doc: DocumentDefinition, draft: FormatDraft, opts: { actor: string; reason: string; revisionNo?: string }): CommitResult {
  const invalid = validateDraft(draft);
  if (invalid) return { ok: false, error: invalid };
  if (!opts.reason.trim()) return { ok: false, error: "Say why the format is changing — it goes in its change history." };
  const summary = describeFormatChange(draftOf(doc), draft);
  if (summary.length === 0) return { ok: false, error: "Nothing about the format has been changed yet." };
  const revisionNo = (opts.revisionNo ?? nextRevisionNo(doc.revisionNo)).trim();
  if (!revisionNo) return { ok: false, error: "Give the new revision number." };

  const existing = formatEditFor(doc.id);
  const issued = SEED_DOCUMENTS.find((d) => d.id === doc.id);
  const today = todayISO();
  const at = new Date().toISOString();
  const revision: FormatRevision = { id: revisionId({ at, by: opts.actor, revisionNo }), revisionNo, revisionDate: today, by: opts.actor, at, reason: opts.reason.trim(), summary: summary.join("; ") };
  const stored = saveFormatEdit(doc.id, {
    revisionNo,
    revisionDate: today,
    name: draft.name.trim() !== (issued?.name ?? doc.name) ? draft.name.trim() : undefined,
    layout: draft.layout ?? existing?.layout,
    // Every entry carries an id, so two people's saves MERGE into one history
    // (data/serverSync.ts merges a list by id) instead of one list replacing the other.
    revisions: [revision, ...(existing?.revisions ?? []).map((r) => (r.id ? r : { ...r, id: revisionId(r) }))],
  });
  if (!stored) return { ok: false, error: "The change could not be stored." };
  const number = doc.formatNo.startsWith("TO BE") ? "" : `${doc.formatNo} `;
  logActivity("Format changed", `${number}${draft.name.trim()}`, `Rev ${doc.revisionNo} → ${revisionNo}: ${revision.summary}. Reason: ${revision.reason}`, doc.id);
  return { ok: true, revision };
}

/** The same id whichever browser works it out, so an entry from before ids existed is one entry everywhere. */
const revisionId = (r: Pick<FormatRevision, "at" | "by" | "revisionNo">): string => `${r.at}|${r.by}|${r.revisionNo}`;

/** Drops the plant's change: the format is the paper's own transcription again, at its own revision. */
export function restoreIssuedFormat(doc: DocumentDefinition): boolean {
  if (!formatEditFor(doc.id)) return false;
  const issued = SEED_DOCUMENTS.find((d) => d.id === doc.id);
  dropFormatEdit(doc.id);
  const number = doc.formatNo.startsWith("TO BE") ? "" : `${doc.formatNo} `;
  logActivity("Format restored to the issued one", `${number}${issued?.name ?? doc.name}`, `Rev ${doc.revisionNo} → ${issued?.revisionNo ?? ""}`, doc.id);
  return true;
}
