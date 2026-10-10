// THE BROWSER'S ROOM, AT SIGN-IN AND SIGN-OUT (REQUIREMENTS §108). Without a browser: the working copy
// (data/storageAdapter.ts, data/serverSync.ts) over the page's room (data/browserRoom.ts), opened on a stand-in
// IndexedDB (tests/support/fakeBrowserRoom.ts), in front of a stand-in database (/api/storage as backend/index.ts
// answers it), with the browser's localStorage given a fixed room.
//
// Until §108 the database's records, once larger than the room, were held in the page's memory at every sign-in, and
// every save said "This browser's copy is full" again. Now:
//
//   * signing in keeps them in IndexedDB: the app opens on every record, nothing is held in memory alone, the page is
//     never told the copy is full, and leaving asks nothing; the old copy in localStorage is removed to free the room;
//   * a record started then is in the database and in IndexedDB, and a page opened afterwards (a reload) reads it;
//   * another account signing in clears what the last one may not keep - another person's conversations, an item
//     the new account's departments do not hold - from IndexedDB exactly as from localStorage;
//   * only when IndexedDB too refuses is the page told the copy is full, and then that the record WAS saved; nothing
//     is lost.
// Run: npm run test:unit -- browserRoomSync
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import type { RecordInstance } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { recordRepository } from "../src/data/repositories/recordRepository";
import { BrowserRoom, openRoom, roomGet, roomIdle, roomKept, roomOpen } from "../src/data/browserRoom";
import { STORAGE_HELD, STORAGE_HELD_SAVED, STORAGE_WRITE_FAILED, storage } from "../src/data/storageAdapter";
import { startServerSync, stopServerSync } from "../src/data/serverSync";
import { createRecordForDocument } from "../src/engine/recordCrud";
import { FakeBrowser, RoomedStorage, until } from "./support/fakeBrowserRoom";

const scope = globalThis as unknown as Record<string, unknown>;
// The page's document, as far as the working copy uses it.
scope.document = { hidden: false, addEventListener() {}, removeEventListener() {} };

// ---------------------------------------------------------------------------
// the browser: its localStorage (tests/support/browserGlobals.ts made one; it is given a room here), its IndexedDB,
// its channels and its locks, the page's own

const local = globalThis.localStorage as unknown as RoomedStorage & Storage;
const realSetItem = local.setItem.bind(local);
let roomFor: number | null = null;
const used = () => {
  let n = 0;
  for (let i = 0; i < local.length; i++) {
    const k = local.key(i)!;
    n += k.length + (local.getItem(k) ?? "").length;
  }
  return n;
};
// As a browser does: a write that would take the storage past its room throws QuotaExceededError.
local.setItem = (key: string, value: string) => {
  if (roomFor !== null) {
    const after = used() - (local.getItem(key) === null ? 0 : key.length + local.getItem(key)!.length) + key.length + String(value).length;
    if (after > roomFor) throw new DOMException(`Setting the value of '${key}' exceeded the quota.`, "QuotaExceededError");
  }
  realSetItem(key, String(value));
};
const browser = new FakeBrowser(local);
scope.indexedDB = browser.idb;
scope.BroadcastChannel = function FakeBroadcastChannel(name: string) {
  return browser.channels.make(name, "page");
};
const locks = browser.locks.forTab("page");
if (typeof scope.navigator === "object" && scope.navigator) Object.defineProperty(scope.navigator, "locks", { value: locks, configurable: true });
else scope.navigator = { locks };

// ---------------------------------------------------------------------------
// the stand-in database

interface Item {
  value: string;
  version: number;
  seq: number;
}
const USER_KEYS = new Set(["settings", "assistant-conversations", "sidebar-open-modules", "sidebar-visible"]);
const company = new Map<string, Item>();
const personal = new Map<string, Map<string, Item>>();
/** What an account's departments do not hold (backend/index.ts). */
const deniedTo = new Map<string, Set<string>>([["person-2", new Set(["hrMasterData"])]]);
let seq = 0;

const itemsOf = (account: string) => (key: string) => (USER_KEYS.has(key) ? (personal.get(account) ?? new Map<string, Item>()) : company);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function bodyText(body: unknown, encoding: string | undefined): Promise<string> {
  if (typeof body === "string") return body;
  const bytes = Buffer.from(body as ArrayBuffer);
  return encoding === "gzip" ? gunzipSync(bytes).toString("utf-8") : bytes.toString("utf-8");
}

function visible(account: string, since: number) {
  const denied = deniedTo.get(account) ?? new Set<string>();
  const out: { key: string; value: string; version: number; seq: number }[] = [];
  for (const [key, item] of [...company, ...(personal.get(account) ?? new Map<string, Item>())]) {
    if (!denied.has(key) && item.seq > since) out.push({ key, ...item });
  }
  return { items: out, seq, denied: [...denied], scope: "*" };
}

