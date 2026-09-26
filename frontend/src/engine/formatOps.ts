import type { DocumentDefinition, LogColumn, LogFieldType, LogHeaderField, LogSheetLayout } from "../types";
import { getLogSheetLayout } from "../data/seed/logSheetLayouts";
import { SEED_DOCUMENTS } from "../data/seed/documentDefinitions";
import { dropFormatEdit, formatEditFor, nextRevisionNo, saveFormatEdit, type FormatRevision } from "../data/formatEdits";
import { COMPANY } from "../data/seed/masterData";
import { logActivity } from "../utils/activityLog";
import { formatDisplayDate, todayISO } from "../utils/date";

// WHAT CAN BE DONE TO A FORMAT, AND THE ONE WAY A CHANGE IS SAVED
// (REQUIREMENTS §62, §64, §68).
//
// §68 added the PROSE side: the words a form prints above its grid are changed
// a line at a time (setInstructionLine and the three beside it), a box can be
// a block of prose rather than a line (BOX_TYPES), and the heading the paper
// draws over a run of columns is named, renamed and taken off (setColumnGroup,
// setGroupName). All of it goes down the same road as everything else.
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

/**
 * A format being changed: its name, its layout when the layout is what draws
 * it, and — since REQUIREMENTS §77 — the rest of what its header prints: the
 * company's name, the format number, the revision the change is saved as and
 * the date that revision carries. Each of those is absent where it is not
 * being changed.
 */
