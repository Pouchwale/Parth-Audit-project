// THE ACCESS LEVELS, HELD BY THE SERVER (REQUIREMENTS §96).
//
// The owner, 8-Oct-2026: "in our dashboard in the audit software I can give access from there only, and only the
// superadmin can do this: make an option for which user can access what, and give read, write and edit access
// accordingly." Who answers for each document and what each level allows are decided in ONE place,
// frontend/src/engine/accessRules.ts (the owner's table of 7-Oct-2026); this file is how the server applies it — the
// screen is never the lock (REQUIREMENTS §66):
//
//   * THE RULES AS STORED: the company item "access" in PostgreSQL, beside "master", read by every signed-in account and
//     written only by the super admin (backend/accessRulesRoutes.ts). Built here over the plant's catalogue (the stored
//     document definitions, and any document a record names that they do not), once per change of either.
//   * WHAT A PERSON SEES: a document at Read or more. The records and deletions-log lines of the others are not handed
//     over (GET /api/storage, the engine host, /api/v1) and not taken in (PUT /api/storage keeps them as stored).
//   * WHAT A PERSON MAY CHANGE, RECORD BY RECORD, against the version stored (recordChanges below): a new record needs
//     Write (start), a change to an unsigned one Write (fill), a move to Submitted or Pending Verification Write (submit),
//     to Verified Write (verify), a send back Write (send_back), a change to a signed-off record or one under correction
//     Edit (correct), removing a record Edit (delete); a document definition or a format edit Edit (format).
//   * THE SUPER ADMIN PASSES EVERYTHING. An account nobody has described keeps what it had (accessRules.ts level()).
//
// A PERSON'S ACT OR THE APP'S HOUSEKEEPING. Every browser does some work of the app's own when it opens: it makes the
// calendar's blank sheets, prepares the ones due (the known parts only), adds the filled papers the plant supplied
// (the historical records, data/seed/historicalRecords.ts), moves a sheet off a holiday, puts a record right after an
// upgrade (the company's name, a schedule pinned to its revision) and clears pre-launch leftovers. None of that is a
// person acting on a record they hold; everything a person does to one writes its history (saveDraft, submit, verify,
// send back, resume, reopen, cancel a correction). So a change the person's level does not allow is
//   * REFUSED, with 403 and the level in plain words, when it is the person's own act on a record stored: it adds to,
//     or changes, the record's history;
//   * LEFT AS STORED, without a word, otherwise: a record that is new to the server (a sheet the calendar made or the
//     assistant prepared, a supplied paper, or one started on a screen that should not have offered Start — the
//     website hides Start below Write and says why, and the phone's engine refuses it in words), a sheet changed or
//     cleared, a record changed without a history line, a record gone. The server's own morning prepare
//     (backend/notificationJobs.ts) and the browser of somebody who may make it do that work, and a Read-only
//     person's browser can never change, add or remove a record through it.
//
// NO IMPORTS BUT THE TWO PURE FILES THE SERVER ALREADY READS (type stripping cannot follow the app's extensionless
// imports). backend/tests/accessLevels.test.ts holds every path to it.
import {
  ACCESS_MODULES,
  DEFAULT_PEOPLE,
  atLeast,
  buildAccess,
  levelNeeded,
  normalizeAccessRules,
  type Access,
  type AccessAccount,
  type AccessDoc,
  type AccessLevel,
  type AccessRules,
  type DocumentAction,
} from "../frontend/src/engine/accessRules.ts";
import { departmentOfDocument } from "../frontend/src/data/seed/documentDepartments.ts";

// THE WEBSITE'S OWN WORDS for a refusal (frontend/src/engine/accessWords.ts), so the server, the pages and Mitra never
// say it differently. Loaded by name rather than by a static import: that file names its two types with an
// extensionless import, which the browser's bundler reads and the server's type check (NodeNext) refuses; Node erases
// the import when it runs the file, so it loads here as it is.
export type AccessLanguage = "en" | "gu" | "hi";
interface AccessWordsModule {
  ACCESS_LEVEL_CODE: string;
  refusalSentence(lang: AccessLanguage, document: string, have: AccessLevel, need: AccessLevel, action: DocumentAction): string;
}
const ACCESS_WORDS_MODULE = "../frontend/src/engine/accessWords.ts";
const { refusalSentence } = (await import(ACCESS_WORDS_MODULE)) as AccessWordsModule;

