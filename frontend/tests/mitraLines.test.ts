// MITRA ADDS, CHANGES AND DELETES ANYTHING IN ANY RECORD: THE TOOLS (REQUIREMENTS §113, engine/mitraTools.ts,
// engine/recordTarget.ts). The engine's half (recordLines.test.ts) proved the patch; this proves what the website
// does with it:
//   * edit_open_record's schema carries the four operations with their shapes, and never replaceList — and
//     replaceList sent by the model is struck, so a list is never replaced through Mitra;
//   * the dry run (previewPatch) names the lines it would remove or clear in their own words, writing nothing;
//   * a deletion or a clear is ASKED first, on a draft too, in those words — "No" changes nothing, "Yes" does it;
//   * an added line needs no question, is handed to the host for its Undo, and the Undo takes off exactly that
//     line by id, leaving everything written since;
//   * the Ask Mitra page finds the record its words name: the document by number as the paper prints it, the
//     date by its words, and asks when it cannot;
//   * the person's level (§96): Read refused, Write refused under correction, Edit on a signed-off record carries
//     its reason into the reopen.
// Run: npm run test:unit -- mitraLines
import test from "node:test";
import assert from "node:assert/strict";
import type { AssistantTarget } from "../src/store/AssistantContext";
import type { AddedLines, MitraToolContext } from "../src/engine/mitraTypes";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded, masterRepository } from "../src/data/repositories/masterRepository";
import { ensureSeeded as ensureRecordsSeeded, recordRepository } from "../src/data/repositories/recordRepository";
import { createDefaultData } from "../src/engine/recordDefaults";
import { createRecordForDocument } from "../src/engine/recordCrud";
import { setAccessRules, setAccessScope, setDepartmentScope } from "../src/engine/departmentScope";
import { ALL_TOOLS, mitraTools, previewPatch, runTool, toolSchemas, undoAddedLines } from "../src/engine/mitraTools";
import { dateInWords, documentInWords, resolveRecordTarget } from "../src/engine/recordTarget";
import { addDays, todayISO } from "../src/utils/date";

ensureDocumentsSeeded();
ensureMasterSeeded();
ensureRecordsSeeded();

if (typeof (globalThis as { location?: unknown }).location === "undefined") {
  Object.defineProperty(globalThis, "location", { value: { hash: "" }, configurable: true, writable: true });
}

const today = todayISO();
type Obj = Record<string, unknown>;

interface TestCtx extends MitraToolContext {
  confirmations: string[];
  buttons: { yes: string; no: string }[];
  added: AddedLines[];
}

function ctxOf(over: Partial<MitraToolContext> = {}, answer = true): TestCtx {
  const confirmations: string[] = [];
  const buttons: { yes: string; no: string }[] = [];
  const added: AddedLines[] = [];
  return {
    today,
    isDemo: true,
    language: "en",
    userName: "Unit Test",
    currentRoute: "/record/rec-fake",
    navigate: () => {},
    target: null,
    bump: () => {},
    attachments: [],
    confirm: async (question, yes, no) => {
      confirmations.push(question);
      buttons.push({ yes, no });
      return answer;
    },
    userWords: "unit test words",
    linesAdded: (info) => {
      added.push(info);
    },
    ...over,
    confirmations,
    buttons,
    added,
  };
}

function fakeTarget(kind: string, documentId: string, data: unknown, over: Partial<AssistantTarget> = {}) {
  let current = data;
  const commits: { data: unknown; note: string }[] = [];
  const reopened: string[] = [];
  const target: AssistantTarget = {
    documentKind: kind,
    documentId,
    recordId: "rec-fake",
    status: "In Progress",
    editable: true,
    currentData: data,
    getData: () => current,
    commit: (next, note) => {
      commits.push({ data: next, note });
      current = next;
    },
    title: "the test record",
    ...over,
  };
  if (!("reopen" in over) && over.editable === false) target.reopen = (reason) => reopened.push(reason);
  return { target, commits, reopened, current: () => current };
}

