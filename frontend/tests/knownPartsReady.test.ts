// A RECORD NOTHING HAS BEEN OBSERVED ON IS NEVER "READY" (REQUIREMENTS §98; the people review of 9-Oct-2026).
//
// The Defect Detection System Camera Challenge Test (F: QA/PRO/FL/CCT/01) marks no box required, so the submit checks
// pass it empty: the morning prepare wrote "Nothing is left to enter. Check it, then submit it.", the notification
// called it ready, the briefing put it under "ready for your OK" and the super admin's summary counted it "Ready to
// submit: 1", though it held only a line id and the date. Under the owner's decision of 8-Oct-2026 (no invented
// observations) a record whose every observation is empty is the person's to fill: "needs input", with the entries of
// its first line counted. engine/knownParts.ts entriesWaiting says so for the prepare's notes, the briefing, and the
// engine host's today and notification plan alike.
// Run: npm run test:unit -- knownPartsReady
import test from "node:test";
import assert from "node:assert/strict";
import type { LogSheetData, RecordInstance } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { masterRepository, ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { ensureSeeded as ensureHrMasterSeeded } from "../src/data/repositories/hrMasterRepository";
import { recordRepository } from "../src/data/repositories/recordRepository";
import { getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import { entriesWaiting, prepareKnownParts } from "../src/engine/knownParts";
import { computeBriefing } from "../src/engine/assistantBriefing";
import { columnKind } from "../src/engine/observations";
import { validateForSubmit } from "../src/engine/validation";
import { nextWorkingDay } from "../src/engine/holidays";
import { todayISO } from "../src/utils/date";

ensureDocumentsSeeded();
ensureMasterSeeded();
ensureHrMasterSeeded();

const master = masterRepository.get();
const camera = documentRepository.getAllUnscoped().find((d) => d.id === "qc-camera-challenge-test")!;
const day = nextWorkingDay(todayISO(), master);

function asRecord(documentId: string, dueDate: string, data: unknown, extra: Partial<RecordInstance> = {}): RecordInstance {
  return {
    id: `ready-${documentId}-${dueDate}`,
    documentId,
    periodKey: `${documentId}:ready:${dueDate}`,
    dueDate,
    status: "In Progress",
    isDemo: false,
    data,
    createdAt: `${dueDate}T03:00:00.000Z`,
    updatedAt: `${dueDate}T03:00:00.000Z`,
    ...extra,
  };
}

test("the camera test marks no box required: the submit checks alone would pass it empty", () => {
  assert.ok(camera, "the Camera Challenge Test is in the catalogue");
  const made = prepareKnownParts(camera, day, master, undefined)!;
  assert.ok(made, "it is prepared");
  assert.equal(validateForSubmit(camera, asRecord(camera.id, day, made.data)).errors.length, 0);
});

test("prepared, the camera test waits for the person: every observation of its first line, never 'Nothing is left to enter'", () => {
  const made = prepareKnownParts(camera, day, master, undefined)!;
  const layout = getLogSheetLayout(camera.id)!;
  const observed = layout.columns.filter((c) => columnKind(c) === "observation");
  assert.equal(made.waiting, observed.length, `waiting ${made.waiting}, observation columns ${observed.map((c) => c.label).join(", ")}`);
  assert.ok(!made.notes.some((n) => n.includes("Nothing is left to enter")), made.notes.join(" | "));
  assert.ok(made.notes.some((n) => /^Left for you: /.test(n)), made.notes.join(" | "));
});

test("one observation written by the person and it is ready for the OK; a box the checks ask for still counts as before", () => {
  const made = prepareKnownParts(camera, day, master, undefined)!;
  const data = structuredClone(made.data) as LogSheetData;
  assert.equal(entriesWaiting(camera, asRecord(camera.id, day, data)).length, made.waiting);
  data.rows[0].marksMade = 4;
  data.rows[0].marksDetected = 4;
  data.rows[0].result = "Pass";
  assert.deepEqual(entriesWaiting(camera, asRecord(camera.id, day, data)), []);
});

test("across the catalogue: a prepared log sheet that holds no observation is never ready", () => {
  let blank = 0;
  for (const doc of documentRepository.getRecordable()) {
    if (doc.kind !== "log-sheet") continue;
    const made = prepareKnownParts(doc, day, master, undefined);
    if (!made) continue;
    const layout = getLogSheetLayout(doc.id);
    if (!layout) continue;
    const observed = layout.columns.filter((c) => columnKind(c) === "observation");
    const rows = (made.data as LogSheetData).rows ?? [];
    const any = rows.some((r) => observed.some((c) => r[c.key] !== null && r[c.key] !== undefined && `${r[c.key]}`.trim() !== ""));
    if (observed.length === 0 || any) continue;
    blank += 1;
    assert.ok(made.waiting > 0, `${doc.formatNo} ${doc.name}: nothing observed, yet waiting ${made.waiting}`);
  }
  assert.ok(blank > 0, "some prepared sheets hold no observation (their lines are the day's)");
});

test("the briefing puts a blank prepared camera test under 'needs a detail only you know', never 'ready for your OK'", () => {
  const today = todayISO();
  const made = prepareKnownParts(camera, today, master, undefined)!;
  const record = asRecord(camera.id, today, made.data, { id: "ready-camera-briefing", prepared: { at: `${today}T03:00:00.000Z`, by: "assistant", notes: made.notes, basedOn: made.basedOn, knownPartsOnly: true } });
  recordRepository.upsert(record);
  try {
    const b = computeBriefing("Ajay Sinh Vaghela");
    assert.ok(!b.ready.some((i) => i.recordId === record.id), "listed as ready");
    assert.ok(b.needsInput.some((i) => i.recordId === record.id), "not listed as needing input");
  } finally {
    recordRepository.remove(record.id);
  }
});
