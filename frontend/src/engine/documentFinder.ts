import type { DocumentDefinition } from "../types";
import { documentRepository } from "../data/repositories/documentRepository";
import { departmentFromFormatNo, departmentName, departmentOfDocument, DEPARTMENTS } from "../data/seed/departments";
import { FORMAT_LIST_ROWS } from "../data/seed/sysDocumentControlLayouts";
import { documentDepartmentLabel, isDocumentVisible } from "./departmentScope";
import { documentsByFormatNumber, documentsByFormatNumberUnscoped, formatKey, formatKeysNamed, namesFormatNumber } from "./formatNumbers";
import { DOC_KEYWORDS } from "./assistantLocal";
import { tr } from "../i18n";
import { documentTextIn } from "../i18n/documentText";

// EVERY DOCUMENT FINDABLE, BY ANYBODY (REQUIREMENTS §84).
//
// The owner, 30-Sep-2026: "If any user searches for any document, or if the
// super admin searches for any document, he should find it — it should be
// present." Until now Search found only the person's own departments'
// documents (§40, §52), so a Quality Control account typing F/HR/17 was told
// nothing at all, and a format on the plant's own Master List of Formats that
// DCRS does not hold yet could not be found by anybody. Now what is typed —
// any word of a document's name, in any case; its format number however it is
// written (F/HR/17, F-HR-17, fhr17, HR 17); its module or department; or a
// word people use for it (engine/assistantLocal.ts DOC_KEYWORDS) — finds, in
// three kinds:
//
//   yours   a document the person may open and work on, as before;
//   kept    another department's document: FOUND, and shown as "Kept by
//           <department> — ask the super admin for access". It is not opened
//           and none of its records is read — nothing here touches a record,
//           and a kept document's line carries no button;
//   master  a line of the Master List of Formats & Records (F/SYS/02, the
//           company's workbook as last updated — sysDocumentControlLayouts.ts
//           FORMAT_LIST_ROWS, the lines DCRS's own F/SYS/02 is on file with)
//           that no DCRS document holds yet: "On the Master List of Formats
//           (F/SYS/02) — not in DCRS yet".
//
// WHAT IS UNCHANGED. A query that names a format number is answered by the
// number alone, and the person's own documents for it are exactly what
// engine/formatNumbers.ts documentsByFormatNumber has always given (the
// Search page's registers and Mitra rest on it). The old name rule — the
// query, as typed, inside a document's name or number — still finds whatever
// it found; the word rule below only adds to it.
//
// FAST ON A SLOW LAPTOP (§56). The words of every document and master-list line
// are worked out once per catalogue (the repository hands back the same list
// until a document changes) and a keystroke is then a pass over ~260 short
// word lists — well under a millisecond — with no record read at all.

/** What a kept document's line says. */
export const keptByLabel = (department: string): string => `Kept by ${department} — ask the super admin for access`;
/** What a master-list line DCRS does not hold yet says. */
export const NOT_IN_DCRS_YET = "On the Master List of Formats (F/SYS/02) — not in DCRS yet";

/** One line of the Master List of Formats & Records (F/SYS/02). */
export interface MasterListFormat {
  /** As the list prints it: "F-HR-10", "F-QC-40. A". */
  formatNo: string;
  /** As the list prints it. */
  name: string;
  /** Its canonical key ("HR-10", "QC-40A"), or null for a number of its own shape. */
  key: string | null;
  /** The department code the number carries (or the holding document's), or null. */
  department: string | null;
  /** The department in words, or "—". */
  departmentName: string;
  /** The DCRS document that holds this format, or null when DCRS does not have it yet. */
  heldBy: string | null;
}

export type FoundDocument =
  /** A document the person may open and work on. `asListed` is the master list's number when that is how it was found (F-MKT-06). */
  | { kind: "yours"; doc: DocumentDefinition; asListed?: string }
  /** Another department's document: found, never opened, its records never read. */
  | { kind: "kept"; doc: DocumentDefinition; department: string; asListed?: string }
  /** On the master list, not in DCRS yet. */
  | { kind: "master"; format: MasterListFormat };

// ---------------------------------------------------------------------------
// the master list against DCRS

// A master-list line DCRS holds under a number of another shape. Each is on
// record in the repository: data/seed/documentDepartments.ts files both by
// their master-list number, and docs/REQUIREMENTS.md says why the form itself
// prints another (or none).
const MASTER_LIST_EQUIVALENTS: Readonly<Record<string, string>> = {
  // The form is headed QA-CAF-00; the list files it as F-MKT-06 "Complaint Acknowldgement form" (§40, §77).
  "F-MKT-06": "capa-complaint-ack",
  // (F-PRD-19 was here while the process parameter record's number was under the clip of the photograph, §12. The
  // paper itself, sent on 06-Oct-2026, prints F-PRD-19, and DCRS holds it under that number: REQUIREMENTS §91.)
};

