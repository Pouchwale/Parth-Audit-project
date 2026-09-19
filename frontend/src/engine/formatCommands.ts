import type { LogColumn, LogFieldType, LogHeaderField, LogSheetLayout } from "../types";
import { documentTextIn } from "../i18n/documentText";
import type { Language } from "../i18n/strings";
import {
  FIELD_TYPE_LABELS,
  addBox,
  addColumn,
  addPrintedRow,
  copyLabel,
  describeFormatChange,
  duplicateBox,
  duplicateColumn,
  duplicatePrintedRow,
  moveBox,
  moveColumn,
  movePrintedRow,
  printedRowsOf,
  removeBox,
  removeColumn,
  removePrintedRow,
  renameBox,
  renameColumn,
  setBoxType,
  setColumnRequired,
  setColumnType,
  setInstructions,
  setPrintedCell,
  type BoxArea,
  type FormatDraft,
  type PrintedRow,
} from "./formatOps";

// A FORMAT CHANGED BY SAYING SO (REQUIREMENTS §64).
//
// "add a column Batch No. after Remarks", "delete the box Serial No", "rename
// the line Special ink to Special inks", "make Result a choice of Pass, Fail",
// "move Batch No. to the left" — typed or spoken to Mitra. Everything here is
// read with no network and no model: a sentence either reads as a change to
// the format or it does not, and one that does is turned into a draft with the
// SAME operations the designer and the Edit format dialog use
// (engine/formatOps.ts). Nothing is saved here; the widget asks first and saves
// through commitFormatChange, or puts the change on an open designer's draft.
//
// TWO RULES THAT KEEP IT SAFE:
//   * A thing is found by the words printed on the form — whatever the case or
//     the punctuation, and by the English reading of a Gujarati form — an exact
//     match first, then every word that was said. MORE THAN ONE MATCH IS NEVER
//     GUESSED: the person is asked which, with the completed sentences to tap.
//     Nothing matched says what the sheet does have.
//   * "row" and "line" mean the format only where the FORM prints its lines
//     (rowMode "fixedRows"). On every other sheet a line is what a person
//     writes, which is the record's (engine/recordRowCommands.ts), so the
//     sentence is not a format command at all.

export type FormatNoun = "column" | "box" | "line";

/** What a person called a thing: its words, or its place ("line 3", "the last column"). */
export interface TargetRef {
  /** Said outright — "the Remarks column"; absent when only the name was given. */
  noun?: FormatNoun;
  area?: BoxArea;
  /** "field" is what people call a box, and sometimes a column: a box is looked for first. */
  loose?: boolean;
  said: string;
  /** Its place, when that is how it was named. */
  index?: number | "last";
}

export type Place = { rel: "after" | "before"; ref: TargetRef } | { rel: "start" | "end" };

export type FormatCommand =
  | {
      kind: "add";
      noun: FormatNoun;
      area?: BoxArea;
      label: string;
      /** A printed line's words, one per printed column ("Printing / Special ink"). */
      values?: string[];
      /** Blank printed lines: "add 2 lines". */
      count?: number;
      type?: LogFieldType;
      options?: string[];
      required?: boolean;
      place?: Place;
      /** The name with the place still in it, in case "after …" was part of the name after all. */
      whole?: string;
    }
  | { kind: "remove"; target: TargetRef }
  | { kind: "rename"; target: TargetRef; to: string }
  | { kind: "duplicate"; target: TargetRef }
  | { kind: "move"; target: TargetRef; to: { by: number } | Place }
  | { kind: "required"; target: TargetRef; required: boolean }
  | { kind: "type"; target: TargetRef; type: LogFieldType; options?: string[] }
  | { kind: "renameFormat"; name: string }
  | { kind: "addInstruction"; text: string }
  | { kind: "removeInstruction"; index: number | "last" };

export type FormatCommandResult =
  // `plan` is the change still to be made ("add the column …"), `what` the same once made ("added the column …").
  | { ok: true; draft: FormatDraft; what: string; plan: string }
  // A question (which one? what name?) — or, with `refused`, something that cannot be done, and why.
  | { ok: false; ask: string; choices?: string[]; refused?: boolean };

// ---------------------------------------------------------------------------
// the sentence, tidied

// Anything in quotes is a name exactly as written: it is set aside before the
// sentence is read, so a name like "Checked before dispatch" is never split at
// its "before".
const Q_OPEN = "\uE000";
const Q_CLOSE = "\uE001";

function protect(text: string): { s: string; quoted: string[] } {
  const quoted: string[] = [];
  const keep = (inner: string): string => {
    quoted.push(inner.trim());
    return `${Q_OPEN}${quoted.length - 1}${Q_CLOSE}`;
  };
  let s = text.replace(/"([^"]+)"|“([^”]+)”/g, (_m, a: string | undefined, b: string | undefined) => keep(a ?? b ?? ""));
  s = s.replace(/(^|\s)'([^']+)'(?=$|[\s,.;:!?])/g, (_m, lead: string, inner: string) => `${lead}${keep(inner)}`);
  return { s, quoted };
}

// "Batch No." ends in a full stop that belongs to the name; "delete the Remarks column." does not.
const ABBREVIATION_END = /\b(?:no|nos|sr|qty|dt|ref|wt|dia|mfg|exp|dept|sig|insp|spec|std|avg|amt|pcs|temp|approx|max|min|tel|mob|ltd|pvt|fig|vol|rev|obs)\.$/i;
const LEAD =
  /^(?:(?:hey|hi|hello|ok|okay)[,!]?\s+)?(?:mitra[,:!]?\s+)?(?:(?:please|pls|kindly|now|then|also|and|just)[,]?\s+)*(?:(?:can|could|would|will)\s+you\s+(?:please\s+|kindly\s+|just\s+)?|i\s+(?:want|need|would\s+like)\s+(?:you\s+)?to\s+|i'd\s+like\s+(?:you\s+)?to\s+|let'?s\s+|you\s+(?:should|can|may)\s+)?/i;
const TAIL = /\s+(?:(?:from|to|on|in|of|into|onto)\s+(?:the|this|that)\s+(?:sheet|format|form|document|register|table|grid)|for\s+me|please|pls|thanks|thank\s+you)$/i;

function tidy(text: string): string {
  let s = text.trim().replace(/\s+/g, " ").replace(/[!?]+$/, "").trim();
  if (!ABBREVIATION_END.test(s)) s = s.replace(/\.+$/, "").trim();
  s = s.replace(LEAD, "");
  for (let i = 0; i < 2; i++) s = s.replace(TAIL, "");
  return s.trim();
}

const NUMBER_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const countOf = (word: string | undefined): number => (word === undefined ? 1 : /^\d+$/.test(word) ? Number(word) : (NUMBER_WORDS[word.toLowerCase()] ?? 1));

const ORDINAL_WORDS: Record<string, number | "last"> = { first: 0, second: 1, third: 2, fourth: 3, fifth: 4, sixth: 5, seventh: 6, eighth: 7, ninth: 8, tenth: 9, last: "last", final: "last" };
const ordinalOf = (word: string): number | "last" => ORDINAL_WORDS[word.toLowerCase()] ?? Number.parseInt(word, 10) - 1;

