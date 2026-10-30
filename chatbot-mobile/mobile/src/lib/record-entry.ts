// THE REVIEW SCREEN'S INPUTS. Plain functions with no imports but types, so the server's tests can check them
// (server/test/phone-app.test.ts).
//
// The record comes from DCRS as its GET /api/v1/records/:id answers it: its layout (a log sheet's boxes, columns and
// lines; the daily pest control check points; any other form's fields) and its data as stored. Each value a person can
// write becomes one input, and each answer is saved at once in DCRS's own patch shape (POST /records/:id/changes):
//   a box of a log sheet, at its head or foot   {"header": {"<key>": value}}
//   a cell of a line, by the line's id            {"itemEdits": [{"collection": "rows", "match": {"id": "row-…"}, "set": {"<key>": value}}]}
//   a check point of the daily pest control      {"checkpoints": {"3": "Yes"}}
//   any other field, or a part of one            {"<key>": value}, {"<key>": {"<part>": value}}
// The lines of a record (DCRS's REQUIREMENTS §113): DCRS's layout.lists says, per list, whether lines can be added or
// removed and why not, and names each line by its id. A line is added with addItems, taken off with removeItems and a
// box blanked with clearItems; every such change is first asked of DCRS as a dry run (nothing written), whose words
// the confirmation sheet shows, and a line just added can be taken off again by the id DCRS answered (Undo).
// DCRS checks and stores every value as its own pages do, and refuses what it cannot take; nothing is decided here
// beyond which inputs to show and which buttons to offer for the usual answers.
import type { RecordChangeResult, RecordField, RecordList, RecordView } from '@shared/api';

export type EntryType = 'number' | 'text' | 'choice' | 'yesno' | 'time' | 'date';

/** Where a value goes in DCRS's patch. */
export type EntryTarget =
  | { kind: 'header'; key: string }
  /** A cell of a line: aimed by the line's id when DCRS gave one, else by its position. */
  | { kind: 'row'; collection: string; row: number; id?: string | number; key: string }
  | { kind: 'field'; key: string }
  | { kind: 'part'; key: string; part: string }
  | { kind: 'checkpoint'; number: number }
  /** The note a check point asks for with its Yes ("Mention the location"). */
  | { kind: 'checkpoint-note'; number: number };

export interface EntryItem {
  /** Stable while the record is open: the screen keeps what was typed under it. */
  id: string;
  label: string;
  /** The line it is on ("10:00", "Row 2", "Check point 3"), or null for a box of its own. */
  where: string | null;
  type: EntryType;
  options: string[];
  unit: string | null;
  required: boolean;
  min: number | null;
  max: number | null;
  /** As stored now, in words: "" for nothing yet. */
  value: string;
  /** The big buttons for the usual answers. */
  quick: string[];
  target: EntryTarget;
}

export interface EntryGroup {
  title: string;
  items: EntryItem[];
  /** The line of a list these inputs belong to, when they do: what deleting it names, and whether DCRS allows that. */
  line?: LineRef;
}

/** A line of a list, as the controls name it. */
export interface LineRef {
  list: string;
  /** What one line is called, from DCRS: "line", "rodent catch". */
  noun: string;
  row: number;
  id: string | number | null;
  /** The line in its own words, from DCRS. */
  words: string;
  canRemove: boolean;
}

/** A box of a new line. */
export interface LineBox {
  key: string;
  label: string;
  type: EntryType;
  options: string[];
  unit: string | null;
}

/** A list of lines with what the screen can do to it. */
export interface LineList {
  key: string;
  label: string;
  noun: string;
  canAdd: boolean;
  canRemove: boolean;
  whyFixed: string | null;
  maxAddAtOnce: number;
  /** The boxes a new line asks for: the list's writable boxes, described by the form's columns where it has them. */
  boxes: LineBox[];
  lines: { row: number; id: string | number | null; words: string }[];
}

export interface Entry {
  /** False for the forms entered on their own DCRS pages (a CAPA inspection, a training record, a complaint checklist). */
  supported: boolean;
  groups: EntryGroup[];
  count: number;
  empty: number;
  requiredEmpty: number;
}

/** Forms with pages of their own in DCRS, whose answers depend on each other: read here, entered in DCRS or by Mitra. */
const OWN_PAGES = new Set(['gap-inspection', 'complaint-checklist', 'training-record']);

