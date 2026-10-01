import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";
import type { StoredItem, WriteResult } from "./db.ts";
import { plantTimeZone } from "./db.ts";
import { repoRoot } from "./paths.ts";
import { departmentOfDocument } from "../frontend/src/data/seed/documentDepartments.ts";

// THE ENGINE HOST: DCRS'S OWN RULES, RUN ON THE SERVER (REQUIREMENTS §85).
//
// The Mitra mobile app does what Mitra does in the browser — find a document,
// say what is due, open today's record, fill it, submit it, verify it — through
// the DCRS API (backend/apiV1Records.ts). Every one of those is DCRS's engine
// at work (frontend/src/engine): the patch checker, the validation, the
// lifecycle, the history, the activity log. This file runs THAT code here,
// rather than a second copy of its rules:
//
//   * THE BUNDLE. frontend/src/engineHost/entry.ts, bundled with esbuild for
//     Node exactly as scripts/unit-tests.ts bundles the unit tests —
//     frontend/tests/support/browserGlobals.ts injected ahead of the app's
//     modules, so a window and an in-memory localStorage exist — with the
//     activity log and the database sync swapped for the entry's own two
//     (frontend/src/engineHost/activityCollector.ts, syncStub.ts). It is built
//     into backend/data/engine-host (not kept in git) when the server starts,
//     and again whenever one of the files it was built from is newer than it.
//     The file is named by its content, so two servers on one computer never
//     load half of each other's.
//   * THE WORKER. The bundle runs in a worker thread of its own: the browser
//     globals it sets up (window, localStorage) exist there only, never in the
//     server itself, and the engine's work — parsing a year of records, a
//     search index — never holds up the server's other requests. It keeps what
//     it loaded between requests, and starts again only when something stored
//     has changed (each item's seq), or the person's departments, or the day.
//   * ONE REQUEST AT A TIME. The engine keeps its working copy in module state,
//     as the browser does, so requests take turns.
//   * EACH REQUEST AS ITS PERSON. The stored company items (records, documents,
//     master, hrMasterData, referenceEdits, formatEdits, deletions, live-start)
//     are read — only when their seq moved — and handed over with the person's
//     departments; the entry keeps a department's account to its own lines, as
//     GET /api/storage does.
//   * EACH CHANGE WRITTEN WITH THE VERSION IT WAS MADE FROM. The entry answers
//     with the records item as it should now stand; it is written with
//     writeItem(..., baseVersion) — the version the change was worked out on.
//     Somebody else saved in between: the items are read again and the change
//     is worked out again, on what is stored now, up to three times (as the
//     CAPA close of backend/apiV1.ts does). New lines of the deletions log are
//     put at its head the same way. Only then are the activity lines the engine
//     wrote handed to the route, to be logged in the person's name.
//
// WHAT THE ENGINE CANNOT DO HERE, and what is done instead (docs/chatbot-integration.md):
//   * its clock is this server's own local time, as a browser's is the plant
//     computer's: the plant's server runs on factory time (PLANT_TIMEZONE); a
//     server in another zone is warned about at start-up;
//   * a picture is not scaled here (the browser scales with a canvas, which
//     Node has not): a photo must come in at most 512 KB, already scaled as the
//     browser scales it (backend/apiV1Records.ts MAX_PHOTO_BYTES);
//   * the record's page is drawn by a real browser only: the PDF is printed by
//     backend/pdfReport.ts, not by this engine.

/** Where the stored items are read and written: the server's database, or a test's stand-in (backend/apiV1.ts ApiV1Store). */
export interface EngineStore {
  itemSeq(scope: string, key: string): Promise<number | null>;
  readItem(scope: string, key: string): Promise<StoredItem | null>;
  writeItem(scope: string, key: string, value: string, baseVersion: number, by: string): Promise<WriteResult>;
}

