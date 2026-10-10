// THE BROWSER'S ROOM: WHAT DOES NOT FIT IN localStorage IS KEPT IN IndexedDB (REQUIREMENTS §108).
//
// The working copy of the company's data (data/serverSync.ts, §55) lives in the browser's localStorage, which gives
// the app about five million characters. A year of the plant's records is larger. Until §108 a value that did not fit
// was held in the page's memory alone (§93, §101): it reached PostgreSQL, but every reload found the browser full
// again, and the banner "This browser's copy is full" came back again and again (the owner, 9-Oct-2026: "coming again
// and again so fix it also without any loss").
//
// Now a value that does not fit in localStorage is kept in IndexedDB, which the browser sizes by the computer's disk,
// and served from this page's memory, so every read and write above stays synchronous, as before:
//
//   start-up    everything kept in IndexedDB is read into memory before anything reads the working copy (main.tsx);
//   a write     goes to localStorage when it fits. One that does not is kept in memory at once and written to
//               IndexedDB a moment later, behind the page and in order: the writes of a moment go in one transaction,
//               the next only after it has been stored, and of two writes of one value the later wins;
//   large       a value kept here is not tried in localStorage again while it is large (over LARGE_CHARS); a smaller
//               one is, and goes back there when it fits. A value and its marker (serverSync.ts) are kept together:
//               the browser never keeps a newer marker beside an older value, which would send the older value back
//               over the database's newer one;
//   the room    once IndexedDB has stored a value, its old copy in localStorage is removed, with its marker's, to free
//               the room for the small values - only while no other tab of the app is open (navigator.locks), so no
//               tab ever finds an empty copy where it had one;
//   other tabs  learn of each change by a BroadcastChannel message, as they learn of a localStorage change by the
//               browser's storage event. Of two tabs writing one value at once the same one wins in every tab and in
//               IndexedDB (a Lamport clock), and a tab opening asks the others for what they have not stored yet;
//   refused     when IndexedDB refuses (the computer's disk full) or there is none, the value stays in this page's
//               memory and goes to the database from there, as in §93; only then does the page say the browser's copy
//               is full (components/common/StorageFullBanner.tsx).
//
// PostgreSQL stays the only store (§55): IndexedDB, like localStorage, holds this browser's working copy of it. Small
// values, and every browser suite's records, stay in localStorage exactly as before.

/** serverSync.ts's NAMESPACE and MARKER_PREFIX (not imported: serverSync.ts imports this module). */
const VALUE_PREFIX = "dcrs:v1:";
const MARKER_PREFIX = "dcrs:sync:";

export const ROOM_DB = "dcrs-room";
const STORE = "items";
const CHANNEL = "dcrs-room";
/** Held, shared, by every open tab of the app for as long as it is open: how a tab knows it is the only one. */
const TABS_LOCK = "dcrs-room-tabs";
/** A value kept in IndexedDB is not tried in localStorage again while it is larger than this (a fifth of the room). */
export const LARGE_CHARS = 1_000_000;
/** What this tab stored lately is handed to a tab that opens now: its read may have started before it was stored. */
const RECENT_MS = 30_000;
/** A browser whose IndexedDB does not open in this time is treated as having none, for this page. */
const OPEN_TIMEOUT_MS = 10_000;

/** When it was written: a Lamport clock, and the tab that wrote it to tell two of one moment apart. */
interface Stamp {
  c: number;
  t: string;
}

/** One value as IndexedDB keeps it, under its name in the browser's storage. `v` null: removed. */
interface Entry extends Stamp {
  v: string | null;
}

/** One value as it travels between tabs. */
interface Note extends Entry {
  n: string;
}

type Message = { kind: "set"; notes: Note[] } | { kind: "hello"; from: string };

interface Bus {
  postMessage(message: unknown): void;
  close(): void;
  onmessage: ((event: MessageEvent) => void) | null;
}

interface Locks {
  request(name: string, options: { mode: "shared" | "exclusive" }, callback: () => Promise<unknown>): Promise<unknown>;
  query(): Promise<{ held?: { name?: string }[]; pending?: { name?: string }[] }>;
}