const run = (ctx: MitraToolContext, name: string, args: unknown) => {
  const found = mitraTools(ctx).find((x) => x.name === name);
  assert.ok(found, `${name} is offered here`);
  return runTool(found!, JSON.stringify(args), ctx);
};

// A free sheet (rows a person writes): the Adhesive Mixing Ratio Record, three lines written.
const FREE = "qc-adhesive-mixing";
const row = (id: string, time: string, viscosity: number, checkedBy: string): Obj => ({ id, date: today, time, adhesive: 15, hardener: 1.65, ethyl: 19.5, viscosity, remark: "", checkedBy, verifiedBy: "" });
const freeSheet = (): Obj => ({ header: {}, rows: [row("r1", "09:00", 20.1, "Jeni"), row("r2", "09:30", 20.2, "Jeni"), row("r3", "10:00", 20.3, "Singh")] });

// ---------------------------------------------------------------------------

test("edit_open_record's schema carries the four operations with their shapes, and never replaceList", () => {
  const edit = ALL_TOOLS.find((x) => x.name === "edit_open_record")!;
  const schema = JSON.stringify(edit.parameters);
  for (const shape of [
    '[{"collection": "rows", "match": {"id"|"row"|"<name key>"}, "set": {...}}]',
    '{"rows": [{"time": "10:00", "viscosity": 20.4}, {"values": {...}, "after": 2}]}',
    '{"rows": ["row-abc", 3, {"time": "11:00"}]}',
    '{"rows": [{"row": 3, "keys": ["viscosity"]}, 4]}',
  ]) {
    assert.ok(schema.includes(JSON.stringify(shape).slice(1, -1)), `the schema carries ${shape}`);
  }
  for (const op of ["itemEdits", "addItems", "removeItems", "clearItems"]) assert.ok(schema.includes(`"${op}"`), `${op} is a named property`);
  assert.ok(!schema.includes("replaceList"), "replaceList is never offered to the model");
  assert.ok(/[Nn]ever .*whole list/.test(edit.description) || /[Nn]ever .*whole list/.test(schema), "the model is told never to send a whole list");
  assert.ok(edit.description.length <= 140, `the description is ${edit.description.length} characters`);
  assert.ok(!JSON.stringify(toolSchemas(ALL_TOOLS)).includes("replaceList"));
});

test("replaceList from the model is struck: a list sent whole with it keeps every line", () => {
  const before = freeSheet();
  const p = previewPatch("log-sheet", FREE, before, { rows: [{ id: "r1", viscosity: 20.9 }], replaceList: true });
  assert.equal((p.data.rows as Obj[]).length, 3, "no line was lost");
  assert.equal((p.data.rows as Obj[])[0].viscosity, 20.9);
  assert.deepEqual(p.removed, []);
});

test("the dry run names the lines it would remove or clear in their own words, and writes nothing", () => {
  const before = freeSheet();
  const gone = previewPatch("log-sheet", FREE, before, { removeItems: { rows: [2] } });
  assert.equal(gone.removed.length, 1);
  assert.match(gone.removed[0], /^line 2 \(.*09:30.*20\.2.*Jeni\)$/, gone.removed[0]);
  assert.deepEqual(gone.cleared, []);
  assert.equal((before.rows as Obj[]).length, 3, "the record itself is untouched");

  const blanked = previewPatch("log-sheet", FREE, before, { clearItems: { rows: [{ row: 3, keys: ["viscosity", "checkedBy"] }] } });
  assert.deepEqual(blanked.removed, []);
  assert.equal(blanked.cleared.length, 1);
  assert.match(blanked.cleared[0], /^20\.3, Singh from line 3 \(10:00\)$/, blanked.cleared[0]);

  // A check point cleared on F/HR/17 is a written value lost too.
  const dpm = documentRepository.getById("daily-pest-monitoring")!;
  const data = createDefaultData(dpm, today, masterRepository.get()) as Obj;
  (data.checkpoints as Record<string, Obj>)["3"] = { ...(data.checkpoints as Record<string, Obj>)["3"], value: "Yes" };
  const cp = previewPatch("daily-pest-monitoring", "daily-pest-monitoring", data, { checkpoints: { 3: null } });
  assert.ok(cp.cleared.some((w) => /Yes from Check point 3/.test(w)), JSON.stringify(cp.cleared));

  // Nothing written is lost when a blank is cleared: no question to ask.
  const blankAlready = previewPatch("log-sheet", FREE, before, { clearItems: { rows: [{ row: 1, keys: ["remark"] }] } });
  assert.deepEqual(blankAlready.cleared, []);
  assert.equal(blankAlready.changes.length, 0);
});