// The pieces the sentences are read with. The app calls them boxes; people say
// box, field or header field — and "row" as often as "line".
const NOUN = "(?:(?:header|footer|top|bottom)\\s+)?(?:box|boxes|fields?)|columns?|cols?|headings?|(?:printed\\s+)?(?:lines?|rows?)";
const NOUN_GRID = "(?:(?:header|footer|top|bottom)\\s+)?(?:box|boxes|fields?)|columns?|cols?|headings?";
const ORDINAL = "first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last|final|\\d{1,3}(?:st|nd|rd|th)";
const ARTICLES = "(?:(?:the|a|an|one|another|new|extra|this|that)\\s+)*";
const TYPE = "text|words|numbers?|numeric|figure|date|time|yes\\s*/\\s*no|yes[- ]no|yes\\s+or\\s+no|yesno|tick|checkbox|choices?|select|selection|drop[- ]?down|list|options?";
const ADD = "add|insert|create|put\\s+in|put|make|append|include|new|give\\s+me|i\\s+want|i\\s+need|we\\s+need";
const DELETE = "delete|remove|drop|erase|scrap|strike\\s+(?:off|out)|get\\s+rid\\s+of|take\\s+(?:off|out|away)";
const MOVE = "move|shift|bring|put|send|push|slide|place";
const STEPS = "\\d{1,2}|one|two|three|four|five|six";
const UNIT = "places?|steps?|positions?|spots?|columns?|lines?|rows?|box(?:es)?";

function nounOf(word: string): { noun: FormatNoun; area?: BoxArea; loose?: boolean } {
  const w = word.toLowerCase();
  if (/col|heading/.test(w)) return { noun: "column" };
  if (/box|field/.test(w)) return { noun: "box", area: /^(?:footer|bottom)/.test(w) ? "footer" : /^(?:header|top)/.test(w) ? "header" : undefined, loose: /field/.test(w) || undefined };
  return { noun: "line" };
}

function typeOf(word: string): LogFieldType {
  const w = word.toLowerCase();
  if (/^num|figure/.test(w)) return "number";
  if (w === "date") return "date";
  if (w === "time") return "time";
  if (/^yes|tick|checkbox/.test(w)) return "yesno";
  if (/choice|select|drop|list|option/.test(w)) return "select";
  return "text";
}

// ---------------------------------------------------------------------------
// finding a thing by what it is called

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9\u0A80-\u0AFF]+/g, " ").trim();
const sameWord = (a: string, b: string): boolean => a === b || a === `${b}s` || b === `${a}s`;

/** Every way one printed label can be said: as printed, in English, and either side of a bracket — "Viscosity (20.0 ± 1.0 Sec.)" answers to "viscosity". */
function readingsOf(label: string): string[] {
  const out = new Set<string>();
  const english = documentTextIn(label, "en");
  for (const l of english === label ? [label] : [label, english]) {
    out.add(norm(l));
    const bracket = l.indexOf(" (");
    if (bracket > 0) {
      out.add(norm(l.slice(0, bracket)));
      out.add(norm(l.slice(bracket + 2).replace(/\)\s*$/, "")));
    }
  }
  out.delete("");
  return Array.from(out);
}

/**
 * The items `said` names: those called exactly that, else those whose name
 * holds every word that was said. Several may come back — the caller asks.
 */
export function findByLabel<T>(items: T[], namesOf: (item: T) => string[], said: string): T[] {
  const want = norm(said);
  if (!want) return [];
  const read = items.map((item) => ({ item, readings: namesOf(item).flatMap(readingsOf) }));
  const exact = read.filter((r) => r.readings.includes(want));
  if (exact.length > 0) return exact.map((r) => r.item);
  const words = want.split(" ");
  return read
    .filter((r) =>
      r.readings.some((reading) => {
        const have = reading.split(" ");
        return words.every((w) => have.some((h) => sameWord(h, w)));
      })
    )
    .map((r) => r.item);
}

type Thing =
  | { noun: "column"; key: string; label: string; index: number; names: string[]; item: LogColumn }
  | { noun: "box"; area: BoxArea; key: string; label: string; index: number; names: string[]; item: LogHeaderField }
  | { noun: "line"; index: number; label: string; names: string[]; row: PrintedRow };

const printedColumnsOf = (layout: LogSheetLayout): LogColumn[] => layout.columns.filter((c) => c.fixed);

// A form that merges a cell down several lines — the process beside its
// materials — is transcribed with the word repeated on each of them. Such a
// column groups the lines; it does not name them.
function groupingKeys(layout: LogSheetLayout): Set<string> {
  const rows = printedRowsOf(layout) ?? [];
  const printed = printedColumnsOf(layout);
  const out = new Set<string>();
  if (printed.length < 2) return out;
  for (const c of printed) {
    for (let i = 1; i < rows.length; i++) {
      const v = String(rows[i][c.key] ?? "");
      if (v && v === String(rows[i - 1][c.key] ?? "")) {
        out.add(c.key);
        break;
      }
    }
  }
  // Every printed column repeating would leave a line with no name at all: the last one is its name then.
  if (out.size === printed.length) out.delete(printed[printed.length - 1].key);
  return out;
}

/** The printed column a line is known by: the first that is not the grouping one. */
function nameColumnKey(layout: LogSheetLayout): string | undefined {
  const printed = printedColumnsOf(layout);
  const grouping = groupingKeys(layout);
  return (printed.find((c) => !grouping.has(c.key)) ?? printed[0])?.key ?? Object.keys((printedRowsOf(layout) ?? [])[0] ?? {})[0];
}

const columnThings = (layout: LogSheetLayout): Thing[] => layout.columns.map((item, index) => ({ noun: "column", key: item.key, label: item.label, index, names: [item.label], item }));

function boxThings(layout: LogSheetLayout, area?: BoxArea): Thing[] {
  const of = (a: BoxArea, boxes: LogHeaderField[]): Thing[] => boxes.map((item, index) => ({ noun: "box", area: a, key: item.key, label: item.label, index, names: [item.label], item }));
  return [...(area === "footer" ? [] : of("header", layout.headerFields)), ...(area === "header" ? [] : of("footer", layout.footerFields ?? []))];
}

function lineThings(layout: LogSheetLayout): Thing[] {
  const rows = printedRowsOf(layout) ?? [];
  const printed = printedColumnsOf(layout);
  const nameKey = nameColumnKey(layout);
  return rows.map((row, index) => {
    const names = printed.map((c) => String(row[c.key] ?? "")).filter(Boolean);
    return { noun: "line", index, label: String((nameKey ? row[nameKey] : "") ?? "") || names[0] || "", names, row };
  });
}

function resolve(layout: LogSheetLayout, ref: TargetRef): Thing[] {
  const pool: Thing[] = [];
  if (!ref.noun || ref.noun === "column") pool.push(...columnThings(layout));
  if (!ref.noun || ref.noun === "box") pool.push(...boxThings(layout, ref.area));
  if ((!ref.noun || ref.noun === "line") && printedRowsOf(layout)) pool.push(...lineThings(layout));
  if (ref.index !== undefined) {
    // "column 3" is the third column — unless a column is actually called "3".
    if (ref.noun !== "line" && /^\d+$/.test(ref.said)) {
      const called = pool.filter((t) => t.names.some((n) => norm(n) === ref.said));
      if (called.length > 0) return called;
    }
    const at = ref.index === "last" ? pool.length - 1 : ref.index;
    return pool[at] ? [pool[at]] : [];
  }
  const hits = findByLabel(pool, (t) => t.names, ref.said);
  if (hits.length === 0 && ref.loose) return findByLabel(columnThings(layout), (t) => t.names, ref.said);
  return hits;
}

// ---------------------------------------------------------------------------
// reading the sentence

interface Reading {
  layout: LogSheetLayout | undefined;
  /** Puts the quoted names back. */
  unq: (s: string) => string;
}

const PRONOUN = /^(?:it|this|that|them|these|those|everything|all|one)$/i;

/**
 * "the Remarks column", "column Remarks", "line 3", "the last box", or a bare
 * "Remarks". A sentence can read more than one way — "the line speed column"
 * starts with a noun and ends with one — so each reading is tried against the
 * sheet and the first that names something on it wins. A bare name has to be
 * on the sheet, or the sentence was not about the format at all.
 */