/** The company item that holds the super admin's rules (REQUIREMENTS §96). */
export const ACCESS_KEY = "access";

/** Kinds of document kept as issued, which have no records (engine/documentFinder.ts, the engine host's isReference). */
const REFERENCE_KINDS = new Set(["chemical-master", "licence", "compliance-statement"]);

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): string => (typeof v === "string" ? v : "");

function parseJson(value: string | null | undefined): unknown {
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// the catalogue and the rules

/** What the server knows of each document: its number and name for the words, its department for the rules. */
export interface CatalogueDoc extends AccessDoc {
  name: string;
}

/** One document definition (as stored, or as a server module reads it), as the rules read it. */
export function catalogueDoc(d: { id: string; formatNo?: unknown; name?: unknown; kind?: unknown; isReferenceOnly?: unknown }): CatalogueDoc {
  const formatNo = text(d.formatNo);
  return {
    id: d.id,
    formatNo,
    name: text(d.name) || d.id,
    department: departmentOfDocument(d.id, formatNo),
    reference: d.isReferenceOnly === true || REFERENCE_KINDS.has(text(d.kind)),
  };
}

/** The stored document definitions, as the rules read them. */
export function catalogueOf(documentsValue: string | null | undefined): CatalogueDoc[] {
  const parsed = parseJson(documentsValue);
  if (!Array.isArray(parsed)) return [];
  const out: CatalogueDoc[] = [];
  const seen = new Set<string>();
  for (const d of parsed) {
    if (!isObj(d) || typeof d.id !== "string" || !d.id || seen.has(d.id)) continue;
    seen.add(d.id);
    out.push(catalogueDoc(d as { id: string }));
  }
  return out;
}

/** A document a record names that the stored definitions do not: placed by its id alone, as the server always placed it. */
const unlisted = (id: string): CatalogueDoc => ({ id, formatNo: "", name: id, department: departmentOfDocument(id, undefined) });

/** The rules over a catalogue, with the documents by id; widened when a record names a document it does not know. */
export class AccessCatalogue {
  readonly rules: AccessRules;
  readonly docs: CatalogueDoc[];
  readonly byId: Map<string, CatalogueDoc>;
  access: Access;

  constructor(docs: CatalogueDoc[], storedRules: unknown) {
    this.rules = normalizeAccessRules(storedRules);
    this.docs = docs.slice();
    this.byId = new Map(this.docs.map((d) => [d.id, d] as const));
    this.access = buildAccess(this.docs, this.rules);
  }

  /** Knows every one of these documents afterwards (one rebuild, only when one is new). */
  include(ids: Iterable<string>): void {
    let added = false;
    for (const id of ids) {
      if (!id || this.byId.has(id)) continue;
      const doc = unlisted(id);
      this.docs.push(doc);
      this.byId.set(id, doc);
      added = true;
    }
    if (added) this.access = buildAccess(this.docs, this.rules);
  }

  /** "F-QC-30 Lamination Adhesive Viscosity Record", or the name alone while its number is to be confirmed. */
  title(documentId: string): string {
    const d = this.byId.get(documentId);
    if (!d) return "This document";
    const number = d.formatNo && !d.formatNo.toUpperCase().startsWith("TO BE") ? `${d.formatNo} ` : "";
    return `${number}${d.name}`.trim() || "This document";
  }
}

/** The catalogue and the rules from the two stored values (the documents item and the access item). */
export function accessCatalogue(documentsValue: string | null | undefined, accessValue: string | null | undefined): AccessCatalogue {
  return new AccessCatalogue(catalogueOf(documentsValue), parseJson(accessValue));
}

// ---------------------------------------------------------------------------
// one person's view

/** What one account may see and do, worked out once for a request. */
export interface AccessView {
  readonly catalogue: AccessCatalogue;
  readonly account: AccessAccount;
  /** The super admin: everything, always. */
  readonly boss: boolean;
  /** Edit on every document of the catalogue (the super admin, an account nobody has described with no departments): nothing to check. */
  readonly editsAll: boolean;
  /** Read or more on every document. */
  readsAll: boolean;
  /** What the person's copy was made for, which a browser sends back with a write (X-Scope): copyKey below. */
  readonly scope: string;
  level(documentId: string): AccessLevel;
  may(documentId: string, action: DocumentAction): boolean;
  /** Whether a line of the records or the deletions log is the person's to hold: one with no document is everybody's. */
  holds(line: unknown): boolean;
  /** The modules the person sees, or null for every one (and every line filed under no module). */
  modules(): string[] | null;
}

/** A short, stable key of a text (FNV-1a, 32 bits): enough to tell two views apart, not a secret. */
function shortHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/**
 * THE KEY OF A PERSON'S COPY (X-Scope): what their levels are worked out from, apart from the catalogue — their role,
 * email and departments, whether the rules name them, their own settings, and which documents the super admin gave
 * to whom where they are among them. Any change of their levels by the super admin, or of their departments, gives a
 * new key, so a write made from the copy before it is refused (409) and the browser loads again
 * (frontend/src/data/serverSync.ts). Not the catalogue: the definitions are written by the first browser of a new
 * plant and again after an upgrade, which must not send everybody's page back to the start. "*" for an account the
 * rules never name with no departments (every module at Edit, as before).
 */
export function copyKey(rules: AccessRules, account: AccessAccount): string {
  const email = (account.email ?? "").trim().toLowerCase();
  const departments = [...(account.departments ?? [])].map((d) => d.trim().toUpperCase()).filter(Boolean).sort();
  const answering = Object.entries(rules.responsibility);
  const described = DEFAULT_PEOPLE.some((p) => p.email === email) || !!rules.people[email] || answering.some(([, list]) => list.includes(email));
  if (account.role !== "admin" && !described && departments.length === 0) return "*";
  const mine = answering.filter(([, list]) => list.includes(email)).map(([id]) => id).sort();
  const given = answering.map(([id]) => id).sort();
  return `v:${shortHash(JSON.stringify([account.role, email, departments, described, rules.people[email] ?? null, given, mine]))}`;
}

export function viewFor(catalogue: AccessCatalogue, account: AccessAccount): AccessView {
  const access = (): Access => catalogue.access;
  const boss = access().isBoss(account);
  const levels = new Map<string, AccessLevel>();
  const level = (documentId: string): AccessLevel => {
    if (boss) return "edit";
    let l = levels.get(documentId);
    if (l === undefined) {
      if (!catalogue.byId.has(documentId)) catalogue.include([documentId]);
      l = access().level(account, documentId);
      levels.set(documentId, l);
    }
    return l;
  };
  // Edit or Read on every document of the catalogue: asked of each. With no catalogue stored yet (a new plant, before
  // a browser has written the definitions) nothing can be said of every document, so each line is asked of.
  let editsAll = boss;
  let readsAll = boss;
  if (!boss && catalogue.docs.length > 0) {
    editsAll = true;
    readsAll = true;
    for (const d of catalogue.docs) {
      const l = level(d.id);
      if (l !== "edit") editsAll = false;
      if (l === "none") readsAll = false;
    }
  }
  const scope = boss ? "*" : copyKey(catalogue.rules, account);
  const view: AccessView = {
    catalogue,
    account,
    boss,
    editsAll,
    readsAll,
    scope,
    level,
    may: (documentId, action) => atLeast(level(documentId), levelNeeded(action)),
    holds: (line) => {
      if (readsAll) return true;
      const id = isObj(line) ? line.documentId : undefined;
      if (typeof id !== "string" || !id) return true;
      return level(id) !== "none";
    },
    modules: () => {
      if (boss || readsAll) return null;
      // With no catalogue stored yet (a new plant), what the module's level and the account's departments say.
      const seen =
        catalogue.docs.length > 0
          ? access().modules(account).map((m) => m.module)
          : ACCESS_MODULES.filter((m) => access().moduleLevel(account, m) !== "none" || (account.departments ?? []).some((d) => d.trim().toUpperCase() === m));
      return seen.length >= ACCESS_MODULES.length ? null : seen;
    },
  };
  return view;
}

// ---------------------------------------------------------------------------
// the words of a refusal

/**
 * THE WORDS OF A REFUSAL, the website's and Mitra's own (frontend/src/engine/accessWords.ts refusalSentence): what the
 * person has on the document and the level the step needs — "F/QC/37 Inspection Record - Pouching Process is Read only
 * for you. Filling in a record needs Write access: ask the super admin for it." In English unless asked for Hindi or
 * Gujarati (the phone's X-Language).
 */
export function levelRefusal(what: string, have: AccessLevel, need: AccessLevel, action: DocumentAction, lang: AccessLanguage = "en"): string {
  return refusalSentence(lang, what.trim() || "This document", have, need, action);
}

/** The language a request asks its words in (X-Language: en, hi or gu), English otherwise. */
export function languageOf(header: unknown): AccessLanguage {
  return header === "hi" || header === "gu" ? header : "en";
}

/** The body of a 403 for an action the level does not allow. */
export interface LevelRefusalBody {
  error: string;
  code: "access-level";
  level: AccessLevel;
  needed: AccessLevel;
  action: DocumentAction;
  documentId: string;
  recordId?: string;
}

export function refusalBody(view: AccessView, documentId: string, action: DocumentAction, recordId?: string, lang: AccessLanguage = "en"): LevelRefusalBody {
  const have = view.level(documentId);
  const needed = levelNeeded(action);
  return {
    error: levelRefusal(view.catalogue.title(documentId), have, needed, action, lang),
    code: "access-level",
    level: have,
    needed,
    action,
    documentId,
    ...(recordId ? { recordId } : {}),
  };
}

/** Thrown inside a write's composition (db.ts writeItem) to refuse it: nothing is written. */
export class AccessRefused extends Error {
  readonly body: LevelRefusalBody;
  constructor(body: LevelRefusalBody) {
    super(body.error);
    this.name = "AccessRefused";
    this.body = body;
  }
}

// ---------------------------------------------------------------------------
// a record's change: what it needs, and whose act it is

const EDITABLE = new Set(["Scheduled", "Due", "In Progress"]);
const AWAITING = new Set(["Submitted", "Pending Verification"]);

interface RecordLike extends Obj {
  id: string;
  documentId: string;
  status?: unknown;
  correction?: unknown;
  prepared?: unknown;
  submittedAt?: unknown;
  submittedBy?: unknown;
  history?: unknown;
}

const isRecordLike = (v: unknown): v is RecordLike => isObj(v) && typeof v.id === "string" && typeof v.documentId === "string";

/** A record's history entries by id (an entry without one by its whole text). */
const historyById = (r: RecordLike): Map<string, unknown> => {
  const m = new Map<string, unknown>();
  if (Array.isArray(r.history)) for (const h of r.history) m.set(isObj(h) && text(h.id) ? text(h.id) : JSON.stringify(h), h);
  return m;
};

/** Whether a person wrote in the record's history: an entry added, or one changed (two edits within a quarter of an hour are folded into one, engine/recordHistory.ts). */
function historyWritten(was: RecordLike, now: RecordLike): boolean {
  const before = historyById(was);
  for (const [id, entry] of historyById(now)) if (!before.has(id) || !sameValue(before.get(id), entry)) return true;
  return false;
}
const historyActions = (r: RecordLike): string[] => (Array.isArray(r.history) ? r.history.map((h) => (isObj(h) ? text(h.action) : "")) : []);

/**
 * A SHEET NOBODY HAS WORKED ON: the calendar's blank sheet (Scheduled or Due), or one the assistant prepared that nobody
 * has saved since (In Progress, the prepared stamp, nothing in its history but "prepared"), never submitted and not
 * under correction.
 */
export function untouchedSheet(r: RecordLike): boolean {
  const status = text(r.status);
  if (r.correction || r.submittedAt || r.submittedBy) return false;
  if (status === "Scheduled" || status === "Due") return historyActions(r).every((a) => a === "prepared");
  if (status === "In Progress") return !!r.prepared && historyActions(r).every((a) => a === "prepared");
  return false;
}

/** Two values the same, whatever order their keys were written in. */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    if (a.length !== bb.length) return false;
    for (let i = 0; i < a.length; i++) if (!sameValue(a[i], bb[i])) return false;
    return true;
  }
  const ao = a as Obj;
  const bo = b as Obj;
  const ak = Object.keys(ao).filter((k) => ao[k] !== undefined);
  const bk = Object.keys(bo).filter((k) => bo[k] !== undefined);
  if (ak.length !== bk.length) return false;
  for (const k of ak) if (!Object.prototype.hasOwnProperty.call(bo, k) || !sameValue(ao[k], bo[k])) return false;
  return true;
}

