// THE DATABASE IS POSTGRESQL; THIS BROWSER HOLDS A WORKING COPY (REQUIREMENTS §55).
//
// Every repository reads and writes through storageAdapter.ts, synchronously,
// as it always has. What changed is where the data lives: in PostgreSQL on the
// server (backend/db.ts). This module keeps the browser's working copy and the
// database in step:
//
//   signing in   every stored item is loaded from the database into the
//                working copy before the app starts (startServerSync); a
//                change this browser made that never reached the database is
//                sent now, and data this browser kept from before the
//                database existed is merged in, never thrown away
//   a change     is written to the working copy at once (so the screen never
//                waits) and sent to the database a moment later, one request
//                per item
//   others' work every few seconds, and when the window comes back into
//                focus, the database is asked what has changed since, and the
//                working copy takes it — the screens redraw
//   two at once  a write made from an out-of-date copy is refused by the
//                database and comes back with what is stored now. The two are
//                merged against the copy both started from (the last one this
//                browser had in step with the database): what only one side
//                changed is kept; a line deleted on one side and untouched on
//                the other stays deleted; a line both changed keeps the newer
//                version. Nothing either person did is lost.
//
// The company's data is shared by everyone; a person's settings, assistant
// conversations and screen layout are their own (backend/index.ts,
// USER_SCOPED_KEYS). Only the assistant bubble's position on the screen stays
// in this browser alone.

export const NAMESPACE = "dcrs:v1:";
const MARKER_PREFIX = "dcrs:sync:";
/** The copy an unsent change was made from, kept over a page close so the next sign-in can merge against it. */
const BASE_PREFIX = "dcrs:base:";
/** Another person's changes that never reached the database, kept aside until they sign in here again. */
const HELD_PREFIX = "dcrs:held:";
export const SYNC_STATE_EVENT = "dcrs:sync-state";
/** Fired on window when the server says nobody is signed in any more (store/AuthContext.tsx signs out). */
export const SESSION_ENDED_EVENT = "dcrs:session-ended";
/** storageAdapter.ts's event for a write that did not fit (components/common/StorageFullBanner.tsx). */
const STORAGE_WRITE_FAILED = "dcrs:storage-write-failed";

/** The company's items. Mirrors backend/index.ts COMPANY_KEYS. */
const COMPANY_KEYS = ["records", "documents", "master", "hrMasterData", "referenceEdits", "formatEdits", "deletions", "live-start"];
/** A person's own. Mirrors backend/index.ts USER_SCOPED_KEYS. */
const USER_KEYS = new Set(["settings", "assistant-conversations", "sidebar-open-modules", "sidebar-visible"]);
/** Everything kept in the database. Anything else (the assistant bubble's position) stays in this browser. */
const SYNC_KEYS = new Set<string>([...COMPANY_KEYS, ...USER_KEYS]);
/** Never handed on to the next person who signs in on this browser. */
const PRIVATE_KEYS = new Set(["assistant-conversations"]);
/** Items whose lines belong to departments: the server keeps a department's account to its own (backend/index.ts). */
const LINE_KEYS = new Set(["records", "deletions"]);

const WRITE_DELAY_MS = 400;
const PULL_EVERY_MS = 5000;
const RETRY_MS = 4000;
const KEEPALIVE_MAX_CHARS = 60_000;

interface Marker {
  /** Whose copy: "company" or "user:<id>". */
  s: string;
  /** The database version this copy was last in step with (0: never stored). */
  v: number;
  /** A hash of the value as it was when last in step. */
  h: string;
  /** When it was last in step (ISO, this browser's clock). */
  t: string;
  /** A change was made that has not been confirmed stored. */
  p?: 1;
  /** The departments the copy was made for, as the server named them ("*": every department). */
  d?: string;
}

interface StoredItem {
  key: string;
  value: string;
  version: number;
  seq: number;
}

interface StorageResponse {
  items: StoredItem[];
  seq: number;
  versions?: Record<string, number>;
  denied?: string[];
  /** The departments this account's copy is made for now. */
  scope?: string;
}

interface Session {
  userId: string;
  seq: number;
  pollTimer: number | null;
  failing: boolean;
  /** Items this account's departments do not hold (backend/index.ts): never sent, never kept. */
  denied: Set<string>;
  /** The departments the account's copy is made for ("*": every department). */
  scope: string;
}

/** Why the working copy could not be loaded — main.tsx says it in words. */
export type SyncErrorKind = "unreachable" | "signed-out" | "no-room" | "storage-disabled";

export class SyncError extends Error {
  kind: SyncErrorKind;
  constructor(kind: SyncErrorKind, message: string) {
    super(message);
    this.name = "SyncError";
    this.kind = kind;
  }
}

class SignedOut extends Error {}

let session: Session | null = null;
let starting: { userId: string; promise: Promise<void> } | null = null;
const scheduled = new Map<string, number>();
const sending = new Map<string, Promise<void>>();
const listeners = new Set<(key: string | null) => void>();
/** The value of each item as the database last had it in step with this copy: what a merge works from. */
const bases = new Map<string, { v: number; value: string }>();

export const syncableKey = (key: string): boolean => SYNC_KEYS.has(key);

const iso = () => new Date().toISOString();

// ---------------------------------------------------------------------------
// the working copy

