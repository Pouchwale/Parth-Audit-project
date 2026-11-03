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
import { KINDS } from "../src/components/master/FrequencyPicker";

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