/** What a change of one record needs, and whether it is a person's own act (true) or the app's housekeeping (false). */
export interface RecordChange {
  recordId: string;
  documentId: string;
  kind: "new" | "changed" | "removed";
  actions: DocumentAction[];
  personal: boolean;
}

/** The actions a move from one status to another is, as the record pages and the engine make it (engine/recordLifecycle.ts). */
function movesOf(stored: RecordLike, posted: RecordLike): DocumentAction[] {
  const s = text(stored.status);
  const p = text(posted.status);
  const out = new Set<DocumentAction>();
  // A correction cancelled: the record goes back as it was signed off (engine/recordLifecycle.ts cancelCorrection).
  const from = isObj(stored.correction) ? text(stored.correction.fromStatus) : "";
  if (stored.correction && !posted.correction && from && p === from) return ["correct"];
  // Reopened for correction, a record under correction, or its correction put back: Edit's alone.
  if (stored.correction || posted.correction) out.add("correct");
  if (EDITABLE.has(s)) {
    if (AWAITING.has(p)) out.add("submit");
    else if (p === "Verified") {
      out.add("submit");
      out.add("verify");
    } else if (p === "Rejected") {
      out.add("submit");
      out.add("send_back");
    } else if (EDITABLE.has(p)) out.add("fill");
    else out.add("correct");
  } else if (AWAITING.has(s)) {
    if (p === "Verified") out.add("verify");
    else if (p === "Rejected") out.add("send_back");
    else out.add("correct");
  } else if (s === "Rejected") {
    // Resumed after it was sent back, and filled in again: the filler's own work. Handed in again: submit.
    if (EDITABLE.has(p) && !posted.correction) out.add("fill");
    else if (AWAITING.has(p)) out.add("submit");
    else out.add("correct");
  } else {
    // Verified (or a status the app does not know): any change is a correction.
    out.add("correct");
  }
  // Correcting includes filling in: the one action says it.
  if (out.has("correct")) out.delete("fill");
  return [...out];
}

