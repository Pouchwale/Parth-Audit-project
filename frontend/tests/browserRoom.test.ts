// THE BROWSER'S ROOM (REQUIREMENTS §108): what does not fit in localStorage is kept in IndexedDB, and nothing is lost.
// Without a browser: data/browserRoom.ts over a stand-in IndexedDB, BroadcastChannel and navigator.locks
// (tests/support/fakeBrowserRoom.ts) and a localStorage with a fixed room.
//
// The owner, 9-Oct-2026, with a picture of "This browser's copy is full - your record WAS saved ... Make room in this
// browser before you close or reload the page", "which is coming again and again so fix it also without any loss".
// Until §108 a value that did not fit was held in the page's memory alone, so every reload found the browser full
// again. Now:
//
//   * a value larger than the room is kept in IndexedDB, read from memory at once, and read back after a reload;
//     a small one stays in localStorage exactly as before;
//   * the writes reach IndexedDB in order: the latest of a value wins, and a value and its marker are stored together,
//     so the browser never holds a newer marker beside an older value - not even when the page is closed mid-way;
//   * once IndexedDB has stored a value, its old copy in localStorage is removed, with its marker's, to free the room -
//     only while no other tab of the app is open;
//   * a value kept in IndexedDB is not tried in localStorage again while it is large; small again, it goes back there;
//   * another tab learns of a change (BroadcastChannel); two tabs writing at once end with the same value, here and in
//     IndexedDB; a tab opening while another's write is on its way is handed it;
//   * when IndexedDB refuses, the value stays in memory, the page is told which, and the next write tries again;
//     without IndexedDB at all, the caller is told it did not fit, as before (§93 holds it in memory).
// Run: npm run test:unit -- browserRoom
import test from "node:test";
import assert from "node:assert/strict";
import { BrowserRoom, LARGE_CHARS } from "../src/data/browserRoom";
import { FakeBrowser, RoomedStorage, turns, until } from "./support/fakeBrowserRoom";

const RECORDS = "dcrs:v1:records";
const MARKER = "dcrs:sync:records";

/** A records value of about `size` characters, telling which write it was. */
const value = (gen: number, size = 3000) => `[{"gen":${gen},"pad":"${"x".repeat(Math.max(0, size - 30))}"}]`;
const marker = (gen: number) => JSON.stringify({ s: "company", v: gen, h: `h${gen}`, t: "2026-10-10T09:00:00.000Z" });
const genOf = (text: unknown): number => {
  if (typeof text !== "string") return -1;
  const m = /"(?:gen|v)":(\d+)/.exec(text);
  return m ? Number(m[1]) : -1;
};
/** What IndexedDB holds for a name: its value, or null (removed or never there). */
const stored = (browser: FakeBrowser, name: string): string | null => {
  const entry = browser.disk.data.get(name) as { v: string | null } | undefined;
  return entry ? entry.v : null;
};

async function openTab(browser: FakeBrowser, tab: string, withIndexedDB = true): Promise<BrowserRoom> {
  const room = new BrowserRoom(browser.env(tab, withIndexedDB), tab);
  await room.open();
  return room;
}

test("a value larger than the room is kept in IndexedDB, read at once, and read back after a reload; a small one stays in localStorage", async () => {
  const browser = new FakeBrowser();
  browser.storage.room = 2000;
  const room = await openTab(browser, "tab-1");
  assert.equal(room.isOpen, true);

  const big = value(1, 5000);
  assert.equal(room.set(RECORDS, big), true, "kept, not refused");
  assert.equal(room.get(RECORDS), big, "read back at once, from memory");
  assert.equal(browser.storage.getItem(RECORDS), null, "localStorage has no room for it");
  assert.equal(room.set("dcrs:v1:settings", "{}"), true);
  assert.equal(browser.storage.getItem("dcrs:v1:settings"), "{}", "a small value goes to localStorage, as before");
  await room.idle();
  assert.equal(stored(browser, RECORDS), big, "IndexedDB has it");
  assert.equal(browser.disk.data.has("dcrs:v1:settings"), false, "...and not the small one");
  assert.deepEqual(room.names("dcrs:v1:").sort(), ["dcrs:v1:records", "dcrs:v1:settings"]);

  // A reload: a new page over the same browser.
  browser.closeTab("tab-1");
  const again = await openTab(browser, "tab-2");
  assert.equal(again.get(RECORDS), big, "after a reload the value is there, read before anything else");
  assert.equal(again.get("dcrs:v1:settings"), "{}");
});

