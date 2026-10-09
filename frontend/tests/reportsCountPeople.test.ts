// REPORTS COUNT ONLY WHAT PEOPLE ENTERED (REQUIREMENTS §98; the audit of 7-Oct-2026, H-13).
//
// Before 8-Oct-2026 the morning prepare wrote simulated readings and rodent catches into Live drafts, and the
// Rodent Trend, the fly figures and the lamination QC report added those drafts up as if somebody had seen
// them. Now:
//   * every report, tile and trend sheet counts a Live record only when a person wrote or confirmed it
//     (data/selectors.ts countsAsEntered, the engine/insights.ts isHumanRecord rule the Management Summary
//     already used);
//   * a draft an earlier version filled with the simulation, and nobody touched since, is prepared again by
//     the rule: the made-up readings taken out, the change in its history; a draft a person worked on is
//     left exactly as it is.
//
// Run: npm run test:unit -- reportsCountPeople
import test from "node:test";
import assert from "node:assert/strict";
import type { DailyPestMonitoringData, FlyCatcherData, RecordInstance } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded, masterRepository } from "../src/data/repositories/masterRepository";
import { recordRepository } from "../src/data/repositories/recordRepository";
import { flyStatsForYear, rodentsInMonth, rodentStatsForYear, rodentTrendRows } from "../src/data/selectors";
import { createDefaultData } from "../src/engine/recordDefaults";
import { autoFillRecord } from "../src/engine/autoFill";
import { prepareDueRecords, REPREPARED_NOTE } from "../src/engine/assistantPrepare";
import { isCompanyHoliday } from "../src/engine/holidays";
import { addDays, todayISO } from "../src/utils/date";

ensureDocumentsSeeded();
ensureMasterSeeded();

const master = masterRepository.get();
const today = todayISO();
// A working day of this month at or before today, so a register day holds check points.
let day = today;
for (let i = 0; i < 10 && isCompanyHoliday(day, master); i++) day = addDays(day, -1);
const year = Number(day.slice(0, 4));
const month = Number(day.slice(5, 7)) - 1;

function pestRecord(id: string, dueDate: string, extra: Partial<RecordInstance<DailyPestMonitoringData>>): RecordInstance<DailyPestMonitoringData> {
  const doc = documentRepository.getById("daily-pest-monitoring")!;
  const base = createDefaultData(doc, dueDate, master) as DailyPestMonitoringData;
  return {
    id,
    documentId: doc.id,
    periodKey: `daily-pest-monitoring:${dueDate}:${id}`,
    dueDate,
    status: "In Progress",
    isDemo: false,
    data: {
      ...base,
      isHoliday: false,
      checkpoints: { 7: { value: "Yes" } },
      rodentCatches: [{ id: `${id}-c`, trapBoxNo: "RB-12", location: "Ink store", count: 2 }],
      timeOfChecking: "09:20",
      checker: "Roshni",
    },
    createdAt: `${dueDate}T03:00:00.000Z`,
    updatedAt: `${dueDate}T03:00:00.000Z`,
    ...extra,
  } as RecordInstance<DailyPestMonitoringData>;
}

test("H-13: a prepared draft's rodent catch is never counted; a submitted one is", () => {
  const at = `${day}T03:00:00.000Z`;
  // The assistant's draft: prepared, nobody's hand on it.
  recordRepository.upsert(pestRecord("unit-draft", day, { prepared: { at, by: "assistant", notes: [], basedOn: "test" }, history: [{ id: "h1", at, by: "Assistant", action: "prepared" }] }));
  assert.equal(rodentsInMonth(year, month, false), 0, "the draft's two rodents are not the plant's");
  assert.equal(rodentStatsForYear(year, false).total, 0);
  assert.equal(rodentTrendRows(false, today).find((r) => r.year === year)?.months[month] ?? null, null, "no register month from a draft");
  // A person's record, submitted.
  recordRepository.upsert(pestRecord("unit-submitted", day, { status: "Submitted", submittedAt: at, submittedBy: "Roshni Patel" }));
  assert.equal(rodentsInMonth(year, month, false), 2, "the submitted record's two rodents count");
  assert.equal(rodentStatsForYear(year, false).total, 2);
});