/** The actions a record's status says were done to it, for a record that arrives already past being filled in. */
function actionsOfStatus(posted: RecordLike): DocumentAction[] {
  const p = text(posted.status);
  if (AWAITING.has(p)) return ["submit"];
  if (p === "Verified") return ["submit", "verify"];
  if (p === "Rejected") return ["submit", "send_back"];
  return posted.correction ? ["correct"] : [];
}

/** What changed between the stored records and the posted ones (both the person's own lines), record by record. */
export function recordChanges(stored: readonly unknown[], posted: readonly unknown[]): RecordChange[] {
  const before = new Map<string, RecordLike>();
  for (const r of stored) if (isRecordLike(r)) before.set(r.id, r);
  const out: RecordChange[] = [];
  const seen = new Set<string>();
  for (const r of posted) {
    if (!isRecordLike(r) || seen.has(r.id)) continue;
    seen.add(r.id);
    const was = before.get(r.id);
    if (!was) {
      out.push(
        untouchedSheet(r)
          ? { recordId: r.id, documentId: r.documentId, kind: "new", actions: ["start"], personal: false }
          : { recordId: r.id, documentId: r.documentId, kind: "new", actions: ["start", ...actionsOfStatus(r)], personal: true }
      );
      continue;
    }
    if (sameValue(was, r)) continue;
    if (was.documentId !== r.documentId) {
      // Moved to another document: removed from the one, started in the other.
      out.push({ recordId: r.id, documentId: was.documentId, kind: "removed", actions: ["delete"], personal: true });
      out.push({ recordId: r.id, documentId: r.documentId, kind: "new", actions: ["start", ...actionsOfStatus(r)], personal: true });
      continue;
    }
    if (untouchedSheet(was) && untouchedSheet(r)) {
      out.push({ recordId: r.id, documentId: r.documentId, kind: "changed", actions: ["fill"], personal: false });
      continue;
    }
    out.push({ recordId: r.id, documentId: r.documentId, kind: "changed", actions: movesOf(was, r), personal: historyWritten(was, r) });
  }
  for (const [id, was] of before) {
    if (seen.has(id)) continue;
    out.push(
      untouchedSheet(was)
        ? { recordId: id, documentId: was.documentId, kind: "removed", actions: ["fill"], personal: false }
        : { recordId: id, documentId: was.documentId, kind: "removed", actions: ["delete"], personal: false }
    );
  }
  return out;
}

