// THE FIRST ITEM OF AN EMPTY LIST (REQUIREMENTS §98: nothing invented, nothing lost).
//
// Through Mitra's patch the first item added to an empty list — F/HR/17's
// first rodent catch, the first finding of an inspection findings report, the
// first name on a training attendance sheet — used to be stored as {}: with no
// item to copy the shape from, every key the model gave was dropped as "not a
// field", and validateForSubmit then threw a TypeError on the box that was not
// there. The item's shape now comes from the record kind itself
// (engine/recordPatch.ts LIST_TEMPLATES), and the check reads each box
// defensively: a missing one is reported as a problem, never thrown.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyAssistantPatch } from "../src/engine/recordPatch";
import { validateForSubmit } from "../src/engine/validation";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import type { DailyPestMonitoringData, GapInspectionData, RecordInstance, TrainingRecordData } from "../src/types";

ensureMasterSeeded();
ensureDocumentsSeeded();

const pestData = (): DailyPestMonitoringData => ({
  isHoliday: false,
  checkpoints: {},
  timeOfChecking: "",
  checker: "",
  summaryActions: [],
  rodentCatches: [],
});

const gapData = (): GapInspectionData => ({
  inspectionDate: "",
  premisesName: "",
  premisesAddress: "",
  contactPerson: "",
  findings: [],
  generalComments: [],
});

const trainingData = (): TrainingRecordData => ({
  trainingDate: "",
  trainingType: "",
  trainerProvider: "",
  topics: [],
  attendees: [],
  certificateRef: "",
  remarks: "",
});

describe("the first item added to an empty list through Mitra's patch", () => {
  it("F/HR/17: the first rodent catch keeps its trap box, location and count", () => {
    const out = applyAssistantPatch("daily-pest-monitoring", "daily-pest-monitoring", pestData(), {
      rodentCatches: [{ trapBoxNo: "RB-27", location: "Store", count: 2 }],
    });
    assert.deepEqual(out.problems, []);
    const c = out.data.rodentCatches?.[0];
    assert.ok(c, "one catch stored");
    assert.equal(c.trapBoxNo, "RB-27");
    assert.equal(c.location, "Store");
    assert.equal(c.count, 2);
    assert.ok(typeof c.id === "string" && c.id.length > 0, "the catch has an id");
  });

  it("a record saved before rodentCatches existed gets its first catch the same way", () => {
    const { rodentCatches: _none, ...old } = pestData();
    void _none;
    const out = applyAssistantPatch("daily-pest-monitoring", "daily-pest-monitoring", old as DailyPestMonitoringData, {
      rodentCatches: [{ trapBoxNo: "RB-3", location: "Dispatch", count: 1 }],
    });
    assert.deepEqual(out.problems, []);
    assert.equal(out.data.rodentCatches?.[0]?.location, "Dispatch");
    assert.equal(out.data.rodentCatches?.[0]?.count, 1);
  });

  it("the first CAPA finding keeps its fields and starts Open / Internal with an id and S. No. 1", () => {
    const out = applyAssistantPatch("gap-inspection", "gap-inspection", gapData(), {
      findings: [{ findingOfInspection: "Gap under the store door", correctiveActionClient: "Fit a door sweep", targetDate: "2026-10-20" }],
    });
    assert.deepEqual(out.problems, []);
    const f = out.data.findings[0];
    assert.ok(f, "one finding stored");
    assert.equal(f.findingOfInspection, "Gap under the store door");
    assert.equal(f.correctiveActionClient, "Fit a door sweep");
    assert.equal(f.targetDate, "2026-10-20");
    assert.equal(f.status, "Open");
    assert.equal(f.source, "Internal");
    assert.equal(f.sNo, 1);
    assert.ok(typeof f.id === "string" && f.id.length > 0, "the finding has an id");
  });

  it("the first training attendee keeps the name and department", () => {
    const out = applyAssistantPatch("training-record", "training-record", trainingData(), {
      attendees: [{ employeeName: "Rahul Patel", department: "Production" }],
    });
    assert.deepEqual(out.problems, []);
    const a = out.data.attendees[0];
    assert.ok(a, "one attendee stored");
    assert.equal(a.employeeName, "Rahul Patel");
    assert.equal(a.department, "Production");
    assert.ok(typeof a.id === "string" && a.id.length > 0, "the attendee has an id");
  });

  it("the first summary action of F/HR/17 keeps its words", () => {
    const out = applyAssistantPatch("daily-pest-monitoring", "daily-pest-monitoring", pestData(), {
      summaryActions: [{ descriptionOfObservation: "Fly killer off", actionTaken: "Switched on" }],
    });
    assert.deepEqual(out.problems, []);
    assert.equal(out.data.summaryActions[0]?.descriptionOfObservation, "Fly killer off");
    assert.equal(out.data.summaryActions[0]?.actionTaken, "Switched on");
  });
});

describe("validateForSubmit on an item missing a box", () => {
  it("reports a rodent catch with no location as a problem instead of throwing", () => {
    const doc = documentRepository.getById("daily-pest-monitoring");
    assert.ok(doc);
    const data = pestData();
    data.checkpoints = { 7: { value: "Yes" } };
    data.rodentCatches = [{ id: "c1" } as unknown as NonNullable<DailyPestMonitoringData["rodentCatches"]>[number]];
    let result: ReturnType<typeof validateForSubmit> | undefined;
    assert.doesNotThrow(() => {
      result = validateForSubmit(doc, { data } as unknown as RecordInstance);
    });
    assert.ok(result && !result.valid);
    assert.ok(result.errors.some((e) => /Rodent catch #1: location is required/.test(e)), result.errors.join(" | "));
  });

  it("reports a finding with no description as a problem instead of throwing", () => {
    const doc = documentRepository.getById("gap-inspection");
    assert.ok(doc);
    const data = gapData();
    data.inspectionDate = "2026-10-14";
    data.findings = [{ id: "f1", sNo: 1 } as unknown as GapInspectionData["findings"][number]];
    let result: ReturnType<typeof validateForSubmit> | undefined;
    assert.doesNotThrow(() => {
      result = validateForSubmit(doc, { data } as unknown as RecordInstance);
    });
    assert.ok(result && !result.valid);
    assert.ok(result.errors.some((e) => /Finding #1: description is required/.test(e)), result.errors.join(" | "));
  });
});
