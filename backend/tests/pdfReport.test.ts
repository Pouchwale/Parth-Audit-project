// The PDF of a record's page (REQUIREMENTS §83, backend/pdfReport.ts): the parts
// that need no browser. Which browser is chosen (DCRS_PDF_BROWSER first, then
// Chrome, then Edge where they are usually installed, then PATH outside
// Windows); the queue that lets two print at a time; the options refused before
// any browser is started; and the two rules that keep a printout from writing
// anything — which requests the browser holds back, and the lock the page puts
// on its own fetch, XMLHttpRequest and sendBeacon (run here in a small stand-in
// window). Printing itself is checked against a running server by hand
// (a Chrome and an Edge are needed). Run: npm run test:unit -- pdfReport
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, afterEach, before, describe, it } from "node:test";
import vm from "node:vm";
import {
  DEFAULT_TIMEOUT_MS,
  findBrowser,
  MAX_RENDERS_AT_ONCE,
  pageStartScript,
  PdfError,
  pdfBrowserPath,
  renderRecordPdf,
  RenderQueue,
  requestIsHeldBack,
  type BrowserSearch,
  type RenderOptions,
} from "../pdfReport.ts";

// ---------------------------------------------------------------------------
// which browser

const on = (files: string[]) => {
  const there = new Set(files);
  return (file: string) => there.has(file);
};
const search = (env: Record<string, string | undefined>, platform: NodeJS.Platform, files: string[]): string | null =>
  findBrowser({ env, platform, runnable: on(files) } satisfies BrowserSearch);

const WIN_ENV = { ProgramFiles: "C:\\Program Files", "ProgramFiles(x86)": "C:\\Program Files (x86)", LOCALAPPDATA: "C:\\Users\\hr\\AppData\\Local" };
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const CHROME_X86 = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";
const CHROME_USER = "C:\\Users\\hr\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

describe("findBrowser — which browser prints", () => {
  it("DCRS_PDF_BROWSER comes first, even with Chrome installed", () => {
    assert.equal(search({ ...WIN_ENV, DCRS_PDF_BROWSER: EDGE }, "win32", [CHROME, EDGE]), EDGE);
    assert.equal(search({ ...WIN_ENV, DCRS_PDF_BROWSER: "D:\\Tools\\chrome.exe" }, "win32", [CHROME, "D:\\Tools\\chrome.exe"]), "D:\\Tools\\chrome.exe");
  });

  it("takes DCRS_PDF_BROWSER written in quotes, or with spaces around it", () => {
    assert.equal(search({ ...WIN_ENV, DCRS_PDF_BROWSER: `"${EDGE}"` }, "win32", [EDGE]), EDGE);
    assert.equal(search({ ...WIN_ENV, DCRS_PDF_BROWSER: `  ${EDGE}  ` }, "win32", [EDGE]), EDGE);
  });

  it("a DCRS_PDF_BROWSER that names nothing there gives no browser — it is never swapped for another", () => {
    assert.equal(search({ ...WIN_ENV, DCRS_PDF_BROWSER: "C:\\Nowhere\\chrome.exe" }, "win32", [CHROME, EDGE]), null);
    assert.equal(search({ PATH: "/usr/bin", DCRS_PDF_BROWSER: "/opt/none/chrome" }, "linux", ["/usr/bin/google-chrome"]), null);
  });

  it("a bare name in DCRS_PDF_BROWSER is looked for on PATH", () => {
    assert.equal(search({ PATH: "/usr/local/bin:/usr/bin", DCRS_PDF_BROWSER: "chromium" }, "linux", ["/usr/bin/chromium", "/usr/bin/google-chrome"]), "/usr/bin/chromium");
    assert.equal(
      search({ ...WIN_ENV, Path: "C:\\Tools;C:\\Browsers", DCRS_PDF_BROWSER: "msedge" }, "win32", ["C:\\Browsers\\msedge.exe", CHROME]),
      "C:\\Browsers\\msedge.exe"
    );
    assert.equal(search({ PATH: "/usr/bin", DCRS_PDF_BROWSER: "chromium" }, "linux", []), null);
  });

  it("an empty DCRS_PDF_BROWSER counts as not set", () => {
    assert.equal(search({ ...WIN_ENV, DCRS_PDF_BROWSER: "   " }, "win32", [CHROME]), CHROME);
  });

  it("on Windows: Chrome where it is usually installed, before Edge", () => {
    assert.equal(search(WIN_ENV, "win32", [CHROME, EDGE]), CHROME);
    assert.equal(search(WIN_ENV, "win32", [CHROME_X86, EDGE]), CHROME_X86);
    assert.equal(search(WIN_ENV, "win32", [CHROME_USER, EDGE]), CHROME_USER);
    assert.equal(search(WIN_ENV, "win32", [EDGE]), EDGE);
    assert.equal(search(WIN_ENV, "win32", ["C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"]), "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe");
  });

  it("on Windows: the folders' variables in any case, the usual folders when they are not set, and no PATH search", () => {
    assert.equal(search({ PROGRAMFILES: "E:\\Apps" }, "win32", ["E:\\Apps\\Google\\Chrome\\Application\\chrome.exe"]), "E:\\Apps\\Google\\Chrome\\Application\\chrome.exe");
    assert.equal(search({}, "win32", [CHROME]), CHROME);
    assert.equal(search({}, "win32", [EDGE]), EDGE);
    assert.equal(search({ ...WIN_ENV, PATH: "C:\\Tools" }, "win32", ["C:\\Tools\\chrome.exe"]), null);
    assert.equal(search(WIN_ENV, "win32", []), null);
  });

  it("on a Mac: the applications folder", () => {
    assert.equal(search({}, "darwin", ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]), "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
    assert.equal(search({}, "darwin", ["/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"]), "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge");
  });

  it("elsewhere: google-chrome, then chromium, then microsoft-edge on PATH", () => {
    const env = { PATH: "/usr/local/bin:/usr/bin:/snap/bin" };
    assert.equal(search(env, "linux", ["/usr/bin/google-chrome", "/usr/bin/chromium"]), "/usr/bin/google-chrome");
    assert.equal(search(env, "linux", ["/snap/bin/chromium"]), "/snap/bin/chromium");
    assert.equal(search(env, "linux", ["/usr/bin/chromium-browser"]), "/usr/bin/chromium-browser");
    assert.equal(search(env, "linux", ["/usr/bin/microsoft-edge"]), "/usr/bin/microsoft-edge");
    assert.equal(search(env, "linux", []), null);
    assert.equal(search({}, "linux", ["/usr/bin/google-chrome"]), null);
  });
});