/** The first action of a change the view does not allow, or null. */
export function missingAction(view: AccessView, change: RecordChange): DocumentAction | null {
  for (const a of change.actions) if (!view.may(change.documentId, a)) return a;
  return null;
}

// ---------------------------------------------------------------------------
// the records item written: the person's lines laid over everyone else's, as the person's levels allow

export interface ComposedRecords {
  /** The whole records item to store. */
  value: string;
  /** Records whose change the person's level does not allow, left as stored (the app's housekeeping). */
  kept: string[];
}

/** Two ways of writing one person's name taken as the same: case and spacing aside. */
const sameName = (a: string, b: string): boolean => a.trim().replace(/\s+/g, " ").toLowerCase() === b.trim().replace(/\s+/g, " ").toLowerCase();

/** A history entry in this person's own name: the record is their own act, not the app's housekeeping. */
function carriesOwnEntry(r: unknown, by: string): boolean {
  return isRecordLike(r) && Array.isArray(r.history) && r.history.some((h) => isObj(h) && typeof h.by === "string" && sameName(h.by, by));
}

/**
 * THE RECORDS ITEM A PERSON WRITES, worked out from what is stored: their own lines (the documents they see) as they
 * posted them, each change checked against their level; everyone else's lines as stored. Throws AccessRefused for a
 * person's own act their level does not allow (nothing is written then). `by` is the person's name, as their history
 * entries carry it: a new record in their own name that their level may not start is their own act, refused in words.
 */
