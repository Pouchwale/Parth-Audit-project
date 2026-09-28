// UPLOAD CHANGES: WHAT AN EDITED WORD/EXCEL FILE CHANGED, APPLIED (REQUIREMENTS §81).
//
// The dialog (components/common/UploadChanges.tsx) shows the plan and, on
// Apply, engine/roundTrip/applyImport.ts writes it. Proved here, without a
// browser:
//   * a stored record is changed through the repository, with an "imported"
//     history line whose note names the file and the number of boxes, and a
//     "success" cue;
//   * a verified one is reopened for correction FIRST, the reason recorded, so it
//     has to be submitted and verified again;
//   * the record open on screen is changed through the page's own target —
//     reopened through it and waited for when it is signed off, never when the
//     page offers no correction — and a commit the page refused is reported, not
//     claimed;
//   * a new line for a free-row log sheet is that sheet's own blank line;
//   * a file of another document is told apart from a file of another record;
//   * and the whole way round: a workbook made by the real writer, edited the
//     way Excel saves it, read, planned against the stored record and applied;
//   * and what the record's own page holds to: a statement's date of
//     publication is never emptied (nor its pages broken by one that was), a
//     line the same file adds again is not added twice, a service report's
//     quantity and area bring the lines that follow them along, the checklist's
//     approval stamp is not a file's to write, and an activity ticked in the file
//     is the page's tick — dated, no longer "not required", and only in turn.
import test from "node:test";
import assert from "node:assert/strict";
import type { RecordInstance } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { recordRepository } from "../src/data/repositories/recordRepository";
import { getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import {
  applyImport,
  fileAgainstScreen,
  howToChange,
  importNote,
  recordsWithWork,
  reopenReason,
  uploadPlanContext,
  workFor,
  type UploadTarget,
} from "../src/engine/roundTrip/applyImport";
import { planImport, type ImportPlan } from "../src/engine/roundTrip/plan";
import { readUploadedFile } from "../src/engine/roundTrip/readFile";
import type { ExportBinding } from "../src/engine/roundTrip/exportMap";
import { documentFileBytes, type Cell, type ExportBlock } from "../src/utils/documentExport";
import { unzip, zipStored } from "../src/utils/xlsx";
import { CUE_EVENT } from "../src/engine/engageBus";
import type { ReadResult } from "../src/engine/roundTrip/readFile";
import type { BindType } from "../src/engine/roundTrip/bindPath";
import { checklistBind, logColumnBind } from "../src/engine/roundTrip/bindingsFor";
import { settleImported } from "../src/engine/roundTrip/applyImport";
import { complianceStatement } from "../src/data/repositories/referenceRepository";
import { complianceValidUntil, keepPublicationDate, COMPLIANCE_STATEMENTS } from "../src/data/seed/complianceStatements";
import { COMPLAINT_DOC_ID, newComplaintChecklistData } from "../src/data/seed/complaintChecklist";
import type { ComplaintChecklistData, ServiceReportAreaLine, ServiceReportData } from "../src/types";
import { formatDisplayDate } from "../src/utils/date";

// The activity log posts its lines to the server a moment later: nowhere to post them here.
(globalThis as unknown as { fetch: unknown }).fetch = () => Promise.resolve(new Response(null, { status: 204 }));

ensureDocumentsSeeded();

const DOC_ID = "fly-catcher";
const FILE = "F-HR-18 Fly Catcher 01-Oct-2026.xlsx";

let seq = 0;
function stored(status: RecordInstance["status"], data?: unknown): RecordInstance {
  const now = new Date().toISOString();
  const record: RecordInstance = {
    id: `up-${++seq}`,
    documentId: DOC_ID,
    periodKey: `2026-10-${String(seq).padStart(2, "0")}`,
    dueDate: `2026-10-${String(seq).padStart(2, "0")}`,
    status,
    isDemo: false,
    data: data ?? { monthYear: "October 2026", entries: [{ pcId: "PC-01", catchCountApprox: 3, remarks: "ok" }, { pcId: "PC-02", catchCountApprox: 0, remarks: "" }] },
    createdAt: now,
    updatedAt: now,
    history: [],
  };
  return recordRepository.upsert(record);
}

function planFor(recordId: string, changes: { path: string; label: string; value: unknown; after: string }[], extra: Partial<ImportPlan> = {}): ImportPlan {
  return {
    envelope: { v: 1, app: "dcrs", kind: "xlsx", documentId: DOC_ID, formatNo: "F/HR/18", revisionNo: "00", recordIds: [recordId], exportedAt: new Date().toISOString() },
    fileName: FILE,
    changes: changes.map((c) => ({ recordId, path: c.path, label: c.label, type: typeof c.value === "number" ? "number" : "text", before: "", after: c.after, value: c.value })),
    appends: [],
    rejected: [],
    unchanged: 0,
    missing: 0,
    records: [{ recordId, documentId: DOC_ID, found: true }],
    ...extra,
  };
}

function cues(): { list: string[]; stop: () => void } {
  const list: string[] = [];
  const on = (e: Event) => list.push((e as CustomEvent<{ cue: string }>).detail.cue);
  window.addEventListener(CUE_EVENT, on);
  return { list, stop: () => window.removeEventListener(CUE_EVENT, on) };
}

type Entry = { pcId: string; catchCountApprox: number | null; remarks: string };
const entries = (r: RecordInstance | undefined) => ((r?.data as { entries: Entry[] }).entries ?? []) as Entry[];

test("the note and the reason name the file", () => {
  assert.equal(importNote("a.xlsx", 1), 'Changes uploaded from "a.xlsx" (1 box)');
  assert.equal(importNote("a.xlsx", 3), 'Changes uploaded from "a.xlsx" (3 boxes)');
  assert.equal(reopenReason("a.docx"), "Changes uploaded from a.docx");
});

test("a file of another document is refused; one of another record of the same document is not", () => {
  assert.equal(fileAgainstScreen({ documentId: "a", recordIds: ["r1"] }, { documentId: "b", recordIds: ["r1"] }), "other-document");
  assert.equal(fileAgainstScreen({ documentId: "a", recordIds: ["r2"] }, { documentId: "a", recordIds: ["r1"] }), "other-record");
  assert.equal(fileAgainstScreen({ documentId: "a", recordIds: ["r1"] }, { documentId: "a", recordIds: ["r1", "r9"] }), "same");
  // A register page shows no one record: nothing to compare with.
  assert.equal(fileAgainstScreen({ documentId: "a", recordIds: ["r1"] }, { documentId: "a", recordIds: [] }), "same");
});

test("an editable stored record is changed through the repository, with an 'imported' history line and a success cue", async () => {
  const rec = stored("In Progress");
  const heard = cues();
  let bumped = 0;
  const plan = planFor(rec.id, [
    { path: "entries/@pcId=PC-01/catchCountApprox", label: "PC-01 · Catch", value: 7, after: "7" },
    { path: "entries/@pcId=PC-02/remarks", label: "PC-02 · Remarks", value: "cleaned", after: "cleaned" },
  ]);
  assert.deepEqual(recordsWithWork(plan), [rec.id]);
  assert.equal(workFor(plan, rec.id), 2);
  const result = await applyImport(plan, { actor: "Upload Tester", getTarget: () => null, onStored: () => bumped++ });
  heard.stop();
  assert.equal(result.applied, 2);
  assert.deepEqual(result.records.map((r) => [r.via, r.applied, r.reopened, r.skipped]), [["store", 2, false, undefined]]);
  const after = recordRepository.getById(rec.id)!;
  assert.equal(entries(after)[0].catchCountApprox, 7);
  assert.equal(entries(after)[1].remarks, "cleaned");
  assert.equal(entries(after)[0].remarks, "ok", "a box the file did not change is left alone");
  const last = after.history![after.history!.length - 1];
  assert.equal(last.action, "imported");
  assert.equal(last.by, "Upload Tester");
  assert.equal(last.note, `Changes uploaded from "${FILE}" (2 boxes)`);
  assert.ok((last.changes ?? []).length >= 2, JSON.stringify(last.changes));
  assert.equal(after.status, "In Progress");
  assert.equal(bumped, 1, "the store is bumped once so every page redraws");
  assert.deepEqual(heard.list, ["success"]);
});

test("a verified stored record is reopened for correction first, the reason recorded", async () => {
  const rec = stored("Verified");
  assert.deepEqual(howToChange(rec.id, () => null), { way: "reopen", via: "store", status: "Verified" });
  const result = await applyImport(planFor(rec.id, [{ path: "entries/@pcId=PC-01/remarks", label: "PC-01 · Remarks", value: "rechecked", after: "rechecked" }]), {
    actor: "Upload Tester",
    getTarget: () => null,
  });
  assert.equal(result.applied, 1);
  assert.equal(result.records[0].reopened, true);
  const after = recordRepository.getById(rec.id)!;
  assert.equal(after.status, "In Progress", "it has to be submitted and verified again");
  assert.equal(after.correction?.reason, `Changes uploaded from ${FILE}`);
  assert.equal(after.correction?.fromStatus, "Verified");
  const actions = after.history!.map((h) => h.action);
  assert.deepEqual(actions.slice(-2), ["reopened", "imported"]);
  assert.equal(after.history![after.history!.length - 2].note, `Changes uploaded from ${FILE}`);
  assert.equal(entries(after)[0].remarks, "rechecked");
});

test("nothing is reopened for a change that cannot be written — a line no longer in the record", async () => {
  const rec = stored("Verified");
  const result = await applyImport(planFor(rec.id, [{ path: "entries/@pcId=PC-99/remarks", label: "PC-99 · Remarks", value: "x", after: "x" }]), { actor: "T", getTarget: () => null });
  assert.equal(result.applied, 0);
  assert.deepEqual(result.failed, ["PC-99 · Remarks"]);
  assert.equal(recordRepository.getById(rec.id)!.status, "Verified");
});

test("a record that is gone is reported, not invented", async () => {
  const heard = cues();
  const result = await applyImport(planFor("no-such-record", [{ path: "monthYear", label: "Month", value: "x", after: "x" }]), { actor: "T", getTarget: () => null });
  heard.stop();
  assert.equal(result.applied, 0);
  assert.equal(result.records[0].skipped, "gone");
  assert.deepEqual(heard.list, [], "no success sound for nothing done");
  assert.deepEqual(howToChange("no-such-record", () => null), { way: "gone" });
});

/** A page's target the way RecordPage behaves: commit saves through saveDraft; reopen makes it editable a little later. */
function fakePage(rec: RecordInstance, opts: { reopenable?: boolean; refuse?: boolean; inRepository?: boolean } = {}) {
  let status = rec.status;
  let data: unknown = rec.data;
  const calls: { note: string; action?: string; next: unknown }[] = [];
  const reopened: string[] = [];
  const target = (): UploadTarget => ({
    recordId: rec.id,
    documentId: rec.documentId,
    status,
    editable: status === "In Progress" || status === "Due" || status === "Scheduled",
    getData: () => data,
    commit: (next, note, action) => {
      calls.push({ next, note, action });
      if (opts.refuse) return;
      data = next;
      if (opts.inRepository !== false) {
        const base = recordRepository.getById(rec.id)!;
        recordRepository.upsert({ ...base, data: next, history: [...(base.history ?? []), { id: `h${calls.length}`, at: new Date().toISOString(), by: "T", action: action ?? "assistant-edit", note }] });
      }
    },
    reopen:
      opts.reopenable === false
        ? undefined
        : (reason) => {
            reopened.push(reason);
            // The page redraws a frame or two later.
            setTimeout(() => (status = "In Progress"), 30);
          },
  });
  return { target, calls, reopened };
}

test("the record on screen is changed through the page: reopened through it, waited for, then committed as 'imported'", async () => {
  const rec = stored("Submitted");
  const page = fakePage(rec);
  assert.equal(howToChange(rec.id, page.target).way, "reopen");
  const result = await applyImport(planFor(rec.id, [{ path: "entries/@pcId=PC-01/catchCountApprox", label: "PC-01 · Catch", value: 11, after: "11" }]), {
    actor: "T",
    getTarget: page.target,
  });
  assert.deepEqual(page.reopened, [`Changes uploaded from ${FILE}`]);
  assert.equal(page.calls.length, 1);
  assert.equal(page.calls[0].action, "imported");
  assert.equal(page.calls[0].note, `Changes uploaded from "${FILE}" (1 box)`);
  assert.equal(entries({ data: page.calls[0].next } as RecordInstance)[0].catchCountApprox, 11);
  assert.deepEqual(result.records.map((r) => [r.via, r.applied, r.reopened, r.skipped]), [["page", 1, true, undefined]]);
});

test("a page that offers no correction leaves its signed-off record alone", async () => {
  const rec = stored("Verified");
  const page = fakePage(rec, { reopenable: false });
  const way = howToChange(rec.id, page.target);
  assert.equal(way.way, "locked");
  const result = await applyImport(planFor(rec.id, [{ path: "monthYear", label: "Month", value: "Nov 2026", after: "Nov 2026" }]), { actor: "T", getTarget: page.target });
  assert.equal(result.applied, 0);
  assert.equal(result.records[0].skipped, "locked");
  assert.equal(page.calls.length, 0);
});

test("a commit the page refused (it moved on meanwhile) is reported as not saved", async () => {
  const rec = stored("In Progress");
  const page = fakePage(rec, { refuse: true });
  const result = await applyImport(planFor(rec.id, [{ path: "monthYear", label: "Month", value: "Nov 2026", after: "Nov 2026" }]), { actor: "T", getTarget: page.target });
  assert.equal(page.calls.length, 1);
  assert.equal(result.applied, 0);
  assert.equal(result.records[0].skipped, "not-saved");
});

test("a reopened page that never becomes editable is not written to", async () => {
  const rec = stored("Verified");
  const page = fakePage(rec);
  const stuck = (): UploadTarget => ({ ...page.target(), editable: false, status: "Verified" });
  const result = await applyImport(planFor(rec.id, [{ path: "monthYear", label: "Month", value: "Nov 2026", after: "Nov 2026" }]), { actor: "T", getTarget: stuck, waitMs: 120 });
  assert.equal(result.records[0].skipped, "not-reopened");
  assert.equal(page.calls.length, 0);
});

test("the plan reads the record on screen from the page (typed but not yet saved), any other from the store", () => {
  const rec = stored("In Progress");
  const live = { monthYear: "typed just now", entries: [] };
  const ctx = uploadPlanContext(() => ({ ...fakePage(rec).target(), getData: () => live }), "2026-10-01");
  assert.deepEqual(ctx.getRecord(rec.id), { data: live, documentId: DOC_ID });
  const other = stored("In Progress");
  assert.deepEqual(ctx.getRecord(other.id)?.data, other.data);
  assert.equal(ctx.getRecord("missing"), null);
});

test("a new line for a free-row log sheet is that sheet's own blank line; other grids take none", () => {
  const ctx = uploadPlanContext(() => null, "2026-10-01");
  const sheets = documentRepository.getAll().filter((d) => d.kind === "log-sheet");
  const free = sheets.find((d) => getLogSheetLayout(d.id)?.rowMode.kind === "free");
  const fixed = sheets.find((d) => getLogSheetLayout(d.id)?.rowMode.kind === "timeSlots");
  assert.ok(free && fixed, "a free-row and a time-slot sheet exist");
  const line = ctx.blankItem(free!.id, "rows");
  assert.ok(line && typeof line.id === "string" && line.id, JSON.stringify(line));
  for (const c of getLogSheetLayout(free!.id)!.columns) assert.ok(c.key in line!, `the blank line has ${c.key}`);
  assert.equal(ctx.blankItem(fixed!.id, "rows"), null);
  assert.equal(ctx.blankItem(free!.id, "entries"), null);
  assert.equal(ctx.blankItem(DOC_ID, "rows"), null);
});

// ---------------------------------------------------------------------------
// the whole way round

const enc = new TextEncoder();
const dec = new TextDecoder();

function bind(recordId: string, path: string, type: "text" | "number", text: string, label: string): ExportBinding {
  return { recordId, path, type, text, label, options: [] };
}
const bound = (b: ExportBinding): Cell => ({ text: b.text, bind: b, parts: [{ text: b.text, bind: b }] });

async function rezip(bytes: Uint8Array, edit: (name: string, xml: string) => string): Promise<ArrayBuffer> {
  const zip = await unzip(bytes.slice().buffer);
  const files: { name: string; data: Uint8Array }[] = [];
  for (const [name, read] of zip) {
    const data = await read();
    files.push({ name, data: name.endsWith(".xml") ? enc.encode(edit(name, dec.decode(data))) : data });
  }
  return zipStored(files).slice().buffer;
}

test("a workbook downloaded, edited in Excel and uploaded changes exactly the edited box of the stored record", async () => {
  const rec = stored("Pending Verification");
  const blocks: ExportBlock[] = [
    { kind: "text", text: "Fly Catcher Record", strong: true, title: true },
    {
      kind: "table",
      headerRows: 1,
      rows: [
        [{ text: "Unit" }, { text: "Catch" }, { text: "Remarks" }],
        [{ text: "PC-01" }, bound(bind(rec.id, "entries/@pcId=PC-01/catchCountApprox", "number", "3", "PC-01 · Catch")), bound(bind(rec.id, "entries/@pcId=PC-01/remarks", "text", "ok", "PC-01 · Remarks"))],
        [{ text: "PC-02" }, bound(bind(rec.id, "entries/@pcId=PC-02/catchCountApprox", "number", "0", "PC-02 · Catch")), bound(bind(rec.id, "entries/@pcId=PC-02/remarks", "text", "", "PC-02 · Remarks"))],
      ],
    },
  ];
  const doc = documentRepository.getById(DOC_ID)!;
  const bytes = documentFileBytes("xlsx", doc, blocks, [rec.id]);
  // Excel: the remarks of PC-01 typed over, the sheet saved again.
  const edited = await rezip(bytes, (name, xml) => (name === "xl/worksheets/sheet1.xml" ? xml.replace('<t xml:space="preserve">ok</t>', '<t xml:space="preserve">Glue board changed</t>') : xml));

  const untouched = await readUploadedFile(bytes.slice().buffer, FILE);
  assert.ok(untouched.ok, JSON.stringify(untouched));
  const none = planImport(untouched as Extract<typeof untouched, { ok: true }>, FILE, uploadPlanContext(() => null, "2026-10-01"));
  assert.equal(none.changes.length, 0, "an untouched download changes nothing");

  const read = await readUploadedFile(edited, FILE);
  assert.ok(read.ok, JSON.stringify(read));
  const plan = planImport(read as Extract<typeof read, { ok: true }>, FILE, uploadPlanContext(() => null, "2026-10-01"));
  assert.deepEqual(
    plan.changes.map((c) => [c.path, c.before, c.after]),
    [["entries/@pcId=PC-01/remarks", "ok", "Glue board changed"]]
  );
  assert.equal(fileAgainstScreen(plan.envelope, { documentId: DOC_ID, recordIds: [rec.id] }), "same");
  assert.equal(howToChange(rec.id, () => null).way, "reopen");

  const result = await applyImport(plan, { actor: "Upload Tester", getTarget: () => null });
  assert.equal(result.applied, 1);
  const after = recordRepository.getById(rec.id)!;
  assert.equal(entries(after)[0].remarks, "Glue board changed");
  assert.equal(entries(after)[0].catchCountApprox, 3);
  assert.equal(after.status, "In Progress");
  assert.equal(after.history!.at(-1)!.action, "imported");
  assert.equal(after.history!.at(-1)!.note, `Changes uploaded from "${FILE}" (1 box)`);
});

// ---------------------------------------------------------------------------
// what the record's own page holds to (REQUIREMENTS §81, the checked defects)

type OkRead = Extract<ReadResult, { ok: true }>;

/** A file as the reader hands it back: one value per bound place (what was downloaded, what the file holds now), and any lines added under a grid. */
function fileOf(
  documentId: string,
  recordId: string,
  boxes: { path: string; type: BindType; label: string; was: string; now: string }[],
  extra: { tables?: OkRead["tables"]; appended?: OkRead["appended"] } = {}
): OkRead {
  return {
    ok: true,
    kind: "docx",
    envelope: { v: 1, app: "dcrs", kind: "docx", documentId, formatNo: "", revisionNo: "", recordIds: [recordId], exportedAt: "2026-10-01T09:00:00.000Z" },
    entries: boxes.map((b, i) => ({ i, recordId, path: b.path, type: b.type, label: b.label, options: [], text: b.was })),
    tables: extra.tables ?? [],
    values: new Map(boxes.map((b, i) => [i, { text: b.now }] as const)),
    missing: [],
    appended: extra.appended ?? [],
  } as OkRead;
}

function storedOf(documentId: string, status: RecordInstance["status"], data: unknown): RecordInstance {
  const now = new Date().toISOString();
  return recordRepository.upsert({
    id: `up-${++seq}`,
    documentId,
    periodKey: `2026-11-${String(seq).padStart(2, "0")}`,
    dueDate: `2026-11-${String(seq).padStart(2, "0")}`,
    status,
    isDemo: false,
    data,
    createdAt: now,
    updatedAt: now,
    history: [],
  });
}

// Finding 0 — a Statement of Compliance's date of publication emptied in Word.

test("a statement's date of publication emptied in the file is refused with a reason, never planned as nothing", () => {
  const id = Object.keys(COMPLIANCE_STATEMENTS)[0];
  const s = complianceStatement(id)!;
  const page = (): UploadTarget => ({ recordId: id, documentId: id, status: "In Progress", editable: true, getData: () => s, commit: () => {} });
  const was = formatDisplayDate(s.signedOn);
  const emptied = planImport(fileOf(id, id, [{ path: "signedOn", type: "date", label: "Date of publication", was, now: "" }]), "soc.docx", uploadPlanContext(page, "2026-10-01"));
  assert.deepEqual(emptied.changes, [], "an emptied date is not a change to make");
  assert.equal(emptied.rejected.length, 1, JSON.stringify(emptied.rejected));
  assert.equal(emptied.rejected[0].label, "Date of publication");
  assert.equal(emptied.rejected[0].whyKey, "rt.rule.requiredDate");
  assert.equal(emptied.rejected[0].why, "This date cannot be left empty — the record keeps the date it has.");
  // A new date typed there is still taken.
  const redated = planImport(fileOf(id, id, [{ path: "signedOn", type: "date", label: "Date of publication", was, now: "01-Apr-2026" }]), "soc.docx", uploadPlanContext(page, "2026-10-01"));
  assert.deepEqual(
    redated.changes.map((c) => [c.path, c.value]),
    [["signedOn", "2026-04-01"]]
  );
  assert.deepEqual(redated.rejected, []);
});

test("a statement with no readable date of publication shows 'to be confirmed', and a correction keeps the date it has", () => {
  const id = Object.keys(COMPLIANCE_STATEMENTS)[0];
  const s = COMPLIANCE_STATEMENTS[id];
  assert.equal(complianceValidUntil({ ...s, signedOn: "" }), "");
  assert.equal(formatDisplayDate(complianceValidUntil({ ...s, signedOn: "" })), "TO BE CONFIRMED");
  assert.equal(complianceValidUntil({ ...s, signedOn: "2026-04-01" }), "2028-04-01");
  assert.equal(keepPublicationDate({ ...s, signedOn: "" }, { ...s, signedOn: "2026-04-01" }).signedOn, "2026-04-01");
  assert.equal(keepPublicationDate({ ...s, signedOn: "" }, { ...s, signedOn: "" }).signedOn, s.signedOn, "else the date it was issued with");
  assert.equal(keepPublicationDate({ ...s, signedOn: "2026-05-02" }, s).signedOn, "2026-05-02");
});

// Finding 2 — the same edited file uploaded twice.

test("the same file uploaded twice adds its new line once; two alike lines in the file need two in the record", async () => {
  const sheets = documentRepository.getAll().filter((d) => d.kind === "log-sheet");
  const doc = sheets.find((d) => {
    const l = getLogSheetLayout(d.id);
    return l?.rowMode.kind === "free" && l.columns.some((c) => ["text", "paragraph"].includes(logColumnBind(c)?.type ?? ""));
  });
  assert.ok(doc, "a free-row log sheet with a column of words exists");
  const layout = getLogSheetLayout(doc!.id)!;
  const columns = layout.columns
    .map((c) => logColumnBind(c))
    .filter((c): c is NonNullable<typeof c> => !!c)
    .map((c, col) => ({ key: c.key, type: c.type, options: (c.options ?? []).map((o) => ({ value: o, label: o })), col }));
  const words = columns.find((c) => c.type === "text" || c.type === "paragraph")!;
  const rec = storedOf(doc!.id, "In Progress", { header: {}, rows: [] });
  const line = { table: 0, recordId: rec.id, listPath: "rows", cells: { [words.key]: { text: "Line typed in Excel" } } };
  const file = fileOf(doc!.id, rec.id, [], { tables: [{ t: 0, recordId: rec.id, listPath: "rows", columns }], appended: [line] });
  const rows = () => ((recordRepository.getById(rec.id)!.data as { rows: Record<string, unknown>[] }).rows ?? []);

  const first = planImport(file, FILE, uploadPlanContext(() => null, "2026-10-01"));
  assert.equal(first.appends.length, 1);
  assert.equal((await applyImport(first, { actor: "T", getTarget: () => null })).applied, 1);
  assert.equal(rows().length, 1);

  // The same file again (one more box fixed elsewhere in it): its line is already in the record.
  const again = planImport(file, FILE, uploadPlanContext(() => null, "2026-10-01"));
  assert.deepEqual(again.appends, [], "the line is not planned a second time");
  assert.equal(again.unchanged, 1);
  await applyImport(again, { actor: "T", getTarget: () => null });
  assert.equal(rows().length, 1, "Apply adds no duplicate line");

  // Two alike lines in the file, one in the record: one more is added.
  const twice = planImport(fileOf(doc!.id, rec.id, [], { tables: file.tables, appended: [line, line] }), FILE, uploadPlanContext(() => null, "2026-10-01"));
  assert.equal(twice.appends.length, 1);
  assert.equal(twice.unchanged, 1);
  // A line with the same words but more filled in is a new line, not the old one.
  const other = columns.find((c) => c !== words && (c.type === "text" || c.type === "paragraph" || c.type === "number"));
  if (other) {
    const fuller = { ...line, cells: { ...line.cells, [other.key]: { text: other.type === "number" ? "7" : "more" } } };
    const plan = planImport(fileOf(doc!.id, rec.id, [], { tables: file.tables, appended: [fuller] }), FILE, uploadPlanContext(() => null, "2026-10-01"));
    assert.equal(plan.appends.length, 1);
  }
});

// Finding 3 — a service report's quantity and area changed in the file.

function serviceData(documentId: string, lines: Omit<ServiceReportAreaLine, "slNo" | "remarks">[]): ServiceReportData {
  return {
    serviceName: documentRepository.getById(documentId)!.variantKey ?? "",
    lines: lines.map((l, i) => ({ ...l, slNo: i + 1, remarks: "" })),
    technicianSign: "",
    customerSign: "",
  };
}

test("a service report's quantity changed in the file becomes every line of that material's quantity — stored or on the page", async () => {
  const docId = "service-report-general";
  const material = { materialName: "Deltamethrin 2.5% SC", methodOfApplication: "Spraying" };
  const data = serviceData(docId, [
    { areaName: "Canteen", qtyUsed: "100 ml", ...material },
    { areaName: "Store room", qtyUsed: "100 ml", ...material },
    { areaName: "Office", qtyUsed: "100 ml", ...material },
  ]);
  const change = { path: "lines/@slNo=1/qtyUsed", label: "Line 1 (Canteen) · Qty used", value: "250 ml", after: "250 ml" };
  const plan = (id: string): ImportPlan => ({ ...planFor(id, [change]), envelope: { ...planFor(id, []).envelope, documentId: docId }, records: [{ recordId: id, documentId: docId, found: true }] });

  const rec = storedOf(docId, "In Progress", data);
  const result = await applyImport(plan(rec.id), { actor: "T", getTarget: () => null });
  assert.equal(result.applied, 1);
  const lines = (recordRepository.getById(rec.id)!.data as ServiceReportData).lines;
  assert.deepEqual(
    lines.map((l) => l.qtyUsed),
    ["250 ml", "250 ml", "250 ml"],
    "the lines that mirror the quantity say the same as the one it was written on"
  );

  const onScreen = storedOf(docId, "In Progress", data);
  const page = fakePage(onScreen);
  await applyImport(plan(onScreen.id), { actor: "T", getTarget: page.target });
  assert.equal(page.calls.length, 1);
  assert.deepEqual(
    (page.calls[0].next as ServiceReportData).lines.map((l) => l.qtyUsed),
    ["250 ml", "250 ml", "250 ml"]
  );
});

test("a service report's area changed in the file brings that area's own material and method", () => {
  const docId = "service-report-rodent";
  const glue = { materialName: "Glue Board", methodOfApplication: "Trouble gum placement" };
  const before = serviceData(docId, [
    { areaName: "Canteen", qtyUsed: "10 nos", ...glue },
    { areaName: "Store room", qtyUsed: "10 nos", ...glue },
  ]);
  const after = { ...before, lines: [before.lines[0], { ...before.lines[1], areaName: "First floor - Offline punching & QC Inspection" }] };
  const settled = settleImported("service-report", docId, before, after, "2026-10-01");
  assert.deepEqual(settled.refused, []);
  const line = (settled.data as ServiceReportData).lines[1];
  assert.equal(line.materialName, "Bromadiolone Cake");
  assert.equal(line.methodOfApplication, "Baiting");
});

// Findings 6 and 7 — the customer complaint checklist.

function checklist(prepare: (d: ComplaintChecklistData) => void): ComplaintChecklistData {
  const d = newComplaintChecklistData("26-27/001");
  prepare(d);
  return d;
}

test("the checklist's Approved By name and date are stamped on approval: a file cannot write them", () => {
  const rec = storedOf(COMPLAINT_DOC_ID, "In Progress", checklist(() => {}));
  const box = (field: "name" | "designation" | "date", now: string) => {
    const b = checklistBind.signoff("approvedBy", field);
    return { path: b.path, type: b.type, label: b.label, was: "", now };
  };
  const plan = planImport(
    fileOf(COMPLAINT_DOC_ID, rec.id, [box("name", "Mallory"), box("date", "01-Oct-2026"), box("designation", "QA Manager")]),
    "checklist.docx",
    uploadPlanContext(() => null, "2026-10-01")
  );
  assert.deepEqual(
    plan.changes.map((c) => [c.path, c.value]),
    [["approvedBy/designation", "QA Manager"]],
    "the designation is the approver's to write"
  );
  assert.deepEqual(
    plan.rejected.map((r) => [r.label, r.whyKey]),
    [
      ["Approved by · Name", "rt.rule.stamped"],
      ["Approved by · Sign & date", "rt.rule.stamped"],
    ]
  );
  assert.equal(plan.rejected[0].why, "This is stamped when the checklist is approved — it cannot be changed from a file.");
});

test("an activity ticked in the file is the page's tick: not 'not required' any more, dated, and only in its turn", async () => {
  const data = checklist((d) => {
    const a = d.sections[0].items;
    a[0].notRequired = true;
    a[0].comment = "Not required";
  });
  const [a1, a2, a3] = data.sections[0].items;
  const sectionA = data.sections[0];
  const tick = (item: typeof a1) => {
    const b = checklistBind.item(sectionA, item, "done");
    return { path: b.path, type: b.type, label: b.label, was: "☐", now: "☑" };
  };
  const rec = storedOf(COMPLAINT_DOC_ID, "In Progress", data);

  // The preview: A1 is taken; A3 waits for A2.
  const plan = planImport(fileOf(COMPLAINT_DOC_ID, rec.id, [tick(a1), tick(a3)]), "checklist.docx", uploadPlanContext(() => null, "2026-10-01"));
  assert.deepEqual(
    plan.changes.map((c) => c.path),
    [checklistBind.item(sectionA, a1, "done").path]
  );
  assert.equal(plan.rejected.length, 1, JSON.stringify(plan.rejected));
  assert.equal(plan.rejected[0].label, `A${a3.srNo} · Done`);
  assert.equal(plan.rejected[0].whyKey, "rt.rule.outOfOrder");
  assert.deepEqual(plan.rejected[0].whyParams, { waiting: `A${a2.srNo}` });

  // Apply, even of a plan that holds both (the record may have moved on since the preview).
  const both: ImportPlan = {
    ...planFor(rec.id, []),
    envelope: { ...planFor(rec.id, []).envelope, documentId: COMPLAINT_DOC_ID, kind: "docx" },
    records: [{ recordId: rec.id, documentId: COMPLAINT_DOC_ID, found: true }],
    changes: [a1, a3].map((it) => ({ recordId: rec.id, path: checklistBind.item(sectionA, it, "done").path, label: `A${it.srNo} · Done`, type: "bool" as const, before: "☐", after: "☑", value: true })),
  };
  const result = await applyImport(both, { actor: "T", getTarget: () => null, today: "2026-10-01" });
  assert.equal(result.applied, 1);
  assert.deepEqual(
    result.records[0].refused?.map((r) => [r.label, r.whyKey]),
    [[`A${a3.srNo} · Done`, "rt.rule.outOfOrder"]]
  );
  const items = (recordRepository.getById(rec.id)!.data as ComplaintChecklistData).sections[0].items;
  assert.equal(items[0].done, true);
  assert.equal(items[0].notRequired, false, "ticked Done, it is no longer 'not required'");
  assert.equal(items[0].date, "2026-10-01", "and it is dated today");
  assert.equal(items[2].done, false, "A3 waits for A2");
  assert.equal(items[2].date, null);
});
