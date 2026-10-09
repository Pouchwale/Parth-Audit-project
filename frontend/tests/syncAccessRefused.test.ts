// A CHANGE THE PERSON'S LEVEL DOES NOT ALLOW, REFUSED BY THE SERVER (REQUIREMENTS §96). Without a browser: the
// working copy (data/serverSync.ts) in front of a stand-in database that checks the records as backend/accessLevels.ts
// does and answers 403 "access-level" with the level in words.
//
// The screens offer no step above the person's level, so this happens only in a race: the super admin changed the
// levels while the page was open. Before, any 403 made the browser give the item up for the session, so every later
// change of the person's own records stayed on this computer and never reached the database, without a word. Now:
//   * the person is told why, in the server's words (an event the sync banner shows);
//   * the refused change is dropped: the copy goes back to what the database holds;
//   * the records keep syncing: the next allowed change reaches the database.
// Run: npm run test:unit -- syncAccessRefused
import test, { after } from "node:test";
import assert from "node:assert/strict";
import type { RecordInstance } from "../src/types";
import { ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { recordRepository } from "../src/data/repositories/recordRepository";
import { ACCESS_REFUSED_EVENT, startServerSync, stopServerSync } from "../src/data/serverSync";

(globalThis as unknown as Record<string, unknown>).document = { hidden: false, addEventListener() {}, removeEventListener() {} };

const REFUSED_DOCUMENT = "hr-daily-cleaning";
const WORDS = "F/HR/15 Daily Cleaning Record is Read only for you. Ask the super admin for Write access.";

const db = new Map<string, { value: string; version: number }>();
const puts: { key: string; ok: boolean; body: string }[] = [];
let seq = 1;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

(globalThis as unknown as Record<string, unknown>).fetch = async (input: string, init: RequestInit = {}) => {
  const url = String(input);
  const method = (init.method ?? "GET").toUpperCase();
  const headers = (init.headers ?? {}) as Record<string, string>;
  if (url.startsWith("/api/activity")) return new Response(null, { status: 204 });
  if (url === "/api/storage" && method === "GET") {
    const items = [...db].map(([key, v]) => ({ key, value: v.value, version: v.version, seq }));
    return json({ items, seq, scope: "levels-1" });
  }
  if (url.startsWith("/api/storage?since=") && method === "GET") return json({ items: [], seq, scope: "levels-1" });
  if (url.startsWith("/api/storage/") && method === "PUT") {
    const key = decodeURIComponent(url.slice("/api/storage/".length));
    const body = typeof init.body === "string" ? init.body : Buffer.from(init.body as ArrayBuffer).toString("utf-8");
    const base = Number(headers["X-Base-Version"] ?? 0);
    const stored = db.get(key);
    if (key === "records") {
      const was = new Set((JSON.parse(stored?.value ?? "[]") as RecordInstance[]).map((r) => JSON.stringify(r)));
      const changed = (JSON.parse(body) as RecordInstance[]).filter((r) => !was.has(JSON.stringify(r)));
      if (changed.some((r) => r.documentId === REFUSED_DOCUMENT)) {
        puts.push({ key, ok: false, body });
        return json({ error: WORDS, code: "access-level", documentId: REFUSED_DOCUMENT, level: "read", needed: "write", action: "fill" }, 403);
      }
    }
    if (stored && stored.version !== base) return json({ current: { key, value: stored.value, version: stored.version, seq }, scope: "levels-1" }, 409);
    const next = { value: body, version: (stored?.version ?? 0) + 1 };
    db.set(key, next);
    seq += 1;
    puts.push({ key, ok: true, body });
    return json({ version: next.version, seq });
  }
  if (method === "DELETE") return new Response(null, { status: 204 });
  return new Response("not here", { status: 404 });
};

const record = (id: string, documentId: string, status: RecordInstance["status"] = "In Progress"): RecordInstance => ({
  id,
  documentId,
  periodKey: `${documentId}:2026-10-12:${id}`,
  dueDate: "2026-10-12",
  status,
  isDemo: false,
  data: {},
  createdAt: "2026-10-12T03:00:00.000Z",
  updatedAt: "2026-10-12T03:00:00.000Z",
});

async function until(what: string, ok: () => boolean, ms = 10000): Promise<void> {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) assert.fail(`waited ${ms} ms: ${what}`);
    await new Promise((r) => setTimeout(r, 40));
  }
}

const refusals: string[] = [];
window.addEventListener(ACCESS_REFUSED_EVENT, (e) => refusals.push((e as CustomEvent<{ message: string }>).detail.message));

ensureDocumentsSeeded();
ensureMasterSeeded();
after(() => stopServerSync());

test("a refused change is said, dropped, and the person's records keep reaching the database", async () => {
  // What the database holds: one record of the person's own document, one they may only read.
  db.set("records", { value: JSON.stringify([record("rec-own", "hr-competence"), record("rec-read", REFUSED_DOCUMENT)]), version: 1 });
  await startServerSync("vinay");
  assert.ok(recordRepository.getById("rec-read"), "the working copy holds the database's records");

  // A change to the record of the document the person may only read: refused by the server.
  const read = recordRepository.getById("rec-read")!;
  recordRepository.upsert({ ...read, data: { remarks: "changed" }, updatedAt: "2026-10-12T05:00:00.000Z" });
  await until("the refusal is said", () => refusals.length === 1);
  assert.equal(refusals[0], WORDS);
  await until("the copy goes back to what the database holds", () => {
    const now = recordRepository.getById("rec-read");
    return !!now && JSON.stringify(now.data) === "{}";
  });

  // The next change of the person's own record still reaches the database.
  const own = recordRepository.getById("rec-own")!;
  recordRepository.upsert({ ...own, data: { remarks: "mine" }, updatedAt: "2026-10-12T06:00:00.000Z" });
  await until("the person's own change is stored", () => (JSON.parse(db.get("records")!.value) as RecordInstance[]).some((r) => r.id === "rec-own" && (r.data as { remarks?: string }).remarks === "mine"));
  const stored = JSON.parse(db.get("records")!.value) as RecordInstance[];
  assert.equal(JSON.stringify(stored.find((r) => r.id === "rec-read")!.data), "{}", "the refused change never reached the database");
});
