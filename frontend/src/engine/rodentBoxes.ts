// THE RODENT BOXES OF F/HR/17'S CHECK POINTS 8 AND 9 (REQUIREMENTS §104).
//
// The owner, 9-Oct-2026: "in daily pest control record if user manually select yes for question 8, 9 so user mention
// yes then it will automatically select location like RC-1 or any RC". Answering Yes opens a picker of the plant's
// rodent boxes at once; nothing is picked for the person (REQUIREMENTS §98: "automatically" is the list opening, never
// a box chosen by the system).
//
// THE LIST, in this order:
//   1. Master Data → Rodent Stations, the Active ones, once the plant has entered them (each box by its own Station
//      ID, the number painted on it, with its area);
//   2. otherwise RC-1 to RC-<check point 4's count on this record> ("Total number of rodent traps provided");
//   3. otherwise RC-1 to RC-<that count on the last record a person confirmed>.
// Worked out each time it is asked and never stored as master data: no station is invented (the Rodent Stations list
// is the plant's to enter, REQUIREMENTS "Master data provenance"). The prefix of 2 and 3 is the owner's "RC"; with
// stations it is the stations' own.
//
// THE NOTE STAYS TEXT. What the picker writes is checkpoints[n].note, as before: "RC-3, RC-17", and on check point 8
// "RC-3; Other: near RM inward shutter" or "Other: Canteen". The register prints it, search finds it, the downloaded
// file's box stays "text" (engine/roundTrip/bindingsFor.ts), and a note written before the picker reads as written.
//
// Everything above rodentBoxListFor is pure (types and the plant's TBC word only), for the website, the engine host's
// layout for the phone, validation.ts, recordPatch.ts and guidedRecord.ts alike.
import type { DailyPestMonitoringData, MasterData, RecordInstance, RodentStation } from "../types";
import { TBC } from "../types";
import { masterRepository } from "../data/repositories/masterRepository";
import { recordRepository } from "../data/repositories/recordRepository";
import { addDays, compareISO, todayISO } from "../utils/date";

/** The owner's prefix (9-Oct-2026: "RC-1 or any RC"), for a list worked out from a count. */
export const RODENT_BOX_PREFIX = "RC";
/** A worked-out list stops here: a count typed by mistake (1000 for 100) must not draw a thousand boxes. */
export const MOST_WORKED_OUT_BOXES = 500;
/** "Add RC-1 to RC-N" adds at most this many at once. */
export const MOST_ADDED_AT_ONCE = 500;

/**
 * Check points 8 and 9 name boxes, and 8 ("If yes, mention the location") also takes a place in words. Stored check
 * point definitions are never refreshed from the seed (data/repositories/masterRepository.ts), so this goes by the
 * check point's number, not by a flag on its definition.
 */
export const isBoxCheckpoint = (no: number): boolean => no === 8 || no === 9;
export const takesOtherPlace = (no: number): boolean => no === 8;

export interface BoxChoice {
  id: string;
  /** The station's area (one of the 16 Rodent Control areas), when Master Data gives one. */
  area?: string;
}

/** Where the list came from: Master Data, today's check point 4, the last confirmed record's, or nowhere yet. */
export type BoxListSource = "stations" | "today" | "last" | "none";

export interface BoxList {
  source: BoxListSource;
  /** What the picker offers, in the list's order. */
  choices: BoxChoice[];
  /** The prefix a bare number takes ("17" is RC-17): the stations' most common one, else the owner's. */
  prefix: string;
  /** Every prefix a Station ID has (with stations), else the one above: the words a note names a box with. */
  prefixes: string[];
  /** "last": the date of the record whose count it is. */
  date?: string;
  /** With stations only: every Station ID on Master Data, Active or not, by boxKey. What a note may name. */
  known?: ReadonlySet<string>;
}

// ---------------------------------------------------------------------------
// one box, however it is written