describe("pdfBrowserPath — on this computer, with DCRS_PDF_BROWSER", () => {
  const saved = process.env.DCRS_PDF_BROWSER;
  const realWarn = console.warn;
  let dir = "";
  let warned: string[] = [];
  before(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), "dcrs-pdf-test-"));
  });
  afterEach(() => {
    console.warn = realWarn;
    if (saved === undefined) delete process.env.DCRS_PDF_BROWSER;
    else process.env.DCRS_PDF_BROWSER = saved;
  });
  after(() => rmSync(dir, { recursive: true, force: true }));

  it("names the program DCRS_PDF_BROWSER names when it is there", () => {
    const program = path.join(dir, process.platform === "win32" ? "browser.exe" : "browser");
    writeFileSync(program, "", { mode: 0o755 });
    process.env.DCRS_PDF_BROWSER = program;
    assert.equal(pdfBrowserPath(), program);
  });

  it("gives none when DCRS_PDF_BROWSER names nothing there, and says so in the log once", () => {
    warned = [];
    console.warn = (line: unknown) => void warned.push(String(line));
    process.env.DCRS_PDF_BROWSER = path.join(dir, "not-there", "chrome.exe");
    assert.equal(pdfBrowserPath(), null);
    assert.equal(pdfBrowserPath(), null);
    assert.equal(warned.length, 1);
    assert.match(warned[0], /DCRS_PDF_BROWSER/);
  });
});

// ---------------------------------------------------------------------------
// the queue

/** A job that runs until it is let go. */
function heldJob(log: string[], name: string) {
  let letGo!: (value: string) => void;
  let fail!: (err: Error) => void;
  const done = new Promise<string>((resolve, reject) => {
    letGo = resolve;
    fail = reject;
  });
  return {
    job: () => {
      log.push(`start ${name}`);
      return done;
    },
    finish: () => letGo(name),
    fail: (message: string) => fail(new Error(message)),
  };
}
const turn = () => new Promise((resolve) => setImmediate(resolve));