scope.fetch = async (input: string, init: RequestInit = {}) => {
  const url = String(input);
  const method = (init.method ?? "GET").toUpperCase();
  const headers = (init.headers ?? {}) as Record<string, string>;
  const account = headers["X-Account"] ?? "";
  if (url.startsWith("/api/activity")) return new Response(null, { status: 204 });
  if (url === "/api/storage" && method === "GET") return json(visible(account, 0));
  if (url.startsWith("/api/storage?since=") && method === "GET") return json(visible(account, Number(url.slice("/api/storage?since=".length))));
  if (url.startsWith("/api/storage/") && method === "PUT") {
    const key = decodeURIComponent(url.slice("/api/storage/".length));
    if (deniedTo.get(account)?.has(key)) return json({ error: "Not your departments'." }, 403);
    const base = Number(headers["X-Base-Version"] ?? 0);
    const body = await bodyText(init.body, headers["Content-Encoding"]);
    const items = itemsOf(account)(key);
    const stored = items.get(key);
    if (stored && stored.version !== base) return json({ current: { key, ...stored }, scope: "*" }, 409);
    seq += 1;
    items.set(key, { value: body, version: (stored?.version ?? 0) + 1, seq });
    if (USER_KEYS.has(key)) personal.set(account, items);
    return json({ version: (stored?.version ?? 0) + 1, seq });
  }
  if (method === "DELETE") return new Response(null, { status: 204 });
  return new Response("not here", { status: 404 });
};

// ---------------------------------------------------------------------------

const said: { name: string; key?: string }[] = [];
for (const name of [STORAGE_HELD, STORAGE_HELD_SAVED, STORAGE_WRITE_FAILED]) {
  window.addEventListener(name, (e) => said.push({ name, key: (e as CustomEvent<{ key?: string } | undefined>).detail?.key }));
}

/** Whether leaving the page now would be asked about. */
function leavingAsks(): boolean {
  const e = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(e);
  return e.defaultPrevented;
}

const inDatabase = (id: string) => (JSON.parse(company.get("records")?.value ?? "[]") as RecordInstance[]).some((r) => r.id === id);
const inIndexedDB = (name: string): string | null => (browser.disk.data.get(name) as { v: string | null } | undefined)?.v ?? null;

/** The database's records grown past the browser's room: `count` more records like `like`. */
function growTheDatabase(like: RecordInstance, count: number, prefix: string): string[] {
  const records = JSON.parse(company.get("records")!.value) as RecordInstance[];
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const id = `${prefix}-${i}`;
    ids.push(id);
    records.push({ ...like, id, periodKey: `${like.periodKey}:${prefix}-${i}` });
  }
  const item = company.get("records")!;
  seq += 1;
  company.set("records", { value: JSON.stringify(records), version: item.version + 1, seq });
  return ids;
}

ensureDocumentsSeeded();
ensureMasterSeeded();
// Stopped whatever happens below: a failing test must end this file, not leave the session's poll running for ever.
after(() => stopServerSync());

let template: RecordInstance;

test("signing in with the database's records larger than the room: kept in IndexedDB, never 'full', and there after a reload", async () => {
  await openRoom();
  assert.equal(roomOpen(), true, "the room is open on the browser's IndexedDB");
  await startServerSync("person-1");
  template = createRecordForDocument(documentRepository.getById("mnt-new-equipment")!, { dateISO: "2026-10-06" }).record;
  await until("the first record reaches the database", () => inDatabase(template.id), 15000);
  await stopServerSync();

  // Colleagues fill the database past what this browser's localStorage can take.
  const theirs = growTheDatabase(template, 400, "rec-colleague");
  roomFor = used() + 20_000;
  assert.ok(company.get("records")!.value.length > roomFor, "the database's records alone are larger than the room");
  said.length = 0;

  await startServerSync("person-1");
  assert.ok(recordRepository.getById(theirs[0]) && recordRepository.getById(theirs[theirs.length - 1]), "every colleague's record opens");
  assert.ok(recordRepository.getById(template.id), "...and the one from before");
  assert.equal(roomKept("dcrs:v1:records"), true, "the records are kept in IndexedDB");
  await roomIdle();
  const kept = inIndexedDB("dcrs:v1:records") ?? "";
  assert.ok(theirs.every((id) => kept.includes(`"${id}"`)) && kept.includes(`"${template.id}"`), "IndexedDB has every record");
  assert.ok(inIndexedDB("dcrs:sync:records"), "...with the marker that belongs to them");
  await until("the old copy leaves localStorage, with its marker", () => local.getItem("dcrs:v1:records") === null && local.getItem("dcrs:sync:records") === null);
  assert.deepEqual(said, [], "the page is never told the copy is full: nothing is held in memory alone");
  assert.equal(leavingAsks(), false, "leaving asks nothing");

  // Work goes on: a record started now reaches the database and IndexedDB.
  const { record } = createRecordForDocument(documentRepository.getById("str-sharp-metal-objects")!, { dateISO: "2026-10-07" });
  assert.ok(recordRepository.getById(record.id), "the new record opens");
  await until("the new record reaches the database", () => inDatabase(record.id), 15000);
  await roomIdle();
  assert.ok((inIndexedDB("dcrs:v1:records") ?? "").includes(`"${record.id}"`), "...and IndexedDB");
  assert.deepEqual(said, [], "still nothing said about a full copy");
  await until("nothing is left to send", () => !leavingAsks());

  // A reload: a page opened now reads every record from IndexedDB before anything else.
  const reload = new BrowserRoom(browser.env("reload"), "reload");
  await reload.open();
  const read = reload.get("dcrs:v1:records") ?? "";
  assert.ok(read.includes(`"${record.id}"`) && read.includes(`"${theirs[0]}"`) && read.includes(`"${template.id}"`), "after a reload every record is there");
  browser.closeTab("reload");
  await stopServerSync();
});