test("the writes reach IndexedDB in order: the latest wins, and a value and its marker are stored together", async () => {
  const browser = new FakeBrowser();
  // The page's copy fits at first, with its marker.
  browser.storage.setItem(RECORDS, value(0, 500));
  browser.storage.setItem(MARKER, marker(0));
  browser.storage.room = browser.storage.used() + 200;
  const room = await openTab(browser, "tab-1");

  // What serverSync.ts does: a value written, then its marker; again and again, while IndexedDB is still storing.
  for (let gen = 1; gen <= 6; gen++) {
    assert.equal(room.set(RECORDS, value(gen)), true);
    assert.equal(room.set(MARKER, marker(gen)), true);
    if (gen % 2 === 0) await turns(3); // some writes land while a transaction is on its way
  }
  assert.equal(room.isKept(MARKER), true, "the marker followed its value into IndexedDB");
  await room.idle();
  assert.equal(genOf(stored(browser, RECORDS)), 6, "the latest value is stored");
  assert.equal(genOf(stored(browser, MARKER)), 6, "...with the latest marker");
  assert.ok(browser.disk.history.length >= 2, "in more than one transaction");
  for (const [i, state] of browser.disk.history.entries()) {
    const v = genOf((state.get(RECORDS) as { v: string } | undefined)?.v);
    const m = genOf((state.get(MARKER) as { v: string } | undefined)?.v);
    assert.ok(m <= v, `stored state ${i}: marker ${m} beside value ${v} - never a newer marker beside an older value`);
  }
});

test("a page closed while its writes are on their way: the next one finds a value and marker that belong together", async () => {
  const browser = new FakeBrowser();
  browser.storage.setItem(RECORDS, value(0, 500));
  browser.storage.setItem(MARKER, marker(0));
  browser.storage.room = browser.storage.used() + 200;
  const room = await openTab(browser, "tab-1");
  room.set(RECORDS, value(1));
  room.set(MARKER, marker(1));
  await room.idle();
  browser.disk.holdWrites = true;
  room.set(RECORDS, value(2));
  await turns(3);
  room.set(MARKER, marker(2));
  room.set(RECORDS, value(3));
  await turns(3);
  browser.disk.dropWaiting(); // the page is closed: what was not stored never is
  browser.disk.holdWrites = false;
  browser.closeTab("tab-1");

  const next = await openTab(browser, "tab-2");
  const v = genOf(next.get(RECORDS));
  const m = genOf(next.get(MARKER));
  assert.equal(v, 1, "the value as last stored");
  assert.equal(m, 1, "...and the marker that belongs to it");
});

test("once IndexedDB has the value, its old copy in localStorage is removed with its marker's - only while no other tab is open", async () => {
  // Another tab of the app is open: the copies stay.
  const browser = new FakeBrowser();
  browser.storage.setItem(RECORDS, value(0, 1500));
  browser.storage.setItem(MARKER, marker(0));
  browser.storage.setItem("dcrs:v1:documents", "[]");
  browser.storage.room = browser.storage.used() + 100;
  const other = await openTab(browser, "tab-0");
  const room = await openTab(browser, "tab-1");
  room.set(RECORDS, value(1));
  await room.idle();
  await turns(20);
  assert.equal(genOf(browser.storage.getItem(RECORDS)), 0, "another tab could be reading it: the old copy stays");
  assert.equal(genOf(other.get(RECORDS)), 1, "...though that tab reads the new value already");

  // That tab is closed; the next write is stored, and the room is made.
  browser.closeTab("tab-0");
  room.set(RECORDS, value(2));
  await room.idle();
  await until("the old copies are removed", () => browser.storage.getItem(RECORDS) === null);
  assert.equal(browser.storage.getItem(MARKER), null, "...the marker's with it, never one without the other");
  assert.equal(browser.storage.getItem("dcrs:v1:documents"), "[]", "everything else stays where it was");
  assert.equal(genOf(room.get(RECORDS)), 2);
  assert.equal(genOf(room.get(MARKER)), 0, "the marker is read from IndexedDB's copy");
  assert.ok(browser.storage.used() < 200, "the room is free for the small values");
});