function readTarget(raw: string, r: Reading, fallback?: FormatNoun): TargetRef | null {
  // "duplicate this record", "delete the sheet": the record itself, which is not the format's to change.
  if (/^(?:this|that|the|my|current)\s+(?:record|sheet|report|entry|document|form|checklist|register|page)$/i.test(raw.trim())) return null;
  const s = raw.trim().replace(/^(?:the|this|that)\s+/i, "");
  if (!s) return null;
  const printsLines = !!r.layout && r.layout.rowMode.kind === "fixedRows";
  const usable = (t: TargetRef): boolean => !!t.said && !PRONOUN.test(t.said) && (t.noun !== "line" || printsLines);

  let m = s.match(new RegExp(`^(${ORDINAL})\\s+(${NOUN})$`, "i"));
  if (m) {
    const t: TargetRef = { ...nounOf(m[2]), said: m[1], index: ordinalOf(m[1]) };
    return usable(t) ? t : null;
  }
  m = s.match(new RegExp(`^(${NOUN})\\s+(?:no\\.?\\s*|number\\s+|#\\s*)?(\\d{1,3})$`, "i"));
  if (m) {
    const t: TargetRef = { ...nounOf(m[1]), said: m[2], index: Number(m[2]) - 1 };
    return usable(t) ? t : null;
  }

  const readings: TargetRef[] = [];
  const last = s.match(new RegExp(`^(.+?)\\s+(${NOUN})$`, "i"));
  if (last) readings.push({ ...nounOf(last[2]), said: r.unq(last[1]) });
  const first = s.match(new RegExp(`^(${NOUN})\\s+(?:(?:called|named|titled|labelled|labeled)\\s+)?(.+)$`, "i"));
  if (first) readings.push({ ...nounOf(first[1]), said: r.unq(first[2]) });
  const bare: TargetRef = { noun: fallback, said: r.unq(s) };
  const all = [...readings, bare].filter(usable);

  const layout = r.layout;
  if (!layout) return all.find((t) => t.noun && t !== bare) ?? null;
  const found = all.find((t) => resolve(layout, t).length > 0);
  if (found) return found;
  return all.find((t) => t !== bare || !!fallback) ?? null;
}

type RawPlace = { rel: "after" | "before"; said: string } | { rel: "start" | "end" | "top" | "bottom" | "aboveGrid" | "belowGrid" };

/** Takes "after Remarks", "at the end", "above the grid" off the end of a name. */
function peelPlace(s: string): { rest: string; place?: RawPlace } {
  let m = s.match(/^(.*?)\s*\b(above|over|on\s+top\s+of|below|under|underneath|beneath)\s+the\s+(?:grid|table|columns|sheet)$/i);
  if (m) return { rest: m[1].trim(), place: { rel: /^(?:above|over|on)/i.test(m[2]) ? "aboveGrid" : "belowGrid" } };
  m = s.match(/^(.*?)\s*\b(?:at|to)\s+the\s+(?:very\s+)?(top|head|bottom|foot)(?:\s+of\s+the\s+(?:sheet|form|format|page|grid|table|list))?$/i);
  if (m) return { rest: m[1].trim(), place: { rel: /^(?:top|head)$/i.test(m[2]) ? "top" : "bottom" } };
  m = s.match(/^(.*?)\s*\b(?:at|to|as)\s+(?:the\s+)?(?:very\s+)?(end|start|beginning|front|back|first|last)(?:\s+(?:place|position|one))?(?:\s+of\s+the\s+(?:sheet|form|format|page|grid|table|list|columns|lines))?$/i);
  if (m) return { rest: m[1].trim(), place: { rel: /^(?:end|back|last)$/i.test(m[2]) ? "end" : "start" } };
  m = s.match(/^(.+?)\s+(first|last)$/i);
  if (m) return { rest: m[1].trim(), place: { rel: /^last$/i.test(m[2]) ? "end" : "start" } };
  m = s.match(/^(.*?)\s*\b(after|before|in\s+front\s+of|ahead\s+of|behind|next\s+to|beside|following|above|below|under|to\s+the\s+(?:left|right)\s+of|(?:left|right)\s+of)\s+(.+)$/i);
  if (m) return { rest: m[1].trim(), place: { rel: /^(?:before|in\s+front|ahead|above|to\s+the\s+left|left)/i.test(m[2]) ? "before" : "after", said: m[3].trim() } };
  return { rest: s };
}

const optionsOf = (s: string, r: Reading): string[] =>
  s
    .split(/\s*(?:,|;|\/|\||\bor\b|\band\b)\s*/i)
    .map((o) => r.unq(o))
    .filter(Boolean);

/** Takes "with Pass, Fail, Hold" off the end of a name: always when the choices are announced, else only for a choice column. */
function peelOptions(s: string, isSelect: boolean, r: Reading): { rest: string; options?: string[] } {
  const m = s.match(/^(.*?)\s*(?:\b(?:with|having)\s+(?:the\s+)?(?:(choices?|options?|values?)\s*(?:of\s+|:\s*|being\s+|as\s+)?)?|\b(choices?|options?)\s*(?::|of|are|being)?\s+|:\s*)(.+)$/i);
  if (!m) return { rest: s };
  if (!isSelect && !m[2] && !m[3]) return { rest: s };
  const options = optionsOf(m[4], r);
  return options.length > 0 ? { rest: m[1].trim(), options } : { rest: s };
}

function placeFrom(raw: RawPlace | undefined, noun: FormatNoun, r: Reading): { place?: Place; area?: BoxArea } {
  if (!raw) return {};
  if ("said" in raw) {
    const ref = readTarget(raw.said, r, noun);
    return ref ? { place: { rel: raw.rel, ref } } : {};
  }
  if (raw.rel === "aboveGrid" || raw.rel === "belowGrid") return noun === "box" ? { area: raw.rel === "aboveGrid" ? "header" : "footer" } : {};
  if (raw.rel === "top" || raw.rel === "bottom") return noun === "box" ? { area: raw.rel === "top" ? "header" : "footer" } : { place: { rel: raw.rel === "top" ? "start" : "end" } };
  return { place: { rel: raw.rel } };
}

function readInstruction(s: string, r: Reading): FormatCommand | null {
  // Not "give me instructions" or "I need instructions on …" — those ask Mitra for help, not the form for a new line.
  let m = s.match(new RegExp(`^(?:add|insert|append|include|write|print|put(?:\\s+in)?)\\s+${ARTICLES}(?:printed\\s+)?instructions?\\s*(?:[:\\-–—]|saying|that\\s+says|which\\s+says|reading)?\\s*(.+)$`, "i"));
  if (m && r.unq(m[1])) return { kind: "addInstruction", text: r.unq(m[1]) };
  m = s.match(new RegExp(`^(?:${DELETE})\\s+(?:the\\s+)?(?:printed\\s+)?instructions?\\s*(?:no\\.?\\s*|number\\s+|#\\s*)?(\\d{1,2})$`, "i"));
  if (m) return { kind: "removeInstruction", index: Number(m[1]) - 1 };
  m = s.match(new RegExp(`^(?:${DELETE})\\s+(?:the\\s+)?(${ORDINAL})\\s+(?:printed\\s+)?instructions?$`, "i"));
  if (m) return { kind: "removeInstruction", index: ordinalOf(m[1]) };
  return null;
}

const FORMAT_WORD = "format|document|form|sheet|register";