export function composeRecords(view: AccessView, storedValue: string | null, postedLines: readonly unknown[], by?: string): ComposedRecords {
  const storedParsed = parseJson(storedValue);
  const all: unknown[] = Array.isArray(storedParsed) ? storedParsed : [];
  // Every document a record names is placed before anybody's level is asked.
  const ids = new Set<string>();
  for (const r of all) if (isRecordLike(r)) ids.add(r.documentId);
  for (const r of postedLines) if (isRecordLike(r)) ids.add(r.documentId);
  view.catalogue.include(ids);

  const theirsStored = all.filter((l) => !view.holds(l));
  if (view.editsAll) return { value: JSON.stringify([...postedLines.filter((l) => view.holds(l)), ...theirsStored]), kept: [] };

  const storedMine = all.filter((l) => view.holds(l));
  // ONE LINE PER RECORD, AND ONLY RECORDS (the security review of 9-Oct-2026). Each record's first posted line is the
  // one checked and the one written: a second line with the same id used to be written unchecked beside it, and the
  // browsers keep the last line of an id, so a person could have changed a record their level does not allow. A line
  // taking the id of a record of a document the person does not see is never written beside that record; a line that
  // is not a record (no id, or no document) is written only as it is already stored.
  const theirIds = new Set<string>();
  for (const r of theirsStored) if (isRecordLike(r)) theirIds.add(r.id);
  const firstOfId = new Set<string>();
  const mine = postedLines.filter((l) => {
    if (!view.holds(l)) return false;
    if (!isRecordLike(l)) return storedMine.some((s) => sameValue(s, l));
    if (theirIds.has(l.id) || firstOfId.has(l.id)) return false;
    firstOfId.add(l.id);
    return true;
  });
  const postedById = new Map<string, unknown>();
  for (const l of mine) if (isRecordLike(l)) postedById.set(l.id, l);
  const changes = recordChanges(storedMine, mine);
  const keepStored = new Set<string>();
  const dropNew = new Set<string>();
  for (const c of changes) {
    const missing = missingAction(view, c);
    if (!missing) continue;
    if (c.kind === "new") {
      // A record the person started in their own name (their entry in its history) is their own act: refused in the
      // level's words, as the brief says of a Start (the people review of 9-Oct-2026). The app's housekeeping (a sheet
      // the calendar made, a paper the plant supplied that every browser adds) is left out without a word.
      if (by && carriesOwnEntry(postedById.get(c.recordId), by)) throw new AccessRefused(refusalBody(view, c.documentId, missing, c.recordId));
      dropNew.add(c.recordId);
      continue;
    }
    if (c.personal) throw new AccessRefused(refusalBody(view, c.documentId, missing, c.recordId));
    else keepStored.add(c.recordId);
  }
  if (keepStored.size === 0 && dropNew.size === 0) return { value: JSON.stringify([...mine, ...theirsStored]), kept: [] };

  const storedById = new Map<string, unknown>();
  for (const r of storedMine) if (isRecordLike(r)) storedById.set(r.id, r);
  const out: unknown[] = [];
  const placed = new Set<string>();
  for (const l of mine) {
    const id = isRecordLike(l) ? l.id : null;
    if (id && dropNew.has(id)) continue;
    if (id && keepStored.has(id)) {
      out.push(storedById.get(id));
      placed.add(id);
      continue;
    }
    out.push(l);
  }
  // A record the person's browser cleared that their level does not let them remove: kept as stored.
  for (const id of keepStored) if (!placed.has(id) && storedById.has(id)) out.push(storedById.get(id));
  return { value: JSON.stringify([...out, ...theirsStored]), kept: [...keepStored, ...dropNew] };
}

