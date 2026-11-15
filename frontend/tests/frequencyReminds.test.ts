// A FREQUENCY SET IS ON THE CALENDAR AT ONCE AND REMINDS ON ITS DAYS (REQUIREMENTS §216; the owner, 15-Nov-2026:
// "everytime user set frequency of any document then according to that it will appear and remind user through
// notification and email both"). A monthly document set to every <today's weekday> from today: today's sheet is made
// the moment it is set, and the reminder plan the server runs every 5 minutes (engine/notificationPlan.ts; the bell, the
// phone and the email all read its ledger) tells the person who answers for it on its day, and the next day that it
// is late - never about a Wednesday.
// Run: npm run test:unit -- frequencyReminds
import test from "node:test";
import assert from "node:assert/strict";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded, masterRepository } from "../src/data/repositories/masterRepository";
import { ensureSeeded as ensureRecordsSeeded, recordRepository } from "../src/data/repositories/recordRepository";
import { applyFrequencyChange } from "../src/engine/frequencyApplied";
import { planNotifications, type PlanRecord } from "../src/engine/notificationPlan";
import { isCompanyHoliday } from "../src/engine/holidays";
import { addDays, todayISO } from "../src/utils/date";

ensureDocumentsSeeded();
ensureMasterSeeded();
ensureRecordsSeeded();

test("set to every <today's weekday>: its sheet at once, a reminder on its day and the day after, none for a day it does not name", () => {
  const today = todayISO();
  // Today's own weekday, so the first sheet is always in the month being made (the end of a month included).
  const weekday = new Date(`${today}T00:00:00`).getDay();
  const doc = documentRepository.getRecordableUnscoped().find((d) => d.schedule.type === "monthly" && d.kind === "log-sheet" && !d.isReferenceOnly)!;
  assert.ok(doc, "a monthly log sheet to set");
  recordRepository.removeIds(recordRepository.queryUnscoped({ documentId: doc.id, isDemo: false }).map((r) => r.id));

  const master = masterRepository.get();
  masterRepository.update({
    scheduleOverrides: { ...(master.scheduleOverrides ?? {}), [doc.id]: { schedule: { type: "custom", weekdays: [weekday] }, frequency: "Custom", since: today, by: "Super Admin" } },
  } as Partial<typeof master>);
  assert.deepEqual(documentRepository.getByIdUnscoped(doc.id)!.schedule, { type: "custom", weekdays: [weekday] }, "the document reads its new frequency");

  applyFrequencyChange();
  const sheets = recordRepository.queryUnscoped({ documentId: doc.id, isDemo: false });
  const firstDay = today;
  const sheet = sheets.find((r) => r.periodKey === `${doc.id}:${firstDay}`);
  assert.ok(sheet, `its sheet for ${firstDay}, made the moment the frequency was set: ${sheets.map((r) => r.periodKey).join(", ")}`);
  for (const r of sheets) {
    const filed = /(\d{4}-\d{2}-\d{2})/.exec(r.periodKey)?.[1] ?? r.dueDate;
    if (filed >= today) assert.equal(new Date(`${filed}T00:00:00`).getDay(), weekday, `only that weekday from the day it was set: ${filed}`);
  }

  const plan = (on: string) =>
    planNotifications({
      today: on,
      time: "09:00",
      documents: [{ id: doc.id, formatNo: doc.formatNo, name: doc.name, module: "QC", schedule: documentRepository.getByIdUnscoped(doc.id)!.schedule }],
      records: recordRepository.queryUnscoped({ documentId: doc.id, isDemo: false }).map(
        (r): PlanRecord => ({ id: r.id, documentId: r.documentId, dueDate: r.dueDate, status: r.status, stored: true, prepared: !!r.prepared, problems: 1, rejections: 0 })
      ),
      people: [{ id: "u-kapila", name: "Kapila Barad", boss: false, answersFor: new Set([doc.id]), mayVerify: () => true }],
      isClosedDay: (d) => isCompanyHoliday(d, masterRepository.get()),
    }).filter((i) => i.data.documentId === doc.id && i.userId === "u-kapila");

  const due = sheet!.dueDate;
  assert.ok(plan(due).some((i) => i.data.dueDate === due), `told on its day, ${due}`);
  const after = plan(addDays(due, 1));
  assert.ok(after.some((i) => i.data.dueDate === due && i.kind === "overdue"), "told the next day that it is late");
  assert.ok(!after.some((i) => i.data.dueDate === addDays(due, 1)), "never about a day the frequency does not name");

  recordRepository.removeIds(recordRepository.queryUnscoped({ documentId: doc.id, isDemo: false }).map((r) => r.id));
  masterRepository.update({ scheduleOverrides: master.scheduleOverrides ?? {} } as Partial<typeof master>);
});
