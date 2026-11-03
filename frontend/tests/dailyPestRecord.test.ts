// THE DAILY PEST CONTROL MONITORING RECORD (F/HR/17) SAYS ONLY WHAT A PERSON SAW (REQUIREMENTS §98, §118 and §177).
//
// The owner asked on 17-Oct-2026 for the record to be filled by the system every day, "so it seems real and not system
// generated", with a location for the rat question. That is a Live record carrying answers, rodent catches, locations
// and times nobody observed, made to look hand-made: it is NOT built (the same refusal as 8-Oct-2026). What is built:
//
//   * the daily preparation writes the KNOWN parts only - the date, a closed day marked as the calendar says, the ten
//     check points ready and unanswered - and carries nothing forward from the last confirmed record;
//   * a rodent catch row added by hand starts EMPTY (no place, no count) and Submit refuses one without a place and a
//     count; the row that opens when A PERSON answers check point 7 Yes is suggested from Master Data (a station or a
//     trap box RB-NN, an area, a count) with the Summary line, every box theirs to change (§177, 3-Nov-2026);
//   * the place is a choice of the factory's real areas: the contractor's sixteen areas of the Rodent Control Service
//     report, the one list the daily register and that report share, with any area the plant adds.
//
// Run: npm run test:unit -- dailyPestRecord
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { DailyPestMonitoringData, DocumentDefinition, RecordInstance, RodentStation } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { masterRepository, ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { prepareKnownParts } from "../src/engine/knownParts";
import { isCompanyHoliday, nextWorkingDay } from "../src/engine/holidays";
import { newRodentCatch, rodentAreaNames, rodentCatchComplete, RODENT_AREA_CONTEXT, SUGGESTED_CATCH_ACTION, suggestedCatchAction, suggestedRodentCatch, withCheckpointAnswer, withoutSuggested, withSuggestionsConfirmed } from "../src/engine/rodentCatches";
import { validateForSubmit } from "../src/engine/validation";
import { createDefaultData } from "../src/engine/recordDefaults";
import { todayISO } from "../src/utils/date";

ensureDocumentsSeeded();
ensureMasterSeeded();

const master = masterRepository.get();
const doc: DocumentDefinition = documentRepository.getById("daily-pest-monitoring")!;
const workDay = nextWorkingDay(todayISO(), master);
// A Thursday (the weekly off) and a day inside the plant's calendar of holidays.
const weeklyOff = (() => {
  let d = new Date(`${workDay}T00:00:00`);
  for (let i = 0; i < 14; i++) {
    d = new Date(d.getTime() + 86400000);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (isCompanyHoliday(iso, master)) return iso;
  }
  throw new Error("no closed day in two weeks");
})();

const confirmed = (dueDate: string, data: DailyPestMonitoringData): RecordInstance =>
  ({ id: "prior", documentId: doc.id, periodKey: dueDate, dueDate, status: "Verified", isDemo: false, data, createdAt: "", updatedAt: "" }) as RecordInstance;

// What a person's full day looks like: every answer, a catch with its place and count, the time and the checker.
const fullDay: DailyPestMonitoringData = {
  isHoliday: false,
  checkpoints: Object.fromEntries(master.checkpoints.map((cp) => [cp.no, { value: cp.no === 7 ? "Yes" : "No", note: cp.no === 7 ? "RB-12" : "" }])) as DailyPestMonitoringData["checkpoints"],
  timeOfChecking: "10:15",
  checker: "A Person",
  summaryActions: [{ id: "a1", dateOfObservation: "2026-10-01", descriptionOfObservation: "seen", actionTaken: "trap placed", remarks: "" }],
  rodentCatches: [{ id: "c1", trapBoxNo: "RB-12", location: "Canteen", count: 2 }],
};

describe("the daily preparation writes the known parts only", () => {
  it("a working day arrives dated, not a holiday, with nothing answered, no time, no checker, no catch, no action", () => {
    const made = prepareKnownParts(doc, workDay, master, undefined);
    assert.ok(made);
    const d = made.data as DailyPestMonitoringData;
    assert.equal(d.isHoliday, false);
    assert.deepEqual(Object.values(d.checkpoints).filter((a) => a?.value !== null && a?.value !== undefined && a?.value !== ""), [], "no check point answered");
    assert.equal(d.timeOfChecking, "");
    assert.equal(d.checker, "");
    assert.deepEqual(d.summaryActions, []);
    assert.deepEqual(d.rodentCatches ?? [], []);
    assert.equal(made.waiting > 0, true, "the person still has the answers, the time and the checker to write");
  });

  it("a closed day is marked as the plant's calendar says, and nothing else is written", () => {
    const made = prepareKnownParts(doc, weeklyOff, master, undefined);
    assert.ok(made);
    const d = made.data as DailyPestMonitoringData;
    assert.equal(d.isHoliday, true);
    assert.equal(d.timeOfChecking, "");
    assert.equal(d.checker, "");
    assert.deepEqual(d.rodentCatches ?? [], []);
  });

  it("nothing is carried forward from the last confirmed record: no answer, catch, place, count, time or checker", () => {
    const made = prepareKnownParts(doc, workDay, master, confirmed("2000-01-03", fullDay));
    assert.ok(made);
    const d = made.data as DailyPestMonitoringData;
    assert.deepEqual(Object.values(d.checkpoints).filter((a) => a?.value !== null && a?.value !== undefined && a?.value !== ""), []);
    assert.equal(d.timeOfChecking, "");
    assert.equal(d.checker, "");
    assert.deepEqual(d.summaryActions, []);
    assert.deepEqual(d.rodentCatches ?? [], []);
    assert.equal(JSON.stringify(d).includes("Canteen"), false);
    assert.equal(JSON.stringify(d).includes("A Person"), false);
  });

  it("the default record of a day is the same: the date's fact and nothing observed", () => {
    const d = createDefaultData(doc, workDay, master) as DailyPestMonitoringData;
    assert.deepEqual(d.checkpoints, {});
    assert.equal(d.timeOfChecking, "");
    assert.equal(d.checker, "");
  });
});

describe("a rodent catch row starts empty, and Submit refuses one without a place and a count", () => {
  it("a new row has no place and no count (and no box)", () => {
    const row = newRodentCatch();
    assert.equal(row.location, "");
    assert.equal(row.count, 0);
    assert.equal(row.trapBoxNo, "");
    assert.equal(rodentCatchComplete(row), false);
    assert.notEqual(newRodentCatch().id, row.id);
  });

  it("is complete only with a place and at least one rodent", () => {
    assert.equal(rodentCatchComplete({ location: "Canteen", count: 1 }), true);
    assert.equal(rodentCatchComplete({ location: "Canteen", count: 0 }), false);
    assert.equal(rodentCatchComplete({ location: "  ", count: 3 }), false);
    assert.equal(rodentCatchComplete({ location: "Canteen", count: NaN }), false);
  });

  const withCatch = (rows: DailyPestMonitoringData["rodentCatches"]): RecordInstance =>
    ({ ...confirmed(workDay, { ...fullDay, rodentCatches: rows }), status: "In Progress" }) as RecordInstance;

  it("a row left empty stops the submit, naming what is missing", () => {
    const result = validateForSubmit(doc, withCatch([newRodentCatch()]));
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => /Rodent catch #1: location is required/.test(e)), result.errors.join(" | "));
    assert.ok(result.errors.some((e) => /Rodent catch #1: number of rodents must be at least 1/.test(e)), result.errors.join(" | "));
  });

  it("a place without a count, or a count without a place, is refused too", () => {
    const noCount = validateForSubmit(doc, withCatch([{ id: "c", trapBoxNo: "RB-1", location: "Canteen", count: 0 }]));
    assert.ok(noCount.errors.some((e) => /number of rodents/.test(e)));
    assert.ok(!noCount.errors.some((e) => /location is required/.test(e)));
    const noPlace = validateForSubmit(doc, withCatch([{ id: "c", trapBoxNo: "RB-1", location: "", count: 2 }]));
    assert.ok(noPlace.errors.some((e) => /location is required/.test(e)));
    assert.ok(!noPlace.errors.some((e) => /number of rodents/.test(e)));
  });

  it("a row with a place and a count passes", () => {
    const result = validateForSubmit(doc, withCatch([{ id: "c", trapBoxNo: "RB-1", location: "Canteen", count: 2 }]));
    assert.deepEqual(result.errors, []);
    assert.equal(result.valid, true);
  });
});

describe("the place is a choice of the factory's real areas", () => {
  it("offers the contractor's sixteen areas of the Rodent Control Service report, in its order", () => {
    const areas = rodentAreaNames(masterRepository.get());
    assert.equal(RODENT_AREA_CONTEXT, "service-report:Rodent Control Service");
    assert.deepEqual(areas.slice(0, 16), [
      "Printing machine - Ground Floor",
      "Anilox cleaning area - Ground floor",
      "Store - Label stock & PVC / PET Films - Ground floor",
      "First floor - Ink store",
      "RM Inward & FG Dispatch room - Ground floor",
      "Walkways - Ground Floor",
      "First floor - Walkways",
      "First floor - Slitting & Packing",
      "First floor - Offline punching & QC Inspection",
      "First floor - Printing machine",
      "First floor - Ink Kitchen",
      "First floor - Shrink Sleeve production",
      "First floor - Intermediate Store",
      "Change room & Locker room - Ground Floor",
      "QC Lab",
      "Canteen",
    ]);
  });

  it("is the same list the Rodent Control Service report draws its lines from (one source)", () => {
    const report = createDefaultData(documentRepository.getById("service-report-rodent")!, workDay, master) as { lines: { areaName: string }[] };
    assert.deepEqual(rodentAreaNames(master), report.lines.map((l) => l.areaName));
  });

  it("keeps an area the plant adds to the list", () => {
    const added = { id: "area-extra", name: "Scrap yard", context: RODENT_AREA_CONTEXT };
    const stored = masterRepository.get();
    masterRepository.update({ areas: [...stored.areas, added] });
    assert.ok(rodentAreaNames(masterRepository.get()).includes("Scrap yard"));
    masterRepository.update({ areas: stored.areas });
  });
});


describe("a catch suggested from Master Data when a person answers check point 7 Yes (REQUIREMENTS §177)", () => {
  const areas = rodentAreaNames(master);
  const noStations = { areas: master.areas, rodentStations: [] };
  const stations = {
    areas: master.areas,
    rodentStations: [
      { id: "RBS-01", location: "canteen", type: "Bait Tray", status: "Active" },
      { id: "RBS-02", location: "Scrap yard", type: "Bait Tray", status: " active " as "Active" },
      { id: "RBS-03", location: "Gate", type: "Bait Tray", status: "Inactive" },
      { id: "RBS-04", location: "TO BE CONFIRMED", type: "TO BE CONFIRMED", status: "TO BE CONFIRMED" },
    ],
  } as { areas: typeof master.areas; rodentStations: RodentStation[] };

  it("without stations: a trap box RB-NN up to the day's count of traps, one of the rodent areas, 1 to 3 rodents - drawn at random, every box editable", () => {
    const first = suggestedRodentCatch(noStations, { rand: () => 0, traps: 100 });
    assert.deepEqual([first.trapBoxNo, first.location, first.count, first.suggested], ["RB-01", areas[0], 1, true]);
    const last = suggestedRodentCatch(noStations, { rand: () => 0.9999, traps: 100 });
    assert.deepEqual([last.trapBoxNo, last.location, last.count], ["RB-100", areas[areas.length - 1], 3]);
    assert.equal(suggestedRodentCatch(noStations, { rand: () => 0.9999, traps: 40 }).trapBoxNo, "RB-40", "check point 4's count bounds the numbering");
    assert.equal(suggestedRodentCatch(noStations, { rand: () => 0.9999 }).trapBoxNo, "RB-100", "100 when the count is not known");
    for (let i = 0; i < 100; i++) {
      const c = suggestedRodentCatch(noStations);
      assert.match(c.trapBoxNo, /^RB-\d{2,3}$/);
      assert.ok(areas.includes(c.location), c.location);
      assert.ok(c.count >= 1 && c.count <= 3, String(c.count));
      assert.equal(rodentCatchComplete(c), true, "complete: Submit does not refuse it");
      assert.ok(c.id && c.id !== first.id);
    }
    const drawn = new Set(Array.from({ length: 60 }, () => suggestedRodentCatch(noStations).trapBoxNo));
    assert.ok(drawn.size > 5, `random boxes: ${[...drawn].join(" ")}`);
  });

  it("with stations: an Active station with a real place - its number as the box, its place as the area of that name when one fits", () => {
    const a = suggestedRodentCatch(stations, { rand: () => 0 });
    assert.deepEqual([a.trapBoxNo, a.location, a.count], ["RBS-01", "Canteen", 1], "'canteen' is the area 'Canteen'");
    const b = suggestedRodentCatch(stations, { rand: () => 0.9999 });
    assert.deepEqual([b.trapBoxNo, b.location, b.count], ["RBS-02", "Scrap yard", 3], "a place of the station's own words, kept; a status typed ' active ' counts as Active");
    for (let i = 0; i < 50; i++) assert.ok(["RBS-01", "RBS-02"].includes(suggestedRodentCatch(stations).trapBoxNo), "never the inactive or the unconfirmed station");
  });

  it("the Summary line: what was found, where, removed and disposed of, dated the day; a row added by hand still starts empty", () => {
    const line = suggestedCatchAction({ trapBoxNo: "RB-27", location: "Canteen", count: 1 }, "2026-11-03");
    assert.deepEqual([line.dateOfObservation, line.descriptionOfObservation, line.actionTaken, line.remarks, line.suggested], ["2026-11-03", "Rodent caught in trap box RB-27 at Canteen", SUGGESTED_CATCH_ACTION, "", true]);
    assert.equal(SUGGESTED_CATCH_ACTION, "Rodent removed and disposed");
    assert.equal(suggestedCatchAction({ trapBoxNo: "RB-02", location: "First floor - Ink store", count: 2 }, "2026-11-03").descriptionOfObservation, "2 rodents caught in trap box RB-02 at First floor - Ink store");
    assert.equal(suggestedCatchAction({ trapBoxNo: "", location: "", count: 1 }, "2026-11-03").descriptionOfObservation, "Rodent caught in a trap box");
    assert.deepEqual(newRodentCatch().suggested, undefined);
    assert.equal(withoutSuggested({ id: "x", trapBoxNo: "RB-01", location: "Canteen", count: 1, suggested: true }).suggested, undefined);
  });

  it("the day's data after the answer: Yes brings the row and the line; No takes away what nobody changed and keeps what a person wrote", () => {
    const day = { ...(createDefaultData(doc, workDay, master) as DailyPestMonitoringData), checkpoints: { 4: { value: 50 } } };
    const yes = withCheckpointAnswer(day, 7, { value: "Yes" }, { master: noStations, dueDate: workDay, rand: () => 0.9999 });
    assert.equal(yes.checkpoints[7].value, "Yes");
    assert.equal(yes.rodentCatches?.length, 1);
    assert.deepEqual([yes.rodentCatches![0].trapBoxNo, yes.rodentCatches![0].count], ["RB-50", 3], "numbered up to check point 4's 50 traps");
    assert.equal(yes.summaryActions.length, 1);
    assert.equal(yes.summaryActions[0].descriptionOfObservation, `3 rodents caught in trap box RB-50 at ${areas[areas.length - 1]}`);
    assert.equal(yes.summaryActions[0].dateOfObservation, workDay);
    assert.equal(withCheckpointAnswer(yes, 7, { value: "Yes" }, { master: noStations, dueDate: workDay }).rodentCatches?.length, 1, "Yes again with a row there: nothing added");
    const no = withCheckpointAnswer(yes, 7, { value: "No" }, { master: noStations, dueDate: workDay });
    assert.deepEqual([no.checkpoints[7].value, no.rodentCatches, no.summaryActions], ["No", [], []], "back to No: the suggestion goes");
    const edited = { ...yes, rodentCatches: [{ ...withoutSuggested(yes.rodentCatches![0]), location: "Scrap yard" }], summaryActions: [{ ...withoutSuggested(yes.summaryActions[0]), remarks: "box re-baited" }, { id: "act-own", dateOfObservation: workDay, descriptionOfObservation: "Gap under the gate", actionTaken: "Sealed", remarks: "" }] };
    const noAfterEdit = withCheckpointAnswer(edited, 7, { value: "No" }, { master: noStations, dueDate: workDay });
    assert.deepEqual(noAfterEdit.rodentCatches, [], "every catch row goes with the No: the hidden table could not be changed, and the reports would still count it");
    assert.equal(noAfterEdit.summaryActions.length, 2, "the Summary lines the person wrote or changed stay, in the table they can see");
    const confirmed = withSuggestionsConfirmed(yes);
    assert.deepEqual([confirmed.rodentCatches![0].suggested, confirmed.summaryActions[0].suggested, confirmed.rodentCatches![0].trapBoxNo], [undefined, undefined, "RB-50"], "Submit confirms the rows: the marks come off, the words stay");
    assert.equal(withSuggestionsConfirmed(day), day, "nothing marked: the same data");
    const other = withCheckpointAnswer(day, 8, { value: "Yes", note: "RC23" }, { master: noStations, dueDate: workDay });
    assert.deepEqual([other.checkpoints[8], other.rodentCatches, other.summaryActions], [{ value: "Yes", note: "RC23" }, undefined, []], "another check point: simply answered");
  });
});