const BOX_ID = /^([A-Za-z]{1,6})\s*[-./]?\s*(\d{1,5})$/;

/** Gujarati and Devanagari digits as 0-9, so "૧૭" typed on a phone is 17. */
export function asciiDigits(s: string): string {
  return s.replace(/[૦-૯०-९]/g, (d) => String((d.charCodeAt(0) - (d >= "૦" ? 0x0ae6 : 0x0966)) % 10));
}

function idParts(id: string): { prefix: string; n: number } | null {
  const m = BOX_ID.exec(asciiDigits(id.trim()));
  return m ? { prefix: m[1].toUpperCase(), n: Number(m[2]) } : null;
}

/** One box however it is written: "rc 5", "RC-05" and "Rc5" are all RC-5. An ID of another shape is its own words, case aside. */
export function boxKey(id: string): string {
  const p = idParts(id);
  return p ? `${p.prefix}-${p.n}` : id.trim().replace(/\s+/g, " ").toUpperCase();
}

/** A trap count as check point 4 holds it: a whole number from 1, else null. */
export function trapCount(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(asciiDigits(value.trim())) : NaN;
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : null;
}

const areaOf = (location: string | undefined): string | undefined => {
  const a = (location ?? "").trim();
  return a && a !== TBC ? a : undefined;
};

// ---------------------------------------------------------------------------
// the list

function workedOut(source: "today" | "last", count: number): BoxList {
  const n = Math.min(count, MOST_WORKED_OUT_BOXES);
  return {
    source,
    choices: Array.from({ length: n }, (_, i) => ({ id: `${RODENT_BOX_PREFIX}-${i + 1}` })),
    prefix: RODENT_BOX_PREFIX,
    prefixes: [RODENT_BOX_PREFIX],
  };
}

/**
 * The list by the rule at the top: the Active stations, else RC-1 to RC-<today's count>, else RC-1 to RC-<the last
 * confirmed record's count>, else none. `todayCount` is check point 4's value on the record; `last` comes from
 * lastTrapCount.
 */
export function boxListFrom(stations: readonly RodentStation[] | undefined, todayCount?: unknown, last?: { count: number; date: string } | null): BoxList {
  const all = stations ?? [];
  const active = all.filter((s) => s.status === "Active" && (s.id ?? "").trim() !== "");
  if (active.length) {
    const tally = new Map<string, number>();
    for (const s of all) {
      const p = idParts(s.id ?? "");
      if (p) tally.set(p.prefix, (tally.get(p.prefix) ?? 0) + 1);
    }
    const prefixes = [...tally.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p);
    const seen = new Set<string>();
    const choices: BoxChoice[] = [];
    for (const s of active) {
      const key = boxKey(s.id);
      if (seen.has(key)) continue;
      seen.add(key);
      const area = areaOf(s.location);
      choices.push(area ? { id: s.id.trim(), area } : { id: s.id.trim() });
    }
    return {
      source: "stations",
      choices,
      prefix: prefixes[0] ?? RODENT_BOX_PREFIX,
      prefixes: prefixes.length ? prefixes : [RODENT_BOX_PREFIX],
      known: new Set(all.filter((s) => (s.id ?? "").trim() !== "").map((s) => boxKey(s.id))),
    };
  }
  const today = trapCount(todayCount);
  if (today) return workedOut("today", today);
  if (last && trapCount(last.count)) return { ...workedOut("last", trapCount(last.count) as number), date: last.date };
  return { source: "none", choices: [], prefix: RODENT_BOX_PREFIX, prefixes: [RODENT_BOX_PREFIX] };
}

const CONFIRMED = new Set(["Submitted", "Pending Verification", "Verified"]);

/**
 * Check point 4's count on the latest F/HR/17 record before `beforeISO` that a person confirmed (submitted, waiting
 * for verification or verified) and that is not a holiday, with its date; null when there is none. One walk.
 */