const raw = {
  get(name: string): string | null {
    try {
      return window.localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  set(name: string, value: string): boolean {
    try {
      window.localStorage.setItem(name, value);
      return true;
    } catch {
      return false;
    }
  },
  remove(name: string): void {
    try {
      window.localStorage.removeItem(name);
    } catch {
      /* noop */
    }
  },
  names(prefix: string): string[] {
    const out: string[] = [];
    try {
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith(prefix)) out.push(k);
      }
    } catch {
      /* none */
    }
    return out;
  },
};

const local = {
  get: (key: string) => raw.get(NAMESPACE + key),
  /** False when it did not fit: the caller must not treat the copy as stored. */
  set(key: string, value: string): boolean {
    if (raw.set(NAMESPACE + key, value)) return true;
    console.error("There is no room in this browser for the working copy of", key);
    try {
      window.dispatchEvent(new Event(STORAGE_WRITE_FAILED));
    } catch {
      /* no window */
    }
    return false;
  },
  remove: (key: string) => raw.remove(NAMESPACE + key),
  keys: () => raw.names(NAMESPACE).map((k) => k.slice(NAMESPACE.length)),
};

function storageUsable(): boolean {
  try {
    const ls = window.localStorage;
    if (!ls) return false;
    ls.getItem(MARKER_PREFIX + "records");
    return true;
  } catch {
    return false;
  }
}

