import { execFile, spawn, type ChildProcess } from "node:child_process";
import { accessSync, constants as fsConstants, statSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

// A RECORD'S OWN PAGE, PRINTED TO PDF ON THE SERVER (REQUIREMENTS §83).
//
// The Audit Assistant asks DCRS for "the daily pest control report for
// yesterday" and wants a PDF back (GET /api/v1/pest-control/daily-report,
// backend/apiV1.ts). DCRS has no PDF writer of its own: a printed record is
// the browser printing the record's page, scoped to the form by DCRS itself
// (frontend/src/utils/print.ts). So the server does exactly that. It starts
// Google Chrome or Microsoft Edge without a window ("headless"), on a profile
// of its own that is thrown away afterwards, signed in as the person asking.
// It opens the record's page in the built app, waits until the form is drawn,
// lets DCRS scope the page for printing as its Print button does, and asks the
// browser for the PDF. The browser is driven over its DevTools protocol with
// Node's own WebSocket, so nothing new is installed.
//
// PRINTING CHANGES NOTHING IN DCRS. Opening the app in a browser writes: the
// start-up seeds and generates records and saves them, the page logs "Record
// opened", the briefing asks for the reminder e-mail, Mitra may speak. Every
// request the page makes that is not a plain read (GET or HEAD) is failed
// before it leaves the browser, as are the two reads that write a line in the
// activity log (/api/v1 and /api/overview). Two locks do it:
//   * the browser itself, told over DevTools to fail such requests (the Fetch
//     domain). This lock holds only while the DevTools connection is open, so
//     the connection is closed only AFTER the browser has ended — closed first,
//     the page would be free for a moment, and its saves went through;
//   * the page, whose fetch, XMLHttpRequest and sendBeacon refuse such
//     requests from before the app's first line runs. This lock holds even if
//     the connection is lost (the server itself ending mid-print); and past the
//     time allowed, such a page leaves the app for an empty page, so it stops
//     asking the server anything.
// The browser is stopped by ending its processes, never by closing its page,
// so the page's own "on leaving" saves never run. What the server logs for the
// download is written by the route that asked (backend/apiV1.ts), once.
//
// At most two browsers print at a time; a third request waits for a place.
// Each request has one time limit in all, the wait for a place included; past
// it, the browser is stopped and the error's code is "pdf-timeout". The page
// runs in a private context of its own, so the company's working copy it
// loads (megabytes) stays in memory and never goes to disk. Whatever happens,
// the browser is stopped and its profile deleted. The answer does not wait for
// either; the next request in the queue waits for the browser to have ended.
//
// WHICH BROWSER. DCRS_PDF_BROWSER, when set, names the program (a path, or a
// name on PATH); nothing else is tried then. Otherwise Chrome, then Edge, where
// they are usually installed (Windows, macOS), then google-chrome, chromium or
// microsoft-edge on PATH (Linux). Set DCRS_PDF_DEBUG=1 to have each print, and
// every request held back, written to the server's log.

/** The options of one printout. */
export interface RenderOptions {
  /** Where the browser reaches the app, such as http://127.0.0.1:4000. */
  appUrl: string;
  /** The person's session: the value of the dcrs_session cookie. */
  sessionToken: string;
  /** The record whose page is printed. */
  recordId: string;
  /** The time allowed in all, the wait for a free place included. One minute by default. */
  timeoutMs?: number;
}

export type PdfErrorCode =
  | "pdf-bad-request"
  | "pdf-unavailable"
  | "pdf-timeout"
  | "pdf-signed-out"
  | "pdf-password-change-required"
  | "pdf-server-unreachable"
  | "pdf-database-unavailable"
  | "pdf-not-your-department"
  | "pdf-record-not-found"
  | "pdf-failed";

/** Why a printout could not be made. `code` says which case; the message says it in words. */
export class PdfError extends Error {
  readonly code: PdfErrorCode;
  constructor(code: PdfErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PdfError";
    this.code = code;
  }
}

/** How many browsers may print at the same time. */
export const MAX_RENDERS_AT_ONCE = 2;
export const DEFAULT_TIMEOUT_MS = 60_000;
const SHORTEST_TIMEOUT_MS = 1_000;
const LONGEST_TIMEOUT_MS = 10 * 60_000;
/** The start of the name of each throwaway profile folder, in the system's temp folder. */
export const PROFILE_PREFIX = "dcrs-pdf-";
const COOKIE_NAME = "dcrs_session"; // backend/auth.ts COOKIE_NAME
const INTRO_SEEN_KEY = "dcrs:intro-seen"; // frontend/src/components/auth/IntroSplash.tsx INTRO_SEEN_KEY
/** A desktop screen: the page is drawn (and measured for printing) as on a person's computer. */
const WINDOW_SIZE = "1280,900";
/** A4 in inches: the paper when the page does not name one (DCRS names A4 itself, styles.css @page). */
const A4_INCHES = { width: 210 / 25.4, height: 297 / 25.4 };
const LOOK_EVERY_MS = 100;
const PICTURES_WAIT_MS = 10_000;
const MOVEMENT_WAIT_MS = 3_000;
const STOP_WAIT_MS = 5_000;
/** How long after its time limit a page left open (its server gone mid-print) leaves the app. */
const RELEASE_AFTER_LIMIT_MS = 30_000;

const debugging = (): boolean => process.env.DCRS_PDF_DEBUG === "1";
const debug = (line: string): void => {
  if (debugging()) console.log(`[pdf] ${line}`);
};

const tookTooLong = (timeoutMs: number): PdfError =>
  new PdfError("pdf-timeout", `Printing the record took longer than ${Math.round(timeoutMs / 1000)} seconds, so it was stopped.`);

const describe = (err: unknown): string => (err instanceof Error ? err.message : String(err));

// ---------------------------------------------------------------------------
// which browser

/** What the search for a browser looks at: a test hands in its own. */
export interface BrowserSearch {
  env: Record<string, string | undefined>;
  platform: NodeJS.Platform;
  /** Whether a path names a program that can be started. */
  runnable: (file: string) => boolean;
}

/** The names tried on PATH, outside Windows. */
const NAMES_ON_PATH = ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge", "microsoft-edge-stable"];

/** An environment variable, whatever the case of its name (Windows names are not case-sensitive). */
function envValue(env: Record<string, string | undefined>, name: string): string | undefined {
  const key = Object.keys(env).find((k) => k.toUpperCase() === name.toUpperCase());
  const value = key === undefined ? undefined : env[key]?.trim();
  return value ? value : undefined;
}

/** Where Chrome and Edge are usually installed, Chrome first. */
function installPaths(env: Record<string, string | undefined>, platform: NodeJS.Platform): string[] {
  if (platform === "win32") {
    const roots = [
      envValue(env, "ProgramFiles") ?? "C:\\Program Files",
      envValue(env, "ProgramW6432"),
      envValue(env, "ProgramFiles(x86)") ?? "C:\\Program Files (x86)",
      envValue(env, "LOCALAPPDATA"),
    ].filter((r): r is string => !!r);
    const chrome = roots.map((r) => path.win32.join(r, "Google", "Chrome", "Application", "chrome.exe"));
    const edge = roots.map((r) => path.win32.join(r, "Microsoft", "Edge", "Application", "msedge.exe"));
    return [...new Set([...chrome, ...edge])];
  }
  if (platform === "darwin") {
    return [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ];
  }
  return [];
}

function onPath(name: string, env: Record<string, string | undefined>, platform: NodeJS.Platform, runnable: (file: string) => boolean): string | null {
  const paths = platform === "win32" ? path.win32 : path.posix;
  const dirs = (envValue(env, "PATH") ?? "").split(platform === "win32" ? ";" : ":").filter(Boolean);
  const names = platform === "win32" && !/\.exe$/i.test(name) ? [`${name}.exe`, name] : [name];
  for (const dir of dirs) {
    for (const n of names) {
      const file = paths.join(dir, n);
      if (runnable(file)) return file;
    }
  }
  return null;
}

/** The browser to print with, or null when there is none. */
export function findBrowser({ env, platform, runnable }: BrowserSearch): string | null {
  const chosen = envValue(env, "DCRS_PDF_BROWSER")?.replace(/^"(.*)"$/, "$1").trim();
  if (chosen) {
    if (runnable(chosen)) return chosen;
    // A bare name is looked for on PATH. A browser named that is not there is
    // not swapped for another one: whoever set it meant that one.
    return /[\\/]/.test(chosen) ? null : onPath(chosen, env, platform, runnable);
  }
  for (const file of installPaths(env, platform)) if (runnable(file)) return file;
  if (platform !== "win32") {
    for (const name of NAMES_ON_PATH) {
      const file = onPath(name, env, platform, runnable);
      if (file) return file;
    }
  }
  return null;
}

function runnableFile(file: string): boolean {
  try {
    if (!statSync(file).isFile()) return false;
    if (process.platform !== "win32") accessSync(file, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

let saidMissing: string | null = null;

/** Chrome or Edge on this computer, or null: the PDF route says it cannot print then. */
export function pdfBrowserPath(): string | null {
  const found = findBrowser({ env: process.env, platform: process.platform, runnable: runnableFile });
  const chosen = process.env.DCRS_PDF_BROWSER?.trim();
  if (!found && chosen && saidMissing !== chosen) {
    saidMissing = chosen;
    console.warn(`[pdf] DCRS_PDF_BROWSER is "${chosen}", which is not a program on this computer, so nothing can be printed as PDF. Set it to Chrome or Edge, or remove it.`);
  }
  return found;
}

// ---------------------------------------------------------------------------
// the queue: at most two printing at once

interface Waiter {
  start: () => void;
  timer?: NodeJS.Timeout;
}

/** Runs jobs, at most `limit` at a time; the rest wait their turn, first come first served. */
export class RenderQueue {
  readonly limit: number;
  #running = 0;
  #waiting: Waiter[] = [];

  constructor(limit: number) {
    if (!Number.isInteger(limit) || limit < 1) throw new RangeError("A queue needs room for one job at least.");
    this.limit = limit;
  }

  /** How many jobs are running now. */
  get running(): number {
    return this.#running;
  }

  /** How many jobs are waiting for a place. */
  get waiting(): number {
    return this.#waiting.length;
  }

  /**
   * Runs `job` as soon as a place is free. A job still waiting at `waitUntil`
   * (a time in milliseconds, as Date.now() gives) is dropped without ever
   * being run, and its promise rejects with `tooLate()`.
   */
  run<T>(job: () => Promise<T>, waitUntil = Number.POSITIVE_INFINITY, tooLate: () => Error = () => new PdfError("pdf-timeout", "There was no free place in time.")): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const start = (): void => {
        this.#running++;
        let running: Promise<T>;
        try {
          running = job();
        } catch (err) {
          running = Promise.reject(err);
        }
        // The place is given up (and the next job started) before the caller hears.
        running.then(
          (value) => {
            this.#ended();
            resolve(value);
          },
          (err: unknown) => {
            this.#ended();
            reject(err);
          }
        );
      };
      if (this.#running < this.limit && this.#waiting.length === 0) {
        start();
        return;
      }
      const waiter: Waiter = { start };
      if (Number.isFinite(waitUntil)) {
        const left = waitUntil - Date.now();
        if (left <= 0) {
          reject(tooLate());
          return;
        }
        waiter.timer = setTimeout(() => {
          const at = this.#waiting.indexOf(waiter);
          if (at < 0) return;
          this.#waiting.splice(at, 1);
          reject(tooLate());
        }, left);
      }
      this.#waiting.push(waiter);
    });
  }

  #ended(): void {
    this.#running--;
    this.#next();
  }

  #next(): void {
    while (this.#running < this.limit && this.#waiting.length > 0) {
      const waiter = this.#waiting.shift() as Waiter;
      clearTimeout(waiter.timer);
      waiter.start();
    }
  }
}