test("a deletion is asked first in the line's own words — No keeps it, Yes takes it off", async () => {
  const no = fakeTarget("log-sheet", FREE, freeSheet());
  const ctxNo = ctxOf({ target: no.target, userWords: "delete line 2" }, false);
  const declined = await run(ctxNo, "edit_open_record", { patch: { removeItems: { rows: [2] } } });
  assert.equal(declined.ok, false);
  assert.equal(ctxNo.confirmations.length, 1, "asked once, on a draft");
  assert.match(ctxNo.confirmations[0], /^Delete line 2 \(.*09:30.*Jeni\) from the test record\?$/, ctxNo.confirmations[0]);
  assert.deepEqual(ctxNo.buttons[0], { yes: "Yes, delete it", no: "No, keep it" });
  assert.equal(no.commits.length, 0, "nothing changed on No");
  assert.equal(((no.current() as Obj).rows as Obj[]).length, 3);

  const yes = fakeTarget("log-sheet", FREE, freeSheet());
  const ctxYes = ctxOf({ target: yes.target, userWords: "delete line 2" }, true);
  const done = await run(ctxYes, "edit_open_record", { patch: { removeItems: { rows: [{ id: "r2" }] } } });
  assert.equal(done.ok, true, done.content);
  assert.equal(ctxYes.confirmations.length, 1);
  assert.equal(yes.commits.length, 1);
  const rows = (yes.commits[0].data as Obj).rows as Obj[];
  assert.deepEqual(
    rows.map((r) => r.id),
    ["r1", "r3"],
    "exactly the line named is gone, the rest keep their ids"
  );
  assert.ok(yes.commits[0].note.startsWith("Asked of Mitra: delete line 2"));
  const res = done.result as { removed?: string[] };
  assert.ok(res.removed?.[0] && /line 2/.test(res.removed[0]), done.content);
  assert.equal(ctxYes.added.length, 0, "nothing was added");
});

