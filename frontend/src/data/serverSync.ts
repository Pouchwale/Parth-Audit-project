// THE DATABASE IS POSTGRESQL; THIS BROWSER HOLDS A WORKING COPY (REQUIREMENTS §55).
//
// Every repository reads and writes through storageAdapter.ts, synchronously,
// as it always has. What changed is where the data lives: in PostgreSQL on the
// server (backend/db.ts). This module keeps the browser's working copy and the
// database in step:
//
//   signing in   every stored item is loaded from the database into the
//                working copy before the app starts (startServerSync), and
//                anything this browser changed that never reached the
//                database — a save still on its way when the page was closed
//                — is sent now
//   a change     is written to the working copy at once (so the screen never
//                waits) and sent to the database a moment later, one request
//                per item
//   others' work every few seconds, and when the window comes back into
//                focus, the database is asked what has changed since, and the
//                working copy takes it — the screens redraw
//   two at once  a write made from an out-of-date copy is refused by the
//                database and comes back with what is stored now; the records,
//                the HR Master Data sheet and the deletions log are merged
//                line by line (the newer version of each line wins, a line
//                deleted here stays deleted), and the merged item is written
//
// The company's data is shared by everyone; a person's settings, assistant
// conversations and screen layout are their own (backend/index.ts,
// USER_SCOPED_KEYS). Only the assistant bubble's position on the screen stays
// in this browser alone.

export const NAMESPACE = "dcrs:v1:";
const MARKER_PREFIX = "dcrs:sync:";
export const SYNC_STATE_EVENT = "dcrs:sync-state";

/** Kept in this browser only: where the assistant bubble was dragged to. */
const LOCAL_ONLY = new Set(["assistant-widget-pos"]);
/** A person's own; everything else is the company's. Mirrors backend/index.ts. */
const USER_KEYS = new Set(["settings", "assistant-conversations", "sidebar-open-modules", "sidebar-visible"]);
/** Never handed on to the next person who signs in on this browser. */
const PRIVATE_KEYS = new Set(["assistant-conversations"]);

const WRITE_DELAY_MS = 400;
const PULL_EVERY_MS = 5000;
const RETRY_MS = 4000;

interface Marker {
  /** Whose copy: "company" or "user:<id>". */
  s: string;
  /** The database version this copy was last in step with (0: never stored). */
  v: number;
  /** A hash of the value as last sent or received. */
  h: string;
  /** When it was last in step (ISO). */
  t: string;
  /** A send was started and has not been confirmed. */
  p?: 1;
}

interface StoredItem {
  key: string;
  value: string;
  version: number;
  seq: number;
}

interface Session {
  userId: string;
  seq: number;
  pollTimer: number | null;
  failing: boolean;
}

let session: Session | null = null;
let starting: { userId: string; promise: Promise<void> } | null = null;
const scheduled = new Map<string, number>();
const sending = new Map<string, Promise<void>>();
const listeners = new Set<(key: string | null) => void>();

export const syncableKey = (key: string): boolean => !LOCAL_ONLY.has(key);

// ---------------------------------------------------------------------------
// the working copy

const local = {
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(NAMESPACE + key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      window.localStorage.setItem(NAMESPACE + key, value);
    } catch (err) {
      console.error("Could not keep the working copy of", key, err);
    }
  },
  remove(key: string): void {
    try {
      window.localStorage.removeItem(NAMESPACE + key);
    } catch {
      /* noop */
    }
  },
  keys(): string[] {
    const out: string[] = [];
    try {
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith(NAMESPACE)) out.push(k.slice(NAMESPACE.length));
      }
    } catch {
      /* none */
    }
    return out;
  },
};

