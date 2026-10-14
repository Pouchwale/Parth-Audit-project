// THE BLANK SHEETS FROM BEFORE GO-LIVE: NO BANNER, NO CLEAN-UP, NOTHING COUNTED (REQUIREMENTS §115).
//
// The owner, 13-Oct-2026: "make sure do fix it anyhow without any loss of any records or any modules". The sheets are
// the server's to move into its archive (backend/recordsArchive.ts); the browser keeps the one rule that finds them
// (engine/preLaunchNoise.ts) and offers nobody a delete any more. Proved here, without a browser:
//   * the rule: an untouched Due/Scheduled shell or an untouched preparation dated before go-live, and nothing else;
//   * findPreLaunchNoise reads that rule and never a seeded specimen;
//   * the reports are unchanged by the move: the minus score, the briefing and the reminders read exactly the same
//     with the sheets in the records as with them moved out — they were never due work;
//   * no "Clean up" or "Remove them" offer is left on the Dashboard, in the briefing or on the storage banner, for
//     staff or the super admin; only Master Data has the super admin's card and "Bring them back".
// Run: npm run test:unit -- archiveBlanks
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { DocumentDefinition, RecordInstance } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { recordRepository, ensureSeeded as ensureRecordsSeeded } from "../src/data/repositories/recordRepository";
import { settingsRepository } from "../src/data/repositories/settingsRepository";
import { SEED_HISTORICAL_RECORDS } from "../src/data/seed/historicalRecords";
import { isPreLaunchNoise, UNTOUCHED_WINDOW_MS } from "../src/engine/preLaunchNoise";
import { findPreLaunchNoise } from "../src/engine/backlogCleanup";
import { computeBriefing } from "../src/engine/assistantBriefing";
import { computeReminders } from "../src/engine/reminders";
import { scorecards, type Person } from "../src/engine/performance";
import { todayISO } from "../src/utils/date";

ensureDocumentsSeeded();
ensureMasterSeeded();
ensureRecordsSeeded();

const LIVE = "2026-09-08";
const shell = (id: string, dueDate: string, extra: Partial<RecordInstance> = {}): RecordInstance =>
  ({
    id,
    documentId: "daily-pest-monitoring",
    periodKey: `daily-pest-monitoring:${dueDate}:${id}`,
    dueDate,
    status: "Due",
    isDemo: false,
    data: { checkpoints: {}, summaryActions: [], rodentCatches: [] },
    createdAt: `${dueDate}T03:00:00.000Z`,
    updatedAt: `${dueDate}T03:00:00.000Z`,
    ...extra,
  }) as RecordInstance;

test("the rule: an untouched blank or an untouched preparation from before go-live, and nothing else", () => {
  assert.equal(isPreLaunchNoise(shell("a", "2026-08-01"), LIVE), true, "a Due shell");
  assert.equal(isPreLaunchNoise(shell("b", "2026-08-01", { status: "Scheduled" }), LIVE), true, "a Scheduled shell");
  assert.equal(isPreLaunchNoise(shell("c", "2026-08-01", { status: "In Progress", prepared: { at: "2026-08-01T03:00:00.000Z", by: "Mitra", notes: [], basedOn: "" } as unknown as RecordInstance["prepared"], updatedAt: "2026-08-01T03:00:01.000Z" }), LIVE), true, "prepared and never saved by a person");
  assert.equal(isPreLaunchNoise(shell("d", "2026-08-01", { status: "In Progress", prepared: { at: "2026-08-01T03:00:00.000Z", by: "Mitra", notes: [], basedOn: "" } as unknown as RecordInstance["prepared"], updatedAt: new Date(Date.parse("2026-08-01T03:00:00.000Z") + UNTOUCHED_WINDOW_MS).toISOString() }), LIVE), false, "saved by a person later");
  assert.equal(isPreLaunchNoise(shell("e", "2026-08-01", { status: "In Progress" }), LIVE), false, "in progress with no preparation: a person's");
  for (const status of ["Submitted", "Pending Verification", "Verified", "Rejected"] as const) assert.equal(isPreLaunchNoise(shell("f", "2026-08-01", { status }), LIVE), false, status);
  assert.equal(isPreLaunchNoise(shell("g", LIVE), LIVE), false, "the go-live day itself is live");
  assert.equal(isPreLaunchNoise(shell("h", "2026-09-09"), LIVE), false, "after go-live");
  assert.equal(isPreLaunchNoise(shell("i", "2026-08-01", { isDemo: true }), LIVE), false, "demo");
  assert.equal(isPreLaunchNoise(shell("j", "2026-08-01"), null), false, "no go-live day: nothing is noise");
});

