// THE LINES OF A RECORD, as DCRS's API describes them since REQUIREMENTS §113 (docs/api/dcrs-api.openapi.json in DCRS,
// ENGINE_API_VERSION 5): each list of lines with what it allows (layout.lists), the four operations a patch may name on
// them (addItems, removeItems, clearItems, itemEdits), a dry run's answer (ChangePreview: what the patch would do,
// nothing written) and a real change's answer (ChangeResponse: the lines added with their ids, removed and cleared in
// their own words). The confirmation card is worded from the dry run, so it says exactly what DCRS will do; a line
// that was added can be taken off again by its id (Undo). Every answer is read defensively: a DCRS before §113 gives
// none of this, and the connector then works as it did.
import { ConnectorError } from '../types.ts';

export type Language = 'en' | 'hi' | 'gu';

/** One list of lines of a form, with what it allows (Layout.lists in DCRS's OpenAPI). */
export interface ListRules {
  key: string;
  label: string;
  /** What one line is called: "line", "rodent catch", "finding", "attendee". */
  noun: string;
  canAdd: boolean;
  canRemove: boolean;
  /** Why no line is added or removed, when neither is allowed. */
  whyFixed?: string;
  minLines: number;
  maxAddAtOnce: number;
  /** The box a line is named by (its time slot, trap box number, serial number). */
  nameKey?: string;
  numberKey?: string;
  /** A list of plain words, not of boxes. */
  scalar?: boolean;
  within?: string;
  /** The boxes of a new line. */
  item: string[];
  /** The boxes a person writes. */
  writable: string[];
  /** On a record only: how many lines it has now, and each as it stands. */
  count?: number;
  lines?: ListLine[];
}

/** A line as it stands, on a record: aim a change at it by its id. */
export interface ListLine {
  row: number;
  id?: string | number;
  /** The value of the list's nameKey, when it has one. */
  name?: string;
  words: string;
}

export interface ChangeLine {
  label: string;
  before: string;
  after: string;
}

/** A dry run's answer: what the patch would do, nothing written. */
export interface ChangePreview {
  dryRun: true;
  recordId: string;
  /** "the Lamination Adhesive Viscosity Record of 11-Oct-2026". */
  title: string;
  status: string;
  editable: boolean;
  /** Signed off: the change would reopen the record for correction first (Edit, with a reason). */
  willReopen: boolean;
  /** With willReopen: no reason was sent yet. */
  reasonNeeded: boolean;
  changes: ChangeLine[];
  added: { collection: string; words: string }[];
  removed: string[];
  cleared: string[];
  problems: string[];
}

/** A real change's answer: the lines it added (by id), took off and cleared. */
export interface ChangeMade {
  recordId: string;
  status: string;
  editable: boolean;
  actions: string[];
  changes: ChangeLine[];
  moreChanges: number;
  /** The record was signed off and was reopened for this correction. */
  reopened: boolean;
  added: { collection: string; id: string | number | null; row: number | null; words: string }[];
  removed: string[];
  cleared: string[];
  problems: string[];
}

type Obj = Record<string, unknown>;
const isObj = (value: unknown): value is Obj => !!value && typeof value === 'object' && !Array.isArray(value);
const str = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : typeof value === 'number' ? String(value) : fallback);
const strings = (value: unknown): string[] => (Array.isArray(value) ? value.map((item) => str(item)).filter(Boolean) : []);
const num = (value: unknown, fallback: number): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
const lineId = (value: unknown): string | number | undefined => (typeof value === 'string' && value ? value : typeof value === 'number' ? value : undefined);

function changeLines(value: unknown): ChangeLine[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => (isObj(item) ? [{ label: str(item.label), before: str(item.before), after: str(item.after) }] : []));
}