const queue = new RenderQueue(MAX_RENDERS_AT_ONCE);

// ---------------------------------------------------------------------------
// what the page may and may not send

/** DCRS's reads that write a line in the activity log (backend/apiV1.ts, backend/overviewRoutes.ts). */
const READS_THAT_WRITE = /^\/api\/(v1|overview)(\/|$)/;

/**
 * Whether a request the page makes is held back: every one that is not a plain
 * read, and the reads of DCRS's own that write a line in the activity log.
 */
export function requestIsHeldBack(method: string, url: string, appOrigin: string): boolean {
  const verb = method.toUpperCase();
  if (verb !== "GET" && verb !== "HEAD") return true;
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return false;
  }
  return target.origin === appOrigin && READS_THAT_WRITE.test(target.pathname);
}

/**
 * What runs in the page before any of the app's own scripts: the 3D
 * introduction counted as seen (components/auth/IntroSplash.tsx — it is for a
 * person opening the system, not for a printout), and the page's own lock on
 * writing, the same rule as requestIsHeldBack. What it refused is kept in
 * window.__dcrsPdfHeldBack, for the log. Past `releaseAfterMs` — only a page
 * whose server went away mid-print is still open then — it leaves the app.
 */
export function pageStartScript(appOrigin: string, releaseAfterMs: number): string {
  return `(() => {
    try { sessionStorage.setItem(${JSON.stringify(INTRO_SEEN_KEY)}, "1"); } catch (e) {}
    const origin = ${JSON.stringify(appOrigin)};
    const readsThatWrite = ${READS_THAT_WRITE.toString()};
    const refusedList = [];
    try { Object.defineProperty(window, "__dcrsPdfHeldBack", { value: refusedList }); } catch (e) {}
    const heldBack = (method, url) => {
      const verb = String(method || "GET").toUpperCase();
      let target;
      try { target = new URL(String(url), location.href); } catch (e) { return true; }
      if (verb !== "GET" && verb !== "HEAD") return true;
      return target.origin === origin && readsThatWrite.test(target.pathname);
    };
    const note = (method, url) => {
      try { refusedList.push(String(method || "GET").toUpperCase() + " " + new URL(String(url), location.href).pathname); } catch (e) {}
    };
    const firstFetch = window.fetch;
    if (typeof firstFetch === "function") {
      window.fetch = function (input, init) {
        let method = "GET";
        let url = "";
        try {
          const request = typeof Request === "function" && input instanceof Request ? input : null;
          method = (init && init.method) || (request ? request.method : "GET");
          url = request ? request.url : String(input);
        } catch (e) {
          return Promise.reject(new TypeError("Failed to fetch"));
        }
        if (heldBack(method, url)) {
          note(method, url);
          return Promise.reject(new TypeError("Failed to fetch"));
        }
        return firstFetch.apply(this, arguments);
      };
    }
    if (typeof XMLHttpRequest === "function") {
      const open = XMLHttpRequest.prototype.open;
      const send = XMLHttpRequest.prototype.send;
      const refused = new WeakSet();
      XMLHttpRequest.prototype.open = function (method, url) {
        if (heldBack(method, url)) { note(method, url); refused.add(this); } else refused.delete(this);
        return open.apply(this, arguments);
      };
      XMLHttpRequest.prototype.send = function () {
        if (refused.has(this)) { this.abort(); return; }
        return send.apply(this, arguments);
      };
    }
    if (typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon = function (url) { note("POST", url); return false; };
    }
    setTimeout(() => { try { location.replace("about:blank"); } catch (e) {} }, ${Math.round(releaseAfterMs)});
  })();`;
}