test("a clear of written values is asked first too; an added line is not, and is handed over for its Undo", async () => {
  const clear = fakeTarget("log-sheet", FREE, freeSheet());
  const ctxClear = ctxOf({ target: clear.target, userWords: "clear line 3" }, true);
  const cleared = await run(ctxClear, "edit_open_record", { patch: { clearItems: { rows: [{ row: 3, keys: ["viscosity"] }] } } });
  assert.equal(cleared.ok, true, cleared.content);
  assert.match(ctxClear.confirmations[0], /^Clear 20\.3 from line 3 \(10:00\) on the test record\?$/, ctxClear.confirmations[0]);
  assert.deepEqual(ctxClear.buttons[0], { yes: "Yes, clear it", no: "No, leave it" });
  assert.equal((((clear.current() as Obj).rows as Obj[])[2] as Obj).viscosity, null);

  const add = fakeTarget("log-sheet", FREE, freeSheet());
  const ctxAdd = ctxOf({ target: add.target, userWords: "add a line 10:30 viscosity 20.4 Jeni" }, false);
  const added = await run(ctxAdd, "edit_open_record", { patch: { addItems: { rows: [{ time: "10:30", viscosity: 20.4, checkedBy: "Jeni" }] } } });
  assert.equal(added.ok, true, added.content);
  assert.equal(ctxAdd.confirmations.length, 0, "an added line needs no question — even with the answer set to No");
  assert.equal(add.commits.length, 1);
  const rows = (add.current() as Obj).rows as Obj[];
  assert.equal(rows.length, 4);
  const line = rows[3];
  assert.equal(line.time, "10:30");
  assert.equal(line.viscosity, 20.4);
  assert.equal(line.checkedBy, "Jeni");
  // §98: only what the person said is written.
  assert.equal(line.remark, "");
  assert.equal(line.verifiedBy, "");
  assert.equal(ctxAdd.added.length, 1);
  assert.equal(ctxAdd.added[0].recordId, "rec-fake");
  assert.deepEqual(
    ctxAdd.added[0].lines.map((l) => [l.collection, l.id]),
    [["rows", line.id]],
    "the host is told exactly which line, by id"
  );
  assert.match(ctxAdd.added[0].lines[0].words, /10:30.*20\.4.*Jeni/);
  assert.match(added.card, /Added 1 line/);

  // The Undo takes off exactly that line — a value written on another line since stays.
  const since = { ...(add.current() as Obj), rows: rows.map((r) => (r.id === "r1" ? { ...r, viscosity: 19.9 } : r)) };
  const undone = undoAddedLines("log-sheet", FREE, since, ctxAdd.added[0].lines);
  assert.deepEqual(undone.problems, []);
  const left = undone.data.rows as Obj[];
  assert.deepEqual(
    left.map((r) => r.id),
    ["r1", "r2", "r3"]
  );
  assert.equal(left[0].viscosity, 19.9, "what was written since the add stays");
});

test("adding, removing and clearing on every kind go through the same tool: a rodent catch, a CAPA finding, an attendee", async () => {
  const dpm = documentRepository.getById("daily-pest-monitoring")!;
  const pest = fakeTarget("daily-pest-monitoring", "daily-pest-monitoring", createDefaultData(dpm, today, masterRepository.get()));
  const ctxPest = ctxOf({ target: pest.target, userWords: "a rodent was caught in RB-27 at the canteen" });
  const caught = await run(ctxPest, "edit_open_record", { patch: { addItems: { rodentCatches: [{ trapBoxNo: "RB-27", location: "Canteen", count: 1 }] } } });
  assert.equal(caught.ok, true, caught.content);
  const catches = (pest.current() as Obj).rodentCatches as Obj[];
  assert.equal(catches.length, 1);
  assert.equal(catches[0].trapBoxNo, "RB-27");
  assert.equal(ctxPest.added[0].lines[0].collection, "rodentCatches");
  assert.equal(ctxPest.confirmations.length, 0);

  const gapDoc = documentRepository.getById("gap-inspection")!;
  const gap = fakeTarget("gap", "gap-inspection", createDefaultData(gapDoc, today, masterRepository.get()));
  const ctxGap = ctxOf({ target: gap.target, userWords: "add a finding: gap under the store door" });
  const found = await run(ctxGap, "edit_open_record", { patch: { addItems: { findings: [{ findingOfInspection: "Gap under the store door" }] } } });
  assert.equal(found.ok, true, found.content);
  const findings = (gap.current() as Obj).findings as Obj[];
  const last = findings[findings.length - 1];
  assert.equal(last.findingOfInspection, "Gap under the store door");
  assert.ok(Number(last.sNo) >= 1, "numbered one past the highest");
  // Removing it again is asked first, by its number.
  const ctxGapNo = ctxOf({ target: gap.target, userWords: `remove finding ${last.sNo}` }, false);
  const kept = await run(ctxGapNo, "edit_open_record", { patch: { removeItems: { findings: [{ no: last.sNo }] } } });
  assert.equal(kept.ok, false);
  assert.match(ctxGapNo.confirmations[0], /Delete finding \d+ \(.*Gap under the store door.*\)/, ctxGapNo.confirmations[0]);
  assert.equal(((gap.current() as Obj).findings as Obj[]).length, findings.length);

  const trDoc = documentRepository.getById("training-record")!;
  const tr = fakeTarget("training", "training-record", createDefaultData(trDoc, today, masterRepository.get()));
  const ctxTr = ctxOf({ target: tr.target, userWords: "Rahul Patel attended" });
  const attended = await run(ctxTr, "edit_open_record", { patch: { addItems: { attendees: [{ employeeName: "Rahul Patel" }] } } });
  assert.equal(attended.ok, true, attended.content);
  const attendees = (tr.current() as Obj).attendees as Obj[];
  assert.equal(attendees[attendees.length - 1].employeeName, "Rahul Patel");
  assert.equal(attendees[attendees.length - 1].department, "", "§98: a department nobody gave is not written");
});