function readFormatName(s: string, r: Reading): FormatCommand | null {
  const m =
    s.match(new RegExp(`^(?:rename|retitle|relabel)\\s+(?:this|the)\\s+(?:${FORMAT_WORD})\\s+(?:to|as)\\s+(.+)$`, "i")) ??
    s.match(new RegExp(`^(?:call|name|title)\\s+(?:this|the)\\s+(?:${FORMAT_WORD})\\s+(?:as\\s+)?(.+)$`, "i")) ??
    s.match(new RegExp(`^(?:change|set)\\s+(?:the\\s+)?(?:name|title)\\s+of\\s+(?:this|the)\\s+(?:${FORMAT_WORD})\\s+(?:to|as)\\s+(.+)$`, "i")) ??
    s.match(new RegExp(`^(?:change|set)\\s+(?:this|the)\\s+(?:${FORMAT_WORD})(?:'s|’s)?\\s+(?:name|title)\\s+(?:to|as)\\s+(.+)$`, "i"));
  const name = m ? r.unq(m[1]) : "";
  return name ? { kind: "renameFormat", name } : null;
}

const REQUIRED_OFF = "not\\s+required|not\\s+mandatory|not\\s+compulsory|optional|no\\s+longer\\s+required|non[- ]mandatory";
const REQUIRED_ON = "required|mandatory|compulsory|a\\s+must";

function readRequired(s: string, r: Reading): FormatCommand | null {
  const m =
    s.match(new RegExp(`^make\\s+(.+?)\\s+(?:as\\s+|to\\s+be\\s+)?(${REQUIRED_OFF}|${REQUIRED_ON})$`, "i")) ??
    s.match(new RegExp(`^(.+?)\\s+(?:is|are|should\\s+be|must\\s+be|has\\s+to\\s+be|needs\\s+to\\s+be|becomes)\\s+(${REQUIRED_OFF}|${REQUIRED_ON})$`, "i"));
  if (!m) return null;
  const target = readTarget(m[1], r);
  if (!target) return null;
  // "Remarks is not required" said of a BOX could as well be the words to write
  // in it; only a column, or a thing called by its noun, makes it the format's.
  if (!target.noun && r.layout && !resolve(r.layout, target).some((t) => t.noun === "column")) return null;
  return { kind: "required", target, required: !new RegExp(`^(?:${REQUIRED_OFF})$`, "i").test(m[2]) };
}

function readType(s: string, r: Reading): FormatCommand | null {
  const tail = `(?:a\\s+|an\\s+)?(${TYPE})(?:\\s+(?:${NOUN}|type|kind))?(?:\\s*(?:of|between|from|with|:|-)\\s*(?:the\\s+)?(?:(?:choices?|options?|values?)\\s*(?:of\\s+|:\\s*)?)?(.+))?`;
  const m =
    s.match(new RegExp(`^(?:change|set|make|turn|switch|convert)\\s+(?:the\\s+)?(?:type|kind)\\s+of\\s+(.+?)\\s+(?:to|as|into)\\s+${tail}$`, "i")) ??
    s.match(new RegExp(`^(?:make|turn|change|convert|set|switch)\\s+(.+?)\\s+(?:(?:to|into|as)\\s+)?(?:a|an)\\s+(${TYPE})(?:\\s+(?:${NOUN}|type|kind))?(?:\\s*(?:of|between|from|with|:|-)\\s*(?:the\\s+)?(?:(?:choices?|options?|values?)\\s*(?:of\\s+|:\\s*)?)?(.+))?$`, "i"));
  if (!m) return null;
  const target = readTarget(m[1], r);
  if (!target) return null;
  const options = m[3] ? optionsOf(m[3], r) : undefined;
  return { kind: "type", target, type: options?.length ? "select" : typeOf(m[2]), options: options?.length ? options : undefined };
}

function readDuplicate(s: string, r: Reading): FormatCommand | null {
  let m = s.match(new RegExp(`^(?:(?:${ADD})\\s+)?(?:another|one\\s+more|a\\s+second|a\\s+similar|the\\s+same|a|an|one)\\s+(${NOUN})\\s+(?:just\\s+)?(?:like|same\\s+as|similar\\s+to)\\s+(.+)$`, "i"));
  if (m) {
    const target = readTarget(m[2], r, nounOf(m[1]).noun);
    return target ? { kind: "duplicate", target } : null;
  }
  m = s.match(/^(?:duplicate|copy|clone|repeat)\s+(.+)$/i);
  if (!m) return null;
  const target = readTarget(m[1], r);
  return target ? { kind: "duplicate", target } : null;
}

function readMove(s: string, r: Reading): FormatCommand | null {
  const subject = (raw: string): TargetRef | null => (/^(?:a|an|another|new|one)\s/i.test(raw) ? null : readTarget(raw, r));
  let m = s.match(new RegExp(`^(?:${MOVE})\\s+(.+?)\\s+(?:(?:to|towards)\\s+(?:the\\s+)?)?(left|right|up|down|upwards?|downwards?|forwards?|backwards?)(?:\\s+(?:by\\s+)?(${STEPS})(?:\\s+(?:${UNIT}))?)?$`, "i"));
  if (m) {
    // "move Remarks 2 places right" — but in "move line 4 up" the 4 is the line's, so a count before the direction needs its unit.
    const counted = m[3] ? null : m[1].match(new RegExp(`^(.+?)\\s+(?:by\\s+)?(${STEPS})\\s+(?:${UNIT})$`, "i"));
    const target = subject(counted ? counted[1] : m[1]);
    const back = /^(?:left|up|back)/i.test(m[2]);
    return target ? { kind: "move", target, to: { by: (back ? -1 : 1) * countOf(counted ? counted[2] : m[3]) } } : null;
  }
  m = s.match(new RegExp(`^(?:${MOVE})\\s+(.+)$`, "i"));
  if (!m) return null;
  const { rest, place } = peelPlace(m[1]);
  if (!place || !rest || place.rel === "aboveGrid" || place.rel === "belowGrid") return null;
  const target = subject(rest);
  if (!target) return null;
  if (place.rel === "after" || place.rel === "before") {
    const ref = readTarget(place.said, r, target.noun);
    return ref ? { kind: "move", target, to: { rel: place.rel, ref } } : null;
  }
  return { kind: "move", target, to: { rel: place.rel === "top" || place.rel === "start" ? "start" : "end" } };
}

function readRename(s: string, r: Reading): FormatCommand | null {
  const m = s.match(/^(?:rename|relabel|retitle|reword)\s+(.+?)\s+(?:to|as|into|->|=>|→)\s+(.+)$/i);
  if (m) {
    const target = readTarget(m[1], r);
    const to = r.unq(m[2]);
    return target && to ? { kind: "rename", target, to } : null;
  }
  // "change the heading of Sign to QA Sign". "Change the name of the operator to
  // Ramesh" is a value for a record, so "name" takes the noun with it.
  const of = s.match(/^(?:change|set|edit|correct)\s+(?:the\s+)?(name|label|heading|title|wording|text|words)\s+of\s+(.+?)\s+(?:to|as|into)\s+(.+)$/i);
  if (of) {
    const target = readTarget(of[2], r);
    const to = r.unq(of[3]);
    if (!target || !to || (!target.noun && /^(?:name|text|words)$/i.test(of[1]))) return null;
    return { kind: "rename", target, to };
  }
  // "change column Sign to QA Sign". With "change" the noun has to be said —
  // "change row 2 remarks to ok" is a value on a record (engine/recordPatch.ts),
  // so a line is taken only by its number or its printed words.
  const c = s.match(new RegExp(`^(?:change|reword|correct)\\s+(?:the\\s+)?((?:${NOUN})\\s+.+?|.+?\\s+(?:${NOUN_GRID}))\\s+(?:to|as|into)\\s+(.+)$`, "i"));
  if (!c) return null;
  const target = readTarget(c[1], r);
  const to = r.unq(c[2]);
  if (!target?.noun || !to) return null;
  if (target.noun === "line" && target.index === undefined && /^\d/.test(target.said)) return null;
  return { kind: "rename", target, to };
}

