// A BROWSER'S IndexedDB, BroadcastChannel AND LOCKS, STOOD UP IN NODE FOR THE TESTS OF THE BROWSER'S ROOM
// (data/browserRoom.ts, REQUIREMENTS §108). Only what the room uses, and the way a browser does it:
//
//   * IndexedDB: one database, one store; a transaction's writes are stored together when it ends, or not at all;
//     transactions run one after another, in the order they were made; each request is answered in a turn of its
//     own, in the order asked; values are copied in and out (structuredClone). The test can hold the writes back
//     ("on their way"), drop them as a page that is closed does (part way through a transaction too), or have the disk
//     refuse them (QuotaExceededError); it reads every state the disk was ever in, and what was read and put;
//   * BroadcastChannel: a message reaches every other channel of the same name in the same browser, a moment later,
//     never the one that sent it;
//   * navigator.locks: who holds what, as query() reports it; a tab that closes lets go.
// Nothing here is written to disk: a test's data vanishes with its process.

type Callback = ((this: unknown, ev: unknown) => unknown) | null;

class FakeRequest<T = unknown> {
  result: T = undefined as T;
  error: DOMException | null = null;
  onsuccess: Callback = null;
  onerror: Callback = null;
  onupgradeneeded: Callback = null;
  onblocked: Callback = null;
}

const later = (fn: () => void) => setTimeout(fn, 0);

export class FakeDisk {
  /** What is stored, by name. */
  readonly data = new Map<string, unknown>();
  /** Every state the disk was in after a transaction that wrote, oldest first. */
  readonly history: Map<string, unknown>[] = [];
  created = false;
  /** Writing transactions wait while this is set: a write "on its way". Reads go on, on what is stored. */
  holdWrites = false;
  /** A writing transaction ends refused, as on a full disk (QuotaExceededError when it would be stored). */
  refuse = false;
  /** store.put throws QuotaExceededError at once, as a browser made to refuse does (tests/e2e_browser_room.py). */
  refusePut = false;
  private readonly queue: FakeTransaction[] = [];
  private running: FakeTransaction | null = null;
  /** Writes stored, in all. */
  commits = 0;
  /** Every name read with get, in order. */
  readonly reads: string[] = [];
  /** The values put, in order: [name, characters] (a string's length; 0 for anything else). */
  readonly puts: [string, number][] = [];

  /** Transactions begun and not yet ended: a write handed to IndexedDB. */
  get waiting(): number {
    return this.queue.length + (this.running ? 1 : 0);
  }

  enqueue(tx: FakeTransaction): void {
    this.queue.push(tx);
    later(() => this.pump());
  }

  pump(): void {
    if (this.running) return;
    const i = this.queue.findIndex((tx) => !(tx.mode === "readwrite" && this.holdWrites));
    if (i < 0) return;
    const [tx] = this.queue.splice(i, 1);
    this.running = tx;
    tx.run(() => {
      this.running = null;
      later(() => this.pump());
    });
  }

  /** Lets the writes held back go. */
  release(): void {
    this.holdWrites = false;
    later(() => this.pump());
  }

  /** The page was closed: the writes not yet stored never are. */
  dropWaiting(): void {
    for (const tx of this.queue.splice(0)) tx.dropped = true;
  }

  /** The page was closed with a transaction part way through: none of it is stored either. */
  dropAll(): void {
    this.dropWaiting();
    if (this.running) this.running.dropped = true;
  }

  /** Called at each put, as it is made: a test closes the page at a moment of its choosing. */
  onPut: ((name: string) => void) | null = null;

  /** What a page opening now reads: a copy of everything stored. */
  snapshot(): Map<string, unknown> {
    return new Map([...this.data].map(([k, v]) => [k, structuredClone(v)]));
  }
}

class FakeStore {
  constructor(private readonly tx: FakeTransaction) {}
  get(key: string): FakeRequest {
    this.tx.disk.reads.push(key);
    return this.tx.op((view) => (view.has(key) ? structuredClone(view.get(key)) : undefined));
  }
  getAll(): FakeRequest {
    return this.tx.op((view) => [...view.keys()].sort().map((k) => structuredClone(view.get(k))));
  }
  getAllKeys(): FakeRequest {
    return this.tx.op((view) => [...view.keys()].sort());
  }
  put(value: unknown, key: string): FakeRequest {
    if (this.tx.mode !== "readwrite") throw new DOMException("The transaction is read-only.", "ReadOnlyError");
    if (this.tx.disk.refusePut) throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    this.tx.disk.puts.push([key, typeof value === "string" ? value.length : 0]);
    this.tx.disk.onPut?.(key);
    const copy = structuredClone(value);
    return this.tx.op(() => {
      this.tx.staged.set(key, copy);
      return key;
    });
  }
  delete(key: string): FakeRequest {
    return this.tx.op(() => {
      this.tx.staged.set(key, DELETED);
      return undefined;
    });
  }
}