test("findPreLaunchNoise reads the rule over the plant's records and never a seeded specimen", () => {
  settingsRepository.ensureLiveStartDate(LIVE);
  const before = findPreLaunchNoise().map((r) => r.id);
  recordRepository.upsertMany([shell("noise-1", "2026-08-01"), shell("noise-2", "2026-08-02", { status: "Scheduled" }), shell("kept-1", "2026-08-03", { status: "Verified" }), shell("kept-2", "2026-09-10")]);
  const found = findPreLaunchNoise().map((r) => r.id);
  assert.deepEqual(found.filter((id) => !before.includes(id)).sort(), ["noise-1", "noise-2"]);
  const seeds = new Set(SEED_HISTORICAL_RECORDS.map((r) => r.id));
  assert.ok(found.every((id) => !seeds.has(id)), "no seeded specimen");
  for (const r of recordRepository.queryUnscoped({ isDemo: false })) {
    const expected = !seeds.has(r.id) && isPreLaunchNoise(r, LIVE);
    assert.equal(found.includes(r.id), expected, `${r.id} (${r.status}, ${r.dueDate})`);
  }
  recordRepository.removeIds(["noise-1", "noise-2", "kept-1", "kept-2"]);
});

test("the minus score, the briefing and the reminders read the same with the sheets in the records as with them moved out", () => {
  settingsRepository.ensureLiveStartDate(LIVE);
  const today = todayISO();
  const docs: DocumentDefinition[] = documentRepository.getAll();
  const people: Person[] = [{ id: "kapila", name: "Kapila Barad", role: "staff", departments: ["QC", "HR"] }, { id: "admin", name: "Super Admin", role: "admin", departments: [] }];
  const picture = () => {
    const b = computeBriefing("Kapila");
    const rem = computeReminders(false);
    const cards = scorecards(recordRepository.queryUnscoped({ isDemo: false }), docs, people, "this-month", today);
    return {
      briefing: { ready: b.ready.length, needsInput: b.needsInput.length, overdue: b.overdue.length, awaiting: b.awaitingVerification.length, upcoming: b.upcoming.length },
      reminders: rem.map((r) => `${r.documentId}|${r.dueDate}|${r.urgency}`).sort(),
      minus: cards.byPerson.map((p) => `${p.person.id}:${p.minus}`),
      byDocument: cards.byDocument.map((d) => `${d.doc.id}:${d.minus}`),
    };
  };
  const without = picture();
  // Three thousand of them, as the plant had, for the three months before go-live.
  const sheets: RecordInstance[] = [];
  for (let i = 0; i < 90; i++) {
    const day = new Date(Date.UTC(2026, 5, 1 + i));
    const iso = day.toISOString().slice(0, 10);
    for (let k = 0; k < 34; k++) sheets.push(shell(`pre-${iso}-${k}`, iso, k % 7 === 0 ? { status: "Scheduled" } : {}));
  }
  recordRepository.upsertMany(sheets);
  assert.equal(findPreLaunchNoise().length >= sheets.length, true, "all of them are found");
  const withThem = picture();
  assert.deepEqual(withThem, without, "nothing the sheets could change: they were never due work");
  recordRepository.removeIds(sheets.map((s) => s.id));
  assert.deepEqual(picture(), without, "and the same again once moved out");
});

test("no 'Clean up' or 'Remove them' offer is left anywhere; the super admin's card is under Master Data alone", () => {
  const src = (p: string) => readFileSync(path.join(process.cwd(), "frontend", "src", p), "utf-8");
  for (const p of ["pages/DashboardPage.tsx", "components/common/AssistantBriefingPopup.tsx", "components/common/StorageFullBanner.tsx"]) {
    const text = src(p);
    assert.ok(!text.includes("purgePreLaunchNoise"), `${p} deletes nothing`);
    assert.ok(!/Clean up \{/.test(text) && !text.includes("Remove them"), `${p} offers no clean-up`);
  }
  assert.ok(!src("engine/backlogCleanup.ts").includes("removeIds"), "the engine's cleanup deletes nothing");
  const master = src("pages/MasterDataPage.tsx");
  assert.ok(master.includes('if (!admin || count === null) return null;'), "the card is the super admin's");
  assert.ok(master.includes("Blank sheets from before go-live, kept in the archive:") && master.includes("Bring them back"), "its words");
  assert.ok(master.includes('"/api/archive/blanks/restore"'), "restored through the server, never by a browser's copy");
});