test("the Ask Mitra page finds the record its words name: the document as its paper prints it, the date by its words", () => {
  const viscosity = documentRepository.getById("qc-viscosity")!;
  assert.equal(viscosity.formatNo, "F-QC-30");
  const { record } = createRecordForDocument(viscosity, { dateISO: today, isDemo: true });
  const opts = { today, isDemo: true, userName: "Unit Test" };

  const found = resolveRecordTarget("add a row to F-QC-30 of today", opts);
  assert.equal(found.kind, "found");
  if (found.kind === "found") {
    assert.equal(found.doc.id, "qc-viscosity");
    assert.equal(found.record.id, record.id);
    assert.equal(found.target.documentKind, "log-sheet");
    assert.equal(found.target.recordId, record.id);
    assert.equal(found.target.editable, true);
  }
  // "F/QC/30" is the minutes of meetings, not the viscosity record (REQUIREMENTS §111).
  const slashes = documentInWords("the F/QC/30 of today");
  assert.ok(slashes && "doc" in slashes && slashes.doc.id !== "qc-viscosity", JSON.stringify(slashes));
  // "F QC 30" could be either: asked, never guessed.
  const either = resolveRecordTarget("add a row to F QC 30 of today", opts);
  assert.equal(either.kind, "ask");
  if (either.kind === "ask") assert.match(either.question, /documents carry that number/);
  // No date: asked for one.
  const undated = resolveRecordTarget("add a row to F-QC-30", opts);
  assert.equal(undated.kind, "ask");
  if (undated.kind === "ask") assert.match(undated.question, /Say its date/);
  // A day with no record: said so, nothing started.
  const far = addDays(today, -700);
  const none = resolveRecordTarget(`delete line 3 from F-QC-30 of ${far}`, opts);
  assert.equal(none.kind, "ask");
  if (none.kind === "ask") assert.match(none.question, /There is no F-QC-30/);
  assert.equal(recordRepository.query({ documentId: "qc-viscosity", isDemo: true, dueDate: far }).length, 0);
  // Not about a record at all.
  assert.equal(resolveRecordTarget("hello there", opts).kind, "none");
  // By the words people use for it: one document answers, or several are offered — never a guess.
  const byWords = resolveRecordTarget("add a rodent catch to the daily pest monitoring record of today", opts);
  assert.ok(byWords.kind !== "none", JSON.stringify(byWords));
  if (byWords.kind === "ask") assert.ok(byWords.doc?.id === "daily-pest-monitoring" || /Which document|F\/HR\/17/.test(byWords.question), byWords.question);
  if (byWords.kind === "found") assert.equal(byWords.doc.id, "daily-pest-monitoring");

  // The date's spellings.
  const y = today.slice(0, 4);
  assert.equal(dateInWords("F-QC-30 of today", today), today);
  assert.equal(dateInWords("F-QC-30 of yesterday", today), addDays(today, -1));
  assert.equal(dateInWords("F-QC-30 of 11-Oct", today), `${y}-10-11`);
  assert.equal(dateInWords("F-QC-30 of 11 October", today), `${y}-10-11`);
  assert.equal(dateInWords("F-QC-30 of 11/10/2026", today), "2026-10-11");
  assert.equal(dateInWords("F-QC-30 of 2026-10-11", today), "2026-10-11");
  assert.equal(dateInWords("add a row to F-QC-30", today), null, "a format number's digits are not a date");
});