// ---------------------------------------------------------------------------
// the documents and the format edits: Edit's alone

/** The documents whose definition (the documents item: a list) or format edit (formatEdits: by id) differ. */
export function changedDocuments(key: "documents" | "formatEdits", storedValue: string | null, postedValue: string): string[] {
  const byId = (value: unknown): Map<string, unknown> => {
    const m = new Map<string, unknown>();
    if (key === "documents") {
      if (Array.isArray(value)) for (const d of value) if (isObj(d) && typeof d.id === "string") m.set(d.id, d);
    } else if (isObj(value)) for (const [id, edit] of Object.entries(value)) m.set(id, edit);
    return m;
  };
  const before = byId(parseJson(storedValue));
  const after = byId(parseJson(postedValue));
  const changed: string[] = [];
  for (const [id, v] of after) if (!before.has(id) || !sameValue(before.get(id), v)) changed.push(id);
  for (const id of before.keys()) if (!after.has(id)) changed.push(id);
  return changed;
}

/** Refuses a write of the format edits that changes a document the person has not Edit on: a person's own act (engine/formatOps.ts). */
export function checkFormatChange(view: AccessView, key: "documents" | "formatEdits", storedValue: string | null, postedValue: string): void {
  if (view.editsAll) return;
  const changed = changedDocuments(key, storedValue, postedValue);
  view.catalogue.include(changed);
  for (const id of changed) if (!view.may(id, "format")) throw new AccessRefused(refusalBody(view, id, "format"));
}