function readRemove(s: string, r: Reading): FormatCommand | null {
  const m = s.match(/^take\s+(.+?)\s+(?:off|out|away)$/i) ?? s.match(new RegExp(`^(?:${DELETE})\\s+(.+)$`, "i"));
  if (!m) return null;
  const target = readTarget(m[1], r);
  // "delete this record", "remove Ramesh": without its noun it is not the format that is meant.
  return target?.noun ? { kind: "remove", target } : null;
}

function buildAdd(noun: { noun: FormatNoun; area?: BoxArea }, rest: string, r: Reading, extra: { count?: string; type?: string; required?: boolean }): FormatCommand | null {
  if (noun.noun === "line" && r.layout?.rowMode.kind !== "fixedRows") return null;
  const isSelect = !!extra.type && typeOf(extra.type) === "select";
  let { rest: named, place: rawPlace } = peelPlace(rest);
  let options: string[] | undefined;
  // "Result after Remarks with Pass, Fail": the choices came after the place.
  if (rawPlace && (rawPlace.rel === "after" || rawPlace.rel === "before")) {
    const inPlace = peelOptions(rawPlace.said, isSelect, r);
    if (inPlace.options) {
      rawPlace = { rel: rawPlace.rel, said: inPlace.rest };
      options = inPlace.options;
    }
  }
  if (!options) {
    const peeled = peelOptions(named, isSelect, r);
    named = peeled.rest;
    options = peeled.options;
  }
  const { place, area } = placeFrom(rawPlace, noun.noun, r);
  const label = r.unq(named.replace(/^(?:called|named|titled)\s+/i, ""));
  const type = options?.length ? "select" : extra.type && noun.noun !== "line" ? typeOf(extra.type) : undefined;
  const cmd: Extract<FormatCommand, { kind: "add" }> = { kind: "add", noun: noun.noun, area: noun.area ?? area, label, type, options, place, required: extra.required || undefined };
  if (rawPlace && (rawPlace.rel === "after" || rawPlace.rel === "before")) cmd.whole = r.unq(rest);
  if (noun.noun === "line") {
    // "create a new line clearance record" starts a record of that document; it is not a printed line called
    // "clearance record". A line that really is called so can be given in quotes.
    if (!named.includes(Q_OPEN) && /\b(?:records?|reports?|sheets?|checklists?|registers?|entry|entries|forms?)$/i.test(label)) return null;
    const parts = named.split(/\s+\/\s+|\s*\|\s*/).map((p) => r.unq(p)).filter(Boolean);
    if (parts.length > 1) cmd.values = parts;
    if (!label && extra.count) cmd.count = Math.min(20, countOf(extra.count));
  }
  return cmd;
}

function readAdd(s: string, r: Reading): FormatCommand | null {
  // "add a Batch No. column after Remarks": the name first, then what it is.
  // "put 5 in the count column" is a value for a record, never a column to add.
  const named = (): FormatCommand | null => {
    const m = s.match(new RegExp(`^(?:${ADD})\\s+${ARTICLES}(.+?)\\s+(${NOUN_GRID})(?:\\s+(.+))?$`, "i"));
    if (!m || /(?:^|\s)(?:in|into|under|onto|on|to|at|for)\s/i.test(m[1])) return null;
    if (m[3]) {
      const after = peelPlace(m[3]);
      if (after.rest || !after.place) return null;
    }
    return buildAdd(nounOf(m[2]), `${m[1]}${m[3] ? ` ${m[3]}` : ""}`, r, {});
  };
  const head = s.match(
    new RegExp(
      `^(?:${ADD})\\s+${ARTICLES}(?:(?<count>\\d{1,2}|two|three|four|five|six|seven|eight|nine|ten)\\s+)?(?<words>(?:(?:more|new|blank|empty|extra|required|mandatory)\\s+)*)(?:(?<type>${TYPE})\\s+)?(?<noun>${NOUN})(?:\\s*(?:called|named|titled|labelled|labeled|saying|reading|for|with\\s+the\\s+(?:name|heading|label|title))\\s+|\\s*[:\\-–—]\\s*|\\s+|$)(?<rest>.*)$`,
      "i"
    )
  )?.groups;
  if (!head) return named();
  const noun = nounOf(head.noun);
  // "add a line speed column": what it ends with says what it is.
  if (noun.noun === "line") {
    const alt = named();
    if (alt) return alt;
  }
  // "add a blank line" is one blank printed line, the way "add 2 lines" is two.
  const count = head.count ?? (/\b(?:blank|empty)\b/i.test(head.words) ? "1" : undefined);
  return buildAdd(noun, head.rest.trim(), r, { count, type: head.type, required: /\b(?:required|mandatory)\b/i.test(head.words) });
}

/**
 * Reads `text` as a change to the format drawn by `layout` (absent for a form
 * the program draws), or returns null when it is not one — a question, a value
 * for the open record, a line of a sheet whose lines are the record's own.
 */
export function parseFormatCommand(text: string, layout: LogSheetLayout | undefined): FormatCommand | null {
  const { s: raw, quoted } = protect(text);
  const s = tidy(raw);
  if (!s) return null;
  const unq = (part: string): string =>
    part
      .replace(/\uE000(\d+)\uE001/g, (_m, i: string) => quoted[Number(i)] ?? "")
      .replace(/\s+/g, " ")
      .trim();
  const r: Reading = { layout, unq };
  return readInstruction(s, r) ?? readFormatName(s, r) ?? readRequired(s, r) ?? readType(s, r) ?? readDuplicate(s, r) ?? readMove(s, r) ?? readRename(s, r) ?? readRemove(s, r) ?? readAdd(s, r);
}

// ---------------------------------------------------------------------------
// the sentence a command is, written out in full — what a "which one?" chip sends back

const quote = (s: string): string => `"${s}"`;

function refWords(ref: TargetRef): string {
  // A box above the grid is said to be so: "the box Date" would answer to the one below it as well, and be asked about for ever.
  const noun = ref.noun === "box" ? `${ref.area === "footer" ? "footer " : ref.area === "header" ? "header " : ""}box` : (ref.noun ?? "");
  if (ref.index !== undefined) return ref.index === "last" ? `the last ${noun}` : `${noun} ${ref.index + 1}`;
  return `${noun ? `the ${noun} ` : ""}${quote(ref.said)}`;
}

const placeWords = (place: Place): string => ("ref" in place ? `${place.rel} ${refWords(place.ref)}` : place.rel === "start" ? "at the start" : "at the end");

const TYPE_WORDS: Record<LogFieldType, string> = { text: "text", number: "number", date: "date", time: "time", yesno: "yes/no", select: "choice" };