const squash = (s: string): string => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
const hasKnownNumber = (d: DocumentDefinition): boolean => !!d.formatNo && d.formatNo !== "TO BE CONFIRMED";

/** DCRS's documents by their number, read once per catalogue: the first document carrying each key, and those whose number is of its own shape. */
interface Numbers {
  byKey: Map<string, string>;
  ownShape: { id: string; squashed: string }[];
  ids: Set<string>;
}

function numbersOf(docs: readonly DocumentDefinition[]): Numbers {
  const byKey = new Map<string, string>();
  const ownShape: { id: string; squashed: string }[] = [];
  for (const d of docs) {
    if (!hasKnownNumber(d)) continue;
    const key = formatKey(d.formatNo);
    if (key) {
      if (!byKey.has(key)) byKey.set(key, d.id);
    } else ownShape.push({ id: d.id, squashed: squash(d.formatNo) });
  }
  return { byKey, ownShape, ids: new Set(docs.map((d) => d.id)) };
}

function holderOf(formatNo: string, key: string | null, numbers: Numbers): string | null {
  if (key) {
    const same = numbers.byKey.get(key);
    if (same) return same;
  }
  const equivalent = MASTER_LIST_EQUIVALENTS[formatNo];
  if (equivalent && numbers.ids.has(equivalent)) return equivalent;
  if (!key) {
    // A number of its own shape (QA-PRO-FL-CCT-01) is matched as written, punctuation aside, as formatNumbers does.
    const s = squash(formatNo);
    if (s.length >= 6) {
      const d = numbers.ownShape.find((x) => x.squashed.includes(s));
      if (d) return d.id;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// the words each document and line is found by

const WORD = /[\p{L}\p{N}\p{M}]+/gu;
// "On-line", "Pre-Employment", "Non-Conformance": typed as one word too ("online").
const JOINED = /[\p{L}\p{N}\p{M}]+(?:[-.'’][\p{L}\p{N}\p{M}]+)+/gu;
function wordsOf(text: string): string[] {
  const lower = text.toLowerCase();
  const words: string[] = Array.from(lower.match(WORD) ?? []);
  for (const joined of lower.match(JOINED) ?? []) words.push(joined.replace(/[-.'’]/g, ""));
  return words;
}

interface Entry {
  /** Name and number, lower case, for the old rule: the query as typed inside either. */
  nameAndNumber: string;
  /** The name's own words (either language), for ranking. */
  nameWords: string[];
  /** Every word the entry is found by. */
  words: string[];
  /** The name, lower case, for "starts with". */
  name: string;
}

interface Catalogue {
  from: readonly DocumentDefinition[];
  docs: Map<string, Entry>;
  lines: MasterListFormat[];
  lineEntries: Map<MasterListFormat, Entry>;
}

let catalogue: Catalogue | null = null;

function entry(name: string, formatNo: string, extras: readonly string[]): Entry {
  const nameWords = Array.from(new Set(wordsOf(name)));
  const words = new Set(nameWords);
  // A number still TO BE CONFIRMED is no word of the document's ("be", "to"), though the old rule still reads it.
  const known = !!formatNo && formatNo !== "TO BE CONFIRMED";
  if (known) {
    for (const w of wordsOf(formatNo)) words.add(w);
    // The number squashed too, so "fhr17" reads as a word of F/HR/17 while it is still being typed.
    const squashed = squash(formatNo).toLowerCase();
    if (squashed) words.add(squashed);
    if (formatKey(formatNo) && squashed.startsWith("f")) words.add(squashed.slice(1));
  }
  for (const extra of extras) for (const w of wordsOf(extra)) words.add(w);
  return { nameAndNumber: `${name} ${formatNo}`.toLowerCase(), nameWords, words: Array.from(words), name: name.toLowerCase() };
}

const ALIASES: Map<string, string[]> = new Map();
function aliasesOf(id: string): string[] {
  if (ALIASES.size === 0) for (const k of DOC_KEYWORDS) ALIASES.set(k.id, [...(ALIASES.get(k.id) ?? []), ...k.aliases]);
  return ALIASES.get(id) ?? [];
}

function departmentWords(code: string | null): string[] {
  if (!code) return [];
  const d = DEPARTMENTS.find((x) => x.code === code);
  return d ? [d.code, d.name] : [code];
}

function build(docs: readonly DocumentDefinition[]): Catalogue {
  const entries = new Map<string, Entry>();
  for (const d of docs) {
    const english = documentTextIn(d.name, "en");
    const extras = [
      english === d.name ? "" : english,
      d.module,
      tr("en", `module.${d.module}`),
      tr("gu", `module.${d.module}`),
      d.section ?? "",
      ...departmentWords(departmentOfDocument(d.id, d.formatNo)),
      ...aliasesOf(d.id),
    ];
    const e = entry(d.name, d.formatNo, extras);
    if (english !== d.name) for (const w of wordsOf(english)) if (!e.nameWords.includes(w)) e.nameWords.push(w);
    entries.set(d.id, e);
  }
  const lines: MasterListFormat[] = [];
  const lineEntries = new Map<MasterListFormat, Entry>();
  const numbers = numbersOf(docs);
  for (const row of FORMAT_LIST_ROWS) {
    const formatNo = String(row.formatNumber ?? "").trim();
    const name = String(row.description ?? "").replace(/^_+/, "").replace(/\s+/g, " ").trim();
    if (!formatNo) continue;
    const key = formatKey(formatNo);
    const heldBy = holderOf(formatNo, key, numbers);
    const holder = heldBy ? docs.find((d) => d.id === heldBy) : undefined;
    const department = departmentFromFormatNo(formatNo) ?? (holder ? departmentOfDocument(holder.id, holder.formatNo) : null);
    const line: MasterListFormat = { formatNo, name, key, department, departmentName: department ? departmentName(department) : "—", heldBy };
    lines.push(line);
    lineEntries.set(line, entry(name, formatNo, departmentWords(department)));
  }
  return { from: docs, docs: entries, lines, lineEntries };
}

function current(): Catalogue {
  const docs = documentRepository.getAllUnscoped();
  if (!catalogue || catalogue.from !== docs) catalogue = build(docs);
  return catalogue;
}

/**
 * Works the catalogue's words out while the browser is idle, so the first
 * keystroke does not wait for it (§56). Returns the way to call it off.
 */
export function prepareDocumentFinder(): () => void {
  if (typeof window === "undefined") return () => undefined;
  const run = () => void current();
  if (typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(run, { timeout: 2000 });
    return () => window.cancelIdleCallback(handle);
  }
  const handle = setTimeout(run, 200);
  return () => clearTimeout(handle);
}

/** Every line of the Master List of Formats (F/SYS/02), each with the DCRS document that holds it, if any. */
export function masterListFormats(): readonly MasterListFormat[] {
  return current().lines;
}

/** The master-list formats DCRS does not have yet, in the list's own order. */
export function masterListFormatsNotInDcrs(): MasterListFormat[] {
  return current().lines.filter((l) => !l.heldBy);
}

// ---------------------------------------------------------------------------
// a query

/** The shortest query looked for by its words: one letter is in nearly every name. */
const SHORTEST_WORD_QUERY = 2;
/** The old rule — the query as typed inside a name or number — started at three letters. */
const SHORTEST_PHRASE_QUERY = 3;

export interface DocumentQuery {
  /** Nothing to look for: every document and line matches. */
  readonly empty: boolean;
  /** Whether a document (any department's) answers the query. */
  matchesDocument(doc: DocumentDefinition): boolean;
  /** Whether a master-list line answers the query. */
  matchesMasterFormat(line: MasterListFormat): boolean;
  /** How well a document answers it (lower is better). */
  rank(doc: DocumentDefinition): number;
}

function keyMatches(lineKey: string, key: string): boolean {
  return lineKey === key || (!/[A-Z]$/.test(key) && lineKey.replace(/[A-Z]$/, "") === key);
}

/** The query read once, for as many documents and lines as need asking. */
export function documentQuery(query: string): DocumentQuery {
  const q = query.trim();
  const cat = current();
  if (!q) return { empty: true, matchesDocument: () => true, matchesMasterFormat: () => true, rank: () => 0 };

  if (namesFormatNumber(q)) {
    // BY NUMBER. The documents that carry it — every department's — and a
    // master-list line DCRS holds under another number (F-MKT-06).
    const keys = formatKeysNamed(q);
    const ids = new Set(documentsByFormatNumberUnscoped(q).map((d) => d.id));
    for (const line of cat.lines) if (line.heldBy && line.key && keys.includes(line.key)) ids.add(line.heldBy);
    const tokens = q.split(/\s+/).map(squash).filter((t) => t.length >= 6 && /[A-Z]/.test(t) && /\d/.test(t));
    const exact = (line: MasterListFormat) => !!line.key && keys.some((k) => keyMatches(line.key as string, k));
    // "F/HR/10A" for F-HR-10: a lettered number with no line of its own finds its base, as formatNumbers does.
    const bases = keys.filter((k) => /[A-Z]$/.test(k) && !cat.lines.some((l) => l.key === k)).map((k) => k.replace(/[A-Z]$/, ""));
    return {
      empty: false,
      matchesDocument: (doc) => ids.has(doc.id),
      matchesMasterFormat: (line) =>
        exact(line) || (!!line.key && bases.includes(line.key)) || (!line.key && tokens.some((t) => squash(line.formatNo).includes(t))),
      rank: () => 0,
    };
  }

  const lower = q.toLowerCase();
  // The query's own words, as typed: "on-line" asks for "on" and "line", each of which the entry has.
  const tokens = lower.match(WORD) ?? [];
  // A word of three letters or more is the start of a word ("insp" for Inspection); a shorter one is a whole
  // word ("hr", "qc", "of") — two letters begin a word on most forms ("re", "ma"), and a keystroke must not draw
  // the catalogue on a low-end laptop.
  const wordMatches = (t: string) => (Array.from(t).length >= SHORTEST_PHRASE_QUERY ? (w: string) => w.startsWith(t) : (w: string) => w === t);
  const tests = tokens.map(wordMatches);
  const byWords = (e: Entry) => tests.length > 0 && tests.every((test) => e.words.some(test));
  const byPhrase = (e: Entry) => lower.length >= SHORTEST_PHRASE_QUERY && e.nameAndNumber.includes(lower);
  const matches = (e: Entry | undefined) => !!e && (byPhrase(e) || (lower.length >= SHORTEST_WORD_QUERY && byWords(e)));
  const entryOf = (doc: DocumentDefinition) => cat.docs.get(doc.id) ?? entry(doc.name, doc.formatNo, [doc.module]);
  return {
    empty: false,
    matchesDocument: (doc) => matches(entryOf(doc)),
    matchesMasterFormat: (line) => matches(cat.lineEntries.get(line)),
    rank: (doc) => {
      const e = entryOf(doc);
      if (e.name.startsWith(lower)) return 0;
      if (tokens.every((t) => e.nameWords.some((w) => w.startsWith(t)))) return 1;
      return 2;
    },
  };
}

/** Whether a document answers what was typed into a filter box (the Document Library's). */
export function documentMatchesQuery(doc: DocumentDefinition, query: string): boolean {
  return documentQuery(query).matchesDocument(doc);
}

/**
 * EVERYTHING WHAT WAS TYPED NAMES: the person's own documents first (exactly
 * as formatNumbers finds them for a number), then other departments' documents,
 * kept by them, then the master-list formats DCRS does not have yet. Reads no
 * record. Empty for an empty query.
 */
export function findDocuments(query: string): FoundDocument[] {
  const q = query.trim();
  if (!q) return [];
  const cat = current();
  const all = documentRepository.getAllUnscoped();
  const found = documentQuery(q);
  const yours: FoundDocument[] = [];
  const kept: FoundDocument[] = [];
  const seen = new Set<string>();
  const asListedFor = (doc: DocumentDefinition): string | undefined => {
    const line = cat.lines.find((l) => l.heldBy === doc.id && l.key && !(hasKnownNumber(doc) && formatKey(doc.formatNo) === l.key));
    return line ? line.formatNo : undefined;
  };
  const add = (doc: DocumentDefinition, asListed?: string) => {
    if (seen.has(doc.id)) return;
    seen.add(doc.id);
    if (isDocumentVisible(doc)) yours.push(asListed ? { kind: "yours", doc, asListed } : { kind: "yours", doc });
    else {
      const department = documentDepartmentLabel(doc.id, doc.formatNo);
      kept.push(asListed ? { kind: "kept", doc, department, asListed } : { kind: "kept", doc, department });
    }
  };

  if (namesFormatNumber(q)) {
    // The person's own, in the order and number formatNumbers has always given them.
    for (const doc of documentsByFormatNumber(q)) add(doc);
    for (const doc of documentsByFormatNumberUnscoped(q)) add(doc);
    const keys = formatKeysNamed(q);
    for (const line of cat.lines) {
      if (!line.heldBy || !line.key || !keys.includes(line.key)) continue;
      const doc = all.find((d) => d.id === line.heldBy);
      if (doc) add(doc, asListedFor(doc));
    }
  } else {
    const matched = all.filter((d) => found.matchesDocument(d));
    const ranked = matched.map((doc, i) => ({ doc, i, r: found.rank(doc) })).sort((a, b) => a.r - b.r || a.i - b.i);
    for (const { doc } of ranked) add(doc);
  }
  const master: FoundDocument[] = cat.lines.filter((l) => !l.heldBy && found.matchesMasterFormat(l)).map((format) => ({ kind: "master", format }));
  return [...yours, ...kept, ...master];
}