function hash(value: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${value.length}:${(h >>> 0).toString(36)}`;
}

function readMarker(key: string): Marker | null {
  try {
    const raw = window.localStorage.getItem(MARKER_PREFIX + key);
    return raw ? (JSON.parse(raw) as Marker) : null;
  } catch {
    return null;
  }
}

function writeMarker(key: string, marker: Marker | null): void {
  try {
    if (marker) window.localStorage.setItem(MARKER_PREFIX + key, JSON.stringify(marker));
    else window.localStorage.removeItem(MARKER_PREFIX + key);
  } catch {
    /* the next sign-in sends it again */
  }
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

/** Called when the database brings in a change from someone else (or a merge). */
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

// ---------------------------------------------------------------------------
// merging two copies of one item

interface Entity {
  id?: string;
  updatedAt?: string;
}

function mergeEntities<T extends Entity>(mine: T[], theirs: T[], syncedAt: string, deleted: (e: T) => boolean): T[] {
  const byId = new Map<string, T>();
  const order: string[] = [];
  const mineIds = new Set(mine.map((e) => String(e.id)));
  for (const e of mine) {
    const id = String(e.id);
    if (!byId.has(id)) order.push(id);
    byId.set(id, e);
  }
  for (const e of theirs) {
    const id = String(e.id);
    const ours = byId.get(id);
    if (ours) {
      if ((e.updatedAt ?? "") > (ours.updatedAt ?? "")) byId.set(id, e);
      continue;
    }
    // Only on the database: added or changed by someone since this copy was in
    // step — or deleted here, if it is older than that.
    if (mineIds.has(id) || deleted(e)) continue;
    if ((e.updatedAt ?? "") <= syncedAt) continue;
    order.push(id);
    byId.set(id, e);
  }
  return order.map((id) => byId.get(id) as T);
}

function merge(key: string, mine: string, theirs: string, syncedAt: string): string {
  try {
    const a = JSON.parse(mine);
    const b = JSON.parse(theirs);
    if (key === "records" && Array.isArray(a) && Array.isArray(b)) {
      const deletions = JSON.parse(local.get("deletions") ?? "[]") as { recordId?: string }[];
      const gone = new Set(deletions.map((d) => d.recordId));
      return JSON.stringify(mergeEntities(a, b, syncedAt, (e) => gone.has(String(e.id))));
    }
    if (key === "deletions" && Array.isArray(a) && Array.isArray(b)) {
      const seen = new Set(a.map((e: Entity) => String(e.id)));
      return JSON.stringify([...a, ...b.filter((e: Entity) => !seen.has(String(e.id)))].sort((x, y) => String(y.deletedAt ?? "").localeCompare(String(x.deletedAt ?? ""))));
    }
    if (key === "hrMasterData" && a && b && Array.isArray(a.people) && Array.isArray(b.people)) {
      const removed = new Set<string>([...(a.removedSeedIds ?? []), ...(b.removedSeedIds ?? []), ...(a.removedIds ?? []), ...(b.removedIds ?? [])]);
      return JSON.stringify({
        ...b,
        ...a,
        people: mergeEntities(a.people, b.people, syncedAt, (e) => removed.has(String(e.id))).filter((p) => !removed.has(String(p.id))),
        removedSeedIds: Array.from(new Set([...(a.removedSeedIds ?? []), ...(b.removedSeedIds ?? [])])),
        removedIds: Array.from(new Set([...(a.removedIds ?? []), ...(b.removedIds ?? [])])),
      });
    }
  } catch {
    /* not JSON: this copy wins */
  }
  return mine;
}

// ---------------------------------------------------------------------------
// talking to the database

async function request(method: string, path: string, body?: string, headers: Record<string, string> = {}, keepalive = false): Promise<Response> {
  return fetch(`/api/storage${path}`, { method, body, headers, credentials: "same-origin", keepalive });
}

/** Sends one item; merges and sends again when the database has moved on. */
async function send(key: string): Promise<void> {
  const s = session;
  if (!s) return;
  const scope = scopeFor(key, s.userId);
  let body = local.get(key);
  if (body === null) return;
  const before = readMarker(key);
  let base = before && before.s === scope ? before.v : 0;
  const syncedAt = before && before.s === scope ? before.t : "";
  writeMarker(key, { s: scope, v: base, h: before?.s === scope ? before.h : "", t: syncedAt, p: 1 });
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await request("PUT", `/${encodeURIComponent(key)}`, body, { "Content-Type": "text/plain;charset=utf-8", "X-Base-Version": String(base) });
    if (res.ok) {
      const { version } = (await res.json()) as { version: number };
      const now = local.get(key);
      writeMarker(key, { s: scope, v: version, h: hash(body), t: new Date().toISOString(), ...(now === body ? {} : { p: 1 as const }) });
      if (now !== body && now !== null) schedule(key);
      return;
    }
    if (res.status === 409) {
      const { current } = (await res.json()) as { current: StoredItem | null };
      if (!current) {
        base = 0;
        continue;
      }
      const merged = merge(key, body, current.value, syncedAt);
      base = current.version;
      if (merged !== body) {
        body = merged;
        local.set(key, merged);
        notify(key);
      }
      continue;
    }
    throw new Error(`The database refused ${key} (${res.status}).`);
  }
  throw new Error(`${key} kept changing in the database; will try again.`);
}

function schedule(key: string, delay = WRITE_DELAY_MS): void {
  if (!session || !syncableKey(key)) return;
  const existing = scheduled.get(key);
  if (existing !== undefined) window.clearTimeout(existing);
  scheduled.set(
    key,
    window.setTimeout(() => {
      scheduled.delete(key);
      const running = sending.get(key);
      if (running) {
        void running.finally(() => schedule(key, 0));
        return;
      }
      const task = send(key)
        .then(() => {
          if (session && session.failing && scheduled.size === 0) session.failing = false;
        })
        .catch((err) => {
          console.error(err);
          if (session) session.failing = true;
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
  if (!session || !syncableKey(key)) return;
  const marker = readMarker(key);
  const scope = scopeFor(key, session.userId);
  // Marked unsent now, so a page closed before the send leaves this copy to win at the next sign-in.
  if (marker && marker.s === scope && !marker.p) writeMarker(key, { ...marker, p: 1 });
  schedule(key);
}

/** storageAdapter.ts: an item of the working copy was removed. */
export function noteLocalRemove(key: string): void {
  if (!session || !syncableKey(key)) return;
  writeMarker(key, null);
  void request("DELETE", `/${encodeURIComponent(key)}`).catch((err) => console.error(err));
}

async function pull(): Promise<void> {
  const s = session;
  if (!s) return;
  const res = await request("GET", `?since=${s.seq}`);
  if (!res.ok || session !== s) return;
  const { items, seq } = (await res.json()) as { items: StoredItem[]; seq: number };
  for (const item of items) {
    if (!syncableKey(item.key) || scheduled.has(item.key) || sending.has(item.key)) continue;
    const scope = scopeFor(item.key, s.userId);
    const marker = readMarker(item.key);
    const current = local.get(item.key);
    if (marker && marker.s === scope && marker.v >= item.version) continue;
    // A change made here that has not gone yet: it goes, and merges, first.
    if (current !== null && marker && marker.s === scope && (marker.p || marker.h !== hash(current))) {
      schedule(item.key);
      continue;
    }
    if (current !== item.value) local.set(item.key, item.value);
    writeMarker(item.key, { s: scope, v: item.version, h: hash(item.value), t: new Date().toISOString() });
    if (current !== item.value) notify(item.key);
  }
  s.seq = Math.max(s.seq, seq);
}

function poll(): void {
  if (!session) return;
  void pull()
    .catch(() => undefined)
    .finally(() => {
      if (session) session.pollTimer = window.setTimeout(poll, PULL_EVERY_MS);
    });
}

const onFocus = () => void pull().catch(() => undefined);

// Closing the page: what is still waiting goes now, if it is small enough to
// go with the page; anything larger goes at the next sign-in (its marker says
// it was never confirmed).
const onPageHide = () => {
  if (!session) return;
  for (const key of scheduled.keys()) {
    const body = local.get(key);
    const marker = readMarker(key);
    if (body === null || body.length > 60_000) continue;
    void request("PUT", `/${encodeURIComponent(key)}`, body, { "Content-Type": "text/plain;charset=utf-8", "X-Base-Version": String(marker?.v ?? 0) }, true).catch(() => undefined);
  }
};

/**
 * Loads the database into this browser's working copy for the person signed
 * in, sends what this browser holds that never reached the database, and keeps
 * the two in step from then on.
 */
export function startServerSync(userId: string): Promise<void> {
  if (starting && starting.userId === userId) return starting.promise;
  const promise = (async () => {
    await stopServerSync();
    const res = await request("GET", "");
    if (!res.ok) throw new Error(`The database could not be reached (${res.status}).`);
    const { items, seq } = (await res.json()) as { items: StoredItem[]; seq: number };
    session = { userId, seq, pollTimer: null, failing: false };
    const stored = new Map(items.map((i) => [i.key, i]));
    const keys = new Set([...stored.keys(), ...local.keys()].filter(syncableKey));
    const sends: Promise<void>[] = [];
    for (const key of keys) {
      const scope = scopeFor(key, userId);
      const item = stored.get(key);
      const mine = local.get(key);
      const marker = readMarker(key);
      const sameScope = marker?.s === scope;
      const unsent = mine !== null && sameScope && (!!marker?.p || marker?.h !== hash(mine));
      if (item) {
        if (unsent) sends.push(send(key));
        else {
          local.set(key, item.value);
          writeMarker(key, { s: scope, v: item.version, h: hash(item.value), t: new Date().toISOString() });
        }
      } else if (mine !== null) {
        if (sameScope && !unsent) {
          // In step before, and no longer in the database: removed there.
          local.remove(key);
          writeMarker(key, null);
        } else if (!sameScope && marker && PRIVATE_KEYS.has(key)) {
          // Another person's conversations: not handed on.
          local.remove(key);
          writeMarker(key, null);
        } else sends.push(send(key));
      }
    }
    await Promise.all(sends);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pagehide", onPageHide);
    session.pollTimer = window.setTimeout(poll, PULL_EVERY_MS);
    announce();
  })();
  starting = { userId, promise };
  promise.catch(() => {
    if (starting?.promise === promise) starting = null;
  });
  return promise;
}

/** Signing out: what is waiting is sent, and the working copy stops following the database. */
export async function stopServerSync(): Promise<void> {
  const s = session;
  if (!s) return;
  const waiting = Array.from(scheduled.keys());
  for (const id of scheduled.values()) window.clearTimeout(id);
  scheduled.clear();
  if (s.pollTimer !== null) window.clearTimeout(s.pollTimer);
  window.removeEventListener("focus", onFocus);
  window.removeEventListener("pagehide", onPageHide);
  await Promise.allSettled([...sending.values(), ...waiting.map((key) => send(key))]);
  session = null;
  starting = null;
  announce();
}