/** Must equal ENGINE_API_VERSION in frontend/src/engineHost/entry.ts. */
export const ENGINE_API_VERSION = 1;
/** The company items a browser holds (backend/index.ts COMPANY_KEYS) — entry.ts ITEM_KEYS. */
export const ITEM_KEYS = ["records", "documents", "master", "hrMasterData", "referenceEdits", "formatEdits", "deletions", "live-start"] as const;
type ItemKey = (typeof ITEM_KEYS)[number];

/** One activity-log line the engine wrote, its detail already beginning "Through <client>". */
export interface ActivityLine {
  action: string;
  target: string;
  detail: string;
  documentId: string;
}

interface WritePlan {
  records?: { value: string; baseVersion: number };
  deletionsAdded?: unknown[];
}

type Outcome =
  | { ok: true; status: number; body: unknown; write?: WritePlan; activity: ActivityLine[] }
  | { ok: false; status: number; code: string; error: string; extra?: Record<string, unknown>; activity: ActivityLine[]; write?: WritePlan };

interface LoadAnswer {
  reloaded: boolean;
  ms: number;
  records: number;
  missing?: string[];
}

/** Who a request is made for. `departments` null: every department (the super admin, or an account with none set). */
export interface EngineCaller {
  userId: string;
  userName: string;
  email: string;
  departments: string[] | null;
  /** The calling app, as its X-Client-Name gave it (backend/findingsCore.ts clientName). */
  client: string;
}

/** What a route answers. */
export interface EngineAnswer {
  status: number;
  body: unknown;
}

/** The engine could not be started here: esbuild missing, the bundle failed, the worker died. The route answers 503. */
export class EngineUnavailable extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "EngineUnavailable";
  }
}

// ---------------------------------------------------------------------------
// the bundle

const FRONTEND_SRC = path.join(repoRoot, "frontend", "src");
const ENTRY = path.join(FRONTEND_SRC, "engineHost", "entry.ts");
const BROWSER_GLOBALS = path.join(repoRoot, "frontend", "tests", "support", "browserGlobals.ts");
/** The browser's modules the bundle does without, and what takes their place. */
const SWAPS = new Map<string, string>([
  [path.join(FRONTEND_SRC, "utils", "activityLog"), path.join(FRONTEND_SRC, "engineHost", "activityCollector.ts")],
  [path.join(FRONTEND_SRC, "data", "serverSync"), path.join(FRONTEND_SRC, "engineHost", "syncStub.ts")],
]);
export const DEFAULT_BUNDLE_DIR = path.join(repoRoot, "backend", "data", "engine-host");
const INDEX_FILE = "current.json";
/** How often a running server looks whether the frontend's files have changed since the bundle was built. */
const STALE_CHECK_MS = 60_000;
const CALL_TIMEOUT_MS = 90_000;
const MAX_ATTEMPTS = 3;
const MAX_DELETIONS_KEPT = 200; // engine/recordCrud.ts MAX_DELETIONS_KEPT

interface BundleIndex {
  file: string;
  inputs: string[];
  builtAt: number;
  api: number;
}

const stripExt = (p: string): string => p.replace(/\.(tsx?|jsx?|mjs)$/, "");
const sameFile = (a: string, b: string): boolean => path.normalize(stripExt(a)).toLowerCase() === path.normalize(stripExt(b)).toLowerCase();

/** The bundle on disk when it is newer than every file it was built from; null when it must be built again. */
function currentBundle(dir: string): { file: string; index: BundleIndex } | null {
  let index: BundleIndex;
  try {
    index = JSON.parse(readFileSync(path.join(dir, INDEX_FILE), "utf-8")) as BundleIndex;
  } catch {
    return null;
  }
  if (index.api !== ENGINE_API_VERSION || !Array.isArray(index.inputs) || index.inputs.length === 0) return null;
  const file = path.join(dir, path.basename(index.file));
  let builtAt: number;
  try {
    builtAt = statSync(file).mtimeMs;
  } catch {
    return null;
  }
  for (const input of index.inputs) {
    try {
      if (statSync(path.resolve(repoRoot, input)).mtimeMs > builtAt) return null;
    } catch {
      return null; // a file it was built from is gone: build again
    }
  }
  return { file, index };
}

