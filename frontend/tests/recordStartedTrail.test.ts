// EVERY RECORD A PERSON STARTS IS IN THE ACTIVITY LOG (REQUIREMENTS §62, §93).
//
// New record and Start this record go through engine/recordCrud.ts, which has
// always written "Record started". The start map of 07-Oct-2026 found six
// starts that build their own record instead and wrote nothing: the internal
// CAPA findings report and the Complaint Acknowledgement (pages/GapPage.tsx),
// the customer complaint (pages/CapaPage.tsx), the training record
// (pages/TrainingPage.tsx), the pest control responsibilities
// (pages/PestControlPages.tsx) and the service agreement's "Draft it for me"
// and upload (engine/serviceAgreement.ts). Each now writes the line through
// engine/recordHistory.ts logRecordStarted, as New does.
// Run: npm run test:unit -- recordStartedTrail
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { ActivityEvent } from "../src/utils/activityLog";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { createAgreement } from "../src/engine/serviceAgreement";
import { createRecordForDocument } from "../src/engine/recordCrud";
import { SA_DOC_ID } from "../src/data/seed/serviceAgreement";

ensureDocumentsSeeded();
ensureMasterSeeded();

/** The activity lines the page sends to /api/activity while `act` runs. */
async function linesSentBy(act: () => void): Promise<ActivityEvent[]> {
  mock.timers.enable({ apis: ["setTimeout"] });
  const sent: ActivityEvent[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: unknown, init?: { body?: unknown }) => {
    if (String(url).includes("/api/activity")) sent.push(...(JSON.parse(String(init?.body)) as { events: ActivityEvent[] }).events);
    return new Response(null, { status: 204 });
  }) as typeof fetch;
  try {
    act();
    mock.timers.tick(1500);
    await new Promise((resolve) => setImmediate(resolve));
  } finally {
    globalThis.fetch = realFetch;
    mock.timers.reset();
  }
  return sent;
}

test("the service agreement's Draft it for me writes 'Record started', naming the agreement", async () => {
  const name = documentRepository.getById(SA_DOC_ID)!.name;
  const lines = await linesSentBy(() => createAgreement(false));
  const started = lines.filter((l) => l.action === "Record started");
  assert.equal(started.length, 1, `one 'Record started' line, got ${JSON.stringify(lines)}`);
  assert.ok(started[0].target?.includes(name), String(started[0].target));
  assert.equal(started[0].documentId, SA_DOC_ID, "filed under the agreement, so it lands in Purchase's lines");
  // Demo records are made by the hundred: none of them is logged.
  assert.deepEqual(
    (await linesSentBy(() => createAgreement(true))).filter((l) => l.action === "Record started"),
    [],
  );
});

test("New record still writes one 'Record started' line, and opening a sheet already on file writes none", async () => {
  const doc = documentRepository.getById("str-sharp-metal-objects")!;
  const first = await linesSentBy(() => createRecordForDocument(doc, { dateISO: "2026-10-07" }));
  assert.equal(first.filter((l) => l.action === "Record started").length, 1);
  const daily = documentRepository.getById("qc-viscosity")!;
  await linesSentBy(() => createRecordForDocument(daily, { dateISO: "2026-10-07" }));
  const again = await linesSentBy(() => createRecordForDocument(daily, { dateISO: "2026-10-07" }));
  assert.deepEqual(again.filter((l) => l.action === "Record started"), [], "the day's sheet is opened, not started again");
});

// The pages cannot be clicked here; what is checked is that each one that builds its own new record (an
// "In Progress" record made on the spot) writes the line as it stores it. tests/e2e_every_record_starts.py
// presses each of them in a browser and reads the line back from the database.
test("every page that builds its own new record writes 'Record started' for it", () => {
  const src = path.join(process.env.DCRS_REPO_ROOT ?? process.cwd(), "frontend", "src");
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (full.endsWith(".tsx")) files.push(full);
    }
  };
  walk(path.join(src, "pages"));
  walk(path.join(src, "components"));
  const builder = /status: "In Progress",\s*\n\s*isDemo,[\s\S]{0,400}?createdAt: now,/g;
  const found: string[] = [];
  const missing: string[] = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const built = (text.match(builder) ?? []).length;
    if (!built) continue;
    const logged = (text.match(/\blogRecordStarted\(/g) ?? []).length;
    const rel = path.relative(src, file).split(path.sep).join("/");
    found.push(`${rel} x${built}`);
    if (logged < built) missing.push(`${rel}: ${built} built, ${logged} logged`);
  }
  assert.deepEqual(found.sort(), ["pages/CapaPage.tsx x1", "pages/GapPage.tsx x2", "pages/PestControlPages.tsx x1", "pages/TrainingPage.tsx x1"]);
  assert.deepEqual(missing, []);
});
