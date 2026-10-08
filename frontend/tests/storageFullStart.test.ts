// START WITH THE BROWSER'S COPY FULL: NEVER "RECORD NOT FOUND" (REQUIREMENTS §93;
// part of C-1 of the audit of 7-Oct-2026). Without a browser: the working copy
// (data/storageAdapter.ts, data/serverSync.ts) in front of a stand-in database.
//
// The owner, 7-Oct-2026: "when i click on start record in many document ... no
// record found go back this message is coming". When the browser's storage for
// the app was full, Start wrote the new record nowhere: the write failed, the
// records repository dropped its copy, nothing was sent to the database, and the
// record's page said "Record not found". Now:
//
//   * the record a person starts opens — it is read from the page's memory;
//   * it is sent to the database (PostgreSQL is the store) from there, and the
//     page is told when the database has it, so it can say it WAS saved;
//   * closing the page before then asks first; afterwards it does not;
//   * a colleague's save in between (the database answers 409) is merged and
//     sent, though the merged copy does not fit either;
//   * nothing new is stored in the browser: its full copy is left as it was.
// Run: npm run test:unit -- storageFullStart
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import type { RecordInstance } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { recordRepository } from "../src/data/repositories/recordRepository";
import { STORAGE_HELD, STORAGE_HELD_SAVED } from "../src/data/storageAdapter";
import { startServerSync, stopServerSync } from "../src/data/serverSync";
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
const puts: { key: string; base: number; body: string }[] = [];
/** The next PUT of this key is refused as made from an older copy, once (a colleague saved first). */
let colleagueSavesFirst: { key: string; value: string } | null = null;
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
  if (url === "/api/storage" && method === "GET") return json({ items: [], seq, scope: "*" });
  if (url.startsWith("/api/storage?since=") && method === "GET") return json({ items: [], seq, scope: "*" });
  if (url.startsWith("/api/storage/") && method === "PUT") {
    const key = decodeURIComponent(url.slice("/api/storage/".length));
    const base = Number(headers["X-Base-Version"] ?? 0);
    const body = await bodyText(init.body, headers["Content-Encoding"]);
    puts.push({ key, base, body });
    if (colleagueSavesFirst && colleagueSavesFirst.key === key) {
      const now = { value: colleagueSavesFirst.value, version: (db.get(key)?.version ?? 0) + 1 };
      colleagueSavesFirst = null;
      db.set(key, now);
      seq += 1;
      return json({ current: { key, value: now.value, version: now.version, seq }, scope: "*" }, 409);
    }
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
// the browser's storage, full

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
// As a browser does: a write that would take the item past the room left throws QuotaExceededError.
storage.setItem = (key: string, value: string) => {
  if (roomFor !== null) {
    const after = used() - (storage.getItem(key) === null ? 0 : key.length + storage.getItem(key)!.length) + key.length + String(value).length;
    if (after > roomFor) throw new DOMException(`Setting the value of '${key}' exceeded the quota.`, "QuotaExceededError");
  }
  realSetItem(key, String(value));
};
/** Fills the browser: from now on nothing larger than what is stored fits (a few characters to spare). */
const fillTheBrowser = () => {
  roomFor = used() + 40;
};

const events: { name: string; key?: string }[] = [];
for (const name of [STORAGE_HELD, STORAGE_HELD_SAVED]) {
  window.addEventListener(name, (e) => events.push({ name, key: (e as CustomEvent<{ key?: string }>).detail?.key }));
}

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

const sentRecordsWith = (id: string) => puts.some((p) => p.key === "records" && (JSON.parse(p.body) as RecordInstance[]).some((r) => r.id === id));
const storedInDatabase = (id: string) => (JSON.parse(db.get("records")?.value ?? "[]") as RecordInstance[]).some((r) => r.id === id);
const inTheBrowser = (id: string) => (storage.getItem("dcrs:v1:records") ?? "").includes(id);

ensureDocumentsSeeded();
ensureMasterSeeded();
// Stopped whatever happens below: a failing test must end this file, not leave the session's poll running for ever.
after(() => stopServerSync());

test("Start with the browser's copy full: the record opens, reaches the database, and the page is told it WAS saved", async () => {
  await startServerSync("person-1");
  // A record already in the working copy, so the records item exists before the browser fills up.
  const earlier = createRecordForDocument(documentRepository.getById("mnt-new-equipment")!, { dateISO: "2026-10-06" }).record;
  await until("the earlier record reaches the database", () => storedInDatabase(earlier.id));

  fillTheBrowser();
  events.length = 0;
  const doc = documentRepository.getById("str-sharp-metal-objects")!;
  const { record, existed } = createRecordForDocument(doc, { dateISO: "2026-10-07" });
  assert.equal(existed, false);
  assert.equal(inTheBrowser(record.id), false, "the browser's storage had no room for it");
  assert.ok(recordRepository.getById(record.id), "...yet the record opens: no 'Record not found'");
  assert.deepEqual(events[0], { name: STORAGE_HELD, key: "records" }, "the page is told the browser's copy is full");
  assert.equal(leavingAsks(), true, "closing the page before the database has it asks first");

  await until("the started record reaches the database", () => storedInDatabase(record.id));
  assert.ok(sentRecordsWith(record.id));
  await until("the page is told the database has it", () => events.some((e) => e.name === STORAGE_HELD_SAVED && e.key === "records"));
  assert.equal(leavingAsks(), false, "once it is saved, leaving asks nothing");

  // Another tab, or the database's own news, makes every screen read the records again: it is still there.
  const news = new Event("storage") as Event & { key: string | null };
  news.key = null;
  window.dispatchEvent(news);
  assert.ok(recordRepository.getById(record.id), "read again, from the page's memory, it is still there");
  assert.ok(recordRepository.getById(earlier.id), "...and so is everything before it");
  assert.equal(inTheBrowser(record.id), false, "nothing new was written into the browser's full storage");
  assert.ok(inTheBrowser(earlier.id), "...which keeps what it had");
});

test("a colleague's save in between is merged, and the merged copy is sent though it does not fit either", async () => {
  // A colleague's record reaches the database first; this browser's next save is refused (409) and merged.
  const theirs = (JSON.parse(db.get("records")!.value) as RecordInstance[]).concat([
    { ...(JSON.parse(db.get("records")!.value) as RecordInstance[])[0], id: "rec-colleague", periodKey: "mnt-new-equipment:2026-10-07:colleague", updatedAt: new Date().toISOString() },
  ]);
  colleagueSavesFirst = { key: "records", value: JSON.stringify(theirs) };
  events.length = 0;
  const { record } = createRecordForDocument(documentRepository.getById("mnt-new-equipment")!, { dateISO: "2026-10-07" });
  assert.ok(recordRepository.getById(record.id), "it opens");
  await until("the merged copy reaches the database", () => storedInDatabase(record.id) && storedInDatabase("rec-colleague"));
  assert.ok(recordRepository.getById("rec-colleague"), "the colleague's record is in this page's copy too");
  assert.ok(recordRepository.getById(record.id), "...beside the one started here");
  await until("the page is told it WAS saved", () => events.some((e) => e.name === STORAGE_HELD_SAVED));
  await stopServerSync();
});
