// THE THREE PEST CONTROL SERVICE REPORTS, TWICE A MONTH ON A SATURDAY (REQUIREMENTS §221; the owner, 15-Nov-2026: "it has
// a frequency of 15 day which means twice a month and on saturday so every month it should be by default two records
// should come on screen for all three service record"). The 1st and 3rd Saturday, fourteen days apart, from 15-11-2026.
// Run: npm run test:unit -- serviceReportSaturdays
import test from "node:test";
import assert from "node:assert/strict";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded, masterRepository } from "../src/data/repositories/masterRepository";
import { serviceReportsOnSaturdays } from "../src/data/serviceSaturdaysMigration";
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
    assert.equal(doc.scheduleSince, "2026-11-15", id);
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