/** What the room uses of the browser — the browser's own, or a test's stand-ins (frontend/tests/browserRoom.test.ts). */
export interface RoomEnv {
  local(): Storage | null;
  idb(): IDBFactory | null;
  bus(name: string): Bus | null;
  locks(): Locks | null;
}

const browserEnv: RoomEnv = {
  local: () => {
    try {
      return globalThis.localStorage ?? null;
    } catch {
      return null; // site data blocked: reading the property throws
    }
  },
  idb: () => {
    try {
      return (globalThis as unknown as { indexedDB?: IDBFactory }).indexedDB ?? null;
    } catch {
      return null;
    }
  },
  bus: (name) => {
    try {
      if (typeof BroadcastChannel !== "function") return null;
      const bus = new BroadcastChannel(name);
      // Node's own channel keeps a process alive; a browser has no unref.
      (bus as unknown as { unref?: () => void }).unref?.();
      return bus as unknown as Bus;
    } catch {
      return null;
    }
  },
  locks: () => {
    try {
      return (globalThis as unknown as { navigator?: { locks?: Locks } }).navigator?.locks ?? null;
    } catch {
      return null;
    }
  },
};

const newer = (a: Stamp, b: Stamp | undefined): boolean => !b || a.c > b.c || (a.c === b.c && a.t > b.t);

const isEntry = (x: unknown): x is Entry =>
  !!x && typeof x === "object" && typeof (x as Entry).c === "number" && typeof (x as Entry).t === "string" && ((x as Entry).v === null || typeof (x as Entry).v === "string");

/** A value's marker, or a marker's value (data/serverSync.ts): kept together, never one without the other. */
export function companionOf(name: string): string | null {
  if (name.startsWith(VALUE_PREFIX)) return MARKER_PREFIX + name.slice(VALUE_PREFIX.length);
  if (name.startsWith(MARKER_PREFIX)) return VALUE_PREFIX + name.slice(MARKER_PREFIX.length);
  return null;
}

