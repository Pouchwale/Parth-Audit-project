// ONE SEARCH OVER WHAT EVERY RECORD SAYS (REQUIREMENTS §75.4).
//
// engine/recordText.ts turns a record into the text Search looks in and the
// values a result's line shows; engine/recordSearch.ts keeps that text for
// every record in an index outside the page, brought up to date record by
// record. These tests hold the rules a person can see the effect of:
//   - a date written on a record is found the way every screen shows it
//     (14-Aug-2026), and the way the plant writes it (14.08.2026), not only as
//     it is stored (2026-08-14);
//   - only what people wrote is a record's words: what the system or the
//     assistant noted in its history is not;
//   - a result's line shows the words that matched, even in a long value with
//     runs of spaces or line breaks in it;
//   - an edit that leaves updatedAt alone (the boot migrations' upsertMany) is
//     still read again, and the index built for one account is never the
//     answer for another signed in on the same tab;
//   - a format number with other words searches those words in that
//     document's records, instead of listing its register and dropping them;
//   - the heading of a result's line is apart from the values people wrote,
//     so the page can keep Google Translate off the values (§58).
import test from "node:test";
import assert from "node:assert/strict";
import type { RecordInstance } from "../src/types";
import { ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { recordRepository } from "../src/data/repositories/recordRepository";
import { documentsByFormatNumber } from "../src/engine/formatNumbers";
import * as recordText from "../src/engine/recordText";
import * as recordSearch from "../src/engine/recordSearch";
import { recordSearchText, snippetFor } from "../src/engine/recordText";
import { ensureRecordIndex, recordIndexStatus, searchRecords } from "../src/engine/recordSearch";

ensureDocumentsSeeded();
ensureMasterSeeded();

const CAPA = { name: "Internal CAPA", formatNo: "F/QA/01", kind: "gap-inspection" };

function record(id: string, documentId: string, data: unknown, extra: Partial<RecordInstance> = {}): RecordInstance {
  return {
    id,
    documentId,
    periodKey: "2026-08-14",
    dueDate: "2026-08-14",
    status: "Pending Verification",
    isDemo: false,
    data,
    createdAt: "2026-08-14T09:00:00.000Z",
    updatedAt: "2026-08-14T10:00:00.000Z",
    submittedBy: "Roshni",
    submittedAt: "2026-08-14T10:00:00.000Z",
    ...extra,
  };
}

/** Brings the index fully up to date, as the Search page's effect and idle time would. */
async function settle(opts: Parameters<typeof ensureRecordIndex>[0]): Promise<void> {
  ensureRecordIndex(opts);
  for (let i = 0; i < 2000 && !recordIndexStatus().complete; i++) {
    await new Promise((r) => setTimeout(r, 0));
    ensureRecordIndex(opts);
  }
  assert.ok(recordIndexStatus().complete, "the index finished");
}

// ---------------------------------------------------------------------------
// 8. dates

test("a date written on a record is found as the screens show it and as the plant writes it", () => {
  const r = record("t-date", "gap-inspection", { findings: [{ findingOfInspection: "Door gap near dispatch", targetDate: "2026-08-29" }], handwritten: "12.09.2026" });
  const { text, cells } = recordSearchText(r, CAPA);
  for (const form of ["2026-08-29", "29-aug-2026", "29/08/2026", "29.08.2026", "29-08-2026"]) assert.ok(text.includes(form), `the target date is found as ${form}`);
  // Written the plant's way, found the other ways too.
  for (const form of ["12.09.2026", "2026-09-12", "12-sep-2026"]) assert.ok(text.includes(form), `12.09.2026 is found as ${form}`);
  const target = cells.find((c) => c.label === "Target date");
  assert.equal(target?.value, "29-Aug-2026", "the line a result shows reads the date as every screen does");
  assert.equal(cells.find((c) => c.label === "Handwritten")?.value, "12.09.2026", "a date written by hand is shown as it was written");
  // The record's own day too, in every form.
  for (const form of ["14/08/2026", "14.08.2026"]) assert.ok(text.includes(form));
});

test("nothing is invented from a value that is not a date", () => {
  const r = record("t-notdate", "gap-inspection", { a: "2026-13-45", b: "31.02.2026", c: "10/18/2025", d: "M-68 2026-08-14 overhaul" });
  const { text, cells } = recordSearchText(r, CAPA);
  assert.ok(!text.includes("45-") && !text.includes("undefined"), "a month 13 is not a date");
  assert.ok(!text.includes("03-mar-2026") && !text.includes("31-feb"), "31 February is not a date");
  // The HR sheet's slashes are month first ("10/18/2025"): read as written, never turned round.
  assert.ok(!text.includes("18-oct-2025") && !text.includes("10-jun"), "a slashed date is left as written");
  assert.equal(cells.find((c) => c.label === "D")?.value, "M-68 2026-08-14 overhaul", "a date inside a sentence is left as written");
});

test("a register line named by a date is named as the screens show it", () => {
  const layout = {
    headerFields: [],
    columns: [
      { key: "failureDate", label: "Date of failure" },
      { key: "machine", label: "Machine" },
    ],
    rowMode: { kind: "free" },
  } as unknown as Parameters<typeof recordSearchText>[2];
  const r = record("t-reg", "mnt-breakdown", { header: {}, rows: [{ id: "x", failureDate: "2026-08-14", machine: "M-13" }] });
  const { cells } = recordSearchText(r, { name: "Breakdown", formatNo: "F/MNT/06", kind: "log-sheet" }, layout);
  const machine = cells.find((c) => c.label === "Machine");
  assert.equal(machine?.where, "14-Aug-2026");
});

// ---------------------------------------------------------------------------
// 11. the history's notes

test("what the system or the assistant noted in a record's history is not the record's words", () => {
  const r = record("t-history", "gap-inspection", { findings: [] }, {
    history: [
      { id: "h1", at: "2026-08-14T09:00:00.000Z", by: "Assistant", action: "prepared", note: "zqxprepared from the specimen" },
      { id: "h2", at: "2026-08-14T09:10:00.000Z", by: "System", action: "edited", note: "zqxsystem tube light dates corrected" },
      { id: "h3", at: "2026-08-14T09:20:00.000Z", by: "Assistant", action: "assistant-edit", note: "zqxassistant filled the sample" },
      { id: "h4", at: "2026-08-14T09:30:00.000Z", by: "Roshni", action: "edited", note: "zqxperson trap count fixed" },
    ],
  });
  const { text } = recordSearchText(r, CAPA);
  assert.ok(text.includes("zqxperson"), "a person's note is searched");
  assert.ok(!text.includes("zqxsystem"), "the system's note is not");
  assert.ok(!text.includes("zqxassistant"), "the assistant's note is not");
  assert.ok(!text.includes("zqxprepared"), "the preparation's note is not");
});

// ---------------------------------------------------------------------------
// 12. the excerpt

test("a long value's excerpt holds the matched word, however many spaces come before it", () => {
  const long = `Observed${" ".repeat(12)}\n`.repeat(25) + "filler words here ".repeat(4) + "zqxneedle" + " and the rest of the remark".repeat(8);
  const r = record("t-excerpt", "gap-inspection", { remarks: long });
  const { cells } = recordSearchText(r, CAPA);
  const line = snippetFor(cells, ["zqxneedle"]);
  assert.ok(line.includes("zqxneedle"), `the excerpt shows the word: ${line}`);
});

// ---------------------------------------------------------------------------
// 13. the index: an edit that keeps updatedAt, and another account

test("an edit that keeps updatedAt (a boot migration's upsertMany) is read again", async () => {
  const before = record("t-stamp", "gap-inspection", { findings: [{ findingOfInspection: "zqxold gap under the door" }] });
  recordRepository.upsertMany([before]);
  await settle({ isDemo: false });
  assert.equal(searchRecords("zqxold", { isDemo: false }).total, 1);

  // What a boot migration does: a new dueDate and new words, updatedAt kept (upsertMany).
  const stored = recordRepository.getById("t-stamp")!;
  recordRepository.upsertMany([{ ...stored, dueDate: "2026-08-17", data: { findings: [{ findingOfInspection: "zqxnew gap under the door" }] } }]);
  await settle({ isDemo: false });
  const found = searchRecords("zqxnew", { isDemo: false });
  assert.equal(found.total, 1, "the record's new words are found");
  assert.equal(found.hits[0]?.dueDate, "2026-08-17", "at its new date");
  assert.equal(searchRecords("zqxold", { isDemo: false }).total, 0, "and its old words are not");
});

test("the index built for one account is never the answer for another signed in on the same tab", async () => {
  recordRepository.upsertMany([record("t-account", "gap-inspection", { findings: [{ findingOfInspection: "zqxaccount seal torn" }] })]);
  // Signed out and in again as somebody else, on the same tab (a sign-out does not reload it).
  const asA = { isDemo: false, account: "user-a" } as Parameters<typeof ensureRecordIndex>[0];
  const asB = { isDemo: false, account: "user-b" } as Parameters<typeof searchRecords>[1];
  await settle(asA);
  assert.equal(searchRecords("zqxaccount", asA).total, 1);
  const other = searchRecords("zqxaccount", asB);
  assert.equal(other.total, 0, "the index built for another account answers nothing");
  assert.equal(other.ready, false, "and says the search is not ready");
  await settle(asB);
  assert.equal(searchRecords("zqxaccount", asB).total, 1, "once built for this account, it answers");
});

test("a draft re-marked as a holiday at boot, updatedAt kept, no longer answers to its old words", async () => {
  // A pest round only the assistant has prepared: searched when drafts are asked for.
  const draft = record(
    "t-holiday",
    "daily-pest-monitoring",
    { isHoliday: false, checkpoints: { "8": { value: "NOT OK", note: "zqxdraftnote near RB-9" } }, summaryActions: [], rodentCatches: [] },
    { status: "In Progress", submittedBy: undefined, submittedAt: undefined, prepared: { at: "2026-08-14T10:00:00.000Z", by: "assistant", notes: [], basedOn: "the specimen" } }
  );
  recordRepository.upsertMany([draft]);
  const withDrafts = { isDemo: false, includeDrafts: true };
  await settle(withDrafts);
  assert.equal(searchRecords("zqxdraftnote", withDrafts).total, 1);
  // What engine/calendarMigration.ts does to it on a closed day, through upsertMany.
  const stored = recordRepository.getById("t-holiday")!;
  recordRepository.upsertMany([{ ...stored, data: { ...(stored.data as object), isHoliday: true, checkpoints: {}, summaryActions: [], rodentCatches: [] } }]);
  await settle(withDrafts);
  assert.equal(searchRecords("zqxdraftnote", withDrafts).total, 0, "the cleared checkpoint note is not found any more");
});

// ---------------------------------------------------------------------------
// 9. a format number with other words

test("a format number and other words search those words in that document's records", async () => {
  recordRepository.upsertMany([
    record("t-pest", "daily-pest-monitoring", { checkpoints: { "8": { value: "NOT OK", note: "zqxrb-27 droppings" } } }),
    record("t-capa", "gap-inspection", { findings: [{ findingOfInspection: "zqxrb-27 bait station missing" }] }),
  ]);
  await settle({ isDemo: false });
  assert.equal(searchRecords("zqxrb-27", { isDemo: false }).total, 2, "both records say it");
  const pestDoc = documentsByFormatNumber("F/HR/17").map((d) => d.id);
  const only = searchRecords("zqxrb-27", { isDemo: false, documentIds: pestDoc } as Parameters<typeof searchRecords>[1]);
  assert.deepEqual(
    only.hits.map((h) => h.id),
    ["t-pest"],
    "restricted to F/HR/17's records"
  );

  const readSearchQuery = (recordSearch as Record<string, unknown>).readSearchQuery as (q: string) => { kind: string; words?: string; documentIds: string[] | null };
  assert.equal(typeof readSearchQuery, "function", "the query is read in one place");
  const mixed = readSearchQuery("F/HR/17 RB-27");
  assert.equal(mixed.kind, "words", "F/HR/17 RB-27 looks for RB-27, not the register");
  assert.equal(mixed.words, "RB-27");
  assert.deepEqual(mixed.documentIds, pestDoc);
  assert.equal(readSearchQuery("hr 5 roshni").words, "roshni");
  assert.deepEqual(readSearchQuery("hr 5 roshni").documentIds, documentsByFormatNumber("F/HR/05").map((d) => d.id));
  assert.equal(readSearchQuery("QC-30 Gaurav").words, "Gaurav");
  assert.equal(readSearchQuery("F HR 05 induction").words, "induction");
  assert.equal(readSearchQuery("F-QC-40.C 180").words, "180");
});

test("every search the Playwright suites make is read as it was", () => {
  const readSearchQuery = (recordSearch as Record<string, unknown>).readSearchQuery as (q: string) => { kind: string; words?: string; documentIds: string[] | null };
  assert.equal(typeof readSearchQuery, "function");
  // e2e_format_numbers, e2e_qc_formats, e2e_hr_master_data: the register, and the documents the number names.
  for (const q of ["F/HR/05", "f-hr-05", "F HR 05", "FHR05", "hr 5", "HR/05", "F-QC-40.C", "f/qc/40c", "QA-CAF-00", "F/MKT/05", "f-prd-18", "F/HR/17", "F/QC/12", "F/HR/01", "F/HR/10", "F/QC/11", "F/QC/01", "F/QC/15-E", "F/QC/21", "open F/HR/05"]) {
    const read = readSearchQuery(q);
    assert.equal(read.kind, "register", `${q} lists the register`);
    assert.deepEqual(read.documentIds, documentsByFormatNumber(q).map((d) => d.id), `${q}: the documents it names`);
  }
  assert.deepEqual(readSearchQuery("F/HR/10").documentIds, [], "a number the system does not hold names nothing");
  // e2e_insights, e2e_smoke, e2e_departments, e2e_hr_master_data: words, over every document.
  for (const q of ["usimeca", "m-13 lux", "Playwright QA", "Gaurav Singh", "pest", "1024", "hr master"]) {
    const read = readSearchQuery(q);
    assert.equal(read.kind, "words", `${q} is looked for in the records`);
    assert.equal(read.words, q);
    assert.equal(read.documentIds, null, `${q} is not kept to any document`);
  }
});

// ---------------------------------------------------------------------------
// 10. the heading apart from what people wrote

test("a result's line keeps the heading apart from the values people wrote", () => {
  const r = record("t-parts", "gap-inspection", { findings: [{ findingOfInspection: "Gaurav Singh saw zqxparts near M-68", targetDate: "2026-08-29" }] });
  const { cells } = recordSearchText(r, CAPA);
  const snippetParts = (recordText as Record<string, unknown>).snippetParts as (c: typeof cells, t: string[]) => { where: string; label: string; value: string }[];
  assert.equal(typeof snippetParts, "function", "the line comes in parts");
  const parts = snippetParts(cells, ["zqxparts", "29-aug"]);
  assert.deepEqual(parts, [
    { where: "Finding 1", label: "Finding", value: "Gaurav Singh saw zqxparts near M-68" },
    { where: "", label: "Target date", value: "29-Aug-2026" },
  ]);
  // The string the parts make is the line as it always read.
  assert.equal(snippetFor(cells, ["zqxparts", "29-aug"]), "Finding 1 · Finding: Gaurav Singh saw zqxparts near M-68 · Target date: 29-Aug-2026");

  // Cut to what the result's cell has room for: only values are cut, and never past the room.
  const clipSnippet = (recordText as Record<string, unknown>).clipSnippet as (p: typeof parts, max: number) => typeof parts;
  const snippetText = (recordText as Record<string, unknown>).snippetText as (p: typeof parts) => string;
  assert.deepEqual(clipSnippet(parts, 200), parts, "a line that fits is left whole");
  const long = [{ where: "Row 3", label: "Remarks", value: "x".repeat(120) }, { where: "", label: "Operator", value: "Gaurav Singh" }];
  const cut = clipSnippet(long, 90);
  assert.equal(cut.length, 1, "a part with no room left is left off");
  assert.equal(cut[0].where, "Row 3");
  assert.equal(cut[0].label, "Remarks");
  assert.ok(cut[0].value.endsWith("…"), "the value cut says so");
  assert.ok(snippetText(cut).length <= 90, `no longer than the room: ${snippetText(cut).length}`);
  const two = clipSnippet([{ where: "", label: "Finding", value: "y".repeat(80) }, { where: "", label: "Target date", value: "29-Aug-2026" }], 90);
  assert.equal(two.length, 1);
  assert.ok(two[0].value.endsWith("…"), "when the next heading does not fit, the value before it ends with …");
  assert.ok(snippetText(two).length <= 90);
});
