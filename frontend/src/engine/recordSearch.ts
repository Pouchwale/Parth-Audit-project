import type { DocumentDefinition, HistoryEntry, LogSheetLayout, RecordInstance, RecordStatus } from "../types";
import { recordRepository } from "../data/repositories/recordRepository";
import { documentRepository } from "../data/repositories/documentRepository";
import { formatEdits } from "../data/formatEdits";
import { getLogSheetLayout, getLogSheetLayoutForRecord } from "../data/seed/logSheetLayouts";
import { departmentScope } from "./departmentScope";
import { documentsByFormatNumber, formatKey, isFormatNumberQuery, namesFormatNumber } from "./formatNumbers";
import { containsAllTerms, recordSearchText, searchTerms, type SearchCell } from "./recordText";

// ONE SEARCH BOX FOR EVERYTHING WRITTEN ON A RECORD, FAST ON A LOW-END LAPTOP
// (REQUIREMENTS §75, within the rules of §56).
//
// Every record is already in the browser, so the words on them can be searched
// there, with no round trip per keystroke and with a person's unsent edits
// included. What must not happen is what Search used to do: flatten every
// record, all at once, on the first keystroke — about 0.1 s on this desktop,
// most of a second on the laptops the plant uses, with the page frozen — and
// then do it all again after every save anywhere, because the cache was keyed
// on the whole array.
//
// So the flattened text is kept HERE, per record, in a Map that outlives the
// page: record id -> its text, its cells, and the stamp it was made from
// (stampOf: updatedAt, status, due date, how long its history is, the shape of
// its data, and — for a record no person has written — how long its data is
// written out). The stamp and not the object: after a colleague's save is
// pulled in every record is a new object (recordRepository drops its parsed
// copy), yet almost none of them changed, and serverSync's merge always keeps a
// WHOLE record from one side, so an unchanged stamp means unchanged words.
// Bringing the index up to date after a save is then one pass comparing stamps
// and ONE record flattened again.
//
// The work is done in slices of at most 8 ms, when the browser is idle
// (requestIdleCallback, or a zero timeout where it has none), and never while
// the tab is hidden — a tab nobody is looking at asks for nothing (§65.5).
// Nothing is built until somebody searches: the first call starts it, and a
// search made meanwhile answers from what is ready and says so ("Still
// indexing...").
//
// WHAT IS INDEXED. Only the records the person may see (§40): the list comes
// from the SCOPED recordRepository.query, and the index is keyed on the
// signed-in account, the department scope and the document definitions, so a
// different person signing in — on the same tab, where signing out does not
// reload the page and this module outlives it — or a format renamed, starts it
// afresh rather than answering with what somebody else could see.
//
// By default, only records a PERSON has written. The calendar makes a blank
// Due sheet for every day of every daily format, and the assistant prepares
// many with values carried forward or picked inside the band: about 3,000 of
// the 3,700 records on file. Their words are the form's own and the
// assistant's, so a name or a number would match hundreds of sheets nobody
// wrote. `includeDrafts` searches those too, when somebody asks for them.

const SLICE_MS = 8;
/** How often a search waiting on the first build is told there is more to show. */
const PROGRESS_EVERY_MS = 300;
// As engine/backlogCleanup.ts: a record whose last save came within two minutes
// of the assistant preparing it, and that no person has touched in its
// history, is still the assistant's batch.
const UNTOUCHED_WINDOW_MS = 2 * 60 * 1000;

/** One record as Search holds it. */
export interface RecordHit {
  id: string;
  documentId: string;
  dueDate: string;
  updatedAt: string;
  status: RecordStatus;
  isDemo: boolean;
  /** Written by a person, not a blank sheet or only the assistant's preparation. */
  human: boolean;
  /** Each value on the record with its heading, for the line a result shows (recordText.snippetFor). */
  cells: readonly SearchCell[];
}

interface IndexEntry extends RecordHit {
  stamp: string;
  text: string;
}

interface Pass {
  /** The stored records this pass brings the index up to. */
  from: readonly RecordInstance[];
  list: RecordInstance[];
  pos: number;
  seen: Set<string>;
  withDrafts: boolean;
}

interface IndexState {
  key: string;
  isDemo: boolean;
  edits: unknown;
  docs: Map<string, DocumentDefinition>;
  layouts: Map<string, LogSheetLayout | undefined>;
  entries: Map<string, IndexEntry>;
  withDrafts: boolean;
  /** The stored records the index was last brought fully up to. */
  syncedTo: readonly RecordInstance[] | null;
  /** A full pass has finished since the index was started (and since drafts were asked for). */
  ready: boolean;
  pass: Pass | null;
  /** Newest first; dropped whenever an entry changes, made again on the next search. */
  sorted: IndexEntry[] | null;
}

