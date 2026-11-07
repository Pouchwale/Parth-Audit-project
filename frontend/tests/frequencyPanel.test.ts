// THE FREQUENCY PANEL AND THE HALF-YEARLY FREQUENCY (REQUIREMENTS §163; the owner, 2-Nov-2026): every document of
// every module grouped in the master list's order, counted by frequency, found by its words; and a half-yearly
// schedule falls due twice a year, six months apart, with a six-month period and a label of its own.
// Run: npm run test:unit -- frequencyPanel
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { DocumentDefinition } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { dueDatesInMonth, schedulePeriodOf, scheduleLabel } from "../src/engine/frequencyEngine";
import { FREQUENCY_ORDER, frequencyCounts, frequencyModules, frequencySearch } from "../src/engine/frequencyPanel";
import { periodDays as planPeriodDays, headsUpFrom } from "../src/engine/notificationPlan";
import { periodDays } from "../src/engine/notifications";
import { KINDS, customSchedule, parseDays, scheduleOf } from "../src/components/master/FrequencyPicker";
import { frequencyDocsFor } from "../src/engine/frequencyPanel";
import { readFileSync } from "node:fs";
import path from "node:path";

ensureDocumentsSeeded();

const docs = documentRepository.getRecordableUnscoped();
const halfYearly = (anchorMonth: number, dayOfMonth: number): DocumentDefinition => ({ ...docs[0], id: "test-half-yearly", schedule: { type: "half-yearly", anchorMonth, dayOfMonth }, frequency: "Half-yearly" });

describe("the Frequency panel (REQUIREMENTS §163)", () => {
  it("lists every document that holds records, by module in the master list's order, none twice, none left out", () => {
    const modules = frequencyModules(docs);
    const codes = modules.map((m) => m.code);
    assert.deepEqual(codes.slice(0, 3), ["SYS", "MKT", "PUR"], codes.join(","));
    assert.ok(codes.includes("HR") && codes.includes("QC") && codes.includes("PRD"));
    const listed = modules.flatMap((m) => m.docs.map((d) => d.id));
    assert.equal(new Set(listed).size, listed.length, "none twice");
    assert.equal(listed.length, docs.filter((d) => !d.isReferenceOnly).length, "every scheduled document, no reference document");
    assert.ok(modules.find((m) => m.code === "HR")!.docs.some((d) => d.id === "hr-induction-staff"));
  });

  it("counts the documents by frequency in a fixed order, and finds a document by its number, name or frequency", () => {
    const counts = frequencyCounts(docs);
    assert.ok(counts.length >= 4);
    assert.deepEqual(
      counts.map((c) => c.frequency),
      FREQUENCY_ORDER.filter((f) => counts.some((c) => c.frequency === f))
    );
    assert.equal(
      counts.reduce((n, c) => n + c.count, 0),
      docs.filter((d) => !d.isReferenceOnly).length
    );
    assert.ok(frequencySearch(docs, "F/HR/05").some((d) => d.id === "hr-induction-staff"));
    assert.ok(frequencySearch(docs, "induction").every((d) => /induction/i.test(d.name)));
    assert.equal(frequencySearch(docs, "").length, docs.length);
  });

  it("half-yearly is one of the frequencies the picker offers, between quarterly and yearly", () => {
    const kinds = KINDS.map((k) => k.kind);
    assert.ok(kinds.indexOf("half-yearly") > kinds.indexOf("quarterly") && kinds.indexOf("half-yearly") < kinds.indexOf("yearly"), kinds.join(","));
    assert.equal(KINDS.find((k) => k.kind === "half-yearly")!.frequency, "Half-yearly");
  });

  it("a half-yearly document falls due twice a year, six months apart, on its day of the month", () => {
    const doc = halfYearly(0, 15); // January and July, the 15th
    const year = Array.from({ length: 12 }, (_, m) => dueDatesInMonth(doc, 2026, m));
    assert.deepEqual(year.flat(), ["2026-01-15", "2026-07-15"]);
    const fromApril = halfYearly(3, 31); // April and October; the 31st becomes the 30th
    assert.deepEqual(Array.from({ length: 12 }, (_, m) => dueDatesInMonth(fromApril, 2026, m)).flat(), ["2026-04-30", "2026-10-31"]);
  });

  it("its period is the six months from its first month, holding the one date the schedule names", () => {
    const doc = halfYearly(0, 15);
    assert.deepEqual(schedulePeriodOf(doc, "2026-03-20"), { from: "2026-01-01", to: "2026-06-30", scheduled: "2026-01-15" });
    assert.deepEqual(schedulePeriodOf(doc, "2026-11-02"), { from: "2026-07-01", to: "2026-12-31", scheduled: "2026-07-15" });
    const fromApril = halfYearly(3, 1);
    assert.deepEqual(schedulePeriodOf(fromApril, "2026-02-10"), { from: "2025-10-01", to: "2026-03-31", scheduled: "2025-10-01" }, "February belongs to the half that began last October");
    assert.equal(scheduleLabel(doc), "Half-yearly (day 15, from Jan)");
  });

  it("the reminders treat a half-yearly document as a long period: 182 days, warned of in advance", () => {
    assert.equal(periodDays({ type: "half-yearly", anchorMonth: 0, dayOfMonth: 1 }), 182);
    assert.equal(planPeriodDays({ type: "half-yearly" }), 182);
    const heads = headsUpFrom({ type: "half-yearly" }, "2026-07-15", () => false);
    assert.ok(heads && heads < "2026-07-14", `warned from ${heads}`);
  });
});