test("H-13: a prepared draft's fly counts are never added up; a person's are", () => {
  const doc = documentRepository.getById("fly-catcher")!;
  const base = createDefaultData(doc, day, master) as FlyCatcherData;
  const at = `${day}T03:00:00.000Z`;
  const filled = { ...base, entries: base.entries.map((e) => ({ ...e, catchCountApprox: 5, cleaningDoneBy: "Vijay", verifiedBy: "Roshni" })) };
  const record: RecordInstance<FlyCatcherData> = {
    id: "unit-fly-draft",
    documentId: doc.id,
    periodKey: `fly-catcher:${day}:draft`,
    dueDate: day,
    status: "In Progress",
    isDemo: false,
    data: filled,
    createdAt: at,
    updatedAt: at,
    prepared: { at, by: "assistant", notes: [], basedOn: "test" },
  };
  recordRepository.upsert(record);
  assert.equal(flyStatsForYear(year, false).total, 0, "the draft's flies are not the plant's");
  recordRepository.upsert({ ...record, id: "unit-fly-verified", periodKey: `fly-catcher:${day}:verified`, status: "Verified", prepared: undefined, verifiedBy: "Kapila Barad", verifiedAt: at });
  assert.equal(flyStatsForYear(year, false).total, 5 * base.entries.length, "the verified visit's flies count");
});

test("a draft the simulation filled before 8-Oct-2026 and nobody touched is prepared again by the rule; a person's draft is left alone", () => {
  const doc = documentRepository.getById("daily-pest-monitoring")!;
  const due = day;
  const sim = autoFillRecord(doc, due, master, undefined)!;
  const at = "2026-10-01T03:00:00.000Z";
  const untouched: RecordInstance = {
    id: "unit-old-sim",
    documentId: doc.id,
    periodKey: `daily-pest-monitoring:${due}:old`,
    dueDate: due,
    status: "In Progress",
    isDemo: false,
    data: sim.data,
    createdAt: at,
    updatedAt: at,
    prepared: { at, by: "assistant", notes: sim.notes, basedOn: sim.basedOn },
  };
  const worked = { ...untouched, id: "unit-old-worked", periodKey: `daily-pest-monitoring:${due}:worked`, updatedAt: "2026-10-01T05:00:00.000Z", history: [{ id: "hp", at: "2026-10-01T05:00:00.000Z", by: "Roshni Patel", action: "edited" as const, changes: [] }] };
  // Stored as the earlier prepare stored them: upsertMany keeps their own updatedAt (upsert would stamp a save).
  recordRepository.upsertMany([untouched, worked]);
  const before = JSON.stringify((sim.data as DailyPestMonitoringData).checkpoints);
  assert.notEqual(before, "{}", "the simulation had answered the check points");

  const prepared = prepareDueRecords(today);
  const again = recordRepository.getById("unit-old-sim")!;
  assert.ok(prepared.some((r) => r.id === "unit-old-sim"), "returned, so the server's job stores it too");
  assert.deepEqual((again.data as DailyPestMonitoringData).checkpoints, {}, "the made-up answers are taken out");
  assert.equal((again.data as DailyPestMonitoringData).checker, "");
  assert.equal(again.prepared?.knownPartsOnly, true);
  assert.equal(again.prepared?.at, again.updatedAt, "still an untouched prepared draft to the backlog clean-up");
  const entry = again.history?.at(-1);
  assert.equal(entry?.note, REPREPARED_NOTE);
  assert.equal(entry?.by, "Assistant");
  assert.ok((entry?.changes ?? []).length > 0, "every value taken out is in the history, before and after");
  assert.equal(JSON.stringify(recordRepository.getById("unit-old-worked")!.data), JSON.stringify(sim.data), "a person's draft is never touched");
  // Run again: nothing more to do.
  assert.ok(!prepareDueRecords(today).some((r) => r.id === "unit-old-sim"));
});
