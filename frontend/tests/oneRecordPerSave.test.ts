// ONE RECORD PER SAVE, AND A COLLEAGUE'S SAVE BRINGS ONLY THAT RECORD (REQUIREMENTS §108, its second half). Without a
// browser: the working copy (data/serverSync.ts, data/repositories/recordRepository.ts) in front of a stand-in database
// that keeps the records as one item, as PostgreSQL does, and answers a save of some records and a question with the
// version the browser holds by the very steps the server takes (backend/changeJournal.ts saveLines and answerLines,
// with its change journal). "Another computer" writes to the stand-in as another browser's save would.
//
// Until this change each save sent the whole records item, and each question after anybody's save downloaded it whole
// again. Now:
//   * a save sends the record that changed, and the ids removed;
//   * somebody else's save of another record in between is no 409: both are kept, and the answer hands theirs back;
//   * the same record changed on both: merged as two copies of a record always were, the later standing;
//   * a removal travels;
//   * a colleague's save reaches the open page as that record alone, and the saver is not handed its own save again;
//   * a save that touched thousands of records goes in parts;
//   * a server older than this (no PATCH) gets the whole item, as before.
// Run: npm run test:unit -- oneRecordPerSave
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import type { RecordInstance } from "../src/types";
import { ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { recordRepository } from "../src/data/repositories/recordRepository";
import { startServerSync, stopServerSync } from "../src/data/serverSync";
import { Lines, answerLines, changesBetween, journalRows, lineId, postedChanges, saveLines, type JournalRow } from "../../backend/changeJournal";

(globalThis as unknown as Record<string, unknown>).document = { hidden: false, addEventListener() {}, removeEventListener() {} };

// ---------------------------------------------------------------------------
// the stand-in database

interface Item {
  value: string;
  version: number;
  seq: number;
}
const db = new Map<string, Item>();
const journal: JournalRow[] = [];
let seq = 0;
let patchAnswered = true;

interface Call {
  method: string;
  url: string;
  status: number;
  /** Characters sent. */
  sent: number;
  /** Characters answered. */
  answered: number;
  body?: string;
  headers: Record<string, string>;
  records?: "whole" | "changes";
}
const calls: Call[] = [];
const recordsCalls = () => calls.filter((c) => c.url.startsWith("/api/storage/records"));

function store(key: string, value: string): Item {
  seq += 1;
  const next = { value, version: (db.get(key)?.version ?? 0) + 1, seq };
  db.set(key, next);
  return next;
}

/** A whole write, journaled record by record as backend/db.ts writeItem journals it. */
function writeWhole(key: string, value: string): Item {
  const before = db.get(key);
  const written = store(key, value);
  if (key === "records") {
    const was = before ? Lines.parse(before.value) : null;
    const now = Lines.parse(value);
    const changes = now && (!before || was) ? changesBetween(was, now) : null;
    if (changes) journal.push(...journalRows(written.seq, written.version, changes));
  }
  return written;
}

const span = async (from: number, to: number) => journal.filter((r) => r.seq >= from && r.seq <= to);

/** A save of some records, as PATCH /api/storage/records takes it from somebody who may change every record. */
async function saveRecords(changed: unknown[], removed: string[], base: { version: number; seq: number | null }) {
  const now = db.get("records");
  const ids = [...changed.map((r) => lineId(r)!), ...removed];
  return saveLines(
    {
      key: "records",
      stored: now ? { version: now.version, seq: now.seq } : null,
      lines: () => Lines.parse(now?.value),
      text: () => now!.value,
      span,
      write: async (value) => store("records", value),
      journal: async (rows) => void journal.push(...rows),
    },
    base,
    (stored, behind) => {
      const conflicts = [
        ...changed.filter((r) => behind.has(lineId(r)!) && stored.textOf(lineId(r)!) !== JSON.stringify(r)).map((r) => lineId(r)!),
        ...removed.filter((id) => behind.has(id) && stored.get(id) !== undefined),
      ];
      if (conflicts.length) return { conflicts };
      return { lines: stored.with(changed, removed), touched: ids };
    }
  );
}

const handed = (lines: Lines, ids: Iterable<string>) => {
  const changed: unknown[] = [];
  const removed: string[] = [];
  for (const id of new Set(ids)) {
    const line = lines.get(id);
    if (line === undefined) removed.push(id);
    else changed.push(line);
  }
  return { changed, removed };
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function bodyText(body: unknown, encoding: string | undefined): Promise<string> {
  if (body === undefined || body === null) return "";
  if (typeof body === "string") return body;
  const bytes = Buffer.from(body as ArrayBuffer);
  return encoding === "gzip" ? gunzipSync(bytes).toString("utf-8") : bytes.toString("utf-8");
}

async function answer(url: string, method: string, headers: Record<string, string>, body: string): Promise<{ res: Response; records?: "whole" | "changes" }> {
  if (url.startsWith("/api/activity")) return { res: new Response(null, { status: 204 }) };
  if (url.startsWith("/api/storage") && method === "GET") {
    const since = Number(new URL(url, "http://x").searchParams.get("since") ?? 0);
    const anchor = headers["X-Records-Version"] ? { version: Number(headers["X-Records-Version"]), seq: Number(headers["X-Records-Seq"]) } : null;
    const now = db.get("records");
    const lines = anchor ? await answerLines(now ? { version: now.version, seq: now.seq } : null, anchor, span, () => Lines.parse(now?.value)) : null;
    const items: unknown[] = [];
    const versions: Record<string, number> = {};
    for (const [key, item] of db) {
      versions[key] = item.version;
      if (item.seq > since && !(lines && key === "records")) items.push({ key, ...item });
    }
    let records: "whole" | "changes" | undefined = items.some((i) => (i as { key: string }).key === "records") ? "whole" : undefined;
    if (lines?.kind === "changes") {
      items.push({ key: "records", version: lines.version, seq: lines.seq, changes: { from: anchor!.version, ...handed(lines.lines, lines.ids) } });
      records = "changes";
    }
    return { res: json({ items, seq, versions, scope: "*" }), records };
  }
  if (url.startsWith("/api/storage/") && method === "PUT") {
    const key = decodeURIComponent(url.slice("/api/storage/".length));
    const base = Number(headers["X-Base-Version"] ?? 0);
    const stored = db.get(key);
    if (stored ? stored.version !== base : base !== 0) return { res: json({ current: stored ? { key, ...stored } : null, scope: "*" }, 409) };
    const written = writeWhole(key, body);
    return { res: json({ version: written.version, seq: written.seq }) };
  }
  if (url === "/api/storage/records" && method === "PATCH" && patchAnswered) {
    const posted = postedChanges(JSON.parse(body));
    if (!posted) return { res: json({ error: "bad" }, 400) };
    const base = { version: Number(headers["X-Base-Version"]), seq: headers["X-Base-Seq"] ? Number(headers["X-Base-Seq"]) : null };
    const result = await saveRecords(posted.changed, posted.removed, base);
    if (result.kind === "whole") return { res: json({ current: result.current, scope: "*" }, 409) };
    if (result.kind === "conflict") return { res: json({ changes: { from: base.version, ...handed(result.lines, result.behind) }, version: result.version, seq: result.seq, conflicts: result.conflicts, scope: "*" }, 409) };
    return { res: json({ version: result.version, seq: result.seq, changes: { from: base.version, ...handed(result.lines, result.behind) } }) };
  }
  if (method === "DELETE") return { res: new Response(null, { status: 204 }) };
  return { res: new Response("not here", { status: 404 }) };
}

(globalThis as unknown as Record<string, unknown>).fetch = async (input: string, init: RequestInit = {}) => {
  const url = String(input);
  const method = (init.method ?? "GET").toUpperCase();
  const headers = (init.headers ?? {}) as Record<string, string>;
  const body = await bodyText(init.body, headers["Content-Encoding"]);
  const { res, records } = await answer(url, method, headers, body);
  const text = await res.clone().text();
  calls.push({ method, url, status: res.status, sent: body.length, answered: text.length, body: url.startsWith("/api/storage/records") ? body : undefined, headers, records });
  return res;
};

// ---------------------------------------------------------------------------

const record = (n: number, extra: Partial<RecordInstance> = {}): RecordInstance => ({
  id: `r-${n}`,
  documentId: "qc-viscosity",
  periodKey: `qc-viscosity:2026-09-${String((n % 28) + 1).padStart(2, "0")}#${n}`,
  dueDate: `2026-09-${String((n % 28) + 1).padStart(2, "0")}`,
  status: "Verified",
  isDemo: false,
  data: { reading: n, remarks: "x".repeat(400) },
  createdAt: "2026-09-01T03:00:00.000Z",
  updatedAt: "2026-09-01T03:00:00.000Z",
  ...extra,
});

/** Another computer's save of one record, made from what the database holds now. */
async function elsewhere(change: RecordInstance): Promise<void> {
  const now = db.get("records")!;
  const result = await saveRecords([change], [], { version: now.version, seq: now.seq });
  assert.equal(result.kind, "written");
}

const dataOf = (r: RecordInstance) => r.data as Record<string, unknown>;
const storedRecord = (id: string) => (JSON.parse(db.get("records")!.value) as RecordInstance[]).find((r) => r.id === id);

async function until(what: string, ok: () => boolean, ms = 10000): Promise<void> {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) assert.fail(`waited ${ms} ms: ${what}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

/** Until nothing of the working copy is on its way: the last call answered, nothing waiting a moment later. */
async function settled(): Promise<void> {
  let count = -1;
  while (count !== calls.length) {
    count = calls.length;
    await new Promise((r) => setTimeout(r, 700));
  }
}

/** The window coming back into focus: the copy asks the database what has changed. */
async function lookAgain(): Promise<Call> {
  const before = calls.length;
  window.dispatchEvent(new Event("focus"));
  await until("the copy asks what changed", () => calls.slice(before).some((c) => c.method === "GET" && c.url.startsWith("/api/storage?since=")));
  await settled();
  return calls.slice(before).find((c) => c.method === "GET" && c.url.startsWith("/api/storage?since="))!;
}

ensureDocumentsSeeded();
ensureMasterSeeded();
after(() => stopServerSync());

const PLANT = 300;

test("a save sends the one record that changed, and the database keeps every other record as it was", async (t) => {
  writeWhole("records", JSON.stringify(Array.from({ length: PLANT }, (_, i) => record(i))));
  await startServerSync("person-1");
  await settled();
  assert.equal(recordRepository.getAll().length, PLANT);
  calls.length = 0;

  const r5 = recordRepository.getById("r-5")!;
  recordRepository.upsert({ ...r5, data: { ...dataOf(r5), reading: 5005 } });
  await until("the change reaches the database", () => (storedRecord("r-5")?.data as { reading?: number }).reading === 5005);
  await settled();

  const saves = recordsCalls();
  assert.deepEqual(saves.map((c) => `${c.method} ${c.status}`), ["PATCH 200"], "one save, of the records that changed, taken");
  const sent = JSON.parse(saves[0].body!) as { changed: RecordInstance[]; removed: string[] };
  assert.deepEqual(sent.changed.map((r) => r.id), ["r-5"]);
  assert.deepEqual(sent.removed, []);
  const whole = db.get("records")!.value.length;
  assert.ok(saves[0].sent < 2000, `the save is ${saves[0].sent} characters`);
  t.diagnostic(`one record saved: ${saves[0].sent} characters sent, where the whole records item is ${whole}`);
  assert.equal(JSON.parse(db.get("records")!.value).length, PLANT, "every other record still there");
  assert.equal(db.get("records")!.value, JSON.stringify(recordRepository.getAll()), "the database's copy is this browser's, to the character");
});

test("somebody else's save of another record in between: no 409, both kept, and theirs handed back with the answer", async () => {
  calls.length = 0;
  await elsewhere({ ...record(10), data: { reading: 1010 }, updatedAt: "2026-10-10T05:00:00.000Z" });
  const r11 = recordRepository.getById("r-11")!;
  recordRepository.upsert({ ...r11, data: { ...dataOf(r11), reading: 1111 } });
  await until("both in the database", () => (storedRecord("r-11")?.data as { reading?: number }).reading === 1111);
  await settled();
  assert.deepEqual(recordsCalls().map((c) => `${c.method} ${c.status}`), ["PATCH 200"], "no 409, nothing sent twice");
  assert.equal((storedRecord("r-10")!.data as { reading: number }).reading, 1010, "theirs kept in the database");
  assert.equal((recordRepository.getById("r-10")!.data as { reading: number }).reading, 1010, "...and handed to this copy with the answer");
  assert.equal(db.get("records")!.value.length, JSON.stringify(recordRepository.getAll()).length);
});

test("the same record changed here and elsewhere: merged as before, the later standing", async () => {
  // Elsewhere later than here: theirs stands, and nothing of this copy's goes again.
  calls.length = 0;
  await elsewhere({ ...record(12), data: { reading: 1212, by: "them" }, updatedAt: "2099-01-01T00:00:00.000Z" });
  const r12 = recordRepository.getById("r-12")!;
  recordRepository.upsert({ ...r12, data: { ...dataOf(r12), reading: 12, by: "me" } });
  await until("theirs reaches this copy", () => (recordRepository.getById("r-12")!.data as { by?: string }).by === "them");
  await settled();
  assert.deepEqual(recordsCalls().map((c) => `${c.method} ${c.status}`), ["PATCH 409"], "refused once, merged, nothing sent again");
  assert.equal((storedRecord("r-12")!.data as { by: string }).by, "them");

  // Here later than elsewhere: this copy's stands, and is sent again from the version the database is at.
  calls.length = 0;
  await elsewhere({ ...record(13), data: { reading: 1313, by: "them" }, updatedAt: "2000-01-01T00:00:00.000Z" });
  const r13 = recordRepository.getById("r-13")!;
  recordRepository.upsert({ ...r13, data: { ...dataOf(r13), by: "me" } });
  await until("this copy's reaches the database", () => (storedRecord("r-13")?.data as { by?: string }).by === "me");
  await settled();
  assert.deepEqual(recordsCalls().map((c) => `${c.method} ${c.status}`), ["PATCH 409", "PATCH 200"]);
  assert.equal((recordRepository.getById("r-13")!.data as { by: string }).by, "me");
});

test("a removal travels as its id", async () => {
  calls.length = 0;
  recordRepository.remove("r-20");
  await until("gone from the database", () => !storedRecord("r-20"));
  await settled();
  const saves = recordsCalls();
  assert.deepEqual(saves.map((c) => `${c.method} ${c.status}`), ["PATCH 200"]);
  assert.deepEqual(JSON.parse(saves[0].body!), { changed: [], removed: ["r-20"] });
});

test("a colleague's save reaches this copy as that record alone, and the saver is not handed its own save again", async (t) => {
  await settled();
  // In step with everything first (the items this browser stored at sign-in come back once, whole, as before).
  await lookAgain();
  await elsewhere({ ...record(30), data: { reading: 3030 }, updatedAt: "2026-10-10T06:00:00.000Z" });
  const asked = await lookAgain();
  assert.ok(asked.headers["X-Records-Version"], "the question says which records this copy holds");
  assert.equal(asked.records, "changes", "the answer is the records changed, not the whole item");
  assert.equal((recordRepository.getById("r-30")!.data as { reading: number }).reading, 3030);
  assert.ok(asked.answered < 3000, `the answer is ${asked.answered} characters`);
  t.diagnostic(`a colleague's save of one record: ${asked.answered} characters handed over, where the whole records item is ${db.get("records")!.value.length}`);

  const r31 = recordRepository.getById("r-31")!;
  recordRepository.upsert({ ...r31, data: { ...dataOf(r31), reading: 3131 } });
  await until("saved", () => (storedRecord("r-31")?.data as { reading?: number }).reading === 3131);
  await settled();
  const after = await lookAgain();
  assert.equal(after.records, undefined, "its own save is not handed back to it");
  assert.equal(db.get("records")!.value, JSON.stringify(recordRepository.getAll()), "the copy is the database's, to the character");
});

test("a save that touched thousands of records goes in parts, every one stored", async () => {
  calls.length = 0;
  const many = Array.from({ length: 2600 }, (_, i) => record(PLANT + i, { data: { reading: i, remarks: "y".repeat(400) } }));
  recordRepository.upsertMany(many);
  await until("every one in the database", () => JSON.parse(db.get("records")!.value).length >= PLANT - 1 + 2600, 20000);
  await settled();
  const saves = recordsCalls();
  assert.ok(saves.length >= 2 && saves.every((c) => c.method === "PATCH" && c.status === 200), saves.map((c) => `${c.method} ${c.status} ${c.sent}`).join(", "));
  assert.ok(saves.every((c) => c.sent <= 1_100_000), "each part a million characters or so at most");
  assert.equal(db.get("records")!.value, JSON.stringify(recordRepository.getAll()));
});

test("signing in again with a copy in step: the records are not downloaded again, and a colleague's save meanwhile comes as that record", async () => {
  await settled();
  await stopServerSync();
  let mark = calls.length;
  await startServerSync("person-1");
  await settled();
  const signIn = () => calls.slice(mark).find((c) => c.method === "GET" && c.url === "/api/storage")!;
  assert.ok(signIn().headers["X-Records-Version"], "the sign-in says which records this browser holds");
  assert.equal(signIn().records, undefined, "and is handed none: the copy is the database's");
  assert.equal(db.get("records")!.value, JSON.stringify(recordRepository.getAll()), "the app opens on every record, to the character");

  await stopServerSync();
  await elsewhere({ ...record(50), data: { reading: 5050 }, updatedAt: "2026-10-10T07:00:00.000Z" });
  mark = calls.length;
  await startServerSync("person-1");
  await settled();
  assert.equal(signIn().records, "changes", "the next sign-in is handed the record changed since, not the whole item");
  assert.equal((recordRepository.getById("r-50")!.data as { reading: number }).reading, 5050);
  assert.equal(db.get("records")!.value, JSON.stringify(recordRepository.getAll()));
});

test("a server older than this (no save of single records): the records go whole, as before", async () => {
  patchAnswered = false;
  calls.length = 0;
  const r40 = recordRepository.getById("r-40")!;
  recordRepository.upsert({ ...r40, data: { ...dataOf(r40), reading: 4040 } });
  await until("stored whole", () => (storedRecord("r-40")?.data as { reading?: number }).reading === 4040);
  await settled();
  assert.deepEqual(recordsCalls().map((c) => `${c.method} ${c.status}`), ["PATCH 404", "PUT 200"]);
});