export interface RecordIndexStatus {
  /** The first full build has finished: what a search finds is everything there is. */
  ready: boolean;
  /** Ready, and nothing waiting to be brought in. */
  complete: boolean;
  indexed: number;
}

export interface RecordSearchResult {
  /** The matching records, newest first, up to `limit`. */
  hits: RecordHit[];
  /** How many match in all. */
  total: number;
  terms: string[];
  ready: boolean;
  complete: boolean;
}

let state: IndexState | null = null;
let generation = 0;
let lastProgress = 0;
const listeners = new Set<() => void>();
let cancelSlice: (() => void) | null = null;
let waitingForVisible = false;
let startLater: ReturnType<typeof setTimeout> | null = null;

const now = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());

function changed(): void {
  generation++;
  lastProgress = now();
  for (const listener of listeners) listener();
}

/** For useSyncExternalStore: told whenever what a search would find has changed. */
export function subscribeRecordIndex(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** A number that changes whenever what a search would find has changed. */
export function recordIndexGeneration(): number {
  return generation;
}

// ---------------------------------------------------------------------------
// which records a person wrote

const byAPerson = (e: HistoryEntry): boolean => e.action !== "prepared" && e.by !== "System" && e.by !== "Assistant";

/**
 * Whose the sheet is now, read from the newest entry back — the rule the
 * insights use (engine/insights.ts isHumanRecord), so a search and an insight
 * never disagree about who wrote a draft: "Fill again" (the assistant's own
 * edit) replaces every value, so a person's entry before it no longer
 * describes the sheet. null when the history says neither.
 */
function personWroteLast(history: readonly HistoryEntry[]): boolean | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const e = history[i];
    if (e.by === "Assistant" && e.action === "assistant-edit") return false;
    if (byAPerson(e)) return true;
  }
  return null;
}

/**
 * Has a person written on this record? Not a blank sheet the calendar made
 * (Due or Scheduled, nothing in its history by anybody) and not one only the
 * assistant has prepared (REQUIREMENTS §75). A record a person asked Mitra to
 * fill or edit counts as theirs: they asked for it, and it is their work.
 */
export function writtenByAPerson(r: RecordInstance): boolean {
  if (r.submittedAt || r.verifiedAt || r.rejectedAt) return true;
  if (r.status !== "Due" && r.status !== "Scheduled" && r.status !== "In Progress") return true;
  const last = r.history ? personWroteLast(r.history) : null;
  if (last !== null) return last;
  if (r.status !== "In Progress") return false;
  // In progress: started by a person (New record) unless the assistant prepared it...
  if (!r.prepared) return true;
  // ...and prepared-only while the history holds nothing but the preparation —
  // or, on a record from before histories were kept, while its last save is
  // the preparation's own.
  if (r.history && r.history.length > 0) return false;
  const gap = Date.parse(r.updatedAt) - Date.parse(r.prepared.at);
  return !(Number.isFinite(gap) && gap >= 0 && gap < UNTOUCHED_WINDOW_MS);
}

// WHAT TELLS A CHANGED RECORD FROM AN UNCHANGED ONE. A save (upsert) always
// mints a new updatedAt, but not every change is a save: upsertMany leaves
// updatedAt alone on purpose (so a prepared record still reads as untouched),
// and the boot migrations write through it — engine/calendarMigration.ts
// moves a record to the next working day, and clears a pest round re-marked
// as a holiday; the tube-light and service-report migrations rewrite a
// draft's lines. So the stamp also carries:
//   - the due date, and how many entries the history has — a migration that
//     changes a record a person has written leaves one ("System");
//   - the data's shape at its top level, in figures: how many boxes, how many
//     lines in its lists, how many boxes inside, how many letters, how many
//     ticks — cheap, and nothing is written out;
//   - for a record NO PERSON has written (a blank sheet, the assistant's
//     preparation — what those writers change without a history entry, and
//     what Search reads only when "Also look in blank sheets…" is ticked),
//     how long its data is when written out, worked out once per data object.
// Why not the written-out length of every record: after a colleague's save is
// pulled in, every record is a new object, and writing a generated year of
// them out (3,744 records, 5.9 M characters) took 60-95 ms on this desktop —
// more on the plant's laptops, and again on every pulled change while Search
// is open — against about 1 ms for the records no person has written. Measured
// as a whole pass after a pull: 4-9 ms before, 8-13 ms with this stamp.
const writtenLengths = new WeakMap<object, number>();