/**
 * THE DOCUMENT DEFINITIONS A PERSON'S BROWSER WRITES. Nobody edits a definition on a screen: the browser writes the
 * issued catalogue the app carries (data/repositories/documentRepository.ts ensureSeeded) on a new plant and after an
 * upgrade, and the format's printed words are the format edits (checkFormatChange, Edit's). So a definition new to the
 * server is taken from anybody — that is how the catalogue first reaches it — while a stored definition is changed or
 * removed only by somebody with Edit on its document, and otherwise left as stored, without a word.
 */
export function composeDefinitions(view: AccessView, storedValue: string | null, postedValue: string): { value: string; kept: string[] } {
  if (view.editsAll) return { value: postedValue, kept: [] };
  const stored = parseJson(storedValue);
  const posted = parseJson(postedValue);
  if (!Array.isArray(posted)) return { value: postedValue, kept: [] };
  const before = new Map<string, unknown>();
  if (Array.isArray(stored)) for (const d of stored) if (isObj(d) && typeof d.id === "string") before.set(d.id, d);
  view.catalogue.include([...before.keys()]);
  const kept: string[] = [];
  const out: unknown[] = [];
  const placed = new Set<string>();
  for (const d of posted) {
    const id = isObj(d) && typeof d.id === "string" ? d.id : null;
    if (!id) {
      out.push(d);
      continue;
    }
    placed.add(id);
    const was = before.get(id);
    if (was === undefined || sameValue(was, d) || view.may(id, "format")) out.push(d);
    else {
      out.push(was);
      kept.push(id);
    }
  }
  for (const [id, was] of before) {
    if (placed.has(id) || view.may(id, "format")) continue;
    out.push(was);
    kept.push(id);
  }
  return { value: kept.length ? JSON.stringify(out) : postedValue, kept };
}

// ---------------------------------------------------------------------------
// whom a late or missed record counts against

/**
 * WHO ANSWERS FOR A DOCUMENT (REQUIREMENTS §96): the people it names who may fill it (accessRules.ts responsible and
 * Write or more) — the ones told when it falls due, and whom a late or missed record counts against in the
 * escalation, the weekly digest and the scorecard. The website's own rule (engine/departmentScope.ts scoreAnswerRule):
 * an account the rules never name answers for its departments' documents, as before; the super admin, and an account
 * with no departments, for none.
 */
export function answerRule(catalogue: AccessCatalogue): (person: AccessAccount, documentId: string) => boolean {
  const access = catalogue.access;
  const described = new Set<string>([...DEFAULT_PEOPLE.map((p) => p.email), ...Object.keys(catalogue.rules.people)]);
  for (const d of catalogue.docs) for (const e of access.responsible(d.id)) described.add(e);
  return (person, documentId) => {
    if (person.role === "admin") return false;
    const email = person.email.trim().toLowerCase();
    if (described.has(email)) return access.responsible(documentId).includes(email) && access.may({ ...person, email }, documentId, "fill");
    const code = catalogue.byId.get(documentId)?.department ?? departmentOfDocument(documentId, undefined);
    const kept = (person.departments ?? []).map((c) => c.trim().toUpperCase()).filter(Boolean);
    return !!code && kept.includes(code);
  };
}

// ---------------------------------------------------------------------------
// the HR Master Data sheet

/** Human Resources' sheet is held by an account that sees Human Resources (as before, its own department). */
export function holdsHrMaster(view: AccessView): boolean {
  const modules = view.modules();
  return modules === null || modules.includes("HR");
}

/** And changed by one with Write on a Human Resources document. */
export function writesHrMaster(view: AccessView): boolean {
  if (view.editsAll) return true;
  // With no catalogue stored yet (a new plant, whose first browser writes HR Master Data's issued list): whoever holds it.
  if (view.catalogue.docs.length === 0) return holdsHrMaster(view);
  return view.catalogue.docs.some((d) => d.department === "HR" && view.may(d.id, "fill"));
}