export function lastTrapCount(records: readonly RecordInstance[], beforeISO: string, isDemo = false): { count: number; date: string } | null {
  let best: { count: number; date: string } | null = null;
  for (const r of records) {
    if (r.isDemo !== isDemo || !CONFIRMED.has(r.status) || compareISO(r.dueDate, beforeISO) >= 0) continue;
    if (best && compareISO(r.dueDate, best.date) <= 0) continue;
    const d = r.data as Partial<DailyPestMonitoringData> | null;
    if (!d || d.isHoliday) continue;
    const count = trapCount(d.checkpoints?.[4]?.value);
    if (count) best = { count, date: r.dueDate };
  }
  return best;
}

// ---------------------------------------------------------------------------
// the note

const byKeyCache = new WeakMap<BoxList, Map<string, string>>();

/** The list's boxes by boxKey, in their own spelling. Made once a list. */
function byKey(list: BoxList): Map<string, string> {
  let map = byKeyCache.get(list);
  if (!map) {
    map = new Map(list.choices.map((c) => [boxKey(c.id), c.id]));
    byKeyCache.set(list, map);
  }
  return map;
}

/**
 * The box a word names, in the list's spelling: "rc 5", "RC-05", "box 5", "no. 5" and "5" are RC-5 (the station's
 * own ID where it is on the list). A word with another of the list's prefixes is that box; null for words that name
 * no box ("near the store", "RB-27" on a list of RC boxes).
 */
