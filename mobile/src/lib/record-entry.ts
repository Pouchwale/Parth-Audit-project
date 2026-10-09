// THE REVIEW SCREEN'S INPUTS. Plain functions with no imports, so the server's tests can check them
// (server/test/record-entry.test.ts).
//
// The record comes from DCRS as its GET /api/v1/records/:id answers it: its layout (a log sheet's boxes, columns and
// lines; the daily pest control check points; any other form's fields) and its data as stored. Each value a person can
// write becomes one input, and each answer is saved at once in DCRS's own patch shape (POST /records/:id/changes):
//   a box of a log sheet, at its head or foot   {"header": {"<key>": value}}
//   a cell of a line, by the line's number       {"itemEdits": [{"collection": "rows", "match": {"row": 2}, "set": {"<key>": value}}]}
//   a check point of the daily pest control      {"checkpoints": {"3": "Yes"}}
//   any other field, or a part of one            {"<key>": value}, {"<key>": {"<part>": value}}
// DCRS checks and stores every value as its own pages do, and refuses what it cannot take; nothing is decided here
// beyond which inputs to show and which buttons to offer for the usual answers.
import type { RecordField, RecordView } from '@shared/api';

export type EntryType = 'number' | 'text' | 'choice' | 'yesno' | 'time' | 'date';

/** Where a value goes in DCRS's patch. */
export type EntryTarget =
  | { kind: 'header'; key: string }
  | { kind: 'row'; collection: string; row: number; key: string }
  | { kind: 'field'; key: string }
  | { kind: 'part'; key: string; part: string }
  | { kind: 'checkpoint'; number: number };

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

/** A line's name: its time slot, else its printed words ("Row 2: Floor clean"), else its number. */
function rowTitle(row: Obj, index: number, columns: readonly RecordField[], slotKey: string | undefined): string {
  if (slotKey && textOf(row[slotKey])) return textOf(row[slotKey]);
  const printed = columns.find((column) => column.printed && textOf(row[column.key]));
  return printed ? `Row ${index + 1}: ${textOf(row[printed.key])}` : `Row ${index + 1}`;
}

function logSheet(record: RecordView): EntryGroup[] {
  const layout = record.layout!;
  const data = isObj(record.data) ? record.data : {};
  const header = isObj(data.header) ? data.header : {};
  const rows = Array.isArray(data.rows) ? data.rows : [];
  const columns = layout.columns ?? [];
  const groups: EntryGroup[] = [];
  const boxes = (fields: readonly RecordField[] | undefined, title: string) => {
    const items = (fields ?? []).filter(writable).map((field) => item(`header:${field.key}`, field, null, header[field.key], { kind: 'header', key: field.key }));
    if (items.length > 0) groups.push({ title, items });
  };
  boxes(layout.header, 'At the top of the sheet');
  rows.forEach((row, index) => {
    if (!isObj(row)) return;
    const where = rowTitle(row, index, columns, layout.rows?.slotKey);
    const items = columns
      .filter(writable)
      .map((column) => item(`row:${index}:${column.key}`, column, where, row[column.key], { kind: 'row', collection: 'rows', row: index + 1, key: column.key }));
    if (items.length > 0) groups.push({ title: where, items });
  });
  boxes(layout.footer, 'At the foot of the sheet');
  return groups;
}

function listGroups(key: string, label: string, keys: readonly string[] | undefined, value: unknown): EntryGroup[] {
  if (!Array.isArray(value) || PICTURE_LISTS.test(key)) return [];
  const groups: EntryGroup[] = [];
  value.forEach((line, index) => {
    if (!isObj(line) || 'dataUrl' in line) return;
    const where = `${label}, line ${index + 1}`;
    const names = (keys && keys.length > 0 ? keys : Object.keys(line)).filter((name) => name !== 'id');
    const items = names.map((name) =>
      item(`list:${key}:${index}:${name}`, { key: name }, where, line[name], { kind: 'row', collection: key, row: index + 1, key: name }, typeOfValue(name, line[name])),
    );
    if (items.length > 0) groups.push({ title: where, items });
  });
  return groups;
}

function dailyPest(record: RecordView): EntryGroup[] {
  const layout = record.layout!;
  const data = isObj(record.data) ? record.data : {};
  const answers = isObj(data.checkpoints) ? data.checkpoints : {};
  const groups: EntryGroup[] = [];
  const checks = (layout.checkpoints ?? []).map((point) =>
    item(
      `checkpoint:${point.number}`,
      { key: String(point.number), label: point.question, required: true },
      `Check point ${point.number}`,
      answers[String(point.number)],
      { kind: 'checkpoint', number: point.number },
      point.answer === 'number' ? 'number' : 'yesno',
    ),
  );
  if (checks.length > 0) groups.push({ title: 'Check points', items: checks });
  const fields = (layout.fields ?? []).map((field) =>
    item(`field:${field.key}`, { ...field, required: field.key !== 'isHoliday' }, null, data[field.key], { kind: 'field', key: field.key }),
  );
  if (fields.length > 0) groups.push({ title: 'The check', items: fields });
  for (const list of layout.lists ?? []) groups.push(...listGroups(list.key, list.label, list.items, data[list.key]));
  return groups;
}

function anyForm(record: RecordView): EntryGroup[] {
  const data = isObj(record.data) ? record.data : {};
  const boxes: EntryItem[] = [];
  const groups: EntryGroup[] = [];
  for (const field of record.layout?.fields ?? []) {
    if (field.key.startsWith('_') || !writable(field)) continue;
    const value = data[field.key];
    if (Array.isArray(value) || field.items) {
      groups.push(...listGroups(field.key, field.label || labelOf(field.key), field.items, value));
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

/** The change DCRS takes for one value. */
export function patchFor(target: EntryTarget, value: string): Record<string, unknown> {
  switch (target.kind) {
    case 'header':
      return { header: { [target.key]: value } };
    case 'row':
      return { itemEdits: [{ collection: target.collection, match: { row: target.row }, set: { [target.key]: value } }] };
    case 'field':
      return { [target.key]: value };
    case 'part':
      return { [target.key]: { [target.part]: value } };
    case 'checkpoint':
      return { checkpoints: { [String(target.number)]: value } };
  }
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