function writtenLength(data: object): number {
  let n = writtenLengths.get(data);
  if (n === undefined) {
    try {
      n = JSON.stringify(data)?.length ?? 0;
    } catch {
      n = -1;
    }
    writtenLengths.set(data, n);
  }
  return n;
}

function shapeOf(data: unknown): string {
  if (data === null || typeof data !== "object") return typeof data === "string" ? `s${data.length}` : String(data);
  let boxes = 0;
  let lines = 0;
  let inner = 0;
  let letters = 0;
  let ticks = 0;
  for (const v of Object.values(data)) {
    boxes++;
    if (Array.isArray(v)) lines += v.length;
    else if (v && typeof v === "object") inner += Object.keys(v).length;
    else if (typeof v === "string") letters += v.length;
    else if (v === true) ticks++;
  }
  return `${boxes}.${lines}.${inner}.${letters}.${ticks}`;
}

function stampOf(r: RecordInstance, human: boolean): string {
  const written = human || r.data === null || typeof r.data !== "object" ? "" : writtenLength(r.data);
  return `${r.updatedAt}|${r.status}|${r.dueDate}|${r.history?.length ?? 0}|${shapeOf(r.data)}|${written}`;
}

// ---------------------------------------------------------------------------
// the index

/**
 * Who is looking and at which formats: a change to any of them means another
 * index. `account` is the signed-in account (pages/SearchPage.tsx passes
 * useAuth's user id): the department scope alone is the same for two accounts
 * that both see every department.
 */
function indexKey(isDemo: boolean, account?: string): { key: string; docs: DocumentDefinition[] } {
  const docs = documentRepository.getAll();
  let key = `${account ?? ""}|${isDemo ? "demo" : "live"}|${departmentScope()?.join(",") ?? "*"}`;
  for (const d of docs) key += `|${d.id}:${d.name}:${d.formatNo}:${d.kind}`;
  return { key, docs };
}

/** The layout a record is read with: looked up once per format per index, and by revision only for a record filled on an old one (§74). */
function layoutFor(s: IndexState | null, r: RecordInstance): LogSheetLayout | undefined {
  if (r.formatRevision) return getLogSheetLayoutForRecord(r.documentId, r);
  if (!s) return getLogSheetLayout(r.documentId);
  if (!s.layouts.has(r.documentId)) s.layouts.set(r.documentId, getLogSheetLayout(r.documentId));
  return s.layouts.get(r.documentId);
}

function entryFor(s: IndexState, r: RecordInstance, human: boolean, stamp: string): IndexEntry {
  const doc = s.docs.get(r.documentId);
  const { text, cells } = recordSearchText(r, doc, doc?.kind === "log-sheet" ? layoutFor(s, r) : undefined);
  return { id: r.id, documentId: r.documentId, dueDate: r.dueDate, updatedAt: r.updatedAt, status: r.status, isDemo: r.isDemo, human, cells, stamp, text };
}

function statusOf(s: IndexState | null): RecordIndexStatus {
  return { ready: !!s?.ready, complete: !!s && s.ready && !s.pass, indexed: s?.entries.size ?? 0 };
}

function hidden(): boolean {
  return typeof document !== "undefined" && document.hidden;
}

function scheduleSlice(): void {
  if (cancelSlice) return;
  if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(runSlice, { timeout: 150 });
    cancelSlice = () => window.cancelIdleCallback(handle);
  } else {
    const handle = setTimeout(runSlice, 0);
    cancelSlice = () => clearTimeout(handle);
  }
}

// A hidden tab builds nothing; the work picks up where it stopped when the tab is looked at again.
function resumeWhenVisible(): void {
  if (waitingForVisible || typeof document === "undefined") return;
  waitingForVisible = true;
  const onVisible = () => {
    if (document.hidden) return;
    document.removeEventListener("visibilitychange", onVisible);
    waitingForVisible = false;
    if (state?.pass) scheduleSlice();
  };
  document.addEventListener("visibilitychange", onVisible);
}