/** Whether the bundle in `dir` is built and newer than every file it was built from. */
export function engineBundleIsCurrent(dir = DEFAULT_BUNDLE_DIR): boolean {
  return currentBundle(dir) !== null;
}

/** Builds the bundle into `dir` and names it by its content. */
async function buildBundle(dir: string): Promise<{ file: string; ms: number }> {
  const started = Date.now();
  let esbuild: typeof import("esbuild");
  try {
    esbuild = await import("esbuild");
  } catch (err) {
    throw new EngineUnavailable("esbuild is not installed on this server (npm install), so DCRS's engine cannot be bundled.", { cause: err });
  }
  const swap: import("esbuild").Plugin = {
    name: "dcrs-engine-host-swaps",
    setup(build) {
      build.onResolve({ filter: /(activityLog|serverSync)$/ }, (args) => {
        const asked = path.resolve(args.resolveDir, args.path);
        for (const [from, to] of SWAPS) if (sameFile(asked, from)) return { path: to };
        return undefined;
      });
    },
  };
  const result = await esbuild.build({
    entryPoints: [ENTRY],
    absWorkingDir: repoRoot,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    write: false,
    outfile: path.join(dir, "engine.mjs"),
    inject: [BROWSER_GLOBALS],
    jsx: "automatic",
    metafile: true,
    logLevel: "silent",
    plugins: [swap],
  });
  const js = result.outputFiles[0]?.contents;
  if (!js) throw new EngineUnavailable("esbuild wrote no bundle.");
  mkdirSync(dir, { recursive: true });
  const name = `engine-${createHash("sha1").update(js).digest("hex").slice(0, 12)}.mjs`;
  const file = path.join(dir, name);
  if (!existsSync(file)) {
    // Written aside, then renamed: another server loading the bundle never reads half a file.
    const aside = `${file}.${process.pid}.tmp`;
    writeFileSync(aside, js);
    try {
      renameSync(aside, file);
    } catch {
      rmSync(aside, { force: true });
      if (!existsSync(file)) throw new EngineUnavailable("The engine's bundle could not be written.");
    }
  }
  const inputs = Object.keys(result.metafile?.inputs ?? {}).map((p) => path.relative(repoRoot, path.resolve(repoRoot, p)));
  const index: BundleIndex = { file: name, inputs, builtAt: Date.now(), api: ENGINE_API_VERSION };
  const indexAside = path.join(dir, `${INDEX_FILE}.${process.pid}.tmp`);
  writeFileSync(indexAside, JSON.stringify(index));
  try {
    renameSync(indexAside, path.join(dir, INDEX_FILE));
  } catch {
    rmSync(indexAside, { force: true });
  }
  // Bundles of earlier builds, a day old: nobody is loading them any more.
  for (const old of readdirSync(dir)) {
    if (old === name || !/^engine-[0-9a-f]+\.mjs(\..*\.tmp)?$/.test(old)) continue;
    try {
      if (Date.now() - statSync(path.join(dir, old)).mtimeMs > 24 * 60 * 60 * 1000) rmSync(path.join(dir, old), { force: true });
    } catch {
      /* in use or gone */
    }
  }
  return { file, ms: Date.now() - started };
}

// Built once per folder per process: several hosts (a unit test's servers) share one build.
const building = new Map<string, Promise<string>>();