/** The lists of lines a record or document answer describes (layout.lists), each with its rules and, on a record, its lines. */
export function listsOf(answer: unknown): ListRules[] {
  const layout = isObj(answer) && isObj(answer.layout) ? answer.layout : undefined;
  const lists = layout && Array.isArray(layout.lists) ? layout.lists : [];
  return lists.flatMap((list) => {
    if (!isObj(list) || typeof list.key !== 'string' || !list.key) return [];
    const nameKey = typeof list.nameKey === 'string' && list.nameKey ? list.nameKey : undefined;
    const lines = Array.isArray(list.lines)
      ? list.lines.flatMap((line, index): ListLine[] => {
          if (!isObj(line)) return [];
          const id = lineId(line.id);
          const name = nameKey ? str(line[nameKey]) : '';
          return [{ row: num(line.row, index + 1), ...(id === undefined ? {} : { id }), ...(name ? { name } : {}), words: str(line.words) }];
        })
      : undefined;
    const rules: ListRules = {
      key: list.key,
      label: str(list.label, list.key),
      noun: str(list.noun, 'line'),
      canAdd: list.canAdd === true,
      canRemove: list.canRemove === true,
      ...(typeof list.whyFixed === 'string' && list.whyFixed ? { whyFixed: list.whyFixed } : {}),
      minLines: num(list.minLines, 0),
      maxAddAtOnce: num(list.maxAddAtOnce, 1),
      ...(nameKey ? { nameKey } : {}),
      ...(typeof list.numberKey === 'string' && list.numberKey ? { numberKey: list.numberKey } : {}),
      ...(list.scalar === true ? { scalar: true } : {}),
      ...(typeof list.within === 'string' && list.within ? { within: list.within } : {}),
      item: strings(list.item),
      writable: strings(list.writable),
      ...(typeof list.count === 'number' ? { count: list.count } : lines ? { count: lines.length } : {}),
      ...(lines ? { lines } : {}),
    };
    return [rules];
  });
}

const NOT_UNDERSTOOD = 'DCRS answered in a way the assistant does not understand.';

/** A dry run's answer as DCRS gives it. A DCRS without dry runs (before §113) answers a real change: refused here, so nothing is written unasked. */
export function previewOf(answer: unknown): ChangePreview {
  if (!isObj(answer) || answer.dryRun !== true) {
    throw new ConnectorError('unavailable', "This DCRS server cannot say what a change would do before making it. It needs updating to the version with the phone's record changes (§113).");
  }
  return {
    dryRun: true,
    recordId: str(answer.recordId),
    title: str(answer.title, 'the record'),
    status: str(answer.status),
    editable: answer.editable === true,
    willReopen: answer.willReopen === true,
    reasonNeeded: answer.reasonNeeded === true,
    changes: changeLines(answer.changes),
    added: Array.isArray(answer.added) ? answer.added.flatMap((item) => (isObj(item) ? [{ collection: str(item.collection), words: str(item.words) }] : [])) : [],
    removed: strings(answer.removed),
    cleared: strings(answer.cleared),
    problems: strings(answer.problems),
  };
}

/** A real change's answer: what DCRS did, with the ids of the lines it added. */
export function changeMade(answer: unknown): ChangeMade {
  if (!isObj(answer)) throw new ConnectorError('unavailable', NOT_UNDERSTOOD);
  return {
    recordId: str(answer.recordId),
    status: str(answer.status),
    editable: answer.editable === true,
    actions: strings(answer.actions),
    changes: changeLines(answer.changes),
    moreChanges: num(answer.moreChanges, 0),
    reopened: answer.reopened === true,
    added: Array.isArray(answer.added)
      ? answer.added.flatMap((item) =>
          isObj(item) ? [{ collection: str(item.collection), id: lineId(item.id) ?? null, row: typeof item.row === 'number' ? item.row : null, words: str(item.words) }] : [],
        )
      : [],
    removed: strings(answer.removed),
    cleared: strings(answer.cleared),
    problems: strings(answer.problems),
  };
}

/** The patch that takes the lines a change added off again, by their ids as DCRS stored them; null when none has an id. */
export function undoPatch(made: Pick<ChangeMade, 'added'>): { removeItems: Record<string, (string | number)[]> } | null {
  const removeItems: Record<string, (string | number)[]> = {};
  for (const line of made.added) {
    if (line.id === null || !line.collection) continue;
    (removeItems[line.collection] ??= []).push(line.id);
  }
  return Object.keys(removeItems).length > 0 ? { removeItems } : null;
}

// THE WORDS, in English, Gujarati and Hindi (the languages people use with Mitra). What a line is called comes from
// DCRS in the X-Language asked, inside `removed`, `cleared`, `added[].words` and `title`; these are the sentences around them.
const ROW_MARKS = new Set(['(no row)', '(row removed)']);