// ---------------------------------------------------------------------------
// the options

interface CheckedOptions {
  appUrl: string;
  appOrigin: string;
  sessionToken: string;
  recordId: string;
  timeoutMs: number;
}

const badRequest = (message: string): PdfError => new PdfError("pdf-bad-request", message);
// The characters a cookie's value may hold (RFC 6265): no spaces, quotes, commas, semicolons or backslashes.
const COOKIE_VALUE_RE = /^[\x21\x23-\x2B\x2D-\x3A\x3C-\x5B\x5D-\x7E]{1,4096}$/;
// DCRS's record ids are letters, digits and dashes (frontend/src/utils/id.ts); nothing that needs escaping in an address.
const RECORD_ID_RE = /^[\w.:~-]{1,200}$/;

function checkOptions(opts: RenderOptions): CheckedOptions {
  if (!opts || typeof opts !== "object") throw badRequest("renderRecordPdf needs its options: appUrl, sessionToken and recordId.");
  const { appUrl, sessionToken, recordId, timeoutMs } = opts;
  let address: URL | null = null;
  try {
    address = typeof appUrl === "string" ? new URL(appUrl) : null;
  } catch {
    address = null;
  }
  if (!address || (address.protocol !== "http:" && address.protocol !== "https:") || address.username || address.password || address.search || address.hash) {
    throw badRequest("appUrl must be the app's own address, such as http://127.0.0.1:4000.");
  }
  if (typeof sessionToken !== "string" || !COOKIE_VALUE_RE.test(sessionToken)) {
    throw badRequest("sessionToken must be the value of the dcrs_session cookie.");
  }
  if (typeof recordId !== "string" || !RECORD_ID_RE.test(recordId)) {
    throw badRequest("recordId must be a record's id: letters, digits, dashes, at most 200.");
  }
  if (timeoutMs !== undefined && (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs) || timeoutMs < SHORTEST_TIMEOUT_MS || timeoutMs > LONGEST_TIMEOUT_MS)) {
    throw badRequest(`timeoutMs must be a number of milliseconds from ${SHORTEST_TIMEOUT_MS} to ${LONGEST_TIMEOUT_MS}.`);
  }
  return {
    appUrl: `${address.origin}${address.pathname.replace(/\/+$/, "")}`,
    appOrigin: address.origin,
    sessionToken,
    recordId,
    timeoutMs: timeoutMs ?? DEFAULT_TIMEOUT_MS,
  };
}