function hash(value: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${value.length}:${(h >>> 0).toString(36)}`;
}

// A FINGERPRINT OF A STORED ITEM, kept in its marker, tells at the next
// sign-in whether the working copy was changed after it was last in step.
// Every change the app makes is also marked unsent the moment it is made
// (noteLocalWrite), so the fingerprint is only the second line; a large item
// (the records run to megabytes) is fingerprinted from its length and evenly
// spread samples — about a millisecond — instead of reading every character,
// which held a slow computer up for a noticeable moment on every sync. While
// the page is open, the copy kept in memory is compared instead.
const FINGERPRINT_FULL_MAX = 200_000;

function fingerprint(value: string): string {
  if (value.length <= FINGERPRINT_FULL_MAX) return hash(value);
  let h = 0x811c9dc5;
  const n = value.length;
  const take = (from: number, to: number) => {
    for (let i = from; i < to; i++) {
      h ^= value.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
  };
  take(0, 8192);
  for (let w = 1; w < 64; w++) {
    const start = Math.floor(((n - 1024) * w) / 64);
    take(start, start + 1024);
  }
  take(n - 8192, n);
  return `s${n}:${(h >>> 0).toString(36)}`;
}

/** Writes a marker carrying the fingerprint of `value`. */
function writeMarkerOf(key: string, marker: Omit<Marker, "h">, value: string): void {
  writeMarker(key, { ...marker, h: fingerprint(value) } as Marker);
}

/** Has the working copy been changed here since it was in step with the database? */
function changedSince(key: string, marker: Marker, current: string): boolean {
  const base = bases.get(key);
  if (base && base.v === marker.v) return current !== base.value;
  if (!marker.h) return true;
  return marker.h !== fingerprint(current);
}

function readMarker(key: string): Marker | null {
  try {
    const text = raw.get(MARKER_PREFIX + key);
    return text ? (JSON.parse(text) as Marker) : null;
  } catch {
    return null;
  }
}

function writeMarker(key: string, marker: Marker | null): void {
  if (marker) raw.set(MARKER_PREFIX + key, JSON.stringify(marker));
  else raw.remove(MARKER_PREFIX + key);
}

const scopeFor = (key: string, userId: string) => (USER_KEYS.has(key) ? `user:${userId}` : "company");

function notify(key: string | null): void {
  for (const listener of listeners) {
    try {
      listener(key);
    } catch (err) {
      console.error(err);
    }
  }
}

/** Called when the working copy was changed from the database (another person's work, a merge, a sign-in). */
export function onServerChange(listener: (key: string | null) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function announce(): void {
  const pending = scheduled.size + sending.size;
  try {
    window.dispatchEvent(new CustomEvent(SYNC_STATE_EVENT, { detail: { pending, failing: !!session?.failing } }));
  } catch {
    /* no window */
  }
}

export function syncState(): { pending: number; failing: boolean; active: boolean } {
  return { pending: scheduled.size + sending.size, failing: !!session?.failing, active: !!session };
}

function sessionEnded(): void {
  try {
    window.dispatchEvent(new Event(SESSION_ENDED_EVENT));
  } catch {
    /* no window */
  }
}

// ---------------------------------------------------------------------------
// the copy a merge works from

interface BaseView {
  value?: string;
  /** For the records: each record's hash, by id (the whole array is too large to keep twice). */
  ids?: Map<string, string>;
}

interface SavedBase {
  v: number;
  value?: string;
  ids?: Record<string, string>;
}

function rememberBase(key: string, v: number, value: string): void {
  bases.set(key, { v, value });
}

function baseFor(key: string, v: number): BaseView | null {
  if (v <= 0) return null;
  const inMemory = bases.get(key);
  if (inMemory && inMemory.v === v) return { value: inMemory.value };
  try {
    const saved = JSON.parse(raw.get(BASE_PREFIX + key) ?? "null") as SavedBase | null;
    if (saved && saved.v === v) return { value: saved.value, ids: saved.ids ? new Map(Object.entries(saved.ids)) : undefined };
  } catch {
    /* unreadable: merged without it */
  }
  return null;
}

const forgetSavedBase = (key: string) => raw.remove(BASE_PREFIX + key);

function entityHashes(value: string): Map<string, string> {
  const out = new Map<string, string>();
  try {
    const list = JSON.parse(value);
    if (Array.isArray(list)) for (const e of list) if (idOf(e) !== null) out.set(idOf(e)!, hash(JSON.stringify(e)));
  } catch {
    /* none */
  }
  return out;
}

/** Keeps, for every item with a change still on its way, the copy that change was made from. */
function saveBasesOfPending(): void {
  const s = session;
  if (!s) return;
  for (const key of SYNC_KEYS) {
    const marker = readMarker(key);
    const b = bases.get(key);
    if (!marker || !marker.p || marker.s !== scopeFor(key, s.userId) || !b || b.v !== marker.v) continue;
    const saved: SavedBase = key === "records" ? { v: b.v, ids: Object.fromEntries(entityHashes(b.value)) } : { v: b.v, value: b.value };
    raw.set(BASE_PREFIX + key, JSON.stringify(saved));
  }
}

// ---------------------------------------------------------------------------
// merging two copies of one item

type Prefer = "mine" | "theirs";
type Obj = Record<string, unknown>;

const isObject = (x: unknown): x is Obj => !!x && typeof x === "object" && !Array.isArray(x);
function idOf(x: unknown): string | null {
  if (!isObject(x)) return null;
  const id = x.id;
  return typeof id === "string" || typeof id === "number" ? String(id) : null;
}
const isIdArray = (x: unknown): x is Obj[] => Array.isArray(x) && x.every((e) => idOf(e) !== null);
const isPrimitive = (x: unknown) => x === null || ["string", "number", "boolean"].includes(typeof x);
const uniquePrimitives = (x: unknown): x is (string | number | boolean | null)[] =>
  Array.isArray(x) && x.every(isPrimitive) && new Set(x.map((e) => JSON.stringify(e))).size === x.length;
const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

/** Of two versions of one line both sides changed: the one changed last. */
function newer<T>(mine: T, theirs: T, prefer: Prefer): T {
  const m = isObject(mine) && typeof mine.updatedAt === "string" ? mine.updatedAt : "";
  const t = isObject(theirs) && typeof theirs.updatedAt === "string" ? theirs.updatedAt : "";
  if (m && t && m !== t) return m > t ? mine : theirs;
  return prefer === "mine" ? mine : theirs;
}

interface ByIdRules<T> {
  hasBase: boolean;
  inBase(id: string): boolean;
  /** Differs from the base (true when there is no base). */
  changedSinceBase(id: string, e: T): boolean;
  equal(a: T, b: T): boolean;
  both(id: string, mine: T, theirs: T): T;
  /** Without a base: known to be deleted. */
  gone(id: string): boolean;
}

function mergeById<T>(mine: T[], theirs: T[], rules: ByIdRules<T>): T[] {
  const theirById = new Map<string, T>();
  for (const t of theirs) theirById.set(idOf(t)!, t);
  const out: T[] = [];
  const done = new Set<string>();
  for (const m of mine) {
    const id = idOf(m)!;
    if (done.has(id)) continue;
    done.add(id);
    const t = theirById.get(id);
    if (t !== undefined) out.push(rules.equal(m, t) ? m : rules.both(id, m, t));
    // Only here: added here — or removed there, and kept only if changed here since.
    else if (rules.hasBase ? !rules.inBase(id) || rules.changedSinceBase(id, m) : !rules.gone(id)) out.push(m);
  }
  for (const t of theirs) {
    const id = idOf(t)!;
    if (done.has(id)) continue;
    done.add(id);
    // Only there: added there — or removed here, and kept only if changed there since.
    if (rules.hasBase ? !rules.inBase(id) || rules.changedSinceBase(id, t) : !rules.gone(id)) out.push(t);
  }
  return out;
}

/** A three-way merge of two JSON values against the copy both came from (`base`, when known). */
function merge3(base: unknown, mine: unknown, theirs: unknown, prefer: Prefer): unknown {
  if (same(mine, theirs)) return mine;
  if (base !== undefined) {
    if (same(mine, base)) return theirs;
    if (same(theirs, base)) return mine;
  }
  if (isObject(mine) && isObject(theirs)) {
    const b = isObject(base) ? base : undefined;
    const out: Obj = {};
    for (const k of new Set([...Object.keys(mine), ...Object.keys(theirs)])) {
      const inMine = Object.prototype.hasOwnProperty.call(mine, k);
      const inTheirs = Object.prototype.hasOwnProperty.call(theirs, k);
      const inBase = !!b && Object.prototype.hasOwnProperty.call(b, k);
      if (inMine && inTheirs) out[k] = merge3(inBase ? b![k] : undefined, mine[k], theirs[k], prefer);
      else if (inMine) {
        if (!(inBase && same(mine[k], b![k]))) out[k] = mine[k];
      } else if (!(inBase && same(theirs[k], b![k]))) out[k] = theirs[k];
    }
    return out;
  }
  if (isIdArray(mine) && isIdArray(theirs)) {
    const b = isIdArray(base) ? new Map(base.map((e) => [idOf(e)!, e] as const)) : null;
    return mergeById<Obj>(mine, theirs, {
      hasBase: !!b,
      inBase: (id) => !!b && b.has(id),
      changedSinceBase: (id, e) => !b || !b.has(id) || !same(e, b.get(id)),
      equal: same,
      both: (id, m, t) => (b && b.has(id) ? (merge3(b.get(id), m, t, prefer) as Obj) : newer(m, t, prefer)),
      gone: () => false,
    });
  }
  if (uniquePrimitives(mine) && uniquePrimitives(theirs)) {
    const k = (x: unknown) => JSON.stringify(x);
    const b = Array.isArray(base) ? new Set(base.map(k)) : null;
    const inMine = new Set(mine.map(k));
    const inTheirs = new Set(theirs.map(k));
    return [
      ...mine.filter((x) => !(b && b.has(k(x)) && !inTheirs.has(k(x)))),
      ...theirs.filter((x) => !inMine.has(k(x)) && !(b && b.has(k(x)))),
    ];
  }
  // One value both sides changed (or no common copy to tell): one side's stands.
  return base === undefined && prefer === "theirs" ? theirs : mine;
}

type Rec = Obj & { id: string | number };

/**
 * Two browsers opening a new month at the same moment each make the month's
 * blank records, under different ids; merged, they would be listed twice. A
 * blank record nobody has touched gives way to another for the same document
 * and date — to the one somebody worked on, or, between two blank ones, to the
 * same one in every browser.
 */
/** Last changed by the assistant's automatic preparation (engine/assistantPrepare.ts), not by a person. */
const preparedOnly = (r: Rec) => isObject(r.prepared) && typeof r.updatedAt === "string" && r.prepared.at === r.updatedAt;

/** Of two versions of a record both sides changed: a person's change over an automatic preparation, then the later. */
function laterRecord(mine: Rec, theirs: Rec, prefer: Prefer): Rec {
  if (preparedOnly(mine) !== preparedOnly(theirs)) return preparedOnly(mine) ? theirs : mine;
  return newer(mine, theirs, prefer);
}

function withoutDuplicateBlanks(records: Rec[]): Rec[] {
  const blank = (r: Rec) =>
    ((r.status === "Due" || r.status === "Scheduled") && typeof r.createdAt === "string" && r.createdAt === r.updatedAt) ||
    (r.status === "In Progress" && preparedOnly(r));
  const groups = new Map<string, Rec[]>();
  for (const r of records) {
    if (typeof r.periodKey !== "string" || typeof r.documentId !== "string") continue;
    const k = `${r.isDemo ? 1 : 0}|${r.documentId}|${r.periodKey}`;
    const list = groups.get(k);
    if (list) list.push(r);
    else groups.set(k, [r]);
  }
  const drop = new Set<Rec>();
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const blanks = list.filter(blank);
    if (blanks.length === 0) continue;
    if (blanks.length < list.length) blanks.forEach((r) => drop.add(r));
    else {
      const keep = blanks.reduce((a, c) => (String(a.id) <= String(c.id) ? a : c));
      blanks.forEach((r) => r !== keep && drop.add(r));
    }
  }
  return drop.size ? records.filter((r) => !drop.has(r)) : records;
}

function mergeRecords(base: BaseView | null, mine: Rec[], theirs: Rec[], prefer: Prefer): Rec[] {
  const ids = base ? (base.ids ?? (base.value !== undefined ? entityHashes(base.value) : null)) : null;
  const hashes = new Map<Rec, string>();
  const h = (e: Rec) => {
    let x = hashes.get(e);
    if (x === undefined) {
      x = hash(JSON.stringify(e));
      hashes.set(e, x);
    }
    return x;
  };
  // Without a common copy, a record is known deleted only from the deletions log.
  let gone: Set<string> | null = null;
  if (!ids) {
    try {
      gone = new Set((JSON.parse(local.get("deletions") ?? "[]") as { recordId?: string }[]).map((d) => String(d.recordId)));
    } catch {
      gone = new Set();
    }
  }
  const merged = mergeById<Rec>(mine, theirs, {
    hasBase: !!ids,
    inBase: (id) => !!ids && ids.has(id),
    changedSinceBase: (id, e) => !ids || ids.get(id) !== h(e),
    equal: (a, b) => h(a) === h(b),
    both: (id, m, t) => {
      if (!ids || !ids.has(id)) return laterRecord(m, t, prefer);
      if (ids.get(id) === h(m)) return t;
      if (ids.get(id) === h(t)) return m;
      return laterRecord(m, t, "mine");
    },
    gone: (id) => !!gone && gone.has(id),
  });
  return withoutDuplicateBlanks(merged);
}

/** Merges this browser's copy of an item with the database's. `prefer` decides a value both changed when there is no common copy. */
function merge(key: string, base: BaseView | null, mine: string, theirs: string, prefer: Prefer): string {
  let a: unknown;
  let b: unknown;
  try {
    a = JSON.parse(mine);
    b = JSON.parse(theirs);
  } catch {
    return prefer === "mine" ? mine : theirs;
  }
  let baseValue: unknown = undefined;
  if (base?.value !== undefined) {
    try {
      baseValue = JSON.parse(base.value);
    } catch {
      baseValue = undefined;
    }
  }
  let out: unknown;
  if (key === "records" && isIdArray(a) && isIdArray(b)) {
    out = mergeRecords(base, a as Rec[], b as Rec[], prefer);
  } else if (key === "live-start" && isObject(a) && isObject(b)) {
    // The date the system went live: the earliest either side knows of.
    const dates = [a.date, b.date].filter((d): d is string => typeof d === "string" && !!d).sort();
    out = { ...b, ...a, date: dates[0] ?? null };
  } else {
    out = merge3(baseValue, a, b, prefer);
    if (key === "hrMasterData" && isObject(out) && Array.isArray(out.people)) {
      // A line removed by anyone stays removed.
      const removed = new Set([...(Array.isArray(out.removedSeedIds) ? out.removedSeedIds : []), ...(Array.isArray(out.removedIds) ? out.removedIds : [])].map(String));
      out = { ...out, people: out.people.filter((p) => !removed.has(String(idOf(p)))) };
    }
    if (key === "deletions" && Array.isArray(out)) {
      out = [...out].sort((x, y) => String((y as Obj)?.deletedAt ?? "").localeCompare(String((x as Obj)?.deletedAt ?? "")));
    }
  }
  const text = JSON.stringify(out);
  if (text === mine) return mine;
  if (text === theirs) return theirs;
  return text;
}

// ---------------------------------------------------------------------------
// talking to the database

/** Every request says which account it works for: a tab left open after the browser signed in as someone else is refused. */
async function request(method: string, path: string, account: string, body?: BodyInit, headers: Record<string, string> = {}, keepalive = false): Promise<Response> {
  return fetch(`/api/storage${path}`, { method, body, headers: { ...headers, "X-Account": account }, credentials: "same-origin", keepalive });
}

/**
 * A large item goes to the server compressed (the records shrink about tenfold),
 * so a save over the office network is a fraction of the upload. Browsers
 * without CompressionStream send it as it is.
 */
async function packed(body: string): Promise<{ body: BodyInit; headers: Record<string, string> }> {
  if (body.length < 16_000 || typeof CompressionStream === "undefined") return { body, headers: {} };
  try {
    const stream = new Blob([body]).stream().pipeThrough(new CompressionStream("gzip"));
    return { body: await new Response(stream).arrayBuffer(), headers: { "Content-Encoding": "gzip" } };
  } catch {
    return { body, headers: {} };
  }
}

const sendHeaders = (key: string, base: number, copyScope: string): Record<string, string> => ({
  "Content-Type": "text/plain;charset=utf-8",
  "X-Base-Version": String(base),
  ...(LINE_KEYS.has(key) ? { "X-Scope": copyScope } : {}),
});

/** Sends one item; merges and sends again when the database has moved on. */
async function send(key: string): Promise<void> {
  const s = session;
  if (!s || !SYNC_KEYS.has(key) || s.denied.has(key)) return;
  const scope = scopeFor(key, s.userId);
  const initial = local.get(key);
  if (initial === null) return;
  let body: string = initial;
  const before = readMarker(key);
  const ours = before && before.s === scope ? before : null;
  let base = ours ? ours.v : 0;
  let baseView = baseFor(key, base);
  let copyScope = ours?.d ?? s.scope;
  if (!ours || !ours.p) writeMarker(key, { s: scope, v: base, h: ours ? ours.h : "", t: ours ? ours.t : "", p: 1, d: copyScope });
  for (let attempt = 0; attempt < 8; attempt++) {
    const upload = await packed(body);
    if (session !== s) return;
    const res = await request("PUT", `/${encodeURIComponent(key)}`, s.userId, upload.body, { ...sendHeaders(key, base, copyScope), ...upload.headers });
    if (session !== s) return;
    if (res.ok) {
      const { version } = (await res.json()) as { version: number };
      rememberBase(key, version, body);
      const now = local.get(key);
      writeMarkerOf(key, { s: scope, v: version, t: iso(), d: copyScope, ...(now === body ? {} : { p: 1 as const }) }, body);
      if (now === body) forgetSavedBase(key);
      else if (now !== null) schedule(key);
      return;
    }
    if (res.status === 401) {
      sessionEnded();
      throw new SignedOut(`Signed out; ${key} is sent at the next sign-in.`);
    }
    if (res.status === 403) {
      // Not this account's departments' to hold (backend/index.ts).
      s.denied.add(key);
      writeMarker(key, null);
      forgetSavedBase(key);
      return;
    }
    if (res.status === 400) {
      // A value the database will never take: not sent again; the database's copy replaces it when it next changes.
      console.error(`The database refused ${key} as unreadable.`);
      writeMarkerOf(key, { s: scope, v: base, t: iso(), d: copyScope }, body);
      return;
    }
    if (res.status === 409) {
      const { current, scope: scopeNow } = (await res.json()) as { current: StoredItem | null; scope?: string };
      if (session !== s) return;
      // Refused because the copy was made for other departments than the account has now: merged with what it sees now.
      if (typeof scopeNow === "string") copyScope = scopeNow;
      if (!current) {
        // It was stored, and the database no longer has it: the database was reset.
        if (base > 0) {
          databaseWasReset();
          return;
        }
        continue;
      }
      // Merged with the working copy as it is now — a save made while this request was out included.
      const mine: string = local.get(key) ?? body;
      const merged = merge(key, baseView, mine, current.value, "mine");
      if (merged !== mine) {
        if (!local.set(key, merged)) throw new Error(`There is no room in this browser for the merged ${key}; it is sent again shortly.`);
        notify(key);
      }
      rememberBase(key, current.version, current.value);
      body = merged;
      base = current.version;
      baseView = { value: current.value };
      if (merged === current.value) {
        writeMarkerOf(key, { s: scope, v: current.version, t: iso(), d: copyScope }, current.value);
        forgetSavedBase(key);
        return;
      }
      writeMarkerOf(key, { s: scope, v: current.version, t: iso(), p: 1, d: copyScope }, current.value);
      continue;
    }
    throw new Error(`The database refused ${key} (${res.status}).`);
  }
  throw new Error(`${key} kept changing in the database; it is sent again shortly.`);
}

function schedule(key: string, delay = WRITE_DELAY_MS): void {
  const s = session;
  if (!s || !SYNC_KEYS.has(key) || s.denied.has(key)) return;
  const existing = scheduled.get(key);
  if (existing !== undefined) window.clearTimeout(existing);
  scheduled.set(
    key,
    window.setTimeout(() => {
      scheduled.delete(key);
      if (session !== s) return;
      const running = sending.get(key);
      if (running) {
        void running.finally(() => schedule(key, 0));
        return;
      }
      const task = send(key)
        .then(() => {
          if (session === s && s.failing && scheduled.size === 0) s.failing = false;
        })
        .catch((err) => {
          if (err instanceof SignedOut) return;
          console.error(err);
          if (session !== s) return;
          s.failing = true;
          schedule(key, RETRY_MS);
        })
        .finally(() => {
          sending.delete(key);
          announce();
        });
      sending.set(key, task);
      announce();
    }, delay)
  );
  announce();
}

/** storageAdapter.ts: an item of the working copy was written. */
export function noteLocalWrite(key: string): void {
  const s = session;
  if (!s || !SYNC_KEYS.has(key) || s.denied.has(key)) return;
  const scope = scopeFor(key, s.userId);
  const marker = readMarker(key);
  // Marked unsent now, so a page closed before the send leaves this copy to go at the next sign-in.
  if (!marker) writeMarker(key, { s: scope, v: 0, h: "", t: "", p: 1, d: s.scope });
  else if (marker.s === scope && !marker.p) writeMarker(key, { ...marker, p: 1 });
  schedule(key);
}

/** storageAdapter.ts: an item of the working copy was removed. */
export function noteLocalRemove(key: string): void {
  if (!session || !SYNC_KEYS.has(key)) return;
  writeMarker(key, null);
  void request("DELETE", `/${encodeURIComponent(key)}`, session.userId).catch((err) => console.error(err));
}

function clearTimers(s: Session): void {
  for (const id of scheduled.values()) window.clearTimeout(id);
  scheduled.clear();
  if (s.pollTimer !== null) window.clearTimeout(s.pollTimer);
  s.pollTimer = null;
}

/**
 * The database no longer holds what this browser had in step with it — it was
 * emptied or restored from a backup. Nothing of the old copy may be written
 * back over it: the working copy is dropped and the app loads again from the
 * database as it now is.
 */
function databaseWasReset(): void {
  const s = session;
  if (!s) return;
  console.warn("The database was reset or restored; loading the app again from it.");
  clearTimers(s);
  window.removeEventListener("focus", onFocus);
  window.removeEventListener("pagehide", onPageHide);
  session = null;
  starting = null;
  bases.clear();
  for (const key of local.keys()) if (SYNC_KEYS.has(key)) local.remove(key);
  for (const name of [...raw.names(MARKER_PREFIX), ...raw.names(BASE_PREFIX), ...raw.names(HELD_PREFIX)]) raw.remove(name);
  try {
    window.location.reload();
  } catch {
    /* no window */
  }
}

async function pull(): Promise<void> {
  const s = session;
  if (!s) return;
  // What this copy was in step with before asking: the database can only have moved on from there.
  const known = new Map<string, number>();
  for (const key of SYNC_KEYS) {
    const m = readMarker(key);
    if (m && m.v > 0 && m.s === scopeFor(key, s.userId)) known.set(key, m.v);
  }
  const res = await request("GET", `?since=${s.seq}`, s.userId);
  if (session !== s) return;
  if (res.status === 401) {
    sessionEnded();
    return;
  }
  if (!res.ok) return;
  const { items, seq, versions, denied, scope } = (await res.json()) as StorageResponse;
  if (session !== s) return;

  // The administrator changed this account's departments: the app loads again for them. What is
  // unsent stays marked with the departments it was made for, and is merged on the way.
  if (typeof scope === "string" && scope !== s.scope) {
    console.warn("This account's departments changed; loading the app again.");
    saveBasesOfPending();
    try {
      window.location.reload();
    } catch {
      /* no window */
    }
    return;
  }

  const deniedNow = new Set(denied ?? []);
  for (const key of deniedNow) {
    const m = readMarker(key);
    if (s.denied.has(key) || (m && m.p)) continue; // an unsent change is left for someone who may send it
    const timer = scheduled.get(key);
    if (timer !== undefined) window.clearTimeout(timer);
    scheduled.delete(key);
    local.remove(key);
    writeMarker(key, null);
    forgetSavedBase(key);
    bases.delete(key);
    notify(key);
  }
  s.denied = deniedNow;

  if (versions) {
    for (const [key, v] of known) {
      if (s.denied.has(key)) continue;
      const stored = versions[key];
      if (stored === undefined || stored < v) {
        databaseWasReset();
        return;
      }
    }
  }

  let cursor = Math.max(s.seq, seq);
  for (const item of items) {
    const key = item.key;
    if (!SYNC_KEYS.has(key) || s.denied.has(key) || scheduled.has(key) || sending.has(key)) continue;
    const scope = scopeFor(key, s.userId);
    const marker = readMarker(key);
    const current = local.get(key);
    if (marker && marker.s === scope && marker.v >= item.version) {
      // Brought in step by another tab of this browser: what the database holds is still the copy a merge here starts from.
      if (marker.v === item.version && bases.get(key)?.v !== item.version) rememberBase(key, item.version, item.value);
      continue;
    }
    // A change made here that has not gone yet: it goes, and merges, first.
    if (current !== null && marker && marker.s === scope && (marker.p || changedSince(key, marker, current))) {
      schedule(key);
      continue;
    }
    if (current !== item.value && !local.set(key, item.value)) {
      // No room for it: the copy stays as it was, marked as the older version, and is asked for again.
      cursor = Math.min(cursor, Math.max(s.seq, item.seq - 1));
      continue;
    }
    rememberBase(key, item.version, item.value);
    writeMarkerOf(key, { s: scope, v: item.version, t: iso(), d: s.scope }, item.value);
    forgetSavedBase(key);
    if (current !== item.value) notify(key);
  }
  s.seq = cursor;
}

function poll(): void {
  const s = session;
  if (!s) return;
  void pull()
    .catch(() => undefined)
    .finally(() => {
      if (session === s) s.pollTimer = window.setTimeout(poll, PULL_EVERY_MS);
    });
}

const onFocus = () => void pull().catch(() => undefined);

// Closing the page: what is still waiting goes now, if it is small enough to
// go with the page; and for everything not yet confirmed, the copy it was made
// from is kept, so the next sign-in merges it properly.
const onPageHide = () => {
  const s = session;
  if (!s) return;
  for (const key of scheduled.keys()) {
    const body = local.get(key);
    const marker = readMarker(key);
    if (body === null || body.length > KEEPALIVE_MAX_CHARS || s.denied.has(key)) continue;
    const ours = marker && marker.s === scopeFor(key, s.userId) ? marker : null;
    void request("PUT", `/${encodeURIComponent(key)}`, s.userId, body, sendHeaders(key, ours ? ours.v : 0, ours?.d ?? s.scope), true).catch(() => undefined);
  }
  saveBasesOfPending();
};

/**
 * A person's own items that another person left unsent on this browser are
 * kept aside for them — neither sent as the new person's, nor overwritten, nor
 * deleted — and what was kept aside for the person signing in now is given
 * back, to be sent.
 */
function sortOutPersonalItems(userId: string): void {
  const myScope = `user:${userId}`;
  for (const key of USER_KEYS) {
    const mine = local.get(key);
    const m = readMarker(key);
    if (mine === null || !m || m.s === myScope || !m.s.startsWith("user:") || !(m.p || m.h !== fingerprint(mine))) continue;
    const saved = raw.get(BASE_PREFIX + key);
    if (raw.set(`${HELD_PREFIX}${m.s}:${key}`, JSON.stringify({ value: mine, marker: m, base: saved }))) {
      local.remove(key);
      writeMarker(key, null);
      forgetSavedBase(key);
    }
  }
  for (const key of USER_KEYS) {
    const name = `${HELD_PREFIX}${myScope}:${key}`;
    const text = raw.get(name);
    if (!text) continue;
    try {
      const held = JSON.parse(text) as { value: string; marker: Marker; base?: string | null };
      const current = readMarker(key);
      if (!(current && current.s === myScope && current.p) && local.set(key, held.value)) {
        writeMarker(key, { ...held.marker, p: 1 });
        if (held.base) raw.set(BASE_PREFIX + key, held.base);
        else forgetSavedBase(key);
      }
    } catch {
      /* unreadable: dropped */
    }
    raw.remove(name);
  }
}

/**
 * Loads the database into this browser's working copy for the person signed
 * in, sends what this browser holds that never reached the database, and keeps
 * the two in step from then on.
 */
export function startServerSync(userId: string): Promise<void> {
  if (starting && starting.userId === userId) return starting.promise;
  const promise = (async () => {
    await endSession(false);
    if (!storageUsable()) {
      throw new SyncError("storage-disabled", "This browser does not let the app keep its working copy (site data is blocked), so nothing could be saved to the database.");
    }
    const loadStartedAt = iso();
    let res: Response;
    try {
      res = await request("GET", "", userId);
    } catch (err) {
      throw new SyncError("unreachable", `The database could not be reached (${err instanceof Error ? err.message : String(err)}).`);
    }
    if (res.status === 401) {
      sessionEnded();
      throw new SyncError("signed-out", "Not signed in.");
    }
    if (!res.ok) throw new SyncError("unreachable", `The database could not be reached (${res.status}).`);
    const { items, seq, denied, scope: copyScope } = (await res.json()) as StorageResponse;
    const s: Session = { userId, seq, pollTimer: null, failing: false, denied: new Set(denied ?? []), scope: copyScope ?? "*" };
    session = s;
    bases.clear();
    sortOutPersonalItems(userId);

    const stored = new Map(items.map((i) => [i.key, i]));
    // The deletions log first: a records merge without a common copy reads it.
    const keys = Array.from(new Set([...stored.keys(), ...local.keys()]))
      .filter((k) => SYNC_KEYS.has(k))
      .sort((a, b) => (a === "deletions" ? -1 : b === "deletions" ? 1 : 0));
    const sends: string[] = [];
    const adopt = (key: string, item: StoredItem) => {
      if (local.get(key) !== item.value && !local.set(key, item.value)) {
        throw new SyncError("no-room", `There is no room in this browser for the company's ${key}.`);
      }
      rememberBase(key, item.version, item.value);
      writeMarkerOf(key, { s: scopeFor(key, userId), v: item.version, t: iso(), d: s.scope }, item.value);
      forgetSavedBase(key);
    };
    try {
      for (const key of keys) {
        const scope = scopeFor(key, userId);
        const item = stored.get(key);
        const mine = local.get(key);
        const marker = readMarker(key);
        const ours = marker && marker.s === scope ? marker : null;
        const pending = mine !== null && !!ours && (!!ours.p || changedSince(key, ours, mine));
        if (s.denied.has(key)) {
          // Not this account's to hold. An unsent change (someone else's, from this browser) is left as it is,
          // for the next person who may send it; anything else is dropped.
          if (pending) continue;
          local.remove(key);
          writeMarker(key, null);
          forgetSavedBase(key);
          continue;
        }
        // Another tab of this browser brought this copy in step while the load was on its way: it is the newer.
        if (mine !== null && ours && !pending && ours.t >= loadStartedAt && (!item || ours.v >= item.version)) {
          if (item && ours.v === item.version) rememberBase(key, item.version, item.value);
          continue;
        }
        if (item) {
          if (pending && ours!.v > item.version) {
            // Brought further by another tab while this load was on its way: that tab sends it.
            if (ours!.t >= loadStartedAt) continue;
            adopt(key, item); // the database went back (reset or restored): its copy stands
          } else if (pending) sends.push(key);
          else if (mine !== null && !marker && mine !== item.value) {
            // Kept in this browser from before the database: merged in, never thrown away.
            const merged = merge(key, null, mine, item.value, "theirs");
            if (merged === item.value) adopt(key, item);
            else {
              if (!local.set(key, merged)) throw new SyncError("no-room", `There is no room in this browser for the company's ${key}.`);
              rememberBase(key, item.version, item.value);
              writeMarkerOf(key, { s: scope, v: item.version, t: iso(), p: 1, d: s.scope }, item.value);
              sends.push(key);
            }
          } else adopt(key, item);
        } else if (mine !== null) {
          if (ours && !pending) {
            // In step before, and no longer in the database: removed there.
            local.remove(key);
            writeMarker(key, null);
          } else if (ours && ours.v > 0) {
            // Stored once, changed here since, and gone from the database: it was reset.
            local.remove(key);
            writeMarker(key, null);
            forgetSavedBase(key);
          } else if (!ours && marker && PRIVATE_KEYS.has(key)) {
            // Another person's conversations: not handed on.
            local.remove(key);
            writeMarker(key, null);
          } else sends.push(key);
        }
      }
    } catch (err) {
      await endSession(false);
      throw err;
    }
    await Promise.all(
      sends.map((key) =>
        send(key).catch((err) => {
          if (err instanceof SignedOut) return;
          console.error(err);
          if (session !== s) return;
          s.failing = true;
          schedule(key, RETRY_MS);
        })
      )
    );
    if (session !== s) throw new SyncError("signed-out", "Signed out while loading.");
    // The working copy was replaced: every copy held in memory (the records repository's) is dropped.
    notify(null);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pagehide", onPageHide);
    s.pollTimer = window.setTimeout(poll, PULL_EVERY_MS);
    announce();
  })();
  starting = { userId, promise };
  promise.catch(() => {
    if (starting?.promise === promise) starting = null;
  });
  return promise;
}

/** Signing out: what is waiting is sent, and the working copy stops following the database. */
export function stopServerSync(): Promise<void> {
  return endSession(true);
}

/** `forgetStart` false: called by a sign-in that is under way, which must stay the one under way. */
async function endSession(forgetStart: boolean): Promise<void> {
  const s = session;
  if (!s) {
    if (forgetStart) starting = null;
    return;
  }
  const waiting = Array.from(scheduled.keys());
  clearTimers(s);
  window.removeEventListener("focus", onFocus);
  window.removeEventListener("pagehide", onPageHide);
  await Promise.allSettled([...sending.values(), ...waiting.map((key) => send(key))]);
  if (session === s) {
    saveBasesOfPending();
    clearTimers(s);
    session = null;
    if (forgetStart) starting = null;
  }
  bases.clear();
  // Nothing held in memory from this session may be written into the next one.
  notify(null);
  announce();
}