// A FREQUENCY OF THE PERSON'S OWN, AND THE PANEL FOR THE DOCUMENTS ONE ANSWERS FOR (REQUIREMENTS §202; the owner,
// 7-Nov-2026: "give option in frequency so user can add manually frequency of all the document of which he is responsible
// and in frequency add customly also").
describe("a custom frequency, and the Frequency panel for everybody's own documents (REQUIREMENTS §202)", () => {
  const custom = (schedule: DocumentDefinition["schedule"]): DocumentDefinition => ({ ...docs[0], id: "test-custom", schedule, frequency: "Custom" });
  const every10 = custom({ type: "custom", everyDays: 10, from: "2026-11-07" });
  const monThu = custom({ type: "custom", weekdays: [4, 1] });
  const days = custom({ type: "custom", daysOfMonth: [31, 5, 15] });

  it("every 10 days from 07-11-2026 falls on the 7th, 17th and 27th of November, then the 7th, 17th and 27th of December", () => {
    assert.deepEqual(dueDatesInMonth(every10, 2026, 10), ["2026-11-07", "2026-11-17", "2026-11-27"]);
    assert.deepEqual(dueDatesInMonth(every10, 2026, 11), ["2026-12-07", "2026-12-17", "2026-12-27"]);
    assert.deepEqual(dueDatesInMonth(every10, 2026, 9), [], "nothing before its first day");
    assert.deepEqual(schedulePeriodOf(every10, "2026-11-19"), { from: "2026-11-17", to: "2026-11-26", scheduled: "2026-11-17" }, "a stretch from one due day to the day before the next");
    assert.equal(schedulePeriodOf(every10, "2026-10-30"), null);
  });

  it("chosen weekdays fall on each of them every week; chosen days of the month on each the month has", () => {
    assert.deepEqual(dueDatesInMonth(monThu, 2026, 10), ["2026-11-02", "2026-11-05", "2026-11-09", "2026-11-12", "2026-11-16", "2026-11-19", "2026-11-23", "2026-11-26", "2026-11-30"]);
    assert.deepEqual(dueDatesInMonth(days, 2026, 1), ["2026-02-05", "2026-02-15"], "February has no 31st");
    assert.deepEqual(dueDatesInMonth(days, 2026, 0), ["2026-01-05", "2026-01-15", "2026-01-31"]);
    assert.equal(schedulePeriodOf(monThu, "2026-11-19"), null, "each day its own");
  });

  it("is labelled in its own words, has a period of its own for the reminders, and is told the working day before", () => {
    assert.equal(scheduleLabel(every10), "Every 10 days from 07-11-2026");
    assert.equal(scheduleLabel(monThu), "Every Mon, Thu");
    assert.equal(scheduleLabel(days), "Days 5, 15, 31 of each month");
    assert.equal(planPeriodDays(every10.schedule), 10);
    assert.equal(planPeriodDays(monThu.schedule), 7);
    assert.equal(planPeriodDays(days.schedule), 30);
    assert.equal(periodDays(every10.schedule), 10);
    assert.equal(periodDays(days.schedule), 30);
    assert.equal(headsUpFrom(every10.schedule, "2026-11-17", () => false), "2026-11-16");
  });

  it("the picker offers Custom last, says a custom choice only once it names something, and reads days typed as words", () => {
    assert.equal(KINDS[KINDS.length - 1].kind, "custom");
    assert.equal(KINDS[KINDS.length - 1].frequency, "Custom");
    assert.equal(FREQUENCY_ORDER[FREQUENCY_ORDER.length - 1], "Custom");
    assert.deepEqual(parseDays("5, 15, 25, 40, 5"), [5, 15, 25]);
    assert.equal(customSchedule({ mode: "weekdays", everyDays: 10, from: "2026-11-07", weekdays: [], daysOfMonth: [] }), null);
    assert.deepEqual(customSchedule({ mode: "days", everyDays: 10, from: "2026-11-07", weekdays: [], daysOfMonth: [15, 5] }), { type: "custom", daysOfMonth: [5, 15] });
    assert.deepEqual(customSchedule({ mode: "every", everyDays: 0, from: "2026-11-07", weekdays: [], daysOfMonth: [] }), null);
    const now = docs[0].schedule;
    assert.deepEqual(scheduleOf("custom", now, 1, 1, 0, { mode: "every", everyDays: 3, from: "2026-11-07", weekdays: [], daysOfMonth: [] }), { type: "custom", everyDays: 3, from: "2026-11-07" });
    assert.deepEqual(scheduleOf("custom", now, 1, 1, 0, { mode: "weekdays", everyDays: 3, from: "2026-11-07", weekdays: [], daysOfMonth: [] }), now, "nothing chosen yet: the schedule stands");
    const counted = frequencyCounts([...docs, every10]);
    assert.equal(counted[counted.length - 1].frequency, "Custom");
  });

  it("the panel lists every scheduled document for the super admin and the ones a person may fill otherwise; the page and the sidebar open it to them (by source)", () => {
    const all = frequencyDocsFor(docs, true);
    assert.equal(all.length, docs.filter((d) => !d.isReferenceOnly).length);
    const mine = frequencyDocsFor(docs, false);
    assert.ok(mine.every((d) => all.some((x) => x.id === d.id)));
    const root = process.env.DCRS_REPO_ROOT ?? process.cwd();
    const page = readFileSync(path.join(root, "frontend", "src", "pages", "FrequencyPage.tsx"), "utf8");
    assert.match(page, /frequencyDocsFor\(documentRepository\.getRecordableUnscoped\(\), boss\)/);
    assert.doesNotMatch(page, /frequency-admin-only/, "no longer the super admin's alone");
    assert.match(page, /data-state="frequency-none-mine"/);
    const sidebar = readFileSync(path.join(root, "frontend", "src", "components", "layout", "Sidebar.tsx"), "utf8");
    assert.match(sidebar, /const frequencyForMe = !!user && user\.role !== "admin" && frequencyDocsFor\(documentRepository\.getRecordableUnscoped\(\), false\)\.length > 0;/);
    assert.match(sidebar, /\.\.\.\(frequencyForMe \? \[FREQUENCY_ITEM\] : \[\]\)/);
  });
});