/** Lists that hold pictures, not observations. */
const PICTURE_LISTS = /^(photos?|scans?|attachments?|pictures?)$/i;

// ONE NUMBER PER LINE (DCRS's REQUIREMENTS §102). The owner, 9-Oct-2026: "still in the starting of any question there
// are number present". A line's name says its number once:
/** A line's own number at the start of its words ("1. ", "01. ", "(1) ", "1." straight before a word), as DCRS's engine/lineNumbers.ts reads it. */
const OWN_NUMBER = /^\s*\(?0*(\d{1,3})\s*[.)](?:\s+|(?=\p{L}))/u;
/** A printed column that numbers a form's lines itself: "#", "No.", "Sr. No.", "S. No.", "Sl. No.", "Serial No.", "Number", "Index". */
const SERIAL_LABEL = /^(#|no\.?|s\.?\s*no\.?|sr\.?\s*no\.?|sl\.?\s*no\.?|serial(\s*no\.?)?|number|index)$/i;
/** A list line's own number (sNo, srNo, slNo): the line's name already says it, so it is not asked. */
const SERIAL_KEY = /^(s|sr|sl)\.?no$/i;

type Obj = Record<string, unknown>;
const isObj = (value: unknown): value is Obj => !!value && typeof value === 'object' && !Array.isArray(value);

/** A stored value in words: Yes or No for a tick, the number, the text, a check point's answer. */
export function textOf(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'string') return value;
  if (isObj(value) && 'value' in value) return textOf(value.value);
  return '';
}

/** DCRS's type of a box, as the input the phone shows. */
export function entryType(type: string | undefined, options?: readonly string[]): EntryType {
  switch ((type ?? '').toLowerCase()) {
    case 'number':
    case 'number or blank':
      return 'number';
    case 'select':
      return options && options.length > 0 ? 'choice' : 'text';
    case 'yesno':
      return 'yesno';
    case 'time':
      return 'time';
    case 'date':
      return 'date';
    default:
      return 'text';
  }
}

/** The type of a value DCRS gave no type for (a line of a list), from the value and its name. */
function typeOfValue(key: string, value: unknown): EntryType {
  if (typeof value === 'boolean') return 'yesno';
  if (typeof value === 'number') return 'number';
  if (/date/i.test(key)) return 'date';
  if (/^time|Time/.test(key)) return 'time';
  return 'text';
}

/** Words for a key DCRS gave no label for: "trapBoxNo" is "Trap box no". */
function labelOf(key: string): string {
  const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim().toLowerCase();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : key;
}

/** Text boxes that hold a state rather than a name or a number get OK and Not OK buttons. */
const STATE_WORDS = /\b(status|condition|result|observations?|ok|clean(liness)?|remarks?|findings?)\b/i;

/** The big buttons for a box's usual answers: Yes and No, its choices, 0 1 2 for a count, OK and Not OK for a state. */
export function quickAnswers(type: EntryType, options: readonly string[], label: string): string[] {
  switch (type) {
    case 'yesno':
      return ['Yes', 'No'];
    case 'choice':
      return options.length <= 8 ? [...options] : [];
    case 'number':
      return ['0', '1', '2'];
    case 'text':
      return STATE_WORDS.test(label) ? ['OK', 'Not OK'] : [];
    default:
      return [];
  }
}

const writable = (field: RecordField) => !field.printed && !field.computed && !field.readFrom;

/** DCRS's lists of lines on this record (layout.lists, §113), read defensively: none on a DCRS before §113. */
function registry(record: Pick<RecordView, 'layout'>): RecordList[] {
  const lists = record.layout?.lists;
  if (!Array.isArray(lists)) return [];
  return lists.filter((list): list is RecordList => isObj(list) && typeof list.key === 'string' && typeof list.canAdd === 'boolean');
}

/** A line's id as DCRS stored it, from the list's lines (by position) or the stored line itself. */
function idOf(list: RecordList | undefined, index: number, stored: unknown): string | number | null {
  const listed = list?.lines?.[index]?.id;
  if (typeof listed === 'string' || typeof listed === 'number') return listed;
  const own = isObj(stored) ? stored.id : undefined;
  return typeof own === 'string' || typeof own === 'number' ? own : null;
}