export function sentenceFor(cmd: FormatCommand): string {
  switch (cmd.kind) {
    case "add": {
      if (cmd.noun === "line" && cmd.count && !cmd.label) return `add ${cmd.count} blank line${cmd.count === 1 ? "" : "s"}`;
      const noun = cmd.noun === "box" ? `${cmd.area === "footer" ? "footer " : ""}box` : cmd.noun;
      const name = cmd.values?.length ? cmd.values.map(quote).join(" / ") : quote(cmd.label);
      const type = cmd.type && cmd.noun !== "line" ? `${TYPE_WORDS[cmd.type]} ` : "";
      const choices = cmd.options?.length ? ` with choices ${cmd.options.join(", ")}` : "";
      return `add a ${cmd.required ? "required " : ""}${type}${noun} ${name}${choices}${cmd.place ? ` ${placeWords(cmd.place)}` : ""}`;
    }
    case "remove":
      return `delete ${refWords(cmd.target)}`;
    case "rename":
      return `rename ${refWords(cmd.target)} to ${quote(cmd.to)}`;
    case "duplicate":
      return `duplicate ${refWords(cmd.target)}`;
    case "move":
      if ("by" in cmd.to) return `move ${refWords(cmd.target)} ${Math.abs(cmd.to.by)} place${Math.abs(cmd.to.by) === 1 ? "" : "s"} ${cmd.target.noun === "line" ? (cmd.to.by < 0 ? "up" : "down") : cmd.to.by < 0 ? "left" : "right"}`;
      return `move ${refWords(cmd.target)} ${"ref" in cmd.to ? placeWords(cmd.to) : cmd.to.rel === "start" ? "to the start" : "to the end"}`;
    case "required":
      return `make ${refWords(cmd.target)} ${cmd.required ? "required" : "not required"}`;
    case "type":
      return `change the type of ${refWords(cmd.target)} to ${TYPE_WORDS[cmd.type]}${cmd.options?.length ? ` of ${cmd.options.join(", ")}` : ""}`;
    case "renameFormat":
      return `rename this format to ${quote(cmd.name)}`;
    case "addInstruction":
      return `add the instruction: ${cmd.text}`;
    case "removeInstruction":
      return cmd.index === "last" ? "remove the last instruction" : `remove instruction ${cmd.index + 1}`;
  }
}

// ---------------------------------------------------------------------------
// making the change

type Failure = Extract<FormatCommandResult, { ok: false }>;
type Verb = "add" | "remove" | "rename" | "copy" | "move" | "make";
const DONE: Record<Verb, string> = { add: "added", remove: "removed", rename: "renamed", copy: "copied", move: "moved", make: "made" };

const refuse = (ask: string): Failure => ({ ok: false, ask, refused: true });
const isFailure = (x: Thing | Failure): x is Failure => "ok" in x;

/** The sheet being changed, and how it is spoken of: the labels it shows read in `lang` (a Gujarati form's English reading, REQUIREMENTS §58). */
interface Sheet {
  layout: LogSheetLayout;
  shown: (label: string) => string;
  words: (t: Thing) => string;
  /** The one thing `ref` names — or the question to put when it names none, or several. */
  pick: (ref: TargetRef, again: (ref: TargetRef) => FormatCommand) => Thing | Failure;
}

function sheetOf(layout: LogSheetLayout, lang: Language): Sheet {
  const shown = (label: string): string => `“${documentTextIn(label, lang)}”`;
  const words = (t: Thing): string => {
    if (t.noun === "line") return `printed line ${t.index + 1}${t.label ? ` (${shown(t.label)})` : ""}`;
    return `the ${t.noun === "box" && t.area === "footer" ? "footer box" : t.noun} ${shown(t.label)}`;
  };
  const listed = (things: Thing[]): string => {
    const names = things.slice(0, 12).map((t) => (t.noun === "line" ? `${t.index + 1} ${shown(t.label)}` : shown(t.label)));
    return `${names.join(", ")}${things.length > 12 ? ` and ${things.length - 12} more` : ""}`;
  };
  // What the sheet does have, for when nothing answered to what was said.
  const has = (noun?: FormatNoun): string => {
    const parts: string[] = [];
    if (!noun || noun === "column") parts.push(`the columns ${listed(columnThings(layout))}`);
    if (!noun || noun === "box") {
      const boxes = boxThings(layout);
      parts.push(boxes.length ? `the boxes ${listed(boxes)}` : "no boxes above or below its grid");
    }
    if (noun === "line") {
      const lines = printedRowsOf(layout) ? lineThings(layout) : [];
      parts.push(lines.length ? `${lines.length} printed lines: ${listed(lines)}` : "no printed lines");
    }
    return parts.join("; ");
  };
  const pick = (ref: TargetRef, again: (ref: TargetRef) => FormatCommand): Thing | Failure => {
    const hits = resolve(layout, ref);
    if (hits.length === 1) return hits[0];
    if (hits.length === 0) {
      const what = ref.noun === "line" ? "printed line" : (ref.noun ?? "column or box");
      if (ref.index !== undefined) return refuse(`There is no ${ref.index === "last" ? what : `${what} ${ref.index + 1}`} on this sheet — it has ${has(ref.noun)}.`);
      return { ok: false, ask: `I can't find a ${what} called “${ref.said}” on this sheet. It has ${has(ref.noun)}. Which one do you mean?` };
    }
    // Two things can carry the same words; those are told apart by their place.
    const same = (x: Thing, y: Thing): boolean => x.noun === y.noun && norm(x.label) === norm(y.label) && (x.noun !== "box" || y.noun !== "box" || x.area === y.area);
    const refOf = (t: Thing): TargetRef =>
      t.noun === "line" || hits.some((o) => o !== t && same(o, t))
        ? { noun: t.noun, area: t.noun === "box" ? t.area : undefined, said: String(t.index + 1), index: t.index }
        : { noun: t.noun, area: t.noun === "box" ? t.area : undefined, said: t.label };
    const some = hits.slice(0, 6);
    return {
      ok: false,
      ask: `${hits.length} things on this sheet answer to “${ref.said}”: ${some.map(words).join(", ")}${hits.length > some.length ? ` and ${hits.length - some.length} more` : ""}. Which one do you mean?`,
      choices: some.map((t) => sentenceFor(again(refOf(t)))),
    };
  };
  return { layout, shown, words, pick };
}

function placeIndex(a: Sheet, place: Place | undefined, noun: FormatNoun, again: (ref: TargetRef) => FormatCommand, area?: BoxArea): { thing?: Thing; rel?: Place["rel"] } | Failure {
  if (!place) return {};
  if (!("ref" in place)) return { rel: place.rel };
  const thing = a.pick({ ...place.ref, noun: place.ref.noun ?? noun, area: place.ref.area ?? area }, again);
  if (isFailure(thing)) return thing;
  if (thing.noun !== noun) return refuse(`${a.words(thing)} is not a ${noun === "line" ? "printed line" : noun}, so a ${noun === "line" ? "printed line" : noun} cannot go ${place.rel} it.`);
  return { thing, rel: place.rel };
}