function runSlice(): void {
  cancelSlice = null;
  const s = state;
  const pass = s?.pass;
  if (!s || !pass) return;
  if (hidden()) {
    resumeWhenVisible();
    return;
  }
  const until = now() + SLICE_MS;
  let touched = false;
  let flattened = 0;
  let looked = 0;
  while (pass.pos < pass.list.length) {
    // The clock is read after each record flattened, and every 64 records
    // only compared: a stamp is cheap, but after a pull a year of them (and,
    // with drafts, each draft's data written out once, writtenLength) must
    // not be one long task either.
    if ((flattened > 0 || ++looked % 64 === 0) && now() >= until) break;
    const r = pass.list[pass.pos++];
    const human = writtenByAPerson(r);
    if (!human && !pass.withDrafts) continue;
    pass.seen.add(r.id);
    const stamp = stampOf(r, human);
    const had = s.entries.get(r.id);
    if (had && had.stamp === stamp) continue;
    s.entries.set(r.id, entryFor(s, r, human, stamp));
    touched = true;
    flattened++;
  }
  if (touched) s.sorted = null;

  if (pass.pos < pass.list.length) {
    scheduleSlice();
    // While the first build runs, a waiting search is shown what there is so far, now and then.
    if (touched && !s.ready && now() - lastProgress >= PROGRESS_EVERY_MS) changed();
    return;
  }

  // The pass is through: a record no longer on file, no longer the person's to
  // see, or no longer asked for, leaves the index.
  for (const id of s.entries.keys()) {
    if (!pass.seen.has(id)) {
      s.entries.delete(id);
      touched = true;
    }
  }
  if (touched) s.sorted = null;
  s.syncedTo = pass.from;
  s.pass = null;
  const becameReady = !s.ready && s.withDrafts === pass.withDrafts;
  if (becameReady) s.ready = true;
  if (touched || becameReady) changed();
}

/**
 * Brings the index up to date with the stored records, starting it if need be.
 * Call it from an effect, never while drawing: it does the first 8 ms slice at
 * once and leaves the rest to idle time.
 */
export function ensureRecordIndex(opts: { isDemo: boolean; includeDrafts?: boolean; account?: string }): RecordIndexStatus {
  const { key, docs } = indexKey(opts.isDemo, opts.account);
  const edits = formatEdits();
  if (!state || state.key !== key || state.edits !== edits) {
    cancelSlice?.();
    cancelSlice = null;
    const hadOne = state !== null;
    state = {
      key,
      isDemo: opts.isDemo,
      edits,
      docs: new Map(docs.map((d) => [d.id, d] as const)),
      layouts: new Map(),
      entries: new Map(),
      withDrafts: !!opts.includeDrafts,
      syncedTo: null,
      ready: false,
      pass: null,
      sorted: null,
    };
    // What the last index found is not this person's, or not these formats'.
    if (hadOne) changed();
  }
  const s = state;
  if (opts.includeDrafts && !s.withDrafts) {
    s.withDrafts = true;
    s.ready = false;
    s.syncedTo = null;
    changed();
  }
  const records = recordRepository.snapshot();
  if (s.syncedTo === records && !s.pass) return statusOf(s);
  if (!s.pass || s.pass.from !== records || s.pass.withDrafts !== s.withDrafts) {
    s.pass = { from: records, list: recordRepository.query({ isDemo: s.isDemo }), pos: 0, seen: new Set(), withDrafts: s.withDrafts };
  }
  cancelSlice?.();
  cancelSlice = null;
  runSlice();
  return statusOf(s);
}

/** How far the index has got. */
export function recordIndexStatus(): RecordIndexStatus {
  return statusOf(state);
}