const DELETED = Symbol("deleted");

class FakeTransaction {
  oncomplete: Callback = null;
  onabort: Callback = null;
  onerror: Callback = null;
  error: DOMException | null = null;
  readonly staged = new Map<string, unknown>();
  dropped = false;
  private aborted = false;
  private readonly ops: { req: FakeRequest; fn: (view: Map<string, unknown>) => unknown }[] = [];
  private started = false;

  constructor(
    readonly disk: FakeDisk,
    readonly mode: "readonly" | "readwrite"
  ) {}

  objectStore(): FakeStore {
    return new FakeStore(this);
  }

  abort(): void {
    this.aborted = true;
  }

  op(fn: (view: Map<string, unknown>) => unknown): FakeRequest {
    const req = new FakeRequest();
    this.ops.push({ req, fn });
    return req;
  }

  /** Runs every request in turn (and those their callbacks make), then stores the writes together, or none of them. */
  run(finished: () => void): void {
    if (this.started) return;
    this.started = true;
    const view = () => {
      const v = new Map(this.disk.data);
      for (const [k, x] of this.staged) {
        if (x === DELETED) v.delete(k);
        else v.set(k, x);
      }
      return v;
    };
    const step = () => {
      if (this.dropped) {
        finished();
        return;
      }
      const next = this.ops.shift();
      if (next && !this.aborted) {
        next.req.result = next.fn(view());
        next.req.onsuccess?.call(next.req, { target: next.req });
        later(step);
        return;
      }
      if (!this.aborted && this.mode === "readwrite" && this.staged.size > 0 && this.disk.refuse) {
        this.error = new DOMException("The quota has been exceeded.", "QuotaExceededError");
        this.aborted = true;
      }
      if (this.aborted) {
        this.onabort?.call(this, { target: this });
      } else {
        if (this.staged.size > 0) {
          for (const [k, x] of this.staged) {
            if (x === DELETED) this.disk.data.delete(k);
            else this.disk.data.set(k, x);
          }
          this.disk.commits += 1;
          this.disk.history.push(this.disk.snapshot());
        }
        this.oncomplete?.call(this, { target: this });
      }
      finished();
    };
    later(step);
  }
}

class FakeDatabase {
  onversionchange: Callback = null;
  onclose: Callback = null;
  closed = false;
  readonly objectStoreNames: { contains: (name: string) => boolean };
  constructor(private readonly disk: FakeDisk) {
    this.objectStoreNames = { contains: () => disk.created };
  }
  createObjectStore(): void {
    this.disk.created = true;
  }
  transaction(_store: string, mode: "readonly" | "readwrite" = "readonly"): FakeTransaction {
    if (this.closed) throw new DOMException("The database connection is closing.", "InvalidStateError");
    const tx = new FakeTransaction(this.disk, mode);
    this.disk.enqueue(tx);
    return tx;
  }
  close(): void {
    this.closed = true;
  }
}

/** indexedDB, over one disk. */
export class FakeIndexedDB {
  opened = 0;
  constructor(readonly disk: FakeDisk) {}
  open(): FakeRequest {
    const req = new FakeRequest<FakeDatabase>();
    later(() => {
      this.opened += 1;
      const db = new FakeDatabase(this.disk);
      req.result = db;
      if (!this.disk.created) req.onupgradeneeded?.call(req, { target: req });
      req.onsuccess?.call(req, { target: req });
    });
    return req;
  }
}

/** The BroadcastChannels of one browser. */
export class FakeChannels {
  private readonly members = new Map<string, Set<FakeChannel>>();
  /** Every message sent, as [channel name, message]. */
  readonly sent: [string, unknown][] = [];

  make(name: string, tab = ""): FakeChannel {
    const ch = new FakeChannel(this, name, tab);
    if (!this.members.has(name)) this.members.set(name, new Set());
    this.members.get(name)!.add(ch);
    return ch;
  }

  deliver(from: FakeChannel, message: unknown): void {
    this.sent.push([from.name, message]);
    const copy = structuredClone(message);
    for (const m of this.members.get(from.name) ?? []) {
      if (m === from) continue;
      later(() => {
        if (!m.closed) m.onmessage?.({ data: structuredClone(copy) } as MessageEvent);
      });
    }
  }

  leave(ch: FakeChannel): void {
    this.members.get(ch.name)?.delete(ch);
  }

  /** The tab was closed: its channels hear nothing more. */
  closeTab(tab: string): void {
    for (const set of this.members.values()) for (const ch of [...set]) if (ch.tab === tab) ch.close();
  }
}