function applyAdd(a: Sheet, cmd: Extract<FormatCommand, { kind: "add" }>, finish: (verb: Verb, rest: string, layout: LogSheetLayout) => FormatCommandResult): FormatCommandResult {
  const layout = a.layout;
  const again = (ref: TargetRef): FormatCommand => ({ ...cmd, whole: undefined, place: cmd.place && "ref" in cmd.place ? { rel: cmd.place.rel, ref } : cmd.place });
  // A place that names nothing may have been part of the name: "Checked before dispatch".
  const placed = (noun: FormatNoun, area?: BoxArea): ReturnType<typeof placeIndex> => {
    const at = placeIndex(a, cmd.place, noun, again, area);
    if (!("ok" in at) || at.refused || at.choices || !cmd.whole) return at;
    return {
      ok: false,
      ask: `${at.ask} Or is “${cmd.whole}” the whole name?`,
      choices: [sentenceFor({ ...cmd, place: { rel: "end" }, whole: undefined }), sentenceFor({ ...cmd, label: cmd.whole, place: undefined, whole: undefined })],
    };
  };

  if (cmd.noun === "line") {
    const rows = printedRowsOf(layout);
    if (!rows) return refuse("This sheet's lines are written on each record, not printed by the format, so there is no printed line to add.");
    const at = placed("line");
    if ("ok" in at) return at;
    const printed = printedColumnsOf(layout);
    const nameKey = nameColumnKey(layout);
    const grouping = groupingKeys(layout);
    if (cmd.count && !cmd.label) {
      let next = layout;
      for (let i = 0; i < cmd.count; i++) next = addPrintedRow(next);
      return finish("add", `${cmd.count} blank printed line${cmd.count === 1 ? "" : "s"} at the end`, next);
    }
    if (!cmd.label) return { ok: false, ask: "What should the new printed line say? Tell me its words — for example: add a line \"Special ink\" after line 2." };
    if (!nameKey) return refuse("This form prints no words down its lines, so a line has nothing to be called by.");
    const values: PrintedRow = {};
    const parts = cmd.values && cmd.values.length <= printed.length ? cmd.values : [cmd.label];
    if (parts.length > 1) {
      printed.slice(0, parts.length).forEach((c, i) => {
        // "Printing" said of a Gujarati form is its own printed word for that process.
        const known = grouping.has(c.key) ? findByLabel(rows, (row) => [String(row[c.key] ?? "")], parts[i])[0] : undefined;
        values[c.key] = known ? String(known[c.key] ?? "") : parts[i];
      });
    } else values[nameKey] = parts[0];
    let index: number | undefined;
    if (at.rel === "start") index = 0;
    else if (at.thing) index = at.rel === "before" ? at.thing.index : at.thing.index + 1;
    else if (at.rel !== "end" && parts.length > 1) {
      // Named with its group and no place: it goes at the foot of that group.
      const groupKey = printed.find((c) => grouping.has(c.key))?.key;
      const lastOfGroup = groupKey ? rows.map((row) => String(row[groupKey] ?? "")).lastIndexOf(String(values[groupKey] ?? "")) : -1;
      if (lastOfGroup >= 0) index = lastOfGroup + 1;
    }
    // A line put among others belongs to the group it was put into.
    const neighbour = index === undefined ? rows[rows.length - 1] : (rows[at.rel === "before" || index === 0 ? index : index - 1] ?? rows[rows.length - 1]);
    for (const key of grouping) if (values[key] === undefined && neighbour) values[key] = neighbour[key] ?? "";
    const where = at.thing ? ` ${at.rel} ${a.words(at.thing)}` : index === 0 ? " at the top" : index === undefined ? " at the end" : ` as line ${index + 1}`;
    return finish("add", `the printed line ${parts.map((p) => `“${p}”`).join(" / ")}${where}`, addPrintedRow(layout, index, values));
  }

  const what = cmd.noun === "column" ? "column" : "box";
  if (!cmd.label) return { ok: false, ask: `What shall I call the new ${what}? Say it in one go — for example: add a ${what} "Batch No."${cmd.noun === "column" ? " after Remarks" : ""}.` };
  if (cmd.type === "select" && !cmd.options?.length) {
    return {
      ok: false,
      ask: `Which choices should “${cmd.label}” offer? Tell me them after the name.`,
      choices: [sentenceFor({ ...cmd, options: ["Pass", "Fail"] }), sentenceFor({ ...cmd, options: ["OK", "Not OK"] })],
    };
  }

  if (cmd.noun === "column") {
    const labels = layout.columns.map((c) => c.label);
    if (layout.columns.some((c) => norm(c.label) === norm(cmd.label))) {
      const other = copyLabel(cmd.label, labels);
      return { ok: false, ask: `This sheet already has a column called “${cmd.label}”. Shall I add another one as “${other}”?`, choices: [sentenceFor({ ...cmd, label: other, whole: undefined })] };
    }
    const at = placed("column");
    if ("ok" in at) return at;
    const opts = { type: cmd.type, options: cmd.options, required: cmd.required, afterKey: at.thing && at.rel === "after" && at.thing.noun === "column" ? at.thing.key : undefined, beforeKey: at.rel === "start" ? layout.columns[0]?.key : at.thing && at.rel === "before" && at.thing.noun === "column" ? at.thing.key : undefined };
    const kind = cmd.type && cmd.type !== "text" ? `${FIELD_TYPE_LABELS[cmd.type]} ` : "";
    const choices = cmd.options?.length ? ` (${cmd.options.join(", ")})` : "";
    const where = at.thing ? ` ${at.rel} ${a.shown(at.thing.label)}` : at.rel === "start" ? " as the first column" : " at the end";
    return finish("add", `the ${cmd.required ? "required " : ""}${kind}column “${cmd.label}”${choices}${where}`, addColumn(layout, cmd.label, opts).layout);
  }

  // A box goes above the grid unless it was said otherwise — or put beside one that is below it.
  const at = placed("box", cmd.area);
  if ("ok" in at) return at;
  const area: BoxArea = cmd.area ?? (at.thing?.noun === "box" ? at.thing.area : "header");
  const boxes = area === "header" ? layout.headerFields : (layout.footerFields ?? []);
  if (boxes.some((b) => norm(b.label) === norm(cmd.label))) {
    const other = copyLabel(cmd.label, boxes.map((b) => b.label));
    return { ok: false, ask: `There is already a box called “${cmd.label}” ${area === "header" ? "above" : "below"} the grid. Shall I add another one as “${other}”?`, choices: [sentenceFor({ ...cmd, area, label: other, whole: undefined })] };
  }
  const opts = { type: cmd.type, options: cmd.options, required: cmd.required, afterKey: at.thing && at.rel === "after" && at.thing.noun === "box" ? at.thing.key : undefined, beforeKey: at.rel === "start" ? boxes[0]?.key : at.thing && at.rel === "before" && at.thing.noun === "box" ? at.thing.key : undefined };
  const kind = cmd.type && cmd.type !== "text" ? `${FIELD_TYPE_LABELS[cmd.type]} ` : "";
  const where = at.thing ? `, ${at.rel} ${a.shown(at.thing.label)}` : "";
  return finish("add", `the ${kind}box “${cmd.label}” ${area === "header" ? "above" : "below"} the grid${where}`, addBox(layout, area, cmd.label, opts).layout);
}

function applyMove(a: Sheet, cmd: Extract<FormatCommand, { kind: "move" }>, finish: (verb: Verb, rest: string, layout: LogSheetLayout) => FormatCommandResult): FormatCommandResult {
  const thing = a.pick(cmd.target, (target) => ({ ...cmd, target }));
  if (isFailure(thing)) return thing;
  const pool = thing.noun === "column" ? columnThings(a.layout) : thing.noun === "box" ? boxThings(a.layout, thing.area) : lineThings(a.layout);
  const from = thing.index;
  let to: number;
  let where: string;
  const lines = thing.noun === "line";
  if ("by" in cmd.to) {
    to = Math.max(0, Math.min(pool.length - 1, from + cmd.to.by));
    const n = Math.abs(to - from);
    where = `${n === 1 ? "one place" : `${n} places`} ${cmd.to.by < 0 ? (lines ? "up" : "left") : lines ? "down" : "right"}`;
  } else if (!("ref" in cmd.to)) {
    to = cmd.to.rel === "start" ? 0 : pool.length - 1;
    where = cmd.to.rel === "start" ? (lines ? "to the top" : "to the start") : "to the end";
  } else {
    const rel = cmd.to.rel;
    const beside = a.pick({ ...cmd.to.ref, noun: cmd.to.ref.noun ?? thing.noun, area: cmd.to.ref.area ?? (thing.noun === "box" ? thing.area : undefined) }, (ref) => ({ ...cmd, to: { rel, ref } }));
    if (isFailure(beside)) return beside;
    if (beside.noun !== thing.noun || (beside.noun === "box" && thing.noun === "box" && beside.area !== thing.area)) {
      return refuse(`${a.words(thing)} cannot be put ${rel} ${a.words(beside)} — they are not in the same part of the sheet.`);
    }
    if (beside.index === from) return refuse(`${a.words(thing)} cannot be put ${rel} itself.`);
    to = rel === "after" ? (from < beside.index ? beside.index : beside.index + 1) : from < beside.index ? beside.index - 1 : beside.index;
    where = `${rel} ${a.shown(beside.label)}`;
  }
  if (to === from) return refuse(`${a.words(thing)} is already there.`);
  // formatOps moves a thing by changing places with its neighbour, so it is walked there one place at a time.
  const step = to > from ? 1 : -1;
  let next = a.layout;
  for (let i = from; i !== to; i += step) {
    next = thing.noun === "column" ? moveColumn(next, thing.key, step) : thing.noun === "box" ? moveBox(next, thing.area, thing.key, step) : movePrintedRow(next, i, step);
  }
  return finish("move", `${a.words(thing)} ${where}`, next);
}