export function boxIdOf(word: string, list: BoxList): string | null {
  const w = asciiDigits(word.trim().replace(/\s+/g, " "));
  if (!w) return null;
  const onList = byKey(list);
  const p = idParts(w);
  if (p && list.prefixes.includes(p.prefix)) return onList.get(`${p.prefix}-${p.n}`) ?? `${p.prefix}-${p.n}`;
  const num = /^(?:(?:rodent\s+)?box(?:\s*no\.?)?|no\.?|#)?\s*(\d{1,5})$/i.exec(w);
  if (num) {
    const key = `${list.prefix}-${Number(num[1])}`;
    return onList.get(key) ?? key;
  }
  // A station whose ID is not letters and a number ("Canteen-A") is named by its ID.
  return onList.get(boxKey(w)) ?? null;
}

export interface BoxNote {
  /** The boxes it names, in the list's spelling, each once. */
  boxes: string[];
  /** Everything else it says: on check point 8 the place in words; on a note written before the picker, the note. */
  other: string;
}

const OTHER = /(?:^|;)\s*other\s*:\s*/i;

function readNote(note: string | null | undefined, list: BoxList): { boxes: string[]; words: string[]; tail: string } {
  const text = (note ?? "").trim();
  const boxes: string[] = [];
  const words: string[] = [];
  if (!text) return { boxes, words, tail: "" };
  const at = OTHER.exec(text);
  const head = at ? text.slice(0, at.index) : text;
  const tail = at ? text.slice(at.index + at[0].length).trim() : "";
  const add = (id: string) => {
    if (!boxes.includes(id)) boxes.push(id);
  };
  for (const part of head.split(/[,;]/)) {
    const p = part.trim();
    if (!p) continue;
    const id = boxIdOf(p, list);
    if (id) {
      add(id);
      continue;
    }
    // "RC-3 and RC-17", "3 & 17": boxes only when every piece is one.
    const pieces = p.split(/\s+(?:and|aur|ane|અને|और)\s+|\s*&\s*/i).map((x) => x.trim()).filter(Boolean);
    const ids = pieces.length > 1 ? pieces.map((x) => boxIdOf(x, list)) : [];
    if (ids.length && ids.every((x): x is string => !!x)) ids.forEach(add);
    else words.push(p);
  }
  return { boxes, words, tail };
}

/** A stored note read back into the picker. A note written before the picker ("near the store") is all words: nothing is lost. */
export function parseBoxNote(note: string | null | undefined, list: BoxList): BoxNote {
  const { boxes, words, tail } = readNote(note, list);
  return { boxes, other: [words.join(", "), tail].filter(Boolean).join("; ") };
}

/** The note the picker writes: "RC-3, RC-17"; with a place in words (check point 8) "RC-3; Other: near RM inward shutter", or "Other: Canteen" alone. */
export function boxNote(boxes: readonly string[], other = ""): string {
  const b = boxes
    .map((x) => x.trim())
    .filter(Boolean)
    .join(", ");
  const o = other.trim();
  if (!o) return b;
  return b ? `${b}; Other: ${o}` : `Other: ${o}`;
}

/**
 * A note given in words (Mitra, the phone, the guided questions), in the list's spelling where it names only boxes:
 * "rc 3 and 17" is "RC-3, RC-17", "box 4; other: near the gate" is "RC-4; Other: near the gate". A note with any
 * other words before its "Other:" is kept exactly as given.
 */
export function tidyBoxNote(note: string, list: BoxList): string {
  const text = note.trim();
  const { boxes, words, tail } = readNote(text, list);
  if (!boxes.length || words.length) return text;
  return boxNote(boxes, tail);
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The boxes a note names that are not on Master Data → Rodent Stations, Active or not (a box taken out of use is
 * still named on the records made before). Only with stations: a worked-out list refuses nothing. A box named among
 * the words ("Other: near RC-140") counts too.
 */
export function boxesNotOnList(note: string | null | undefined, list: BoxList): string[] {
  const known = list.known;
  if (list.source !== "stations" || !known) return [];
  const { boxes, words, tail } = readNote(note, list);
  const named = [...boxes];
  const said = asciiDigits([...words, tail].join(" "));
  if (said.trim()) {
    const re = new RegExp(`\\b(${list.prefixes.map(escapeRe).join("|")})\\s*[-./]?\\s*(\\d{1,5})\\b`, "gi");
    for (const m of said.matchAll(re)) named.push(`${m[1].toUpperCase()}-${Number(m[2])}`);
  }
  const out: string[] = [];
  for (const id of named) if (!known.has(boxKey(id)) && !out.some((x) => boxKey(x) === boxKey(id))) out.push(id);
  return out;
}

/**
 * The boxes the picker shows for what was typed: by number ("1" is RC-1, RC-10 to RC-19, RC-100), by ID, or by area
 * words ("canteen"); the box that is exactly what was typed first. Nothing typed: the whole list.
 */
export function boxesMatching(list: BoxList, typed: string): BoxChoice[] {
  const raw = asciiDigits(typed).trim();
  const q = raw.toUpperCase().replace(/[\s\-./]+/g, "");
  if (!q) return list.choices;
  const digits = /^\d+$/.test(q) ? String(Number(q)) : null;
  const exactKey = digits ? `${list.prefix}-${digits}` : boxKey(raw);
  const words = raw.toLowerCase();
  const out: BoxChoice[] = [];
  let exact: BoxChoice | undefined;
  for (const c of list.choices) {
    if (boxKey(c.id) === exactKey) {
      exact = c;
      continue;
    }
    const p = idParts(c.id);
    const flat = c.id.toUpperCase().replace(/[\s\-./]+/g, "");
    const hit = digits !== null ? (p ? String(p.n).startsWith(digits) : flat.includes(q)) : flat.startsWith(q) || flat.includes(q) || (!!c.area && c.area.toLowerCase().includes(words));
    if (hit) out.push(c);
  }
  return exact ? [exact, ...out] : out;
}

/** The boxes in order, in groups by area when the stations have areas (a group's place is its first box's). */
export function boxGroups(choices: readonly BoxChoice[]): { area: string | null; boxes: BoxChoice[] }[] {
  if (!choices.some((c) => c.area)) return [{ area: null, boxes: [...choices] }];
  const groups = new Map<string, BoxChoice[]>();
  for (const c of choices) {
    const key = c.area ?? "";
    const g = groups.get(key);
    if (g) g.push(c);
    else groups.set(key, [c]);
  }
  return [...groups.entries()].map(([area, boxes]) => ({ area: area || null, boxes }));
}

// ---------------------------------------------------------------------------
// Master Data → Rodent Stations

export interface BulkAdd {
  prefix: string;
  from: number;
  to: number;
  location?: string;
  type?: RodentStation["type"];
}

export type BulkAddProblem = "prefix" | "range" | "tooMany";

/**
 * "Add RC-1 to RC-N" on Master Data: the stations from `from` to `to`, Active, each ID once. A box already on the
 * list (RC-05 is RC-5) is kept as it is, its location, type and status untouched, and named in `kept`.
 */
export function addStationsInBulk(
  stations: readonly RodentStation[],
  ask: BulkAdd
): { stations: RodentStation[]; added: string[]; kept: string[] } | { problem: BulkAddProblem } {
  const prefix = ask.prefix.trim().toUpperCase();
  if (!/^[A-Z]{1,6}$/.test(prefix)) return { problem: "prefix" };
  const { from, to } = ask;
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from || to > 99999) return { problem: "range" };
  if (to - from + 1 > MOST_ADDED_AT_ONCE) return { problem: "tooMany" };
  const have = new Set(stations.map((s) => boxKey(s.id ?? "")));
  const next = stations.slice();
  const added: string[] = [];
  const kept: string[] = [];
  const location = areaOf(ask.location) ?? TBC;
  for (let n = from; n <= to; n++) {
    const id = `${prefix}-${n}`;
    if (have.has(boxKey(id))) {
      kept.push(id);
      continue;
    }
    have.add(boxKey(id));
    next.push({ id, location, type: ask.type ?? "TO BE CONFIRMED", status: "Active" });
    added.push(id);
  }
  return { stations: next, added, kept };
}

/** A Station ID typed over on Master Data: "empty", "taken" when another station has it already (RC-05 is RC-5), else null. */
export function stationIdProblem(stations: readonly RodentStation[], index: number, id: string): "empty" | "taken" | null {
  if (!id.trim()) return "empty";
  const key = boxKey(id);
  return stations.some((s, i) => i !== index && boxKey(s.id ?? "") === key) ? "taken" : null;
}

/** The ID "Add Row" gives a new station: the list's prefix and the next number after its highest. */
export function nextStationId(stations: readonly RodentStation[]): string {
  const prefix = boxListFrom(stations.map((s) => ({ ...s, status: "Active" as const }))).prefix;
  let top = 0;
  for (const s of stations) {
    const p = idParts(s.id ?? "");
    if (p && p.prefix === prefix) top = Math.max(top, p.n);
  }
  return `${prefix}-${top + 1}`;
}

// ---------------------------------------------------------------------------
// the list for a record, from what is stored

/**
 * The picker's list for this F/HR/17 record (or, with none, for today's): the stations, else check point 4 on the
 * record, else the last record a person confirmed before it. Reads the stored master data and records; one walk of
 * F/HR/17's records, and only when there are no stations and no count today.
 */
export function rodentBoxListFor(record?: RecordInstance | null, master: MasterData = masterRepository.get()): BoxList {
  const stations = master.rodentStations ?? [];
  const todayCount = (record?.data as Partial<DailyPestMonitoringData> | undefined)?.checkpoints?.[4]?.value;
  const list = boxListFrom(stations, todayCount);
  if (list.source !== "none") return list;
  const isDemo = record?.isDemo ?? false;
  const records = recordRepository.queryUnscoped({ documentId: record?.documentId ?? "daily-pest-monitoring", isDemo });
  return boxListFrom(stations, null, lastTrapCount(records, record ? record.dueDate : addDays(todayISO(), 1), isDemo));
}