export interface FormatDraft {
  name: string;
  /** Absent for a form the program draws by hand — its name and revision are all that can change here. */
  layout?: LogSheetLayout;
  /** The company name the header prints; absent, the registered name (COMPANY.name). */
  companyName?: string;
  formatNo?: string;
  /** The revision number on the header: the format's own until it is typed over, when it is the number the change is saved as. */
  revisionNo?: string;
  /** The date the header prints for that revision (ISO); today when absent. */
  revisionDate?: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The parts of the header block a format's designer — or Mitra, told in words — can change (REQUIREMENTS §77). */
export type HeaderField = "companyName" | "title" | "formatNo" | "revisionNo" | "revisionDate";

/** The company name a format's header prints: the one set on it, else the registered name. */
export const printedCompanyName = (doc: Pick<DocumentDefinition, "companyName">): string => doc.companyName ?? COMPANY.name;

export type BoxArea = "header" | "footer";

export const FIELD_TYPE_LABELS: Record<LogFieldType, string> = { text: "Text", number: "Number", date: "Date", time: "Time", yesno: "Yes / No", select: "Choice", paragraph: "Paragraph" };

/** What a box above or below the grid can be — every type there is, prose among them (REQUIREMENTS §68). */
export const BOX_TYPES = Object.keys(FIELD_TYPE_LABELS) as LogFieldType[];
/** What a COLUMN can be. A grid cell is one line and the paper draws a prose block the width of the page, so a paragraph is never a column (types/logSheet.ts). */
export const COLUMN_TYPES = BOX_TYPES.filter((t) => t !== "paragraph");

/** Whether this format's grid is drawn from a layout, and so can be designed on the sheet. */
export function canDesignGrid(doc: Pick<DocumentDefinition, "id" | "kind">): boolean {
  return doc.kind === "log-sheet" && !!getLogSheetLayout(doc.id);
}

/** The format as it stands now, ready to be changed. */
export function draftOf(doc: DocumentDefinition): FormatDraft {
  return {
    name: doc.name,
    layout: doc.kind === "log-sheet" ? getLogSheetLayout(doc.id) : undefined,
    companyName: doc.companyName,
    formatNo: doc.formatNo,
    revisionNo: doc.revisionNo,
    revisionDate: doc.revisionDate ?? undefined,
  };
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
// the heading the paper draws OVER a run of columns (REQUIREMENTS §68)
//
// The List of Approved Suppliers prints "METHOD OF APPROVAL" across its five
// tick columns, and the grid draws a second heading row for them
// (LogColumn.group). A column is put under such a heading or taken out of it
// one at a time; the heading ITSELF is reworded by its words, because a
// heading the form prints twice — F/PUR/03 redraws it on its second page — is
// the one heading, not two.

export const setColumnGroup = (layout: LogSheetLayout, key: string, group?: string): LogSheetLayout => patchColumn(layout, key, { group: group?.trim() || undefined });

/** Every column under the spanning heading `from` put under `to` — or taken out of it when `to` is left out. */
export function setGroupName(layout: LogSheetLayout, from: string, to?: string): LogSheetLayout {
  const want = to?.trim() || undefined;
  if (!layout.columns.some((c) => c.group === from)) return layout;
  return { ...layout, columns: layout.columns.map((c) => (c.group === from ? { ...c, group: want } : c)) };
}

/** The spanning headings this grid draws, in the order they are printed. */
export function groupNames(layout: LogSheetLayout): string[] {
  const out: string[] = [];
  for (const c of layout.columns) if (c.group && !out.includes(c.group)) out.push(c.group);
  return out;
}

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

// ---------------------------------------------------------------------------
// the words the form PRINTS above its grid, a line at a time (REQUIREMENTS §68)
//
// `instructions` is the prose a format prints: the Supplier Registration
// Form's "Please provide following documents along with this form." and the
// five documents listed under it, the note that the boxes at the foot are the
// office's. Rewording one of those is not retyping the block — a printed line
// is changed where it stands, the way a column heading is, so each rewording,
// each line added, moved or taken off is ONE step to undo and shows in the
// change history as itself.

export const instructionsOf = (layout: LogSheetLayout): string[] => layout.instructions ?? [];

// A form has no way to print a blank line, so one never reaches the layout.
function withInstructionLines(layout: LogSheetLayout, lines: string[]): LogSheetLayout {
  const kept = lines.map((l) => l.trim()).filter(Boolean);
  return { ...layout, instructions: kept.length ? kept : undefined };
}

/** The whole block at once — the Edit format dialog's textarea, and the sheet's "reword them all". */
export const setInstructions = (layout: LogSheetLayout, lines: string[]): LogSheetLayout => withInstructionLines(layout, lines);

/** One printed line reworded. Rubbed out it stays as it was: a line comes off the form by being deleted, which asks first. */
export function setInstructionLine(layout: LogSheetLayout, index: number, text: string): LogSheetLayout {
  const lines = instructionsOf(layout);
  // The same words again are not a change: nothing to undo, nothing to list.
  if (lines[index] === undefined || !text.trim() || lines[index] === text.trim()) return layout;
  return withInstructionLines(layout, lines.map((l, i) => (i === index ? text : l)));
}

/** A printed line at `index` (the end when left out). */
export function addInstructionLine(layout: LogSheetLayout, index: number | undefined, text: string): LogSheetLayout {
  if (!text.trim()) return layout;
  const lines = instructionsOf(layout);
  const at = index === undefined ? lines.length : Math.max(0, Math.min(index, lines.length));
  return withInstructionLines(layout, [...lines.slice(0, at), text, ...lines.slice(at)]);
}

export function removeInstructionLine(layout: LogSheetLayout, index: number): LogSheetLayout {
  const lines = instructionsOf(layout);
  return lines[index] === undefined ? layout : withInstructionLines(layout, lines.filter((_, i) => i !== index));
}

export function moveInstructionLine(layout: LogSheetLayout, index: number, by: number): LogSheetLayout {
  const lines = instructionsOf(layout);
  const j = index + by;
  if (lines[index] === undefined || j < 0 || j >= lines.length) return layout;
  const next = lines.slice();
  [next[index], next[j]] = [next[j], next[index]];
  return withInstructionLines(layout, next);
}

// ---------------------------------------------------------------------------
// what changed, in words

type Item = LogHeaderField | LogColumn;

/** A printed line can be a paragraph long; the change history says which line it is, not the whole of it. */
const short = (text: string): string => (text.length > 60 ? `${text.slice(0, 57)}…` : text);

/**
 * THE PRINTED WORDS, LINE BY LINE (REQUIREMENTS §68). Two states of a block of
 * prose say nothing about which step made them, so each difference is named
 * for what it IS. A line is known by its words — the same words are the same
 * line — so one rewording names that one line and leaves the rest unsaid,
 * instead of the whole block being called "reworded".
 */
function describeInstructions(before: string[], after: string[]): string[] {
  if (before.join("\n") === after.join("\n")) return [];
  const out: string[] = [];
  const tally = (list: string[]): Map<string, number> => {
    const m = new Map<string, number>();
    for (const l of list) m.set(l, (m.get(l) ?? 0) + 1);
    return m;
  };
  const take = (m: Map<string, number>, line: string): boolean => {
    const n = m.get(line) ?? 0;
    if (n === 0) return false;
    m.set(line, n - 1);
    return true;
  };
  // A line on both sides is the same line; what is left over on each side was
  // added or taken off — and one of each is a line REWORDED, which is what a
  // person nearly always did.
  const inAfter = tally(after);
  const inBefore = tally(before);
  type Line = { line: string; index: number };
  const keptBefore: Line[] = [];
  const gone: Line[] = [];
  before.forEach((line, index) => (take(inAfter, line) ? keptBefore : gone).push({ line, index }));
  const keptAfter: Line[] = [];
  const fresh: Line[] = [];
  after.forEach((line, index) => (take(inBefore, line) ? keptAfter : fresh).push({ line, index }));
  const pairs = Math.min(gone.length, fresh.length);
  for (let i = 0; i < pairs; i++) out.push(`reworded line ${fresh[i].index + 1} of the printed instructions, from “${short(gone[i].line)}” to “${short(fresh[i].line)}”`);
  for (const f of fresh.slice(pairs)) out.push(`added line ${f.index + 1} to the printed instructions: “${short(f.line)}”`);
  for (const g of gone.slice(pairs)) out.push(`took line ${g.index + 1}, “${short(g.line)}”, off the printed instructions`);

  // A line that kept its words but changed its PLACE was moved. Its place is
  // counted among the lines that stayed, so a line added at the top does not
  // read as every line below it moving down.
  const ranks = new Map<string, number[]>();
  keptBefore.forEach((k, rank) => ranks.set(k.line, [...(ranks.get(k.line) ?? []), rank]));
  const used = new Map<string, number>();
  const moved: { at: number; up: boolean; delta: number; line: string }[] = [];
  keptAfter.forEach((k, rank) => {
    const n = used.get(k.line) ?? 0;
    used.set(k.line, n + 1);
    const was = (ranks.get(k.line) ?? [])[n];
    if (was !== undefined && was !== rank) moved.push({ at: k.index, up: rank < was, delta: Math.abs(rank - was), line: k.line });
  });
  if (moved.length > 0) {
    // Two lines that changed places both moved, and which of them a person
    // took hold of cannot be read off the two states: the one that went up is
    // named, which is true of either step. Where the order was shuffled more
    // than that, it is called what it is.
    moved.sort((a, b) => b.delta - a.delta || Number(b.up) - Number(a.up));
    if (moved.length <= 2 || moved[0].delta > moved[1].delta) out.push(`moved line ${moved[0].at + 1} of the printed instructions, “${short(moved[0].line)}”, ${moved[0].up ? "up" : "down"}`);
    else out.push("reordered the printed instructions");
  }
  return out;
}

/**
 * The heading the paper draws over a run of columns, changed (REQUIREMENTS §68).
 * Kept apart from the columns' own names: a heading taken off five columns is
 * one change to the form, not five.
 */
function describeGroups(before: LogColumn[], after: LogColumn[]): string[] {
  const was = new Map(before.map((c) => [c.key, c]));
  const changed = after.filter((a) => {
    const b = was.get(a.key);
    return !!b && (b.group ?? "") !== (a.group ?? "");
  });
  if (changed.length === 0) return [];
  const runs = new Map<string, LogColumn[]>();
  for (const a of changed) {
    const step = `${was.get(a.key)?.group ?? ""}\u0000${a.group ?? ""}`;
    runs.set(step, [...(runs.get(step) ?? []), a]);
  }
  const out: string[] = [];
  for (const [step, cols] of runs) {
    const [from, to] = step.split("\u0000");
    const what = cols.length === 1 ? "column" : "columns";
    const names = cols.map((c) => `“${c.label}”`).join(", ");
    // Every column of a heading given the same new name is that HEADING reworded.
    if (from && to && before.filter((c) => (c.group ?? "") === from).length === cols.length) out.push(`renamed the spanning heading “${from}” to “${to}”`);
    else if (to) out.push(`put the ${what} ${names} under the spanning heading “${to}”`);
    else out.push(`took the ${what} ${names} out of the spanning heading “${from}”`);
  }
  return out;
}

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
  // THE REST OF THE HEADER (REQUIREMENTS §77): each is a change only when it
  // is written and differs. The revision number is the save's own — the next
  // number is what every save is numbered, so only another number is a change.
  const company = (after.companyName ?? before.companyName ?? COMPANY.name).trim();
  if (company !== (before.companyName ?? COMPANY.name)) out.push(`changed the company name to “${company}”`);
  if (after.formatNo !== undefined && after.formatNo.trim() !== (before.formatNo ?? "")) out.push(`changed the format number from “${before.formatNo ?? ""}” to “${after.formatNo.trim()}”`);
  if (after.revisionNo !== undefined && after.revisionNo.trim() !== (before.revisionNo ?? "") && after.revisionNo.trim() !== nextRevisionNo(before.revisionNo)) {
    out.push(`numbered the revision ${after.revisionNo.trim()}`);
  }
  // Every save is dated today, so today is not a change to describe; another date is.
  if (after.revisionDate !== undefined && after.revisionDate !== (before.revisionDate ?? "") && after.revisionDate !== todayISO()) {
    out.push(`dated the revision ${formatDisplayDate(after.revisionDate)}`);
  }
  const a = before.layout;
  const b = after.layout;
  if (!a || !b) return out;
  out.push(...describeItems("box", a.headerFields, b.headerFields));
  out.push(...describeItems("column", a.columns, b.columns));
  out.push(...describeGroups(a.columns, b.columns));
  out.push(...describeItems("footer box", a.footerFields ?? [], b.footerFields ?? []));
  out.push(...describeInstructions(a.instructions ?? [], b.instructions ?? []));
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

/** `now` is the format as it stands, which says whether it has a grid at all to keep. */
export function validateDraft(draft: FormatDraft, now?: FormatDraft): string | null {
  if (!draft.name.trim()) return "The format needs a name.";
  if (draft.formatNo !== undefined && !draft.formatNo.trim()) return "The format needs its number.";
  if (draft.companyName !== undefined && !draft.companyName.trim()) return "The header needs the company's name.";
  if (draft.revisionDate !== undefined && !ISO_DATE.test(draft.revisionDate)) return "The revision needs a real date.";
  const l = draft.layout;
  if (!l) return null;
  if ([...l.headerFields, ...l.columns, ...(l.footerFields ?? [])].some((x) => !x.label.trim())) return "Every box and column needs a name.";
  // A GRID-SHAPED FORM KEEPS AT LEAST ONE COLUMN: emptying it would quietly
  // turn the form into labelled lines alone. But a format that HAS no grid has
  // none to keep — the Supplier Registration Form is labelled lines and prose
  // blocks from the top of its first page to the bottom of its third
  // (REQUIREMENTS §68) — and its boxes and its printed words must still be
  // changeable, so it is never asked for a column it has never had.
  if (l.columns.length === 0 && (now?.layout ? now.layout.columns.length > 0 : true)) return "A sheet needs at least one column.";
  if ([...l.headerFields, ...(l.footerFields ?? [])].length === 0 && l.columns.length === 0) return "A format with no grid needs at least one box.";
  return null;
}

/**
 * Saves `draft` as the format's next revision: numbered (the next one, unless
 * `revisionNo` says otherwise), dated today, with who changed what and why at
 * the head of its change history, and a line in the activity log. Refused,
 * with the reason, when nothing has changed or something is missing.
 */
export function commitFormatChange(doc: DocumentDefinition, draft: FormatDraft, opts: { actor: string; reason: string; revisionNo?: string }): CommitResult {
  const before = draftOf(doc);
  const invalid = validateDraft(draft, before);
  if (invalid) return { ok: false, error: invalid };
  if (!opts.reason.trim()) return { ok: false, error: "Say why the format is changing — it goes in its change history." };
  const summary = describeFormatChange(before, draft);
  if (summary.length === 0) return { ok: false, error: "Nothing about the format has been changed yet." };
  // The number typed over on the header, when it was; the next number otherwise.
  const typed = draft.revisionNo?.trim();
  const revisionNo = (opts.revisionNo ?? (typed && typed !== doc.revisionNo ? typed : nextRevisionNo(doc.revisionNo))).trim();
  if (!revisionNo) return { ok: false, error: "Give the new revision number." };

  const existing = formatEditFor(doc.id);
  const issued = SEED_DOCUMENTS.find((d) => d.id === doc.id);
  // Dated today, unless the header's date was itself typed over (REQUIREMENTS
  // §77): the draft carries the format's own date until then.
  const dated = draft.revisionDate?.trim();
  const revisionDate = dated && ISO_DATE.test(dated) && dated !== (doc.revisionDate ?? "") ? dated : todayISO();
  const at = new Date().toISOString();
  const revision: FormatRevision = { id: revisionId({ at, by: opts.actor, revisionNo }), revisionNo, revisionDate, by: opts.actor, at, reason: opts.reason.trim(), summary: summary.join("; ") };
  // The header's company name and format number are kept only where they
  // differ from the issued format's, so "Restore the issued format" and a
  // name typed back to the registered one both print the paper's own again.
  const company = draft.companyName?.trim();
  const formatNo = draft.formatNo?.trim();
  const stored = saveFormatEdit(doc.id, {
    revisionNo,
    revisionDate,
    name: draft.name.trim() !== (issued?.name ?? doc.name) ? draft.name.trim() : undefined,
    companyName: company && company !== (issued?.companyName ?? COMPANY.name) ? company : undefined,
    formatNo: formatNo && formatNo !== (issued?.formatNo ?? doc.formatNo) ? formatNo : undefined,
    layout: draft.layout ?? existing?.layout,
    // Every entry carries an id, so two people's saves MERGE into one history
    // (data/serverSync.ts merges a list by id) instead of one list replacing the other.
    revisions: [revision, ...(existing?.revisions ?? []).map((r) => (r.id ? r : { ...r, id: revisionId(r) }))],
  });
  if (!stored) return { ok: false, error: "The change could not be stored." };
  const printedNo = formatNo || doc.formatNo;
  const number = printedNo.startsWith("TO BE") ? "" : `${printedNo} `;
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