test("a value kept in IndexedDB is not tried in localStorage again while it is large; small again, it goes back", async () => {
  const browser = new FakeBrowser();
  browser.storage.room = 4000;
  const room = await openTab(browser, "tab-1");
  room.set(RECORDS, value(1, LARGE_CHARS + 10));
  await room.idle();
  const asked = browser.storage.asked.filter((k) => k === RECORDS).length;
  room.set(RECORDS, value(2, LARGE_CHARS + 20));
  room.set(RECORDS, value(3, LARGE_CHARS + 30));
  assert.equal(browser.storage.asked.filter((k) => k === RECORDS).length, asked, "localStorage is not asked again while it is large");
  room.set(MARKER, marker(3));
  assert.equal(browser.storage.getItem(MARKER), null, "its marker stays with it in IndexedDB, though it is small");
  await room.idle();

  room.set(RECORDS, "[]");
  assert.equal(browser.storage.getItem(RECORDS), "[]", "small again: back in localStorage");
  assert.equal(room.isKept(RECORDS), false);
  await room.idle();
  assert.equal(stored(browser, RECORDS), null, "...and IndexedDB's copy is removed behind it");
  browser.closeTab("tab-1");
  const next = await openTab(browser, "tab-2");
  assert.equal(next.get(RECORDS), "[]", "after a reload it is read from localStorage");
});

test("another tab learns of a change, and two tabs writing at once end with the same value, there and in IndexedDB", async () => {
  const browser = new FakeBrowser();
  browser.storage.room = 1500;
  const a = await openTab(browser, "tab-a");
  const b = await openTab(browser, "tab-b");
  const told: string[] = [];
  b.onChange((name) => told.push(name));

  a.set(RECORDS, value(1));
  await until("tab b is told", () => told.includes(RECORDS));
  assert.equal(genOf(b.get(RECORDS)), 1, "tab b reads tab a's value");

  b.set(RECORDS, value(2));
  await until("tab a reads tab b's value", () => genOf(a.get(RECORDS)) === 2);

  // At the same moment, each its own.
  a.set(RECORDS, value(3));
  b.set(RECORDS, value(4));
  await turns(30);
  await a.idle();
  await b.idle();
  await turns(10);
  assert.equal(a.get(RECORDS), b.get(RECORDS), "both tabs end with the same value");
  assert.equal(stored(browser, RECORDS), a.get(RECORDS), "...and so does IndexedDB");
});

test("a tab opening while another's write is on its way is handed it", async () => {
  const browser = new FakeBrowser();
  browser.storage.room = 1500;
  const a = await openTab(browser, "tab-a");
  browser.disk.holdWrites = true;
  a.set(RECORDS, value(7));
  await turns(5);
  // The new tab reads IndexedDB before tab a's write is stored.
  const c = await openTab(browser, "tab-c");
  await until("tab c is handed the value", () => genOf(c.get(RECORDS)) === 7);
  browser.disk.release();
  await a.idle();
  assert.equal(genOf(stored(browser, RECORDS)), 7);
});

test("IndexedDB refusing: the value stays in memory, the page is told, the older copy is left as it was, and the next write tries again", async () => {
  const browser = new FakeBrowser();
  browser.storage.setItem(RECORDS, value(0, 500));
  browser.storage.setItem(MARKER, marker(0));
  browser.storage.room = browser.storage.used() + 100;
  const room = await openTab(browser, "tab-1");
  const refused: string[][] = [];
  room.onRefused((names) => refused.push(names));
  browser.disk.refuse = true;

  assert.equal(room.set(RECORDS, value(1)), true);
  room.set(MARKER, marker(1));
  await until("the page is told", () => refused.length > 0);
  assert.ok(refused[0].includes(RECORDS), "the records are named");
  assert.equal(genOf(room.get(RECORDS)), 1, "this page goes on with the change, from memory");
  assert.equal(room.busy, false, "nothing is said to be on its way");
  assert.equal(genOf(browser.storage.getItem(RECORDS)), 0, "the older copy is left in localStorage, as it was");
  assert.equal(genOf(browser.storage.getItem(MARKER)), 0, "...with the marker that belongs to it");

  // A reload now would find the older pair, and take the database's newer copy at sign-in (data/serverSync.ts).
  assert.equal(stored(browser, RECORDS), null, "nothing of the refused value in IndexedDB");
  assert.equal(stored(browser, MARKER), null, "...nor of its marker");

  // Room on the disk again: the next write takes everything still waiting with it.
  browser.disk.refuse = false;
  room.set(MARKER, marker(2));
  await room.idle();
  assert.equal(genOf(stored(browser, RECORDS)), 1, "the refused value is stored with the next write");
  assert.equal(genOf(stored(browser, MARKER)), 2);
});

test("without IndexedDB, what does not fit is refused to the caller as before (data/serverSync.ts holds it in memory, §93)", async () => {
  const browser = new FakeBrowser(new RoomedStorage());
  browser.storage.room = 1000;
  const room = await openTab(browser, "tab-1", false);
  assert.equal(room.isOpen, false);
  assert.equal(room.set(RECORDS, value(1)), false, "not kept: the caller holds it");
  assert.equal(room.set("dcrs:v1:settings", "{}"), true, "what fits goes to localStorage");
  assert.equal(room.get(RECORDS), null);
});