test("another account signing in clears what the last one may not keep, from IndexedDB as from localStorage", async () => {
  await startServerSync("person-1");
  // Person 1's own conversations, and the HR Master sheet, each larger than the room left.
  const conversations = JSON.stringify([{ id: "c1", title: "Person 1's", messages: [{ text: "x".repeat(60_000) }] }]);
  assert.equal(storage.setItem("assistant-conversations", conversations), true);
  const hr = JSON.stringify({ people: [{ id: "p1", name: "Asha", notes: "y".repeat(60_000) }] });
  assert.equal(storage.setItem("hrMasterData", hr), true);
  assert.equal(roomKept("dcrs:v1:assistant-conversations"), true, "the conversations are kept in IndexedDB");
  assert.equal(roomKept("dcrs:v1:hrMasterData"), true, "...and the HR Master sheet");
  await until("both reach the database", () => personal.get("person-1")?.get("assistant-conversations")?.value === conversations && company.get("hrMasterData")?.value === hr, 15000);
  await roomIdle();
  assert.equal(inIndexedDB("dcrs:v1:assistant-conversations"), conversations);
  await stopServerSync();

  // Person 2 signs in on the same browser: another person's conversations are not handed on, and person 2's
  // departments do not hold the HR Master sheet - each removed exactly as the copy in localStorage is (serverSync.ts).
  said.length = 0;
  await startServerSync("person-2");
  assert.equal(storage.getItem("assistant-conversations"), null, "person 1's conversations are not person 2's to read");
  assert.equal(storage.getItem("hrMasterData"), null, "nor is the HR Master sheet");
  await roomIdle();
  assert.equal(inIndexedDB("dcrs:v1:assistant-conversations"), null, "IndexedDB keeps no copy of the conversations");
  assert.equal(inIndexedDB("dcrs:sync:assistant-conversations"), null, "...nor of their marker");
  assert.equal(inIndexedDB("dcrs:v1:hrMasterData"), null, "...nor of the HR Master sheet");
  const reload = new BrowserRoom(browser.env("reload-2"), "reload-2");
  await reload.open();
  assert.equal(reload.get("dcrs:v1:assistant-conversations"), null, "a reload finds none of it");
  assert.equal(reload.get("dcrs:v1:hrMasterData"), null);
  browser.closeTab("reload-2");
  assert.equal(personal.get("person-1")?.get("assistant-conversations")?.value, conversations, "nothing was removed from the database: they are person 1's there");
  assert.equal(company.get("hrMasterData")?.value, hr, "...and the HR Master sheet is the company's there");
  assert.ok(recordRepository.getById(template.id), "the records person 2 holds open");
  assert.deepEqual(said, []);
  await stopServerSync();
});

test("only when IndexedDB too refuses is the page told the copy is full, then that the record WAS saved; nothing is lost", async () => {
  await startServerSync("person-1");
  said.length = 0;
  browser.disk.refuse = true;
  const { record } = createRecordForDocument(documentRepository.getById("str-sharp-metal-objects")!, { dateISO: "2026-10-08" });
  assert.ok(recordRepository.getById(record.id), "the record opens, from memory");
  await until("the page is told the copy is full", () => said.some((s) => s.name === STORAGE_HELD && s.key === "records"), 15000);
  await until("...and then that the record WAS saved", () => said.some((s) => s.name === STORAGE_HELD_SAVED && s.key === "records"), 15000);
  assert.ok(inDatabase(record.id), "the record is in the database");
  await until("nothing is left to send", () => !leavingAsks());
  assert.ok(!(inIndexedDB("dcrs:v1:records") ?? "").includes(`"${record.id}"`), "IndexedDB did not take it");

  // Room on the disk again: the next save stores everything, the refused record with it.
  browser.disk.refuse = false;
  const next = createRecordForDocument(documentRepository.getById("str-sharp-metal-objects")!, { dateISO: "2026-10-09" }).record;
  await until("the next record reaches the database", () => inDatabase(next.id), 15000);
  await roomIdle();
  const kept = inIndexedDB("dcrs:v1:records") ?? "";
  assert.ok(kept.includes(`"${record.id}"`) && kept.includes(`"${next.id}"`), "IndexedDB has both now");
  assert.equal(roomGet("dcrs:v1:records")?.includes(`"${record.id}"`), true);
  await stopServerSync();
});