export class FakeChannel {
  onmessage: ((event: MessageEvent) => void) | null = null;
  closed = false;
  constructor(
    private readonly channels: FakeChannels,
    readonly name: string,
    readonly tab: string
  ) {}
  postMessage(message: unknown): void {
    if (this.closed) throw new DOMException("The channel is closed.", "InvalidStateError");
    this.channels.deliver(this, message);
  }
  close(): void {
    this.closed = true;
    this.channels.leave(this);
  }
}

/** navigator.locks of one browser: who holds what. */
export class FakeLocks {
  readonly held: { name: string; tab: string }[] = [];
  forTab(tab: string) {
    return {
      request: (name: string, _options: { mode: "shared" | "exclusive" }, callback: () => Promise<unknown>): Promise<unknown> => {
        this.held.push({ name, tab });
        return Promise.resolve().then(callback);
      },
      query: async () => ({ held: this.held.map((l) => ({ name: l.name })), pending: [] }),
    };
  }
  /** The tab was closed: what it held is let go. */
  close(tab: string): void {
    for (let i = this.held.length - 1; i >= 0; i--) if (this.held[i].tab === tab) this.held.splice(i, 1);
  }
}

/** A localStorage with the browser's fixed room, counted as the browser counts it: every name and every value. */
export class RoomedStorage {
  private readonly items = new Map<string, string>();
  /** The room, in characters; null: as much as asked for. */
  room: number | null = null;
  /** Every setItem asked, by name. */
  readonly asked: string[] = [];
  get length(): number {
    return this.items.size;
  }
  used(): number {
    let n = 0;
    for (const [k, v] of this.items) n += k.length + v.length;
    return n;
  }
  clear(): void {
    this.items.clear();
  }
  key(i: number): string | null {
    return [...this.items.keys()][i] ?? null;
  }
  getItem(key: string): string | null {
    return this.items.has(key) ? this.items.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.asked.push(key);
    const text = String(value);
    if (this.room !== null) {
      const before = this.items.has(key) ? key.length + this.items.get(key)!.length : 0;
      if (this.used() - before + key.length + text.length > this.room) throw new DOMException(`Setting the value of '${key}' exceeded the quota.`, "QuotaExceededError");
    }
    this.items.set(key, text);
  }
  removeItem(key: string): void {
    this.items.delete(key);
  }
}

/** One browser: its localStorage, IndexedDB, channels and locks, shared by its tabs. */
export class FakeBrowser {
  readonly disk = new FakeDisk();
  readonly idb = new FakeIndexedDB(this.disk);
  readonly channels = new FakeChannels();
  readonly locks = new FakeLocks();
  /** Who hears of another tab's localStorage writes (the browser's storage event), and of the page being left. */
  private readonly localWatchers: { tab: string; listener: (name: string | null, value: string | null) => void }[] = [];
  private readonly leavingWatchers: { tab: string; listener: (leaving: boolean) => void }[] = [];
  constructor(readonly storage: RoomedStorage = new RoomedStorage()) {}

  /** The tab was closed (or loaded again): it hears nothing more, and lets go of what it held. */
  closeTab(tab: string): void {
    this.channels.closeTab(tab);
    this.locks.close(tab);
    for (const list of [this.localWatchers, this.leavingWatchers]) for (let i = list.length - 1; i >= 0; i--) if (list[i].tab === tab) list.splice(i, 1);
  }

  /** A tab of the app's older version writes localStorage, as it always did: no lock, no channel; every tab of the room hears the storage event. */
  writeFromOlderTab(name: string, value: string): void {
    this.storage.setItem(name, value);
    for (const w of [...this.localWatchers]) setTimeout(() => w.listener(name, value), 0);
  }

  /** The tab's page is being left (pagehide). */
  leave(tab: string): void {
    for (const w of this.leavingWatchers) if (w.tab === tab) w.listener(true);
  }

  /** What a tab of this browser gives data/browserRoom.ts. */
  env(tab: string, withIndexedDB = true) {
    return {
      local: () => this.storage as unknown as Storage,
      idb: () => (withIndexedDB ? (this.idb as unknown as IDBFactory) : null),
      bus: (name: string) => this.channels.make(name, tab) as never,
      locks: () => this.locks.forTab(tab) as never,
      watchLocal: (listener: (name: string | null, value: string | null) => void) => {
        this.localWatchers.push({ tab, listener });
      },
      watchLeaving: (listener: (leaving: boolean) => void) => {
        this.leavingWatchers.push({ tab, listener });
      },
    };
  }
}

/** Waits until `ok()` holds (polled), or fails with `what`. */
export async function until(what: string, ok: () => boolean, ms = 5000): Promise<void> {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) throw new Error(`waited ${ms} ms: ${what}`);
    await new Promise((r) => setTimeout(r, 5));
  }
}

/** A few turns of the event loop: messages delivered, transactions run. */
export const turns = async (n = 20): Promise<void> => {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0));
};