// ---------------------------------------------------------------------------
// the browser's DevTools protocol, over Node's own WebSocket

interface DevToolsMessage {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code?: number; message?: string };
  sessionId?: string;
}

interface Pending {
  method: string;
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
}

class DevTools {
  readonly #socket: WebSocket;
  readonly #pending = new Map<number, Pending>();
  readonly #listeners = new Set<(message: DevToolsMessage) => void>();
  #lastId = 0;
  #closed: Error | null = null;

  private constructor(socket: WebSocket) {
    this.#socket = socket;
    socket.addEventListener("message", (event) => {
      const data: unknown = event.data;
      let message: DevToolsMessage;
      try {
        message = JSON.parse(typeof data === "string" ? data : Buffer.from(data as ArrayBuffer).toString("utf8")) as DevToolsMessage;
      } catch {
        return;
      }
      if (typeof message.id === "number") {
        const pending = this.#pending.get(message.id);
        if (!pending) return;
        this.#pending.delete(message.id);
        if (message.error) pending.reject(new PdfError("pdf-failed", `The browser refused ${pending.method}: ${message.error.message ?? "no reason given"}.`));
        else pending.resolve(message.result);
        return;
      }
      for (const listener of this.#listeners) listener(message);
    });
    socket.addEventListener("close", () => this.close());
    socket.addEventListener("error", () => this.close());
  }

  /** Connects to the browser's DevTools address (ws://127.0.0.1:<port>/devtools/browser/<id>). */
  static open(address: string): Promise<DevTools> {
    return new Promise<DevTools>((resolve, reject) => {
      const socket = new WebSocket(address);
      const failed = (): void => reject(new PdfError("pdf-unavailable", "The browser's DevTools connection could not be opened."));
      socket.addEventListener("error", failed, { once: true });
      socket.addEventListener(
        "open",
        () => {
          socket.removeEventListener("error", failed);
          resolve(new DevTools(socket));
        },
        { once: true }
      );
    });
  }

  get closed(): boolean {
    return this.#closed !== null;
  }

  send<T>(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<T> {
    if (this.#closed) return Promise.reject(this.#closed);
    const id = ++this.#lastId;
    return new Promise<T>((resolve, reject) => {
      this.#pending.set(id, { method, resolve: resolve as (value: unknown) => void, reject });
      try {
        this.#socket.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
      } catch {
        this.#pending.delete(id);
        reject(new PdfError("pdf-failed", "The browser's DevTools connection is closed."));
      }
    });
  }

  on(listener: (message: DevToolsMessage) => void): void {
    this.#listeners.add(listener);
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = new PdfError("pdf-failed", "The browser's DevTools connection is closed.");
    for (const pending of this.#pending.values()) pending.reject(this.#closed);
    this.#pending.clear();
    this.#listeners.clear();
    try {
      this.#socket.close();
    } catch {
      /* already closed */
    }
  }
}

// ---------------------------------------------------------------------------
// the browser's process

interface Job {
  /** The time limit has passed: everything stops. */
  expired: boolean;
  child: ChildProcess | null;
  startError: Error | null;
  /** The last of what the browser wrote to its error output, for the log when it fails to start. */
  said: string;
  ending: Promise<void> | null;
  devtools: DevTools | null;
  /** The record's page, once it is open. */
  page: PageCall | null;
  /** The requests the browser held back (the Fetch domain), for the log. */
  heldBack: string[];
}

// Browsers still running when the server itself ends are ended with it.
const running = new Set<ChildProcess>();
let endWithServer = false;

function launch(browser: string, profile: string, job: Job): ChildProcess {
  const args = [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "--mute-audio",
    "--no-first-run",
    "--disable-extensions",
    "--no-default-browser-check",
    "--disable-default-apps",
    "--disable-sync",
    "--disable-background-networking",
    "--disable-component-update",
    // No shader cache on disk: two thirds of a fresh profile, and nothing a printout needs.
    "--disable-gpu-shader-disk-cache",
    "--hide-scrollbars",
    `--window-size=${WINDOW_SIZE}`,
    "about:blank",
  ];
  // Its own process group outside Windows, so the whole group can be ended at once;
  // on Windows no window of any kind (taskkill ends the tree there).
  const child = spawn(browser, args, { stdio: ["ignore", "ignore", "pipe"], windowsHide: true, detached: process.platform !== "win32" });
  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (chunk: string) => {
    job.said = (job.said + chunk).slice(-2000);
  });
  child.once("error", (err) => {
    job.startError = err;
  });
  running.add(child);
  child.once("exit", () => running.delete(child));
  if (!endWithServer) {
    endWithServer = true;
    process.once("exit", () => {
      for (const c of running) {
        try {
          c.kill("SIGKILL");
        } catch {
          /* already gone */
        }
      }
    });
  }
  return child;
}

/**
 * Whether the browser's main process still runs. On Windows a process being
 * ended runs none of its own code from the moment it is told to end, but
 * Windows may keep it, and Node's "exit" event, for many seconds after that —
 * so there the process is asked directly (process.kill with signal 0).
 */
function isRunning(child: ChildProcess): boolean {
  if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) return false;
  if (process.platform !== "win32") return true; // the "exit" event comes at once there
  try {
    process.kill(child.pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Ends the browser and every process it started (renderers, GPU, network), and waits a few seconds at most until it no longer runs. */
async function endBrowser(child: ChildProcess): Promise<void> {
  if (!isRunning(child)) return;
  const pid = child.pid as number;
  if (process.platform === "win32") {
    const taskkill = path.join(process.env.SystemRoot ?? process.env.windir ?? "C:\\Windows", "System32", "taskkill.exe");
    // Its answer does not matter: it says "no running instance" of the helpers that had already gone.
    await new Promise<void>((resolve) => execFile(taskkill, ["/PID", String(pid), "/T", "/F"], { windowsHide: true }, () => resolve()));
  } else {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      /* no group: the process itself, below */
    }
  }
  if (isRunning(child)) {
    try {
      child.kill("SIGKILL");
    } catch {
      /* already gone */
    }
  }
  const until = Date.now() + STOP_WAIT_MS;
  while (isRunning(child) && Date.now() < until) await sleep(25);
}

/**
 * Ends the browser, THEN closes the DevTools connection. The browser holds the
 * page's writes back only while the connection is open: closed first, the page
 * would be free to write for the moment the browser takes to end. A browser
 * that has not ended keeps its connection, and so keeps holding them back.
 */
async function stop(job: Job): Promise<void> {
  if (job.child) {
    job.ending ??= endBrowser(job.child);
    await job.ending;
    if (isRunning(job.child)) {
      console.warn(`[pdf] the browser (process ${job.child.pid}) has not ended yet; its DevTools connection is kept open so that it still writes nothing.`);
      return;
    }
  }
  job.devtools?.close();
}

async function removeProfile(dir: string): Promise<void> {
  try {
    // Windows keeps a file busy for a moment after the process holding it has ended.
    await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  } catch (err) {
    console.warn(`[pdf] the browser's throwaway profile ${dir} could not be deleted yet (${describe(err)}); trying again in a minute.`);
    setTimeout(() => void rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 }).catch(() => undefined), 60_000).unref();
  }
}

/** The address of the browser's DevTools, from the DevToolsActivePort file it writes into its profile. */
async function devToolsAddress(profile: string, job: Job, timeoutMs: number): Promise<string> {
  const file = path.join(profile, "DevToolsActivePort");
  const child = job.child as ChildProcess;
  for (;;) {
    if (job.expired) throw tookTooLong(timeoutMs);
    if (job.startError) throw new PdfError("pdf-unavailable", `The browser could not be started: ${job.startError.message}.`);
    // (No process number yet: it could not be started, and the "error" event is on its way.)
    if (child.pid !== undefined && !isRunning(child)) {
      if (job.said.trim()) console.warn(`[pdf] the browser ended as it started. It said: ${job.said.trim()}`);
      throw new PdfError("pdf-unavailable", "The browser ended as it started.");
    }
    try {
      const [port, target] = (await readFile(file, "utf8")).split(/\r?\n/);
      if (/^\d+$/.test(port ?? "") && target?.startsWith("/devtools/browser/")) return `ws://127.0.0.1:${port}${target}`;
    } catch {
      /* not written yet */
    }
    await sleep(50);
  }
}

// ---------------------------------------------------------------------------
// the page

type PageCall = <T>(method: string, params?: Record<string, unknown>) => Promise<T>;

interface EvaluateResult {
  result?: { value?: unknown };
  exceptionDetails?: { text?: string; exception?: { description?: string } };
}

async function evaluate<T>(page: PageCall, expression: string, awaitPromise = false): Promise<T> {
  const answer = await page<EvaluateResult>("Runtime.evaluate", { expression, returnByValue: true, awaitPromise });
  if (answer.exceptionDetails) {
    const why = answer.exceptionDetails.exception?.description ?? answer.exceptionDetails.text ?? "an error";
    throw new PdfError("pdf-failed", `The page's script failed: ${why.split("\n")[0]}`);
  }
  return answer.result?.value as T;
}

/**
 * What the page shows now: "ready" once the record's form is drawn, a refusal
 * DCRS shows instead of it, or "waiting". Read with every look; nothing is
 * left behind in the page.
 */
function pageStateScript(recordId: string): string {
  return `(() => {
    const want = ${JSON.stringify(recordId)};
    const has = (selector) => document.querySelector(selector) !== null;
    const opened = performance.getEntriesByType("navigation")[0];
    if (opened && opened.responseStatus >= 400) return "http-" + opened.responseStatus;
    if (has("#login-email")) return "signed-out";
    if (has('[data-section="password-required"]')) return "password-change-required";
    if (has('[data-state="server-unreachable"]')) return "server-unreachable";
    // The working copy could not be loaded (main.tsx). Not the banner that says a save is being sent again:
    // every save here is held back on purpose, so that one shows as soon as the app first saves.
    const database = document.querySelector('[data-state^="database-"]:not([data-state="database-sync-failing"])');
    if (database) return "database:" + database.getAttribute("data-state");
    if (has('[data-state="not-your-department"]')) return "not-your-department";
    for (const doc of document.querySelectorAll("[data-print-doc][data-bind-record]")) {
      if (doc.getAttribute("data-bind-record") === want && doc.querySelector(".doc-header")) return "ready";
    }
    for (const heading of document.querySelectorAll(".empty-state h2")) {
      if ((heading.textContent || "").trim() === "Record not found") return "record-not-found";
    }
    if (has('.app-content .empty-state[role="alert"]')) return "screen-failed";
    return "waiting";
  })()`;
}

/**
 * Makes the page ready to print as DCRS's Print button does: every face and
 * picture loaded, then DCRS's own print scoping and page fit (the listener
 * utils/print.ts puts on "beforeprint"), then anything still moving in the
 * form brought to rest.
 */
function preparePrintScript(recordId: string): string {
  return `(async () => {
    const want = ${JSON.stringify(recordId)};
    const doc = [...document.querySelectorAll("[data-print-doc][data-bind-record]")].find((d) => d.getAttribute("data-bind-record") === want);
    if (!doc) return { ok: false };
    const within = (promise, ms) => Promise.race([promise, new Promise((resolve) => setTimeout(resolve, ms))]);
    const settled = () => new Promise((resolve) => {
      let done = false;
      const go = () => { if (!done) { done = true; resolve(); } };
      requestAnimationFrame(() => requestAnimationFrame(go));
      setTimeout(go, 250);
    });
    // Every face the app's style sheets name — the printout may use one the screen has not needed yet.
    await Promise.all([...document.fonts].map((face) => (face.status === "unloaded" ? face.load().catch(() => null) : null)));
    await document.fonts.ready;
    for (const img of doc.querySelectorAll("img")) if (img.loading === "lazy") img.loading = "eager";
    const pictures = [...doc.querySelectorAll("img")].filter((img) => !img.complete).map((img) => new Promise((resolve) => {
      img.addEventListener("load", resolve, { once: true });
      img.addEventListener("error", resolve, { once: true });
    }));
    await within(Promise.all(pictures), ${PICTURES_WAIT_MS});
    window.dispatchEvent(new Event("beforeprint"));
    await settled();
    const moving = doc.getAnimations({ subtree: true }).filter((a) => {
      const timing = a.effect ? a.effect.getComputedTiming() : null;
      return a.playState === "running" && !!timing && Number.isFinite(timing.endTime);
    });
    await within(Promise.all(moving.map((a) => a.finished.catch(() => null))), ${MOVEMENT_WAIT_MS});
    await document.fonts.ready;
    return { ok: true, scoped: document.documentElement.classList.contains("print-scoped"), page: document.documentElement.dataset.printPage || "" };
  })()`;
}

const REFUSALS: Record<string, [PdfErrorCode, string]> = {
  "signed-out": ["pdf-signed-out", "DCRS showed its sign-in form: the session is not valid, or the account is switched off."],
  "password-change-required": ["pdf-password-change-required", "The account is still on the password the administrator gave it."],
  "server-unreachable": ["pdf-server-unreachable", "The app could not reach the DCRS server."],
  "not-your-department": ["pdf-not-your-department", "The record belongs to a department this account is not kept to."],
  "record-not-found": ["pdf-record-not-found", "DCRS has no such record for this account."],
  "screen-failed": ["pdf-failed", "DCRS could not draw the record's page."],
};

async function waitForTheRecord(page: PageCall, devtools: DevTools, o: CheckedOptions, job: Job): Promise<void> {
  const script = pageStateScript(o.recordId);
  for (;;) {
    if (job.expired) throw tookTooLong(o.timeoutMs);
    let state = "waiting";
    try {
      state = String(await evaluate<string>(page, script));
    } catch (err) {
      // Between two documents there is nothing to ask for a moment; ask again.
      if (devtools.closed || job.expired) throw err;
    }
    if (state === "ready") return;
    if (Object.hasOwn(REFUSALS, state)) {
      const [code, message] = REFUSALS[state];
      throw new PdfError(code, message);
    }
    if (state.startsWith("database:")) throw new PdfError("pdf-database-unavailable", `DCRS could not load its records in the browser (${state.slice("database:".length)}).`);
    if (state.startsWith("http-")) throw new PdfError("pdf-server-unreachable", `The DCRS server answered the app's address with ${state.slice("http-".length)}; is the app built (npm run build)?`);
    await sleep(LOOK_EVERY_MS);
  }
}

async function readStream(page: PageCall, handle: string): Promise<Buffer> {
  const parts: Buffer[] = [];
  try {
    for (;;) {
      const piece = await page<{ data: string; base64Encoded?: boolean; eof: boolean }>("IO.read", { handle, size: 1024 * 1024 });
      parts.push(Buffer.from(piece.data, piece.base64Encoded ? "base64" : "utf8"));
      if (piece.eof) break;
    }
  } finally {
    await page("IO.close", { handle }).catch(() => undefined);
  }
  return Buffer.concat(parts);
}

async function printRecord(devtools: DevTools, o: CheckedOptions, job: Job, deadline: number, mark: (what: string) => void): Promise<Buffer> {
  // A context of its own that keeps everything in memory (like a private window): the company's
  // working copy the app loads is several megabytes, and none of it needs to go to disk.
  const { browserContextId } = await devtools.send<{ browserContextId: string }>("Target.createBrowserContext", {});
  const { targetId } = await devtools.send<{ targetId: string }>("Target.createTarget", { url: "about:blank", browserContextId });
  const { sessionId } = await devtools.send<{ sessionId: string }>("Target.attachToTarget", { targetId, flatten: true });
  const page: PageCall = <T>(method: string, params: Record<string, unknown> = {}) => devtools.send<T>(method, params, sessionId);
  job.page = page;

  devtools.on((message) => {
    if (message.sessionId !== sessionId || !message.params) return;
    if (message.method === "Fetch.requestPaused") {
      // NOTHING THE PAGE TRIES TO CHANGE REACHES DCRS.
      const { requestId, request } = message.params as { requestId: string; request: { url: string; method: string } };
      const held = requestIsHeldBack(request.method, request.url, o.appOrigin);
      void (held ? page("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" }) : page("Fetch.continueRequest", { requestId })).catch(() => undefined);
      if (held) {
        let where = request.url;
        try {
          where = new URL(request.url).pathname;
        } catch {
          /* kept whole */
        }
        job.heldBack.push(`${request.method} ${where}`);
      }
    } else if (message.method === "Page.javascriptDialogOpening") {
      // A question the page asks would stop it where it is: nobody is there to answer.
      void page("Page.handleJavaScriptDialog", { accept: false }).catch(() => undefined);
    }
  });
  await page("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] });
  // Signed in as the person asking, for the app's address only.
  await page("Network.setCookie", {
    name: COOKIE_NAME,
    value: o.sessionToken,
    url: `${o.appOrigin}/`,
    path: "/",
    httpOnly: true,
    secure: o.appOrigin.startsWith("https:"),
    sameSite: "Lax",
  });
  await page("Page.enable");
  // Before any of the app's scripts: the introduction counted as seen, and the page's own lock on writing.
  await page("Page.addScriptToEvaluateOnNewDocument", { source: pageStartScript(o.appOrigin, Math.max(0, deadline - Date.now()) + RELEASE_AFTER_LIMIT_MS) });

  const opened = await page<{ errorText?: string }>("Page.navigate", { url: `${o.appUrl}/index.html#/record/${o.recordId}` });
  if (opened.errorText) throw new PdfError("pdf-server-unreachable", `The browser could not open DCRS at ${o.appUrl} (${opened.errorText}).`);
  await waitForTheRecord(page, devtools, o, job);
  mark("record drawn");

  const prepared = await evaluate<{ ok: boolean; scoped?: boolean; page?: string }>(page, preparePrintScript(o.recordId), true);
  if (!prepared?.ok) throw new PdfError("pdf-failed", "The record's form left the page before it could be printed.");
  mark(`ready to print (scoped: ${prepared.scoped ? "yes" : "NO"}, page ${prepared.page || "portrait"})`);

  const { stream } = await page<{ stream?: string }>("Page.printToPDF", {
    preferCSSPageSize: true,
    printBackground: true,
    // What the page itself does not say: A4, and no margin of the browser's own
    // (DCRS asks for none and keeps its 12 mm inside the form — styles.css @page).
    paperWidth: A4_INCHES.width,
    paperHeight: A4_INCHES.height,
    marginTop: 0,
    marginBottom: 0,
    marginLeft: 0,
    marginRight: 0,
    displayHeaderFooter: false,
    transferMode: "ReturnAsStream",
  });
  if (!stream) throw new PdfError("pdf-failed", "The browser gave no printout.");
  const pdf = await readStream(page, stream);
  if (pdf.subarray(0, 5).toString("latin1") !== "%PDF-") throw new PdfError("pdf-failed", "The browser's printout is not a PDF.");
  return pdf;
}

// ---------------------------------------------------------------------------
// one printout, from start to finish

/** What the page itself refused (pageStartScript), for the log; nothing when it does not answer at once. */
async function refusedByThePage(job: Job): Promise<string[]> {
  if (!job.page || job.expired || !job.devtools || job.devtools.closed) return [];
  const asked = evaluate<string[]>(job.page, "Array.isArray(window.__dcrsPdfHeldBack) ? window.__dcrsPdfHeldBack.slice() : []").catch(() => []);
  const list = await Promise.race([asked, sleep(1000).then(() => [] as string[])]);
  return Array.isArray(list) ? list : [];
}

interface Answer {
  resolve: (pdf: Buffer) => void;
  reject: (err: unknown) => void;
}

/**
 * One printout. The answer is given as soon as the PDF, or the reason there is
 * none, is known; then the browser is ended, and only then is the place in the
 * queue given up. Its profile is deleted after that (a few seconds on Windows).
 * Never rejects: what went wrong goes to `answer`.
 */
async function printOnce(browser: string, o: CheckedOptions, deadline: number, answer: Answer): Promise<void> {
  const started = Date.now();
  const job: Job = { expired: false, child: null, startError: null, said: "", ending: null, devtools: null, page: null, heldBack: [] };
  // At the time limit the browser is stopped, which ends every wait on it at once.
  const timer = setTimeout(() => {
    job.expired = true;
    void stop(job);
  }, Math.max(0, deadline - Date.now()));
  let profile: string | null = null;
  const took: string[] = [];
  const mark = (what: string): void => {
    took.push(`${what} ${Date.now() - started} ms`);
  };
  try {
    profile = await mkdtemp(path.join(os.tmpdir(), PROFILE_PREFIX));
    if (job.expired) throw tookTooLong(o.timeoutMs);
    job.child = launch(browser, profile, job);
    const address = await devToolsAddress(profile, job, o.timeoutMs);
    job.devtools = await DevTools.open(address);
    mark("browser up");
    if (job.expired) throw tookTooLong(o.timeoutMs);
    const pdf = await printRecord(job.devtools, o, job, deadline, mark);
    clearTimeout(timer);
    mark(`answered with the PDF (${pdf.length} bytes)`);
    answer.resolve(pdf);
  } catch (err) {
    if (job.expired) answer.reject(tookTooLong(o.timeoutMs));
    else if (err instanceof PdfError) answer.reject(err);
    else {
      console.warn(`[pdf] ${o.recordId} could not be printed: ${describe(err)}`);
      answer.reject(new PdfError("pdf-failed", "The browser could not print the record.", { cause: err }));
    }
  } finally {
    clearTimeout(timer);
    let byThePage: string[] = [];
    try {
      if (debugging()) byThePage = await refusedByThePage(job);
      await stop(job);
      mark("browser ended");
    } catch (err) {
      console.warn(`[pdf] ending the browser after ${o.recordId}: ${describe(err)}`);
    }
    // The place in the queue is given up now that the browser has ended; its
    // profile is deleted meanwhile (Windows can take seconds over that).
    const deleted = profile ? removeProfile(profile) : Promise.resolve();
    void deleted
      .then(() => {
        mark("profile deleted");
        if (!debugging()) return;
        const list = (items: string[]) => (items.length ? [...new Set(items)].join(", ") : "none");
        debug(`${o.recordId} with ${path.basename(browser)}: ${took.join(", ")}`);
        debug(`${o.recordId}: writes the page tried and was refused — by the page: ${list(byThePage)}; by the browser: ${list(job.heldBack)}`);
      })
      .catch(() => undefined);
  }
}

/**
 * THE RECORD'S PAGE AS A PDF, printed by a headless Chrome or Edge signed in
 * with `sessionToken`, exactly as DCRS's Print button prints it. Nothing the
 * page tries to write reaches DCRS. Rejects with a PdfError: "pdf-timeout" past
 * `timeoutMs`, "pdf-unavailable" with no browser, "pdf-bad-request" for options
 * that cannot be right, or the refusal DCRS showed (signed out, not your
 * department, no such record, the database not loaded).
 */
export function renderRecordPdf(opts: RenderOptions): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    // Thrown here, a refusal rejects the promise before any browser is started.
    const o = checkOptions(opts);
    const browser = pdfBrowserPath();
    if (!browser) throw new PdfError("pdf-unavailable", "Neither Google Chrome nor Microsoft Edge was found on this computer (see DCRS_PDF_BROWSER).");
    const deadline = Date.now() + o.timeoutMs;
    if (queue.running >= queue.limit) debug(`${o.recordId}: waiting for a place (${queue.running} printing, ${queue.waiting} waiting)`);
    queue.run(() => printOnce(browser, o, deadline, { resolve, reject }), deadline, () => tookTooLong(o.timeoutMs)).catch(reject);
  });
}