interface Words {
  remove(line: string): string;
  clear(what: string): string;
  add(words: string): string;
  set(label: string, after: string): string;
  /** The card's sentence: the acts (joined) in the record. A question when a line is deleted or cleared. */
  card(acts: string, title: string, asks: boolean): string;
  reopen(title: string, status: string, acts: string, reason: string): string;
  reasonNeeded(title: string, status: string): string;
  nothingToDo: string;
  and: string;
  /** What a change did, for the reply: each kind as a sentence. */
  didAdd(lines: string): string;
  didRemove(lines: string): string;
  didClear(what: string): string;
  didReopen: string;
  undo: string;
}

const WORDS: Record<Language, Words> = {
  en: {
    remove: (line) => `delete ${line}`,
    clear: (what) => `clear ${what}`,
    add: (words) => `add a line (${words})`,
    set: (label, after) => `set ${label} to ${after || 'blank'}`,
    card: (acts, title, asks) => `${cap(acts)} in ${title}${asks ? '?' : '.'}`,
    reopen: (title, status, acts, reason) => `${cap(title)} is ${status}. Reopen it for correction and ${acts}? Reason: “${reason}”. It will need submitting and verifying again.`,
    reasonNeeded: (title, status) => `${cap(title)} is ${status}. Changing it reopens it for correction, which needs a reason: ask the person why, then call edit_record again with the reason.`,
    nothingToDo: 'Nothing on the form would change.',
    and: ' and ',
    didAdd: (lines) => `Added ${lines}.`,
    didRemove: (lines) => `Deleted ${lines}.`,
    didClear: (what) => `Cleared ${what}.`,
    didReopen: 'The record was reopened for correction: it needs submitting and verifying again.',
    undo: 'To undo the added line(s), call edit_record with this patch (DCRS will ask the person first):',
  },
  gu: {
    remove: (line) => `${line} કાઢી નાખો`,
    clear: (what) => `${what} ખાલી કરો`,
    add: (words) => `એક લાઇન ઉમેરો (${words})`,
    set: (label, after) => `${label} = ${after || 'ખાલી'}`,
    card: (acts, title, asks) => `${title}માં ${acts}${asks ? '?' : '.'}`,
    reopen: (title, status, acts, reason) => `${title} ${status} છે. સુધારા માટે ફરી ખોલીને ${acts}? કારણ: “${reason}”. પછી ફરીથી સબમિટ અને વેરિફાય કરવું પડશે.`,
    reasonNeeded: (title, status) => `${title} ${status} છે. બદલવા માટે તે સુધારા માટે ફરી ખોલવું પડે, જેનું કારણ જોઈએ: વ્યક્તિને કારણ પૂછો, પછી edit_record ફરી reason સાથે કરો.`,
    nothingToDo: 'ફોર્મમાં કંઈ બદલાશે નહીં.',
    and: ' અને ',
    didAdd: (lines) => `${lines} ઉમેરી.`,
    didRemove: (lines) => `${lines} કાઢી નાખી.`,
    didClear: (what) => `${what} ખાલી કર્યું.`,
    didReopen: 'રેકોર્ડ સુધારા માટે ફરી ખોલાયો: તેને ફરીથી સબમિટ અને વેરિફાય કરવો પડશે.',
    undo: 'ઉમેરેલી લાઇન પાછી કાઢવા (Undo) edit_record આ patch સાથે કરો (DCRS પહેલાં વ્યક્તિને પૂછશે):',
  },
  hi: {
    remove: (line) => `${line} हटाएँ`,
    clear: (what) => `${what} खाली करें`,
    add: (words) => `एक लाइन जोड़ें (${words})`,
    set: (label, after) => `${label} = ${after || 'खाली'}`,
    card: (acts, title, asks) => `${title} में ${acts}${asks ? '?' : '.'}`,
    reopen: (title, status, acts, reason) => `${title} ${status} है। सुधार के लिए फिर खोलकर ${acts}? कारण: “${reason}”। फिर से सबमिट और वेरिफ़ाई करना होगा।`,
    reasonNeeded: (title, status) => `${title} ${status} है। बदलने के लिए उसे सुधार के लिए फिर खोलना होगा, जिसका कारण चाहिए: व्यक्ति से कारण पूछें, फिर edit_record को reason के साथ दोबारा करें।`,
    nothingToDo: 'फ़ॉर्म में कुछ नहीं बदलेगा।',
    and: ' और ',
    didAdd: (lines) => `${lines} जोड़ी।`,
    didRemove: (lines) => `${lines} हटाई।`,
    didClear: (what) => `${what} खाली किया।`,
    didReopen: 'रिकॉर्ड सुधार के लिए फिर खोला गया: उसे फिर से सबमिट और वेरिफ़ाई करना होगा।',
    undo: 'जोड़ी गई लाइन वापस हटाने (Undo) के लिए edit_record को इस patch के साथ करें (DCRS पहले व्यक्ति से पूछेगा):',
  },
};