describe("RenderQueue — at most two print at a time", () => {
  it("prints two at a time, as the server does", () => {
    assert.equal(MAX_RENDERS_AT_ONCE, 2);
    assert.equal(DEFAULT_TIMEOUT_MS, 60_000);
  });

  it("runs two at once; a third waits for a place and starts when one ends; first come, first served", async () => {
    const queue = new RenderQueue(2);
    const log: string[] = [];
    const [a, b, c, d] = ["a", "b", "c", "d"].map((n) => heldJob(log, n));
    const results = [a, b, c, d].map((j) => queue.run(j.job));
    await turn();
    assert.deepEqual(log, ["start a", "start b"]);
    assert.equal(queue.running, 2);
    assert.equal(queue.waiting, 2);
    b.finish();
    await turn();
    assert.deepEqual(log, ["start a", "start b", "start c"]);
    assert.equal(queue.running, 2);
    assert.equal(queue.waiting, 1);
    a.finish();
    c.finish();
    await turn();
    assert.deepEqual(log, ["start a", "start b", "start c", "start d"]);
    d.finish();
    assert.deepEqual(await Promise.all(results), ["a", "b", "c", "d"]);
    assert.equal(queue.running, 0);
    assert.equal(queue.waiting, 0);
  });

  it("gives the place up when a job fails, and passes its error on", async () => {
    const queue = new RenderQueue(1);
    const log: string[] = [];
    const a = heldJob(log, "a");
    const b = heldJob(log, "b");
    const first = queue.run(a.job);
    const thrown = queue.run(() => {
      log.push("start thrower");
      throw new Error("thrown at once");
    });
    const second = queue.run(b.job);
    const firstFailed = assert.rejects(first, /the browser ended/);
    const thrownFailed = assert.rejects(thrown, /thrown at once/);
    a.fail("the browser ended");
    await firstFailed;
    await thrownFailed;
    await turn();
    assert.deepEqual(log, ["start a", "start thrower", "start b"]);
    b.finish();
    assert.equal(await second, "b");
    assert.equal(queue.running, 0);
  });

  it("drops a job still waiting at its time, with pdf-timeout, and never runs it; those behind it still run", async () => {
    const queue = new RenderQueue(1);
    const log: string[] = [];
    const a = heldJob(log, "a");
    const late = heldJob(log, "late");
    const c = heldJob(log, "c");
    const first = queue.run(a.job);
    const dropped = queue.run(late.job, Date.now() + 30);
    const third = queue.run(c.job);
    await assert.rejects(dropped, (err: unknown) => err instanceof PdfError && err.code === "pdf-timeout");
    assert.equal(queue.waiting, 1);
    a.finish();
    await first;
    await turn();
    c.finish();
    assert.equal(await third, "c");
    assert.deepEqual(log, ["start a", "start c"]);
  });

  it("says why it gave up in the caller's own words", async () => {
    const queue = new RenderQueue(1);
    const log: string[] = [];
    const a = heldJob(log, "a");
    const first = queue.run(a.job);
    await assert.rejects(
      queue.run(heldJob(log, "b").job, Date.now() - 1, () => new PdfError("pdf-timeout", "Printing the record took longer than 1 seconds.")),
      /took longer than 1 seconds/
    );
    a.finish();
    await first;
  });

  it("starts a job at once when there is a free place, whatever its time", async () => {
    const queue = new RenderQueue(2);
    assert.equal(await queue.run(async () => "now", Date.now() - 1000), "now");
  });

  it("refuses a queue with no place", () => {
    assert.throws(() => new RenderQueue(0), RangeError);
    assert.throws(() => new RenderQueue(1.5), RangeError);
  });
});

// ---------------------------------------------------------------------------
// the options, refused before any browser is started