function lineRef(list: RecordList | undefined, key: string, index: number, stored: unknown, fallbackWords: string): LineRef {
  const words = list?.lines?.[index]?.words;
  return {
    list: key,
    noun: list?.noun || 'line',
    row: index + 1,
    id: idOf(list, index, stored),
    words: typeof words === 'string' && words ? words : fallbackWords,
    canRemove: list?.canRemove === true,
  };
}

/** The lists of lines of the record, each with its rules, the boxes of a new line and its lines: for the Add and Delete controls. */
export function lineListsOf(record: RecordView): LineList[] {
  const columns = new Map((record.layout?.columns ?? []).map((column) => [column.key, column]));
  return registry(record).map((list) => {
    const keys = list.writable.length > 0 ? list.writable : list.item;
    const boxes = keys
      .filter((key) => key !== 'id' && !SERIAL_KEY.test(key))
      .map((key): LineBox => {
        const column = columns.get(key);
        const options = column?.options ?? [];
        const type = column ? entryType(column.type, options) : typeOfValue(key, undefined);
        return { key, label: column?.label?.trim() || labelOf(key), type, options, unit: column?.unit ?? null };
      });
    return {
      key: list.key,
      label: list.label || labelOf(list.key),
      noun: list.noun || 'line',
      canAdd: list.canAdd === true,
      canRemove: list.canRemove === true,
      whyFixed: typeof list.whyFixed === 'string' && list.whyFixed ? list.whyFixed : null,
      maxAddAtOnce: typeof list.maxAddAtOnce === 'number' && list.maxAddAtOnce > 0 ? list.maxAddAtOnce : 1,
      boxes,
      lines: (list.lines ?? []).map((line, index) => ({ row: typeof line.row === 'number' ? line.row : index + 1, id: typeof line.id === 'string' || typeof line.id === 'number' ? line.id : null, words: typeof line.words === 'string' ? line.words : '' })),
    };
  });
}

function item(id: string, field: { key: string; label?: string; type?: string; options?: string[]; unit?: string; required?: boolean; min?: number; max?: number }, where: string | null, value: unknown, target: EntryTarget, type?: EntryType): EntryItem {
  const options = field.options ?? [];
  const kind = type ?? entryType(field.type, options);
  const label = field.label?.trim() || labelOf(field.key);
  return {
    id,
    label,
    where,
    type: kind,
    options,
    unit: field.unit ?? null,
    required: field.required === true,
    min: typeof field.min === 'number' ? field.min : null,
    max: typeof field.max === 'number' ? field.max : null,
    value: textOf(value),
    quick: quickAnswers(kind, options, label),
    target,
  };
}

/**
 * A line's name, with its number said once: its time slot; else its printed words ("Row 2: Floor clean"), without
 * the line's own number in front ("1. I can freely speak up" is "Row 1: I can freely speak up"); else its number.
 * A form that numbers its lines itself (DCRS's ownLineNumbers: a "Sr. No." or "#" column of its own, or questions
 * numbered 01 to 10) has its own number and no "Row N" beside it ("Sr. No. 3: Diabetes").
 */
function rowTitle(row: Obj, index: number, columns: readonly RecordField[], slotKey: string | undefined, ownNumbers = false): string {
  if (slotKey && textOf(row[slotKey])) return textOf(row[slotKey]);
  const printed = columns.filter((column) => column.printed && textOf(row[column.key]));
  const serial = printed.find((column) => SERIAL_LABEL.test((column.label ?? '').trim()) || SERIAL_KEY.test(column.key));
  // A bare figure is a number, not the line's words.
  const named = printed.find((column) => column !== serial && !/^[\d.]+$/.test(textOf(row[column.key])));
  const words = named ? textOf(row[named.key]) : '';
  if (ownNumbers) {
    const own = serial ? `${(serial.label ?? '').trim()} ${textOf(row[serial.key])}`.trim() : '';
    if (own && words) return `${own}: ${words}`;
    return own || words || `Line ${index + 1}`;
  }
  const line = index + 1;
  const m = OWN_NUMBER.exec(words);
  const once = m && Number(m[1]) === line ? words.slice(m[0].length) : words;
  return once ? `Row ${line}: ${once}` : `Row ${line}`;
}