async function bundleFile(dir: string, force = false): Promise<string> {
  if (!force) {
    const ready = currentBundle(dir);
    if (ready) return ready.file;
  }
  let pending = building.get(dir);
  if (!pending) {
    pending = buildBundle(dir).then(
      (b) => {
        console.log(`[engine host] DCRS's engine bundled for the server in ${b.ms} ms (${path.relative(repoRoot, b.file)}).`);
        return b.file;
      },
      (err: unknown) => {
        throw err instanceof EngineUnavailable ? err : new EngineUnavailable(`DCRS's engine could not be bundled: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
      }
    );
    building.set(dir, pending);
    void pending.finally(() => building.delete(dir)).catch(() => undefined);
  }
  return pending;
}

// ---------------------------------------------------------------------------
// the worker

// A CommonJS script (a worker given code, not a file): it loads the bundle and
// answers each message with the entry's handle(). Its console goes to the server's.
const WORKER_SOURCE = `
const { parentPort, workerData } = require("node:worker_threads");
const loading = import(workerData.url);
parentPort.on("message", async (message) => {
  try {
    const engine = await loading;
    const result = await engine.handle(message.body);
    parentPort.postMessage({ id: message.id, ok: true, result });
  } catch (err) {
    parentPort.postMessage({ id: message.id, ok: false, error: String((err && err.stack) || err) });
  }
});
`;

interface Pending {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

class EngineWorker {
  readonly file: string;
  readonly #worker: Worker;
  readonly #pending = new Map<number, Pending>();
  #lastId = 0;
  #dead: Error | null = null;
  /** The seq of each item whose value the worker holds. */
  readonly held = new Map<string, number>();

  constructor(file: string) {
    this.file = file;
    this.#worker = new Worker(WORKER_SOURCE, { eval: true, workerData: { url: pathToFileURL(file).href } });
    // The server may end while the worker is idle: the worker does not keep it running.
    this.#worker.unref();
    this.#worker.on("message", (m: { id: number; ok: boolean; result?: unknown; error?: string }) => {
      const p = this.#pending.get(m.id);
      if (!p) return;
      this.#pending.delete(m.id);
      clearTimeout(p.timer);
      if (m.ok) p.resolve(m.result);
      else p.reject(new Error(m.error ?? "the engine failed"));
    });
    const fail = (err: Error) => {
      this.#dead ??= err;
      for (const p of this.#pending.values()) {
        clearTimeout(p.timer);
        p.reject(new EngineUnavailable(`DCRS's engine stopped: ${err.message}`, { cause: err }));
      }
      this.#pending.clear();
    };
    this.#worker.on("error", (err: unknown) => fail(err instanceof Error ? err : new Error(String(err))));
    this.#worker.on("exit", (code) => fail(new Error(`the engine's worker ended (${code})`)));
  }

  get dead(): boolean {
    return this.#dead !== null;
  }

  call(body: unknown, timeoutMs = CALL_TIMEOUT_MS): Promise<unknown> {
    if (this.#dead) return Promise.reject(new EngineUnavailable(`DCRS's engine stopped: ${this.#dead.message}`));
    const id = ++this.#lastId;
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new EngineUnavailable(`DCRS's engine took more than ${Math.round(timeoutMs / 1000)} seconds, so it was stopped.`));
        void this.terminate();
      }, timeoutMs);
      this.#pending.set(id, { resolve, reject, timer });
      this.#worker.postMessage({ id, body });
    });
  }

  async terminate(): Promise<void> {
    this.#dead ??= new Error("stopped");
    await this.#worker.terminate().catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// the host

export interface EngineHostOptions {
  store: EngineStore;
  /** Where the bundle is kept; a test gives a folder of its own. */
  bundleDir?: string;
}

export interface EngineHost {
  /** Bundles the engine (if its files changed) and starts the worker: the server calls it at start-up, so the first request does not wait. */
  warm(): Promise<void>;
  /** A read: nothing is written. */
  read(caller: EngineCaller, op: string, args?: Record<string, unknown>): Promise<EngineAnswer>;
  /**
   * A change: worked out by the engine, written with the version it was made
   * from (again from the start when somebody else wrote meanwhile), and only
   * then are its activity lines handed to `log`.
   */
  change(caller: EngineCaller, op: string, args: Record<string, unknown>, log: (line: ActivityLine) => void): Promise<EngineAnswer>;
  /** Stops the worker (a test, or the server ending). */
  close(): Promise<void>;
}

const scopeKey = (departments: string[] | null): string => (departments ? [...departments].map((d) => d.toUpperCase()).sort().join(",") : "*");

/** The day by this server's own clock — the engine's todayISO. */
function localDay(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

let warnedZone = false;
/** The engine's "today" is the server's local day; said once when that is not the plant's day. */
function warnIfZonesDiffer(): void {
  if (warnedZone) return;
  warnedZone = true;
  try {
    const zone = plantTimeZone();
    const now = new Date();
    const plantDay = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).format(now);
    const localHere = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).format(now);
    if (plantDay !== localHere) {
      console.warn(
        `[engine host] this server's clock is not on factory time (${zone}); DCRS's engine counts "today" by this server's clock, as a browser counts it by its computer's. Start the server with TZ=${zone} to keep the two together.`
      );
    }
  } catch {
    /* a zone this Node does not know: db.ts already falls back */
  }
}