describe("renderRecordPdf — options that cannot be right", () => {
  const saved = process.env.DCRS_PDF_BROWSER;
  const realWarn = console.warn;
  before(() => {
    // No browser could start even if a check let something through: a refusal
    // of the options is "pdf-bad-request", never "pdf-unavailable".
    process.env.DCRS_PDF_BROWSER = path.join(os.tmpdir(), "dcrs-pdf-test-no-browser", "chrome.exe");
    console.warn = () => undefined;
  });
  after(() => {
    console.warn = realWarn;
    if (saved === undefined) delete process.env.DCRS_PDF_BROWSER;
    else process.env.DCRS_PDF_BROWSER = saved;
  });

  const good: RenderOptions = { appUrl: "http://127.0.0.1:4000", sessionToken: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.c2lnbmF0dXJl", recordId: "rec-mtnvtbes-z-gka4a9" };
  const refused = (opts: unknown) =>
    assert.rejects(renderRecordPdf(opts as RenderOptions), (err: unknown) => {
      assert.ok(err instanceof PdfError, String(err));
      assert.equal(err.code, "pdf-bad-request");
      return true;
    });

  it("no options at all", async () => {
    await refused(undefined);
    await refused(null);
    await refused("http://127.0.0.1:4000");
  });

  it("an appUrl that is not the app's own http(s) address", async () => {
    for (const appUrl of [undefined, "", "127.0.0.1:4000", "not a url", "ftp://127.0.0.1/", "file:///C:/dist/index.html", "javascript:alert(1)", "http://user:pw@127.0.0.1:4000", "http://127.0.0.1:4000/?x=1", "http://127.0.0.1:4000/#/record/x", 4000]) {
      await refused({ ...good, appUrl });
    }
  });

  it("a sessionToken that is not a cookie's value", async () => {
    for (const sessionToken of [undefined, "", "two words", "a;b", 'a"b', "a,b", "a\\b", "line\nbreak", "x".repeat(4097), 12345]) {
      await refused({ ...good, sessionToken });
    }
  });

  it("a recordId that is not a record's id", async () => {
    for (const recordId of [undefined, "", " rec-1", "rec 1", "rec/1", "../rec", "rec#1", "rec?1", "rec%201", "r".repeat(201), 7]) {
      await refused({ ...good, recordId });
    }
  });

  it("a timeoutMs that is not a sensible number of milliseconds", async () => {
    for (const timeoutMs of [0, -1, 999, 600_001, Number.NaN, Number.POSITIVE_INFINITY, "60000"]) {
      await refused({ ...good, timeoutMs });
    }
  });

  it("good options with no browser on the computer: pdf-unavailable, at once", async () => {
    const started = Date.now();
    await assert.rejects(renderRecordPdf({ ...good, timeoutMs: 30_000 }), (err: unknown) => err instanceof PdfError && err.code === "pdf-unavailable");
    assert.ok(Date.now() - started < 1000);
  });
});

// ---------------------------------------------------------------------------
// nothing the page tries to change reaches DCRS

describe("requestIsHeldBack — the browser's lock", () => {
  const app = "http://127.0.0.1:4000";

  it("holds back every request that is not a plain read, wherever it goes", () => {
    for (const method of ["POST", "PUT", "DELETE", "PATCH", "OPTIONS", "put", "post"]) {
      assert.equal(requestIsHeldBack(method, `${app}/api/storage/records`, app), true, method);
      assert.equal(requestIsHeldBack(method, "https://elsewhere.example/collect", app), true, method);
    }
    assert.equal(requestIsHeldBack("POST", `${app}/api/activity`, app), true);
    assert.equal(requestIsHeldBack("POST", `${app}/api/reminders/send-digest`, app), true);
    assert.equal(requestIsHeldBack("POST", `${app}/api/assistant/speak`, app), true);
  });

  it("lets the page read: the app, its files, the records", () => {
    for (const url of [`${app}/index.html`, `${app}/assets/index-abc.js`, `${app}/api/auth/me`, `${app}/api/storage`, `${app}/api/storage?since=42`, `${app}/fonts/plus-jakarta-sans/plus-jakarta-sans-latin.woff2`]) {
      assert.equal(requestIsHeldBack("GET", url, app), false, url);
      assert.equal(requestIsHeldBack("HEAD", url, app), false, url);
    }
  });

  it("holds back DCRS's own reads that write a line in the activity log (/api/v1, /api/overview)", () => {
    assert.equal(requestIsHeldBack("GET", `${app}/api/v1/pest-control/daily-report?date=2026-09-29`, app), true);
    assert.equal(requestIsHeldBack("GET", `${app}/api/v1`, app), true);
    assert.equal(requestIsHeldBack("GET", `${app}/api/overview/views/findings`, app), true);
    assert.equal(requestIsHeldBack("GET", `${app}/api/v1x/other`, app), false);
    assert.equal(requestIsHeldBack("GET", "http://other.example/api/v1/me", app), false);
  });
});

interface StandIn {
  window: Record<string, unknown>;
  sent: string[];
  timers: { ms: number; run: () => void }[];
  replacedWith: string[];
  intro: Map<string, string>;
}

/** A small stand-in window, with the page's start script run in it before anything else. */
function pageWithTheLock(releaseAfterMs = 90_000): StandIn {
  const sent: string[] = [];
  const timers: { ms: number; run: () => void }[] = [];
  const replacedWith: string[] = [];
  const intro = new Map<string, string>();
  class FakeXhr {
    method = "";
    url = "";
    aborted = false;
    open(method: string, url: string) {
      this.method = method;
      this.url = url;
    }
    send() {
      sent.push(`xhr ${this.method} ${this.url}`);
    }
    abort() {
      this.aborted = true;
    }
  }
  const context: Record<string, unknown> = {
    URL,
    Promise,
    TypeError,
    WeakSet,
    Object,
    Array,
    String,
    location: { href: "http://127.0.0.1:4000/index.html#/record/rec-1", replace: (to: string) => replacedWith.push(to) },
    sessionStorage: { setItem: (k: string, v: string) => intro.set(k, v) },
    fetch: (input: unknown, init?: { method?: string }) => {
      sent.push(`fetch ${init?.method ?? "GET"} ${String(input)}`);
      return Promise.resolve("answered");
    },
    XMLHttpRequest: FakeXhr,
    navigator: {
      sendBeacon: (url: string) => {
        sent.push(`beacon ${url}`);
        return true;
      },
    },
    setTimeout: (run: () => void, ms: number) => timers.push({ ms, run }),
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(pageStartScript("http://127.0.0.1:4000", releaseAfterMs), context);
  return { window: context, sent, timers, replacedWith, intro };
}

describe("pageStartScript — the page's own lock, which holds even if the DevTools connection is lost", () => {
  it("is a script a browser can run, that counts the 3D introduction as seen", () => {
    const page = pageWithTheLock();
    assert.equal(page.intro.get("dcrs:intro-seen"), "1");
  });

  it("refuses every fetch that is not a plain read, as a failed network request, and never sends it", async () => {
    const page = pageWithTheLock();
    const fetch = page.window.fetch as (input: unknown, init?: unknown) => Promise<unknown>;
    await assert.rejects(fetch("/api/storage/records", { method: "PUT", body: "[]" }), TypeError);
    await assert.rejects(fetch("/api/activity", { method: "POST", keepalive: true }), TypeError);
    await assert.rejects(fetch("http://elsewhere.example/x", { method: "post" }), TypeError);
    await assert.rejects(fetch("/api/v1/pest-control/daily-report?date=2026-09-29"), TypeError);
    assert.deepEqual(page.sent, []);
    // (Copied out: the list is an array of the stand-in window's own realm.)
    assert.deepEqual([...(page.window.__dcrsPdfHeldBack as string[])], ["PUT /api/storage/records", "POST /api/activity", "POST /x", "GET /api/v1/pest-control/daily-report"]);
  });

  it("lets the page read", async () => {
    const page = pageWithTheLock();
    const fetch = page.window.fetch as (input: unknown, init?: unknown) => Promise<unknown>;
    assert.equal(await fetch("/api/storage?since=4"), "answered");
    assert.equal(await fetch("/api/auth/me", { method: "GET" }), "answered");
    assert.deepEqual(page.sent, ["fetch GET /api/storage?since=4", "fetch GET /api/auth/me"]);
  });

  it("stops an XMLHttpRequest that would write before it is sent, and lets a read go", () => {
    const page = pageWithTheLock();
    const Xhr = page.window.XMLHttpRequest as new () => { open(m: string, u: string): void; send(): void; aborted: boolean };
    const write = new Xhr();
    write.open("POST", "/api/activity");
    write.send();
    assert.equal(write.aborted, true);
    const read = new Xhr();
    read.open("GET", "/api/storage");
    read.send();
    assert.deepEqual(page.sent, ["xhr GET /api/storage"]);
  });

  it("sends no beacon, and says it could not", () => {
    const page = pageWithTheLock();
    const navigator = page.window.navigator as { sendBeacon(url: string, data?: unknown): boolean };
    assert.equal(navigator.sendBeacon("/api/activity", "{}"), false);
    assert.deepEqual(page.sent, []);
  });

  it("leaves the app for an empty page once the time allowed is well past", () => {
    const page = pageWithTheLock(91_000);
    assert.equal(page.timers.length, 1);
    assert.equal(page.timers[0].ms, 91_000);
    page.timers[0].run();
    assert.deepEqual(page.replacedWith, ["about:blank"]);
  });
});
