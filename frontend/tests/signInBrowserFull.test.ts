// SIGNING IN WITH THE BROWSER FULL: THE APP OPENS (REQUIREMENTS §101; §93 held the
// saves, this holds the sign-in). Without a browser: the working copy
// (data/storageAdapter.ts, data/serverSync.ts) in front of a stand-in database.
//
// The owner, 9-Oct-2026, with a picture of "This browser has no room for the
// company's records": "So fix it any how without any loss." A year of records is
// about as large as the browser's storage for the app, and once the database's
// copy no longer fitted, signing in stopped at that screen for good. Now:
//
//   * signing in succeeds, and every record the database has can be opened: the
//     copy that does not fit is read from the page's memory;
//   * the browser's storage is left as it was (the older copy, with the marker
//     that belongs to it), so the next sign-in takes the database's copy again;
//   * nothing is waiting to be sent, so leaving the page asks nothing;
//   * a record started afterwards reaches the database, beside every other one;
//   * the same holds for a browser that has no copy at all yet.
// Run: npm run test:unit -- signInBrowserFull
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import type { RecordInstance } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { recordRepository } from "../src/data/repositories/recordRepository";
import { SyncError, startServerSync, stopServerSync } from "../src/data/serverSync";
import { createRecordForDocument } from "../src/engine/recordCrud";

// The page's document, as far as the working copy uses it.
(globalThis as unknown as Record<string, unknown>).document = { hidden: false, addEventListener() {}, removeEventListener() {} };

// ---------------------------------------------------------------------------
// the stand-in database: /api/storage as backend/index.ts answers it

interface Item {
  value: string;
  version: number;
}
const db = new Map<string, Item>();
let seq = 0;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function bodyText(body: unknown, encoding: string | undefined): Promise<string> {
  if (typeof body === "string") return body;
  const bytes = Buffer.from(body as ArrayBuffer);
  return encoding === "gzip" ? gunzipSync(bytes).toString("utf-8") : bytes.toString("utf-8");
}

(globalThis as unknown as Record<string, unknown>).fetch = async (input: string, init: RequestInit = {}) => {
  const url = String(input);
  const method = (init.method ?? "GET").toUpperCase();
  const headers = (init.headers ?? {}) as Record<string, string>;
  if (url.startsWith("/api/activity")) return new Response(null, { status: 204 });
  if (url === "/api/storage" && method === "GET") {
    const items = Array.from(db, ([key, item], i) => ({ key, value: item.value, version: item.version, seq: i + 1 }));
    return json({ items, seq, scope: "*" });
  }
  if (url.startsWith("/api/storage?since=") && method === "GET") return json({ items: [], seq, scope: "*" });
  if (url.startsWith("/api/storage/") && method === "PUT") {
    const key = decodeURIComponent(url.slice("/api/storage/".length));
    const base = Number(headers["X-Base-Version"] ?? 0);
    const body = await bodyText(init.body, headers["Content-Encoding"]);
    const stored = db.get(key);
    if (stored && stored.version !== base) return json({ current: { key, value: stored.value, version: stored.version, seq }, scope: "*" }, 409);
    const next = { value: body, version: (stored?.version ?? 0) + 1 };
    db.set(key, next);
    seq += 1;
    return json({ version: next.version, seq });
  }
  if (method === "DELETE") return new Response(null, { status: 204 });
  return new Response("not here", { status: 404 });
};

// ---------------------------------------------------------------------------
// the browser's storage, with a fixed room

const storage = globalThis.localStorage as Storage;
const realSetItem = storage.setItem.bind(storage);
let roomFor: number | null = null;
const used = () => {
  let n = 0;
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i)!;
    n += k.length + (storage.getItem(k) ?? "").length;
  }
  return n;
};
// As a browser does: a write that would take the storage past its room throws QuotaExceededError.
storage.setItem = (key: string, value: string) => {
  if (roomFor !== null) {
    const after = used() - (storage.getItem(key) === null ? 0 : key.length + storage.getItem(key)!.length) + key.length + String(value).length;
    if (after > roomFor) throw new DOMException(`Setting the value of '${key}' exceeded the quota.`, "QuotaExceededError");
  }
  realSetItem(key, String(value));
};