function logSheet(record: RecordView): EntryGroup[] {
  const layout = record.layout!;
  const data = isObj(record.data) ? record.data : {};
  const header = isObj(data.header) ? data.header : {};
  const rows = Array.isArray(data.rows) ? data.rows : [];
  const columns = layout.columns ?? [];
  const list = registry(record).find((one) => one.key === 'rows');
  const groups: EntryGroup[] = [];
  const boxes = (fields: readonly RecordField[] | undefined, title: string) => {
    const items = (fields ?? []).filter(writable).map((field) => item(`header:${field.key}`, field, null, header[field.key], { kind: 'header', key: field.key }));
    if (items.length > 0) groups.push({ title, items });
  };
  boxes(layout.header, 'At the top of the sheet');
  rows.forEach((row, index) => {
    if (!isObj(row)) return;
    const where = rowTitle(row, index, columns, layout.rows?.slotKey, layout.ownLineNumbers === true);
    const id = idOf(list, index, row);
    const items = columns
      .filter(writable)
      .map((column) => item(`row:${index}:${column.key}`, column, where, row[column.key], { kind: 'row', collection: 'rows', row: index + 1, ...(id === null ? {} : { id }), key: column.key }));
    if (items.length > 0) groups.push({ title: where, items, line: lineRef(list, 'rows', index, row, where) });
  });
  boxes(layout.footer, 'At the foot of the sheet');
  return groups;
}

function listGroups(key: string, label: string, keys: readonly string[] | undefined, value: unknown, list: RecordList | undefined): EntryGroup[] {
  if (!Array.isArray(value) || PICTURE_LISTS.test(key)) return [];
  const groups: EntryGroup[] = [];
  // The boxes a person writes, as DCRS's registry names them (§113); else the keys the form gave; else the line's own.
  const asked = list && list.writable.length > 0 ? list.writable : keys;
  value.forEach((line, index) => {
    if (!isObj(line) || 'dataUrl' in line) return;
    const where = `${label}, line ${index + 1}`;
    const id = idOf(list, index, line);
    const names = (asked && asked.length > 0 ? asked : Object.keys(line)).filter((name) => name !== 'id' && !SERIAL_KEY.test(name));
    const items = names.map((name) =>
      item(`list:${key}:${index}:${name}`, { key: name }, where, line[name], { kind: 'row', collection: key, row: index + 1, ...(id === null ? {} : { id }), key: name }, typeOfValue(name, line[name])),
    );
    if (items.length > 0) groups.push({ title: where, items, line: lineRef(list, key, index, line, where) });
  });
  return groups;
}

/**
 * F/HR/17, as DCRS checks it before a submit (its engine/validation.ts): on a working day every check point, the
 * checker and the time; a check point that asks for a note with its Yes ("yesno-note": the location, the rodent box's
 * number) asks for it once it is Yes, under the check point; on a holiday nothing is required.
 */
function dailyPest(record: RecordView): EntryGroup[] {
  const layout = record.layout!;
  const data = isObj(record.data) ? record.data : {};
  const answers = isObj(data.checkpoints) ? data.checkpoints : {};
  const required = data.isHoliday !== true;
  const groups: EntryGroup[] = [];
  const checks: EntryItem[] = [];
  for (const point of layout.checkpoints ?? []) {
    const stored = answers[String(point.number)];
    const where = `Check point ${point.number}`;
    checks.push(
      item(
        `checkpoint:${point.number}`,
        { key: String(point.number), label: point.question, required },
        where,
        stored,
        { kind: 'checkpoint', number: point.number },
        point.answer === 'number' ? 'number' : 'yesno',
      ),
    );
    if (point.answer === 'yesno-note' && textOf(stored) === 'Yes') {
      const note = isObj(stored) && typeof stored.note === 'string' ? stored.note : '';
      checks.push(
        item(`checkpoint-note:${point.number}`, { key: `${point.number}-note`, label: point.noteAsks?.trim() || 'Note', required }, where, note, { kind: 'checkpoint-note', number: point.number }, 'text'),
      );
    }
  }
  if (checks.length > 0) groups.push({ title: 'Check points', items: checks });
  const fields = (layout.fields ?? []).map((field) =>
    item(`field:${field.key}`, { ...field, required: required && field.key !== 'isHoliday' }, null, data[field.key], { kind: 'field', key: field.key }),
  );
  if (fields.length > 0) groups.push({ title: 'The check', items: fields });
  for (const list of registry(record)) groups.push(...listGroups(list.key, list.label, list.item, data[list.key], list));
  return groups;
}