/**
 * Makes the change `cmd` asks for on `draft`, with the operations of
 * engine/formatOps.ts and nothing else. Never saves anything.
 */
export function applyFormatCommand(draft: FormatDraft, cmd: FormatCommand, lang: Language = "en"): FormatCommandResult {
  if (cmd.kind === "renameFormat") {
    if (cmd.name === draft.name.trim()) return refuse(`The format is already called “${draft.name}”.`);
    const rest = `the format from “${draft.name}” to “${cmd.name}”`;
    return { ok: true, draft: { ...draft, name: cmd.name }, plan: `rename ${rest}`, what: `renamed ${rest}` };
  }
  const layout = draft.layout;
  if (!layout) return refuse("This form is drawn by the program itself rather than from a layout, so its grid cannot be changed from here — only its name and its revision.");
  const a = sheetOf(layout, lang);
  const finish = (verb: Verb, rest: string, next: LogSheetLayout): FormatCommandResult => {
    const after: FormatDraft = { ...draft, layout: next };
    if (describeFormatChange(draft, after).length === 0) return refuse("That would change nothing on the format — it is already so.");
    return { ok: true, draft: after, plan: `${verb} ${rest}`, what: `${DONE[verb]} ${rest}` };
  };

  switch (cmd.kind) {
    case "add":
      return applyAdd(a, cmd, finish);
    case "move":
      return applyMove(a, cmd, finish);
    case "remove": {
      const thing = a.pick(cmd.target, (target) => ({ ...cmd, target }));
      if (isFailure(thing)) return thing;
      if (thing.noun === "column") {
        if (layout.columns.length === 1) return refuse("A sheet needs at least one column, so its last one stays.");
        return finish("remove", a.words(thing), removeColumn(layout, thing.key));
      }
      if (thing.noun === "box") return finish("remove", a.words(thing), removeBox(layout, thing.area, thing.key));
      if ((printedRowsOf(layout) ?? []).length === 1) return refuse("A form that prints its lines needs at least one, so its last line stays.");
      return finish("remove", a.words(thing), removePrintedRow(layout, thing.index));
    }
    case "rename": {
      const thing = a.pick(cmd.target, (target) => ({ ...cmd, target }));
      if (isFailure(thing)) return thing;
      if (thing.noun === "line") {
        // The printed cell that was named is the one reworded; a line named by its number is reworded where its name is.
        const printed = printedColumnsOf(layout);
        const said = cmd.target.index === undefined ? printed.find((c) => findByLabel([thing.row], (row) => [String(row[c.key] ?? "")], cmd.target.said).length > 0)?.key : undefined;
        const key = said ?? nameColumnKey(layout);
        if (!key) return refuse("This form prints no words down its lines, so there is nothing to reword.");
        if (String(thing.row[key] ?? "") === cmd.to) return refuse(`${a.words(thing)} already says “${cmd.to}”.`);
        return finish("rename", `printed line ${thing.index + 1} from ${a.shown(String(thing.row[key] ?? ""))} to “${cmd.to}”`, setPrintedCell(layout, thing.index, key, cmd.to));
      }
      if (thing.label === cmd.to) return refuse(`${a.words(thing)} is already called that.`);
      const next = thing.noun === "column" ? renameColumn(layout, thing.key, cmd.to) : renameBox(layout, thing.area, thing.key, cmd.to);
      return finish("rename", `${a.words(thing)} to “${cmd.to}”`, next);
    }
    case "duplicate": {
      const thing = a.pick(cmd.target, (target) => ({ ...cmd, target }));
      if (isFailure(thing)) return thing;
      if (thing.noun === "line") return finish("copy", `${a.words(thing)} as line ${thing.index + 2}`, duplicatePrintedRow(layout, thing.index));
      const copy = thing.noun === "column" ? duplicateColumn(layout, thing.key) : duplicateBox(layout, thing.area, thing.key);
      if (!copy) return refuse(`${a.words(thing)} could not be copied.`);
      const made = [...copy.layout.columns, ...copy.layout.headerFields, ...(copy.layout.footerFields ?? [])].find((x) => x.key === copy.key);
      return finish("copy", `${a.words(thing)} as “${made?.label ?? thing.label}”, beside it`, copy.layout);
    }
    case "required": {
      const thing = a.pick(cmd.target.noun ? cmd.target : { ...cmd.target, noun: "column" }, (target) => ({ ...cmd, target }));
      if (isFailure(thing)) return thing;
      if (thing.noun !== "column") return refuse(`Required can be set on a column from here. For ${a.words(thing)}, use Edit format — its Required tick is there.`);
      if (thing.item.fixed || thing.item.computed) return refuse(`${a.words(thing)} is ${thing.item.computed ? "worked out by the sheet" : "printed on the form"}, so nobody fills it in and it cannot be required.`);
      if (!!thing.item.required === cmd.required) return refuse(`${a.words(thing)} is already ${cmd.required ? "required" : "not required"}.`);
      return finish("make", `${a.words(thing)} ${cmd.required ? "required" : "no longer required"}`, setColumnRequired(layout, thing.key, cmd.required));
    }
    case "type": {
      const thing = a.pick(cmd.target, (target) => ({ ...cmd, target }));
      if (isFailure(thing)) return thing;
      if (thing.noun === "line") return refuse("A printed line has no type — its columns do.");
      if (thing.noun === "column" && (thing.item.fixed || thing.item.computed)) return refuse(`${a.words(thing)} is ${thing.item.computed ? "worked out by the sheet" : "printed on the form"}, so its type stays as it is.`);
      if (cmd.type === "select" && !cmd.options?.length && !thing.item.options?.length) {
        return {
          ok: false,
          ask: `Which choices should ${a.shown(thing.label)} offer?`,
          choices: [sentenceFor({ ...cmd, options: ["Pass", "Fail"] }), sentenceFor({ ...cmd, options: ["OK", "Not OK"] })],
        };
      }
      const next = thing.noun === "column" ? setColumnType(layout, thing.key, cmd.type, cmd.options) : setBoxType(layout, thing.area, thing.key, cmd.type, cmd.options);
      const choices = cmd.type === "select" ? ` of ${(cmd.options ?? thing.item.options ?? []).join(", ")}` : "";
      return finish("make", `${a.words(thing)} a ${FIELD_TYPE_LABELS[cmd.type]} ${thing.noun}${choices}`, next);
    }
    case "addInstruction":
      return finish("add", `the printed instruction “${cmd.text}”`, setInstructions(layout, [...(layout.instructions ?? []), cmd.text]));
    case "removeInstruction": {
      const lines = layout.instructions ?? [];
      const at = cmd.index === "last" ? lines.length - 1 : cmd.index;
      if (!lines[at]) return refuse(lines.length ? `This form prints ${lines.length} instruction${lines.length === 1 ? "" : "s"}, so there is no instruction ${at + 1}.` : "This form prints no instructions.");
      const shown = documentTextIn(lines[at], lang);
      return finish("remove", `printed instruction ${at + 1} (“${shown.length > 80 ? `${shown.slice(0, 77)}…` : shown}”)`, setInstructions(layout, lines.filter((_, i) => i !== at)));
    }
  }
}