async function until(what: string, ok: () => boolean, ms = 15000): Promise<void> {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) assert.fail(`waited ${ms} ms: ${what}`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

/** Whether leaving the page now would be asked about. */
function leavingAsks(): boolean {
  const e = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(e);
  return e.defaultPrevented;
}

const storedInDatabase = (id: string) => (JSON.parse(db.get("records")?.value ?? "[]") as RecordInstance[]).some((r) => r.id === id);
const inTheBrowser = (id: string) => (storage.getItem("dcrs:v1:records") ?? "").includes(`"${id}"`);

/** The database's records grown past the browser's room: `count` more records like `like`. */
function growTheDatabase(like: RecordInstance, count: number, prefix: string): string[] {
  const records = JSON.parse(db.get("records")!.value) as RecordInstance[];
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const id = `${prefix}-${i}`;
    ids.push(id);
    records.push({ ...like, id, periodKey: `${like.periodKey}:${prefix}-${i}` });
  }
  const item = db.get("records")!;
  db.set("records", { value: JSON.stringify(records), version: item.version + 1 });
  seq += 1;
  return ids;
}

ensureDocumentsSeeded();
ensureMasterSeeded();
// Stopped whatever happens below: a failing test must end this file, not leave the session's poll running for ever.
after(() => stopServerSync());

let template: RecordInstance;

test("signing in when the database's records no longer fit in the browser: the app opens on all of them", async () => {
  // A first sign-in with room: the browser holds a copy in step with the database.
  await startServerSync("person-1");
  template = createRecordForDocument(documentRepository.getById("mnt-new-equipment")!, { dateISO: "2026-10-06" }).record;
  await until("the first record reaches the database", () => storedInDatabase(template.id));
  await stopServerSync();

  // Colleagues fill the database past what this browser can take.
  const before = used();
  const theirs = growTheDatabase(template, 400, "rec-colleague");
  roomFor = before + 20_000;
  assert.ok(db.get("records")!.value.length > roomFor, "the database's records alone are larger than the browser's room");

  await startServerSync("person-1"); // used to throw SyncError "no-room": "This browser has no room for the company's records"
  assert.ok(recordRepository.getById(theirs[0]), "a colleague's record opens");
  assert.ok(recordRepository.getById(theirs[theirs.length - 1]), "...and the last of them");
  assert.ok(recordRepository.getById(template.id), "...and the one from before");
  assert.equal(inTheBrowser(theirs[0]), false, "the browser's storage had no room for them");
  assert.ok(inTheBrowser(template.id), "...and keeps the older copy it had");
  assert.equal(leavingAsks(), false, "nothing is waiting to be sent: the database has it all");

  // Work goes on: a record started now reaches the database, beside every other one.
  const { record } = createRecordForDocument(documentRepository.getById("str-sharp-metal-objects")!, { dateISO: "2026-10-07" });
  assert.ok(recordRepository.getById(record.id), "the new record opens");
  await until("the new record reaches the database", () => storedInDatabase(record.id));
  assert.ok(theirs.every(storedInDatabase), "every colleague's record is still in the database");
  await until("nothing is left to send", () => !leavingAsks());
  await stopServerSync();

  // The next sign-in (a reload) takes the database's copy again, the new record in it.
  await startServerSync("person-1");
  assert.ok(recordRepository.getById(record.id), "after signing in again the new record opens");
  assert.ok(recordRepository.getById(theirs[0]), "...and so do the colleagues'");
  await stopServerSync();
});

test("a browser with no copy at all yet signs in too, though the records do not fit", async () => {
  // Another computer: nothing of the app's in its storage, and less room than the records take.
  storage.clear();
  roomFor = 30_000;
  assert.ok(db.get("records")!.value.length > roomFor);
  let failed: unknown = null;
  await startServerSync("person-2").catch((err: unknown) => {
    failed = err;
  });
  assert.equal(failed instanceof SyncError ? failed.kind : failed, null, "no 'This browser has no room' stop");
  assert.ok(recordRepository.getById(template.id), "the records open");
  assert.equal(storage.getItem("dcrs:v1:records"), null, "nothing was forced into the browser's storage");
  assert.equal(leavingAsks(), false);
  await stopServerSync();
});