test("the person's level: Read refused, Write refused under correction, Edit on a signed-off record carries its reason", async () => {
  const dpm = documentRepository.getById("daily-pest-monitoring")!;
  const data = createDefaultData(dpm, today, masterRepository.get());
  // Vinay Bhojak (HR) only reads F/HR/17.
  setAccessScope({ email: "vinay.bhojak@gpp.local", role: "staff", departments: ["HR"] }, null);
  try {
    const read = fakeTarget("daily-pest-monitoring", "daily-pest-monitoring", data);
    const refused = await run(ctxOf({ target: read.target, isDemo: false }), "edit_open_record", { patch: { addItems: { rodentCatches: [{ trapBoxNo: "RB-27", location: "Canteen", count: 1 }] } } });
    assert.equal(refused.ok, false);
    assert.match(refused.content, /Write access/);
    assert.equal(read.commits.length, 0, "nothing half-done");
  } finally {
    setDepartmentScope(null);
    setAccessRules(null);
  }
  // Vinay at Write on F/HR/01: a record under correction is Edit's.
  setAccessScope({ email: "vinay.bhojak@gpp.local", role: "staff", departments: ["HR"] }, { version: 1, people: { "vinay.bhojak@gpp.local": { documents: { "hr-competence": "write" } } }, responsibility: {} });
  try {
    const hr = documentRepository.getAllUnscoped().find((d) => d.id === "hr-competence")!;
    const draft = fakeTarget(hr.kind, "hr-competence", createDefaultData(hr, today, masterRepository.get()));
    const filled = await run(ctxOf({ target: draft.target, isDemo: false }), "edit_open_record", { patch: { remarks: "x" } });
    assert.ok(filled.ok || !/access/.test(filled.content), `Write fills a draft: ${filled.content}`);
    const correcting = fakeTarget(hr.kind, "hr-competence", createDefaultData(hr, today, masterRepository.get()), { correction: true });
    const stopped = await run(ctxOf({ target: correcting.target, isDemo: false }), "edit_open_record", { patch: { remarks: "x" } });
    assert.equal(stopped.ok, false);
    assert.match(stopped.content, /Edit access/);
    assert.equal(correcting.commits.length, 0);
  } finally {
    setDepartmentScope(null);
    setAccessRules(null);
  }
  // Signed off: reopened only after the yes, with the reason given on the reopen line.
  const verified = fakeTarget("log-sheet", FREE, freeSheet(), { editable: false, status: "Verified" });
  const ctx = ctxOf({ target: verified.target, userWords: "delete line 2" }, true);
  const r = await run(ctx, "edit_open_record", { patch: { removeItems: { rows: [2] } }, reason: "written on the wrong line" });
  assert.equal(r.ok, true, r.content);
  assert.equal(ctx.confirmations.length, 1, "one question: the reopen, naming the line");
  assert.match(ctx.confirmations[0], /is Verified\. Reopen it for correction and delete line 2 \(.*09:30.*\)\? Reason: “written on the wrong line”/, ctx.confirmations[0]);
  assert.deepEqual(verified.reopened, ["Asked of Mitra: written on the wrong line"]);
  assert.equal(verified.commits.length, 1);
  assert.equal(((verified.commits[0].data as Obj).rows as Obj[]).length, 2);
  // No reason given: the person's own words stand as the reason.
  const again = fakeTarget("log-sheet", FREE, freeSheet(), { editable: false, status: "Submitted" });
  const ctx2 = ctxOf({ target: again.target, userWords: "take line 3 off, it was a test" }, true);
  await run(ctx2, "edit_open_record", { patch: { removeItems: { rows: [3] } } });
  assert.match(ctx2.confirmations[0], /Reason: “take line 3 off, it was a test”/);
  assert.deepEqual(again.reopened, ["Asked of Mitra: take line 3 off, it was a test"]);
});