function newestFirst(a: IndexEntry, b: IndexEntry): number {
  if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? 1 : -1;
  if (a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? 1 : -1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * The records whose words contain EVERY word of the query, newest first
 * (REQUIREMENTS §75). Safe to call while drawing: it only reads what the index
 * holds, and if the index is missing or was made for somebody else it asks for
 * one to be built — after this frame — and finds nothing meanwhile.
 * `documentIds`, when given, keeps the search to those documents' records (a
 * format number typed with the words, readSearchQuery).
 */
export function searchRecords(
  query: string,
  opts: { isDemo: boolean; includeDrafts?: boolean; limit?: number; account?: string; documentIds?: readonly string[] }
): RecordSearchResult {
  const terms = searchTerms(query);
  const s = state;
  const stale = !s || s.key !== indexKey(opts.isDemo, opts.account).key || s.edits !== formatEdits();
  if (stale || (opts.includeDrafts && !s.withDrafts)) {
    if (!startLater) {
      startLater = setTimeout(() => {
        startLater = null;
        ensureRecordIndex(opts);
      }, 0);
    }
  }
  if (stale || terms.length === 0) return { hits: [], total: 0, terms, ready: !stale && s.ready, complete: false };

  const sorted = (s.sorted ??= Array.from(s.entries.values()).sort(newestFirst));
  const limit = opts.limit ?? Infinity;
  const only = opts.documentIds ? new Set(opts.documentIds) : null;
  const hits: RecordHit[] = [];
  let total = 0;
  for (const e of sorted) {
    if (e.isDemo !== opts.isDemo || (!e.human && !opts.includeDrafts)) continue;
    if (only && !only.has(e.documentId)) continue;
    if (!containsAllTerms(e.text, terms)) continue;
    total++;
    if (hits.length < limit) hits.push(e);
  }
  const draftsPending = !!opts.includeDrafts && !s.withDrafts;
  return { hits, total, terms, ready: s.ready && !draftsPending, complete: s.ready && !s.pass && !draftsPending };
}

// ---------------------------------------------------------------------------
// what the search box was asked

/** What a query asks of the records (readSearchQuery). */
export type SearchQueryReading =
  /** Only a format number, or a request to open one: that document's register, blank sheets included. */
  | { kind: "register"; documentIds: string[] }
  /** Words to look for in what the records say — in the named documents' records only, when the query also named a format number (documentIds; null = every document). */
  | { kind: "words"; words: string; documentIds: string[] | null };

/** The longest run of words a format number is written over: "F / HR / 05". */
const LONGEST_NUMBER_WORDS = 5;
const EDGE_PUNCTUATION = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

/**
 * The query with the format numbers it names taken out: "F/HR/17 RB-27" ->
 * "RB-27", "hr 5 roshni" -> "roshni", "F HR 05 induction" -> "induction".
 * A number is found as engine/formatNumbers.ts finds one — a run of words
 * that is wholly an F/<dept>/<nn> number however it is written (formatKey),
 * or a single word that names one (a number of its own shape, QA-CAF-00, or
 * one with punctuation on it, "F/HR/17:") — longest run first. A run never
 * ends on a lone letter: "F/QC/40 C" is F/QC/40 and the word C, as
 * formatNumbers reads it.
 */
function withoutFormatNumbers(query: string): string {
  const words = query.trim().split(/\s+/).filter(Boolean);
  const kept: string[] = [];
  for (let i = 0; i < words.length; ) {
    let taken = 0;
    for (let n = Math.min(LONGEST_NUMBER_WORDS, words.length - i); n >= 1 && taken === 0; n--) {
      if (n > 1 && !/\d/.test(words[i + n - 1])) continue;
      const run = words.slice(i, i + n).join(" ").replace(EDGE_PUNCTUATION, "");
      if (run && (formatKey(run) !== null || (n === 1 && namesFormatNumber(run)))) taken = n;
    }
    if (taken === 0) kept.push(words[i]);
    i += taken || 1;
  }
  return kept.join(" ");
}

/**
 * What the search box is asked (REQUIREMENTS §52, §75.4). A query that is
 * ONLY a format number, however it is written — or a request to open one,
 * "open F/HR/05", "F/QC/19 and F/QC/20" (formatNumbers.isFormatNumberQuery) —
 * lists that document's register. A format number WITH other words — "F/HR/17
 * RB-27", "QC-30 Gaurav", "hr 5 roshni" — looks for those words, in that
 * document's records only: the number says where to look, the words what to
 * look for. It used to list the register and drop the words without a word
 * said. A word with a figure in it is never a request: isFormatNumberQuery
 * reads letters only, so "F-QC-40.C 180" would have counted as the bare
 * number, and 180 is looked for. Until the other words come to two letters
 * the register stays (the number is being typed, or a letter after it). A
 * query that names no format number is all words, over every document.
 */
export function readSearchQuery(query: string): SearchQueryReading {
  const q = query.trim();
  if (!namesFormatNumber(q)) return { kind: "words", words: q, documentIds: null };
  const documentIds = documentsByFormatNumber(q).map((d) => d.id);
  const words = withoutFormatNumbers(q);
  if (words.length < 2 || (isFormatNumberQuery(q) && !/\d/.test(words))) return { kind: "register", documentIds };
  return { kind: "words", words, documentIds };
}

/**
 * The values on one record, with their headings — from the index when it holds
 * this very version of the record, otherwise read afresh (one record, a few
 * hundredths of a millisecond). For a line of a list the index did not build,
 * such as a format number's records; call it for the lines being drawn only.
 */
export function recordCells(record: RecordInstance): readonly SearchCell[] {
  const s = state;
  const had = s?.entries.get(record.id);
  if (had && had.stamp === stampOf(record, writtenByAPerson(record))) return had.cells;
  const doc = s?.docs.get(record.documentId) ?? documentRepository.getById(record.documentId);
  return recordSearchText(record, doc, doc?.kind === "log-sheet" ? layoutFor(s, record) : undefined).cells;
}
