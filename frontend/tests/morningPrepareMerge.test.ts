// THE MORNING PREPARE AND A BROWSER AT THE SAME MOMENT: THE BROWSER'S SIDE (REQUIREMENTS §97). Without a browser: the
// working copy (data/serverSync.ts) in front of a stand-in database.
//
// The server's job (backend/notificationJobs.ts "morning-prepare") makes and prepares the day's sheets while a person
// opens DCRS, whose browser makes and prepares the same sheets under its own ids (record ids are random). Two orders:
//   * the browser saves first: the job's write is refused, worked out again on what is stored, and makes no second
//     sheet (backend/tests/notificationJobs.test.ts);
//   * the job saves first (here): the browser's save is refused (409) and merged with what the job stored. The merge
//     (serverSync.ts mergeRecords, withoutDuplicateBlanks) keeps ONE sheet for each document and period: of two blank
//     or only-prepared sheets, the one with the lower id, the same in every browser; a sheet a person worked on over
//     either. So the plant's records never hold the day's sheet twice.
// Run: npm run test:unit -- morningPrepareMerge
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import type { RecordInstance } from "../src/types";
import { ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { recordRepository } from "../src/data/repositories/recordRepository";
import { startServerSync, stopServerSync } from "../src/data/serverSync";
import { prepareDueRecords } from "../src/engine/assistantPrepare";
import { todayISO } from "../src/utils/date";

(globalThis as unknown as Record<string, unknown>).document = { hidden: false, addEventListener() {}, removeEventListener() {} };

// ---------------------------------------------------------------------------
// the stand-in database: /api/storage as backend/index.ts answers it, with the job saving first

interface Item {
  value: string;
  version: number;
}
const db = new Map<string, Item>();
let seq = 0;
let jobSavedFirst = false;
let jobsCopy: RecordInstance[] = [];
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
  if (url.startsWith("/api/storage") && method === "GET") return json({ items: [], seq, scope: "*" });
  if (url.startsWith("/api/storage/") && method === "PUT") {
    const key = decodeURIComponent(url.slice("/api/storage/".length));
    const base = Number(headers["X-Base-Version"] ?? 0);
    const body = await bodyText(init.body, headers["Content-Encoding"]);
    if (key === "records" && !jobSavedFirst) {
      // THE JOB SAVED FIRST: the same sheets, made and prepared on the server under ids of its own.
      jobSavedFirst = true;
      const browsers = JSON.parse(body) as RecordInstance[];
      jobsCopy = browsers.map((r) => ({ ...r, id: `${r.id}-server` }));
      db.set(key, { value: JSON.stringify(jobsCopy), version: 1 });
      seq += 1;
      return json({ current: { key, value: JSON.stringify(jobsCopy), version: 1, seq }, scope: "*" }, 409);
    }
    const stored = db.get(key);
    if (stored && stored.version !== base) return json({ current: { key, value: stored.value, version: stored.version, seq }, scope: "*" }, 409);
    db.set(key, { value: body, version: (stored?.version ?? 0) + 1 });
    seq += 1;
    return json({ version: (stored?.version ?? 0) + 1, seq });
  }
  if (method === "DELETE") return new Response(null, { status: 204 });
  return new Response("not here", { status: 404 });
};

async function until(what: string, ok: () => boolean, ms = 15000): Promise<void> {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) assert.fail(`waited ${ms} ms: ${what}`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

ensureDocumentsSeeded();
ensureMasterSeeded();
after(() => stopServerSync());

test("the job saved the day's sheets first: the browser's save is merged, one sheet for each document and period", async () => {
  await startServerSync("person-1");
  // What the app's start-up does (data/bootstrap.ts): the near-term sheets made, the blank ones due by today prepared.
  const prepared = prepareDueRecords(todayISO());
  const mine = recordRepository.getAll().filter((r) => r.isDemo === false);
  assert.ok(mine.length > 0, "the browser made the near-term sheets");
  await until("the browser's save was refused, merged and saved again", () => jobSavedFirst && (db.get("records")?.version ?? 0) >= 2);
  const stored = JSON.parse(db.get("records")!.value) as RecordInstance[];
  const periods = new Map<string, string[]>();
  for (const r of stored) {
    if (r.isDemo !== false) continue;
    const k = `${r.documentId}|${r.periodKey}`;
    periods.set(k, [...(periods.get(k) ?? []), r.id]);
  }
  const twice = [...periods.entries()].filter(([, ids]) => ids.length > 1);
  assert.deepEqual(twice, [], "no document and period twice");
  assert.equal(periods.size, new Set(mine.map((r) => `${r.documentId}|${r.periodKey}`)).size, "every sheet once");
  // The same choice in every browser: the lower id of the two.
  for (const r of mine) {
    const kept = periods.get(`${r.documentId}|${r.periodKey}`)![0];
    assert.equal(kept, [r.id, `${r.id}-server`].sort()[0]);
  }
  // A sheet the browser prepared is kept prepared, whichever copy stands.
  for (const p of prepared) {
    const kept = stored.find((r) => r.documentId === p.documentId && r.periodKey === p.periodKey)!;
    assert.equal(kept.status, "In Progress");
    assert.ok(kept.prepared);
  }
  assert.deepEqual(
    recordRepository.getAll().filter((r) => r.isDemo === false).map((r) => r.id).sort(),
    stored.filter((r) => r.isDemo === false).map((r) => r.id).sort(),
    "the browser's own copy is the merged one"
  );
});
