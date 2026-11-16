// THE THREE PEST CONTROL SERVICE REPORTS, TWICE A MONTH ON A SATURDAY (REQUIREMENTS §221; the owner, 15-Nov-2026: "it has
// a frequency of 15 day which means twice a month and on saturday so every month it should be by default two records
// should come on screen for all three service record"). The 1st and 3rd Saturday, fourteen days apart, from November 2026
// (the owner, 16-Nov-2026: November's are the 7th and the 21st).
// Run: npm run test:unit -- serviceReportSaturdays
import test from "node:test";
import assert from "node:assert/strict";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded, masterRepository } from "../src/data/repositories/masterRepository";
import { serviceReportsOnSaturdays, serviceVisitsOnSaturdays } from "../src/data/serviceSaturdaysMigration";
import type { RecordInstance } from "../src/types";
import { ensureSeeded as ensureRecordsSeeded, recordRepository } from "../src/data/repositories/recordRepository";
import { dueDatesInMonth } from "../src/engine/frequencyEngine";
import { ensureRecordsGeneratedForMonth } from "../src/engine/recordGenerator";

ensureDocumentsSeeded();
ensureMasterSeeded();
ensureRecordsSeeded();

const SERVICES = ["service-report-rodent", "service-report-general", "service-report-fly"];

test("every month of a year holds two visits for each service report, each a Saturday, fourteen days apart", () => {
  for (const id of SERVICES) {
    const doc = documentRepository.getByIdUnscoped(id)!;
    assert.deepEqual(doc.schedule, { type: "fortnightly", weekday: 6 }, id);
    assert.equal(doc.scheduleSince, "2026-11-01", id);
    for (let m = 0; m < 12; m++) {
      const days = dueDatesInMonth(doc, 2027, m);
      assert.equal(days.length, 2, `${id} ${m + 1}/2027: two visits`);
      for (const d of days) assert.equal(new Date(`${d}T00:00:00`).getDay(), 6, `${d} a Saturday`);
      assert.equal((Date.parse(days[1]) - Date.parse(days[0])) / 86400000, 14);
    }
  }
  assert.deepEqual(dueDatesInMonth(documentRepository.getByIdUnscoped(SERVICES[0])!, 2026, 11), ["2026-12-05", "2026-12-19"], "December 2026: the 5th and the 19th");
});

test("the month's two visits are on the screen for all three, made by the schedule", () => {
  for (const id of SERVICES) recordRepository.removeIds(recordRepository.queryUnscoped({ documentId: id }).map((r) => r.id));
  ensureRecordsGeneratedForMonth(2026, 11, { documentIds: SERVICES });
  for (const id of SERVICES) {
    const days = recordRepository.queryUnscoped({ documentId: id, isDemo: false }).map((r) => r.dueDate).sort();
    assert.deepEqual(days, ["2026-12-05", "2026-12-19"], id);
  }
  for (const id of SERVICES) recordRepository.removeIds(recordRepository.queryUnscoped({ documentId: id }).map((r) => r.id));
});

test("the Sunday set on General and Fly on 15-11-2026 is taken off at start; a frequency set after that day stays", () => {
  const master = masterRepository.get();
  const sunday = { schedule: { type: "fortnightly" as const, weekday: 0 }, frequency: "Fortnightly" as const, since: "2026-11-15", by: "Super Admin" };
  const later = { ...sunday, since: "2026-11-20" };
  masterRepository.update({ scheduleOverrides: { ...(master.scheduleOverrides ?? {}), "service-report-general": sunday, "service-report-fly": sunday, "service-report-rodent": later } });
  assert.equal(serviceReportsOnSaturdays(), 2);
  const now = masterRepository.get().scheduleOverrides ?? {};
  assert.ok(!now["service-report-general"] && !now["service-report-fly"], "General and Fly as issued: the 1st and 3rd Saturday");
  assert.deepEqual(documentRepository.getByIdUnscoped("service-report-general")!.schedule, { type: "fortnightly", weekday: 6 });
  assert.equal(now["service-report-rodent"]?.since, "2026-11-20", "the plant's newer word stays");
  assert.equal(serviceReportsOnSaturdays(), 0, "nothing to do a second time");
  masterRepository.update({ scheduleOverrides: master.scheduleOverrides ?? {} });
});

test("November 2026 on its Saturdays: each open visit filed on the 4th moves to the 7th, with what is written on it; the 21st stays; a signed visit stays", () => {
  for (const id of SERVICES) recordRepository.removeIds(recordRepository.queryUnscoped({ documentId: id }).map((r) => r.id));
  const visit = (id: string, day: string, over: Partial<RecordInstance> = {}): RecordInstance =>
    recordRepository.upsert({
      id: `rec-${id}-${day}`,
      documentId: id,
      periodKey: `${id}:${day}`,
      dueDate: day,
      status: "In Progress",
      isDemo: false,
      data: { lines: [], remarks: "written" },
      createdAt: "2026-11-15T11:22:11.735Z",
      updatedAt: "2026-11-15T11:22:11.735Z",
      ...over,
    } as RecordInstance);
  for (const id of SERVICES) {
    visit(id, "2026-11-04");
    visit(id, "2026-11-21", { status: "Due" });
  }
  visit("service-report-rodent", "2026-11-18", { status: "Verified", submittedAt: "2026-11-18T10:00:00.000Z", submittedBy: "Kapila Barad" });
  assert.equal(serviceVisitsOnSaturdays(), 3, "the three 4ths");
  for (const id of SERVICES) {
    const nov = recordRepository.queryUnscoped({ documentId: id, isDemo: false }).filter((r) => r.status !== "Verified").map((r) => [r.periodKey.split(":")[1], r.dueDate]).sort();
    assert.deepEqual(nov, [["2026-11-07", "2026-11-07"], ["2026-11-21", "2026-11-21"]], `${id}: the 1st and 3rd Saturday`);
    const moved = recordRepository.getById(`rec-${id}-2026-11-04`)!;
    assert.equal((moved.data as { remarks?: string }).remarks, "written", "what is written on it, kept");
    assert.match(String(moved.history?.at(-1)?.note), /Moved to 07-11-2026, the fortnight's Saturday \(was 04-11-2026/);
  }
  assert.equal(recordRepository.getById("rec-service-report-rodent-2026-11-18")!.dueDate, "2026-11-18", "a signed visit stays where it is");
  assert.equal(serviceVisitsOnSaturdays(), 0, "nothing to do a second time");
  for (const id of SERVICES) recordRepository.removeIds(recordRepository.queryUnscoped({ documentId: id }).map((r) => r.id));
});