function answerOf(out: Outcome): EngineAnswer {
  if (out.ok) return { status: out.status, body: out.body };
  return { status: out.status, body: { error: out.error, code: out.code, ...(out.extra ?? {}) } };
}

export function createEngineHost(opts: EngineHostOptions): EngineHost {
  const store = opts.store;
  const dir = opts.bundleDir ?? DEFAULT_BUNDLE_DIR;
  let worker: EngineWorker | null = null;
  let starting: Promise<EngineWorker> | null = null;
  let lastStaleCheck = 0;
  const items = new Map<ItemKey, StoredItem | null>();
  let turn: Promise<unknown> = Promise.resolve();

  /** Requests take turns: the engine holds one working copy. */
  function inTurn<T>(work: () => Promise<T>): Promise<T> {
    const run = turn.then(work, work);
    turn = run.catch(() => undefined);
    return run;
  }

  async function startWorker(force = false): Promise<EngineWorker> {
    const file = await bundleFile(dir, force);
    const w = new EngineWorker(file);
    let pong: { version?: number } | undefined;
    try {
      pong = (await w.call({ kind: "ping" }, 60_000)) as { version?: number };
    } catch (err) {
      // The bundle failed to load in the worker (or the worker died): it must never be left running, or every
      // later request would start, and leave behind, one more thread.
      await w.terminate();
      throw err instanceof EngineUnavailable
        ? err
        : new EngineUnavailable(`DCRS's engine could not be loaded: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
    }
    if (pong?.version !== ENGINE_API_VERSION) {
      await w.terminate();
      throw new EngineUnavailable(`The engine's bundle speaks version ${String(pong?.version)}; this server speaks ${ENGINE_API_VERSION}.`);
    }
    return w;
  }

  async function engine(): Promise<EngineWorker> {
    // The frontend's files changed since the bundle was built (a developer at work): bundled again, and a new worker.
    if (worker && !worker.dead && Date.now() - lastStaleCheck > STALE_CHECK_MS) {
      lastStaleCheck = Date.now();
      const ready = currentBundle(dir);
      if (!ready || !sameFile(ready.file, worker.file)) {
        const old = worker;
        worker = null;
        void old.terminate();
      }
    }
    if (worker && !worker.dead) return worker;
    starting ??= startWorker().finally(() => {
      starting = null;
    });
    worker = await starting;
    lastStaleCheck = Date.now();
    warnIfZonesDiffer();
    return worker;
  }

  /** The stored company items, each read again only when its seq has moved. */
  async function readItems(): Promise<void> {
    const seqs = await Promise.all(ITEM_KEYS.map((key) => store.itemSeq("company", key)));
    await Promise.all(
      ITEM_KEYS.map(async (key, i) => {
        const seq = seqs[i];
        const had = items.get(key);
        if (seq === null) items.set(key, null);
        else if (!had || had.seq !== seq) items.set(key, await store.readItem("company", key));
      })
    );
  }

  /** Hands the worker what it does not hold yet, and the person's departments. */
  async function loadFor(w: EngineWorker, caller: EngineCaller): Promise<void> {
    await readItems();
    const key = `${ITEM_KEYS.map((k) => items.get(k)?.seq ?? 0).join(".")}|${scopeKey(caller.departments)}|${localDay()}`;
    const input = (all: boolean) => ({
      key,
      departments: caller.departments,
      items: Object.fromEntries(
        ITEM_KEYS.map((k) => {
          const item = items.get(k);
          if (!item) return [k, null];
          const send = all || w.held.get(k) !== item.seq;
          return [k, { seq: item.seq, version: item.version, ...(send ? { value: item.value } : {}) }];
        })
      ),
    });
    const remember = () => {
      w.held.clear();
      for (const k of ITEM_KEYS) {
        const item = items.get(k);
        if (item) w.held.set(k, item.seq);
      }
    };
    let answer = (await w.call({ kind: "load", input: input(false) })) as LoadAnswer;
    if (answer.missing?.length) answer = (await w.call({ kind: "load", input: input(true) })) as LoadAnswer;
    remember();
    if (answer.reloaded && answer.ms > 1500) console.log(`[engine host] loaded ${answer.records} records for a request in ${answer.ms} ms.`);
  }

  function runArgs(caller: EngineCaller, args: Record<string, unknown>): Record<string, unknown> {
    return { ...args, userId: caller.userId, userName: caller.userName, client: caller.client };
  }

  /** The deletions log with new lines at its head — a department's account keeps its own lines to the log's length, everyone else's stay (backend/index.ts). */
  async function writeDeletions(added: unknown[], caller: EngineCaller): Promise<void> {
    const formatNos = new Map<string, string>();
    try {
      for (const d of JSON.parse(items.get("documents")?.value ?? "[]") as { id?: unknown; formatNo?: unknown }[]) {
        if (typeof d?.id === "string" && typeof d.formatNo === "string") formatNos.set(d.id, d.formatNo);
      }
    } catch {
      /* the fixed list decides */
    }
    const scope = caller.departments;
    const visible = (line: unknown): boolean => {
      if (!scope) return true;
      const id = (line as { documentId?: unknown } | null)?.documentId;
      if (typeof id !== "string" || !id) return true;
      const code = departmentOfDocument(id, formatNos.get(id));
      return code === null || scope.includes(code);
    };
    for (let attempt = 1; attempt <= 5; attempt++) {
      const item = await store.readItem("company", "deletions");
      let current: unknown[] = [];
      try {
        const parsed: unknown = item ? JSON.parse(item.value) : [];
        current = Array.isArray(parsed) ? parsed : [];
      } catch {
        current = [];
      }
      const mine = [...added, ...current.filter(visible)].slice(0, MAX_DELETIONS_KEPT);
      const next = scope ? [...mine, ...current.filter((l) => !visible(l))] : mine;
      const written = await store.writeItem("company", "deletions", JSON.stringify(next), item?.version ?? 0, caller.email);
      if (written.ok) return;
    }
    console.error("[engine host] the deletions log could not be written after five tries; the record was deleted and its activity line written.");
  }

  return {
    async warm() {
      await inTurn(async () => {
        await engine();
      });
    },

    read(caller, op, args = {}) {
      return inTurn(async () => {
        const w = await engine();
        await loadFor(w, caller);
        return answerOf((await w.call({ kind: "run", op, args: runArgs(caller, args) })) as Outcome);
      });
    },

    change(caller, op, args, log) {
      return inTurn(async () => {
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
          const w = await engine();
          await loadFor(w, caller);
          const out = (await w.call({ kind: "run", op, args: runArgs(caller, args) })) as Outcome;
          const plan = out.write;
          if (plan?.records) {
            const written = await store.writeItem("company", "records", plan.records.value, plan.records.baseVersion, caller.email);
            // Somebody else saved the records in between: worked out again on what is stored now.
            if (!written.ok) continue;
          }
          if (plan?.deletionsAdded?.length) await writeDeletions(plan.deletionsAdded, caller);
          for (const line of out.activity ?? []) log(line);
          return answerOf(out);
        }
        return { status: 409, body: { error: "The records kept changing while this was being saved. Try again in a moment.", code: "busy" } };
      });
    },

    async close() {
      const w = worker;
      worker = null;
      await w?.terminate();
    },
  };
}