const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** "a, b and c". */
function joined(parts: readonly string[], and: string): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')}${and}${parts.at(-1)}`;
}

/** The most of a card's words: about a phone screen. */
const CARD_CHARS = 600;

function cut(text: string, max = CARD_CHARS): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** The acts a dry run names, each in words: lines deleted, boxes cleared, lines added, values set. */
function acts(preview: ChangePreview, w: Words): string[] {
  const out: string[] = [];
  for (const line of preview.removed) out.push(w.remove(line));
  for (const what of preview.cleared) out.push(w.clear(what));
  for (const line of preview.added) out.push(w.add(line.words));
  for (const change of preview.changes) {
    if (ROW_MARKS.has(change.before) || ROW_MARKS.has(change.after)) continue;
    if (change.after === '' && preview.cleared.length > 0) continue;
    out.push(w.set(change.label, change.after));
  }
  return out;
}

/**
 * The confirmation card's words, from DCRS's dry run: what is deleted or cleared is asked, what is added is listed,
 * and a signed-off record says it will be reopened with the person's reason. Thrown as invalid_request when the dry
 * run would change nothing, and when a signed-off record needs a reason the person has not given yet.
 */
export function cardWords(preview: ChangePreview, language: Language, reason: string | undefined): string {
  const w = WORDS[language];
  const did = acts(preview, w);
  if (did.length === 0) throw new ConnectorError('invalid_request', [w.nothingToDo, ...preview.problems].join(' '));
  if (preview.willReopen && (preview.reasonNeeded || !reason)) throw new ConnectorError('invalid_request', w.reasonNeeded(preview.title, preview.status));
  const asks = preview.removed.length > 0 || preview.cleared.length > 0;
  const list = joined(did, w.and);
  if (preview.willReopen) return cut(w.reopen(preview.title, preview.status, list, reason ?? ''));
  return cut(w.card(list, preview.title, asks));
}

/** What a change did, for the reply: the lines added (by their words), deleted and cleared, and the reopening. */
export function madeWords(made: ChangeMade, language: Language): string {
  const w = WORDS[language];
  const said: string[] = [];
  if (made.added.length > 0) said.push(w.didAdd(joined(made.added.map((line) => line.words), w.and)));
  if (made.removed.length > 0) said.push(w.didRemove(joined(made.removed, w.and)));
  if (made.cleared.length > 0) said.push(w.didClear(joined(made.cleared, w.and)));
  if (made.reopened) said.push(w.didReopen);
  return said.join(' ');
}

/** The note that tells the model how to offer Undo, with the patch that takes the added lines off. */
export function undoNote(made: ChangeMade, language: Language): { undo: string; undoPatch: Record<string, unknown> } | null {
  const patch = undoPatch(made);
  return patch ? { undo: WORDS[language].undo, undoPatch: patch } : null;
}

/** The lists of a record as the model is best given them: the rules, and the lines as a table by row, id and words. */
export function listsForModel(lists: readonly ListRules[]): unknown[] {
  return lists.map((list) => {
    const { lines, ...rules } = list;
    return {
      ...rules,
      ...(lines && lines.length > 0
        ? { lines: lines.map((line) => ({ row: line.row, ...(line.id === undefined ? {} : { id: line.id }), words: line.words })) }
        : {}),
    };
  });
}