function randomTab(): string {
  try {
    const id = (globalThis.crypto as Crypto | undefined)?.randomUUID?.();
    if (id) return id;
  } catch {
    /* none */
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** Opens the database and reads everything in it. */
function openAndRead(idb: IDBFactory): Promise<{ db: IDBDatabase; entries: [string, Entry][] }> {
  return new Promise((resolve, reject) => {
    let req: IDBOpenDBRequest;
    try {
      req = idb.open(ROOM_DB, 1);
    } catch (err) {
      reject(err);
      return;
    }
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onerror = () => reject(req.error);
    // An older connection in another tab is asked to close (onversionchange below); the timeout ends the wait.
    req.onblocked = () => undefined;
    req.onsuccess = () => {
      const db = req.result;
      try {
        const tx = db.transaction(STORE, "readonly");
        const store = tx.objectStore(STORE);
        const keys = store.getAllKeys();
        const values = store.getAll();
        tx.oncomplete = () => {
          const names = keys.result as IDBValidKey[];
          const stored = values.result as unknown[];
          const entries: [string, Entry][] = [];
          names.forEach((name, i) => {
            if (typeof name === "string" && isEntry(stored[i])) entries.push([name, stored[i] as Entry]);
          });
          resolve({ db, entries });
        };
        tx.onerror = tx.onabort = () => {
          db.close();
          reject(tx.error);
        };
      } catch (err) {
        db.close();
        reject(err);
      }
    };
  });
}

export class BrowserRoom {
  /** The values kept in IndexedDB, by their name in the browser's storage: what every read of them is served from. */
  private readonly kept = new Map<string, string>();
  /** When each value this tab knows in IndexedDB was written, removed ones included. */
  private readonly stamps = new Map<string, Stamp>();
  /** Written here, not yet handed to IndexedDB: the latest of each. */
  private readonly queue = new Map<string, Entry>();
  /** Handed to IndexedDB, not yet stored. */
  private inFlight: Map<string, Entry> | null = null;
  /** Kept values whose latest is stored in IndexedDB. */
  private readonly stored = new Set<string>();
  /** Kept values IndexedDB refused: in this page's memory only. */
  private readonly refused = new Set<string>();
  /** What was stored lately, and when: handed to a tab that opens now. */
  private readonly recent = new Map<string, number>();
  private readonly changeListeners = new Set<(name: string) => void>();
  private readonly refusedListeners = new Set<(names: string[]) => void>();
  private idleWaiters: (() => void)[] = [];
  private db: IDBDatabase | null = null;
  private bus: Bus | null = null;
  private state: "closed" | "opening" | "open" | "unavailable" = "closed";
  private opening: Promise<void> | null = null;
  private clock = 0;
  /** As last asked of navigator.locks: no other tab of the app is open. False when it cannot be known. */
  private alone = false;
  /** Messages heard from other tabs: one heard while asking navigator.locks says another tab is there. */
  private heardFrom = 0;
  private holdingTabLock = false;
  /** The last write to IndexedDB was refused and nothing has been stored since: nothing is on its way. */
  private failing = false;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private tidying = false;
  /** How long the start-up read took, in milliseconds (REQUIREMENTS §108 "Speed"). */
  openMs = 0;
  readonly tab: string;

  constructor(
    private readonly env: RoomEnv = browserEnv,
    tab?: string
  ) {
    this.tab = tab ?? randomTab();
  }

  /** Reads everything kept in IndexedDB into memory. Never rejects: without IndexedDB the room is simply not there. */
  open(timeoutMs = OPEN_TIMEOUT_MS): Promise<void> {
    if (!this.opening) this.opening = this.start(timeoutMs);
    return this.opening;
  }

  private async start(timeoutMs: number): Promise<void> {
    const began = Date.now();
    // Every open tab says so, whether or not its IndexedDB opens: no other tab removes a copy it may be reading.
    this.holdTabLock();
    const idb = this.env.idb();
    if (!idb) {
      this.state = "unavailable";
      return;
    }
    this.state = "opening";
    // Told first, read second: a value another tab writes while this one reads is not missed.
    this.bus = this.env.bus(CHANNEL);
    if (this.bus) this.bus.onmessage = (event: MessageEvent) => this.heard(event.data as Message);
    this.post({ kind: "hello", from: this.tab }, true);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), timeoutMs);
    });
    const reading = openAndRead(idb).catch((err: unknown) => {
      console.warn("This browser's IndexedDB could not be opened; what does not fit in its localStorage is held in the page's memory.", err);
      return null;
    });
    const read = await Promise.race([reading, late]);
    clearTimeout(timer);
    if (!read) {
      this.state = "unavailable";
      // Opened after all, too late for this page: closed again, and never written to from it.
      void reading.then((r) => r?.db.close());
      this.bus?.close();
      this.bus = null;
      return;
    }
    const { db, entries } = read;
    this.db = db;
    db.onversionchange = () => {
      db.close();
      this.lost();
    };
    db.onclose = () => this.lost();
    for (const [name, entry] of entries) {
      this.clock = Math.max(this.clock, entry.c);
      const known = this.stamps.get(name);
      if (known && !newer(entry, known)) {
        // Heard from another tab while reading: the same, or newer.
        if (entry.v !== null && known.c === entry.c && known.t === entry.t) this.stored.add(name);
        continue;
      }
      this.stamps.set(name, { c: entry.c, t: entry.t });
      if (entry.v === null) {
        this.kept.delete(name);
        continue;
      }
      this.kept.set(name, entry.v);
      this.stored.add(name);
    }
    // The only tab of the app: its writes are not passed to tabs that are not there (a tab that opens later says so).
    await this.refreshAlone();
    this.state = "open";
    this.openMs = Date.now() - began;
    try {
      performance.measure?.("dcrs:room-open", { start: performance.now() - this.openMs, end: performance.now() });
    } catch {
      /* no User Timing here */
    }
    void this.tidy();
  }

  /** IndexedDB is open and takes what does not fit in localStorage. */
  get isOpen(): boolean {
    return this.state === "open";
  }

  get(name: string): string | null {
    const kept = this.kept.get(name);
    if (kept !== undefined) return kept;
    const local = this.env.local();
    try {
      return local ? local.getItem(name) : null;
    } catch {
      return null;
    }
  }

  /** False only when localStorage has no room for it and there is no IndexedDB to take it (data/serverSync.ts then holds it in memory, §93). */
  set(name: string, value: string): boolean {
    if ((this.kept.has(name) && value.length > LARGE_CHARS) || this.keptWithItsValue(name)) {
      this.keep(name, value);
      return true;
    }
    const local = this.env.local();
    try {
      if (!local) throw new Error("no localStorage");
      local.setItem(name, value);
      // Small again, and back in localStorage: IndexedDB's copy is removed behind it, in order.
      if (this.kept.has(name)) this.release(name);
      return true;
    } catch {
      /* no room in localStorage */
    }
    if (this.state !== "open") return false;
    this.keep(name, value);
    // A value's marker follows it, so that the two are stored together.
    const companion = companionOf(name);
    if (companion && name.startsWith(VALUE_PREFIX) && !this.kept.has(companion)) {
      let marker: string | null = null;
      try {
        marker = local ? local.getItem(companion) : null;
      } catch {
        marker = null;
      }
      if (marker !== null) this.keep(companion, marker);
    }
    return true;
  }

  remove(name: string): void {
    try {
      this.env.local()?.removeItem(name);
    } catch {
      /* noop */
    }
    if (this.kept.has(name)) this.release(name);
  }

  /** Every name with this prefix, in localStorage or kept here. */
  names(prefix: string): string[] {
    const out = new Set<string>();
    const local = this.env.local();
    try {
      if (local)
        for (let i = 0; i < local.length; i++) {
          const k = local.key(i);
          if (k !== null && k.startsWith(prefix)) out.add(k);
        }
    } catch {
      /* none */
    }
    for (const k of this.kept.keys()) if (k.startsWith(prefix)) out.add(k);
    return [...out];
  }

  /** Whether this value is kept in IndexedDB (and read from memory). */
  isKept(name: string): boolean {
    return this.kept.has(name);
  }

  /** A write is still on its way to IndexedDB. */
  get busy(): boolean {
    return !!this.inFlight || (this.queue.size > 0 && !this.failing);
  }

  /** Resolves once nothing is on its way to IndexedDB (or after `ms`): before the page is loaded again. */
  idle(ms = 3000): Promise<void> {
    if (!this.busy) return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      this.idleWaiters.push(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  /** Another tab changed a value of the working copy: `name` is its name in the browser's storage. */
  onChange(listener: (name: string) => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  /** IndexedDB refused these values: they are in this page's memory only. */
  onRefused(listener: (names: string[]) => void): () => void {
    this.refusedListeners.add(listener);
    return () => this.refusedListeners.delete(listener);
  }

  // -------------------------------------------------------------------------
  // writing to IndexedDB

  /**
   * A marker goes where its value is kept, and stays there while it is: never the newer marker in localStorage
   * (stored at once) beside an older value here (stored a moment later).
   */
  private keptWithItsValue(name: string): boolean {
    return name.startsWith(MARKER_PREFIX) && this.kept.has(VALUE_PREFIX + name.slice(MARKER_PREFIX.length));
  }

  private stamp(name: string): Stamp {
    const s = { c: ++this.clock, t: this.tab };
    this.stamps.set(name, s);
    return s;
  }

  private keep(name: string, value: string): void {
    const s = this.stamp(name);
    this.kept.set(name, value);
    this.stored.delete(name);
    this.queue.set(name, { v: value, ...s });
    this.post({ kind: "set", notes: [{ n: name, v: value, ...s }] });
    this.schedule();
  }

  /** No longer kept here (back in localStorage, or removed): IndexedDB's copy goes, behind the writes before it. */
  private release(name: string): void {
    const s = this.stamp(name);
    this.kept.delete(name);
    this.stored.delete(name);
    this.refused.delete(name);
    this.queue.set(name, { v: null, ...s });
    this.post({ kind: "set", notes: [{ n: name, v: null, ...s }] });
    this.schedule();
  }

  private schedule(): void {
    // A new write is on its way, and takes anything refused before with it.
    this.failing = false;
    if (this.flushTimer !== null || this.inFlight) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, 0);
  }

  /** The writes of the moment, in one transaction: stored together, or not at all. */
  private flush(): void {
    if (this.inFlight) return;
    if (this.queue.size === 0) {
      this.settle();
      return;
    }
    const batch = new Map(this.queue);
    this.queue.clear();
    this.inFlight = batch;
    let tx: IDBTransaction;
    try {
      if (!this.db) throw new Error("IndexedDB is not open in this page.");
      tx = this.db.transaction(STORE, "readwrite");
    } catch (err) {
      this.failed(batch, err);
      return;
    }
    let thrown: unknown = null;
    const store = tx.objectStore(STORE);
    for (const [name, entry] of batch) {
      const there = store.get(name);
      there.onsuccess = () => {
        // Another tab stored a newer one of it in the meantime: that one stands, here as in every tab.
        if (isEntry(there.result) && !newer(entry, there.result)) return;
        try {
          store.put(entry, name);
        } catch (err) {
          thrown = err;
          try {
            tx.abort();
          } catch {
            /* already ending */
          }
        }
      };
    }
    tx.oncomplete = () => this.done(batch);
    tx.onabort = () => this.failed(batch, thrown ?? tx.error);
  }

  private done(batch: Map<string, Entry>): void {
    this.inFlight = null;
    this.failing = false;
    const now = Date.now();
    for (const [name, entry] of batch) {
      this.recent.set(name, now);
      const latest = this.stamps.get(name);
      if (latest && latest.c === entry.c && latest.t === entry.t) {
        this.refused.delete(name);
        if (entry.v !== null && this.kept.has(name)) this.stored.add(name);
      }
    }
    for (const [name, at] of this.recent) if (at < now - RECENT_MS) this.recent.delete(name);
    if (this.queue.size) this.schedule();
    else {
      this.settle();
      void this.tidy();
    }
  }

  private failed(batch: Map<string, Entry>, err: unknown): void {
    this.inFlight = null;
    this.failing = true;
    const refusedNow: string[] = [];
    for (const [name, entry] of batch) {
      // Tried again with the next write, unless a newer one of it is waiting already; and stored together with it.
      if (!this.queue.has(name)) this.queue.set(name, entry);
      if (entry.v !== null && this.kept.has(name)) {
        this.refused.add(name);
        refusedNow.push(name);
      }
    }
    console.warn("This browser's IndexedDB refused the working copy; it is kept in the page's memory and sent to the database from there.", err);
    this.settle();
    if (refusedNow.length)
      for (const listener of this.refusedListeners) {
        try {
          listener(refusedNow);
        } catch (e) {
          console.error(e);
        }
      }
  }

  private settle(): void {
    if (this.busy) return;
    const waiting = this.idleWaiters;
    this.idleWaiters = [];
    for (const resolve of waiting) resolve();
  }

  /** The database was closed under this page (site data cleared, a newer version): what is kept stays in memory. */
  private lost(): void {
    this.db = null;
    if (this.state === "open") this.state = "unavailable";
  }

  // -------------------------------------------------------------------------
  // the room in localStorage

  private holdTabLock(): void {
    const locks = this.env.locks();
    if (!locks) return;
    try {
      void locks
        .request(TABS_LOCK, { mode: "shared" }, () => {
          this.holdingTabLock = true;
          return new Promise<void>(() => undefined); // held until the page goes
        })
        .catch(() => undefined);
    } catch {
      /* no locks */
    }
  }

  private async queryAlone(): Promise<boolean> {
    const locks = this.env.locks();
    if (!locks || !this.holdingTabLock) return false;
    try {
      const { held = [], pending = [] } = await locks.query();
      return [...held, ...pending].filter((l) => l.name === TABS_LOCK).length <= 1;
    } catch {
      return false;
    }
  }

  /** Asks whether this is the only tab of the app; a tab heard from in the meantime has the last word. */
  private async refreshAlone(): Promise<boolean> {
    const before = this.heardFrom;
    const alone = await this.queryAlone();
    if (this.heardFrom === before) this.alone = alone;
    return this.alone && this.heardFrom === before;
  }

  /**
   * Once IndexedDB has stored a value, its old copy in localStorage only takes room: it is removed, with its
   * marker's (both or neither, so a tab still running an older version of the app reads them as a pair), while this
   * is the only tab of the app — another tab could be reading the copy.
   */
  private async tidy(): Promise<void> {
    if (this.tidying || this.state !== "open") return;
    this.tidying = true;
    try {
      if (!(await this.refreshAlone()) || this.busy || this.state !== "open") return;
      const local = this.env.local();
      if (!local) return;
      const inLocal = new Set<string>();
      for (let i = 0; i < local.length; i++) {
        const k = local.key(i);
        if (k !== null) inLocal.add(k);
      }
      const settled = (name: string) => this.kept.has(name) && this.stored.has(name);
      for (const name of [...this.stored]) {
        if (!settled(name) || !inLocal.has(name)) continue;
        const companion = companionOf(name);
        if (companion && inLocal.has(companion) && !settled(companion)) continue;
        local.removeItem(name);
        inLocal.delete(name);
        if (companion && inLocal.has(companion)) {
          local.removeItem(companion);
          inLocal.delete(companion);
        }
      }
    } catch {
      /* the next tidy tries again */
    } finally {
      this.tidying = false;
    }
  }

  // -------------------------------------------------------------------------
  // the other tabs

  private post(message: Message, always = false): void {
    if (!this.bus || (!always && this.alone)) return;
    try {
      this.bus.postMessage(message);
    } catch (err) {
      console.warn("A change could not be passed to the app's other tabs; they read it from IndexedDB when they open.", err);
    }
  }

  private noteOf(name: string): Note | null {
    const s = this.stamps.get(name);
    return s ? { n: name, v: this.kept.get(name) ?? null, c: s.c, t: s.t } : null;
  }

  private heard(message: Message): void {
    if (!message || typeof message !== "object") return;
    if (message.kind === "hello") {
      if (message.from === this.tab) return;
      this.alone = false;
      this.heardFrom++;
      // A tab opening now is handed what this one has not stored yet, or stored lately: its read may have missed it.
      const cutoff = Date.now() - RECENT_MS;
      const names = new Set<string>([...this.queue.keys(), ...(this.inFlight ? this.inFlight.keys() : [])]);
      for (const [name, at] of this.recent) if (at >= cutoff) names.add(name);
      const notes = [...names].map((n) => this.noteOf(n)).filter((n): n is Note => n !== null);
      if (notes.length) this.post({ kind: "set", notes }, true);
      return;
    }
    if (message.kind !== "set" || !Array.isArray(message.notes)) return;
    this.alone = false;
    this.heardFrom++;
    const behind: Note[] = [];
    for (const note of message.notes) {
      if (!note || typeof note.n !== "string" || !isEntry(note)) continue;
      const mine = this.stamps.get(note.n);
      if (!newer(note, mine)) {
        // The other tab is behind: it is told what this one has.
        if (mine && newer(mine, note)) {
          const back = this.noteOf(note.n);
          if (back) behind.push(back);
        }
        continue;
      }
      this.clock = Math.max(this.clock, note.c);
      this.stamps.set(note.n, { c: note.c, t: note.t });
      // The other tab stores it.
      this.stored.delete(note.n);
      this.refused.delete(note.n);
      if (note.v === null) this.kept.delete(note.n);
      else this.kept.set(note.n, note.v);
      for (const listener of this.changeListeners) {
        try {
          listener(note.n);
        } catch (err) {
          console.error(err);
        }
      }
    }
    if (behind.length) this.post({ kind: "set", notes: behind }, true);
  }
}

// ---------------------------------------------------------------------------
// the page's room

const room = new BrowserRoom();

/** At start-up, before anything reads the working copy (main.tsx). */
export const openRoom = (): Promise<void> => room.open();
export const roomGet = (name: string): string | null => room.get(name);
export const roomSet = (name: string, value: string): boolean => room.set(name, value);
export const roomRemove = (name: string): void => room.remove(name);
export const roomNames = (prefix: string): string[] => room.names(prefix);
export const roomKept = (name: string): boolean => room.isKept(name);
/** IndexedDB is open and takes what does not fit in localStorage: the browser's copy cannot be "nearly full". */
export const roomOpen = (): boolean => room.isOpen;
export const roomBusy = (): boolean => room.busy;
export const roomIdle = (ms?: number): Promise<void> => room.idle(ms);
export const onRoomChange = (listener: (name: string) => void): (() => void) => room.onChange(listener);
export const onRoomRefused = (listener: (names: string[]) => void): (() => void) => room.onRefused(listener);