function anyForm(record: RecordView): EntryGroup[] {
  const data = isObj(record.data) ? record.data : {};
  const boxes: EntryItem[] = [];
  const groups: EntryGroup[] = [];
  const lists = registry(record);
  for (const field of record.layout?.fields ?? []) {
    if (field.key.startsWith('_') || !writable(field)) continue;
    const value = data[field.key];
    if (Array.isArray(value) || field.items) {
      groups.push(...listGroups(field.key, field.label || labelOf(field.key), field.items, value, lists.find((list) => list.key === field.key)));
    } else if (isObj(value) || field.parts) {
      const parts = field.parts ?? Object.keys(isObj(value) ? value : {});
      const holder = isObj(value) ? value : {};
      const items = parts.map((part) =>
        item(`part:${field.key}:${part}`, { key: part }, field.label || labelOf(field.key), holder[part], { kind: 'part', key: field.key, part }, typeOfValue(part, holder[part])),
      );
      if (items.length > 0) groups.push({ title: field.label || labelOf(field.key), items });
    } else {
      boxes.push(item(`field:${field.key}`, field, null, value, { kind: 'field', key: field.key }));
    }
  }
  return boxes.length > 0 ? [{ title: 'On the form', items: boxes }, ...groups] : groups;
}

/** Every value of the record a person can enter, grouped as the form is. */
export function entryOf(record: RecordView): Entry {
  const kind = record.layout?.kind ?? record.document?.kind ?? '';
  const supported = !!record.layout && !OWN_PAGES.has(kind);
  const groups = !supported ? [] : kind === 'log-sheet' ? logSheet(record) : kind === 'daily-pest-monitoring' ? dailyPest(record) : anyForm(record);
  return summed(supported, groups);
}

function summed(supported: boolean, groups: EntryGroup[]): Entry {
  const items = groups.flatMap((group) => group.items);
  return {
    supported,
    groups,
    count: items.length,
    empty: items.filter((entry) => entry.value.trim() === '').length,
    requiredEmpty: items.filter((entry) => entry.required && entry.value.trim() === '').length,
  };
}

/** The entry with what the person has saved since the record was read. */
export function withValues(entry: Entry, saved: Readonly<Record<string, string>>): Entry {
  if (Object.keys(saved).length === 0) return entry;
  const groups = entry.groups.map((group) => ({ ...group, items: group.items.map((one) => (one.id in saved ? { ...one, value: saved[one.id]! } : one)) }));
  return summed(entry.supported, groups);
}

/** How a line is aimed at: by its id as DCRS stored it, else by its position on the sheet. */
function matchOf(target: { row: number; id?: string | number }): Record<string, string | number> {
  return target.id === undefined ? { row: target.row } : { id: target.id };
}

/** The change DCRS takes for one value. */
export function patchFor(target: EntryTarget, value: string): Record<string, unknown> {
  switch (target.kind) {
    case 'header':
      return { header: { [target.key]: value } };
    case 'row':
      return { itemEdits: [{ collection: target.collection, match: matchOf(target), set: { [target.key]: value } }] };
    case 'field':
      return { [target.key]: value };
    case 'part':
      return { [target.key]: { [target.part]: value } };
    case 'checkpoint':
      return { checkpoints: { [String(target.number)]: value } };
    case 'checkpoint-note':
      // DCRS keeps the check point's answer and sets its note.
      return { checkpoints: { [String(target.number)]: { note: value } } };
  }
}

/**
 * The change that blanks one box (§113): a line's cell through clearItems (DCRS names what it clears in its own
 * words), a check point with null, any other box with null.
 */
export function clearPatchFor(target: EntryTarget): Record<string, unknown> {
  switch (target.kind) {
    case 'header':
      return { header: { [target.key]: null } };
    case 'row':
      return { clearItems: { [target.collection]: [{ ...matchOf(target), keys: [target.key] }] } };
    case 'field':
      return { [target.key]: null };
    case 'part':
      return { [target.key]: { [target.part]: null } };
    case 'checkpoint':
      return { checkpoints: { [String(target.number)]: null } };
    case 'checkpoint-note':
      return { checkpoints: { [String(target.number)]: { note: '' } } };
  }
}

/** The change that adds lines to a list, each with only the boxes the person filled: DCRS writes nothing else. */
export function addLinePatch(list: string, lines: readonly Readonly<Record<string, string>>[]): Record<string, unknown> {
  const values = lines.map((line) => Object.fromEntries(Object.entries(line).filter(([, value]) => value.trim() !== '').map(([key, value]) => [key, value.trim()])));
  return { addItems: { [list]: values } };
}

/** The change that takes a line off its list, by its id when DCRS gave one, else by its position. */
export function removeLinePatch(line: Pick<LineRef, 'list' | 'row' | 'id'>): Record<string, unknown> {
  return { removeItems: { [line.list]: [line.id === null ? line.row : line.id] } };
}

/**
 * The change that takes off again the lines a change added, by the ids DCRS answered (Undo); null when it added none
 * with an id (a DCRS before §113 answers no ids, so there is nothing safe to take off).
 */
export function undoAddPatch(result: Pick<RecordChangeResult, 'added'>): Record<string, unknown> | null {
  const byList: Record<string, (string | number)[]> = {};
  for (const line of result.added ?? []) {
    if (typeof line.id !== 'string' && typeof line.id !== 'number') continue;
    (byList[line.collection] ??= []).push(line.id);
  }
  return Object.keys(byList).length > 0 ? { removeItems: byList } : null;
}

/** The words of a dry run's answer for the confirmation sheet: what DCRS would delete, clear and add. */
export function previewLines(result: Pick<RecordChangeResult, 'removed' | 'cleared' | 'added' | 'changes'>): { removed: string[]; cleared: string[]; added: string[]; set: string[] } {
  const marks = new Set(['(no row)', '(row removed)']);
  return {
    removed: (result.removed ?? []).filter((line) => typeof line === 'string'),
    cleared: (result.cleared ?? []).filter((line) => typeof line === 'string'),
    added: (result.added ?? []).map((line) => line.words).filter((words) => typeof words === 'string' && words !== ''),
    set: (result.changes ?? []).filter((change) => !marks.has(change.before) && !marks.has(change.after)).map((change) => `${change.label}: ${change.after === '' ? '—' : change.after}`),
  };
}

/** A note beside a number outside the form's band (not a refusal: the paper has no such gate, a remark is expected). */
export function rangeNote(entry: Pick<EntryItem, 'type' | 'min' | 'max' | 'unit'>, value: string): string | null {
  if (entry.type !== 'number' || value.trim() === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return 'Write a number.';
  const unit = entry.unit ? ` ${entry.unit}` : '';
  if (entry.min !== null && entry.max !== null && (number < entry.min || number > entry.max)) return `Outside ${entry.min} to ${entry.max}${unit}: add a remark.`;
  if (entry.min !== null && number < entry.min) return `Below ${entry.min}${unit}: add a remark.`;
  if (entry.max !== null && number > entry.max) return `Above ${entry.max}${unit}: add a remark.`;
  return null;
}

/**
 * Whether Submit can be pressed, and if not, why: DCRS offers it, the person may submit, DCRS's own checks pass (its
 * problems, when its answer gives them; else no required box is empty), and the person has ticked "Reviewed and
 * correct". DCRS checks again when it is pressed, and its refusal is shown in its words.
 */
export function submitState(record: Pick<RecordView, 'actions' | 'canSubmit' | 'problems'>, entry: Pick<Entry, 'requiredEmpty'>, reviewed: boolean): { shown: boolean; enabled: boolean; why: string | null } {
  if (!record.actions.includes('submit') || record.canSubmit === false) return { shown: false, enabled: false, why: null };
  const problems = Array.isArray(record.problems) ? record.problems.filter((p) => typeof p === 'string' && p.trim()) : null;
  if (problems && problems.length > 0) {
    const more = problems.length > 1 ? ` (and ${problems.length - 1} more)` : '';
    return { shown: true, enabled: false, why: `Not ready to submit: ${problems[0]}${more}` };
  }
  if (!problems && entry.requiredEmpty > 0) {
    const n = entry.requiredEmpty;
    return { shown: true, enabled: false, why: `${n} required ${n === 1 ? 'box is' : 'boxes are'} still empty.` };
  }
  if (!reviewed) return { shown: true, enabled: false, why: 'Tick "Reviewed and correct" once you have checked every value.' };
  return { shown: true, enabled: true, why: null };
}
