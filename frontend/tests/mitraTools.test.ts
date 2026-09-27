// MITRA'S TOOLS (REQUIREMENTS §80, engine/mitraTools.ts): what the model may
// ask the browser to do, run against the same engine the pages use — here
// without a browser, on the seeded repositories and a fake open record.
//   * the schema set the browser sends stays small: under 9,000 characters
//     with a record open, every description at most 140 characters;
//   * a tool is only offered where it makes sense, and refuses what the
//     router, the patch checker or the format engine refuse;
//   * anything that writes goes through the open record's own commit, with
//     the "Asked of Mitra" note, and a locked record is only reopened after
//     the person's yes (ctx.confirm);
//   * every result fits the wire's 1,500 characters.
import test from "node:test";
import assert from "node:assert/strict";
import type { AssistantTarget } from "../src/store/AssistantContext";
import type { LogSheetLayout, RecordInstance } from "../src/types";
import type { MitraAttachment, MitraTool, MitraToolContext } from "../src/engine/mitraTypes";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded, masterRepository } from "../src/data/repositories/masterRepository";
import { ensureSeeded as ensureHrMasterSeeded, hrMasterRepository } from "../src/data/repositories/hrMasterRepository";
import { ensureSeeded as ensureRecordsSeeded, recordRepository } from "../src/data/repositories/recordRepository";
import { getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import { createDefaultData } from "../src/engine/recordDefaults";
import { createRecordForDocument } from "../src/engine/recordCrud";
import { SAMPLE_FILL_NOTE } from "../src/engine/sampleFill";
import { ALL_TOOLS, MAX_TOOL_RESULT_CHARS, describeStep, documentOnPath, fitValue, mitraTools, runTool, toolSchemas } from "../src/engine/mitraTools";
import { addDays, todayISO } from "../src/utils/date";

ensureDocumentsSeeded();
ensureMasterSeeded();
ensureHrMasterSeeded();
ensureRecordsSeeded();

// store/router.tsx reads window.location the moment it loads (the navigate tool
// loads it to check a route); the harness stands up no location, so one is here.
if (typeof (globalThis as { location?: unknown }).location === "undefined") {
  Object.defineProperty(globalThis, "location", { value: { hash: "" }, configurable: true, writable: true });
}

const today = todayISO();

interface TestCtx extends MitraToolContext {
  navigated: string[];
  confirmations: string[];
}

/** A tool context as the widget would build it; `answer` is what the person clicks when asked. */
function ctxOf(over: Partial<MitraToolContext> = {}, answer = true): TestCtx {
  const navigated: string[] = [];
  const confirmations: string[] = [];
  return {
    today,
    isDemo: true,
    language: "en",
    userName: "Unit Test",
    currentRoute: "/dashboard",
    navigate: (route) => {
      navigated.push(route);
    },
    target: null,
    bump: () => {},
    attachments: [],
    confirm: async (question) => {
      confirmations.push(question);
      return answer;
    },
    userWords: "unit test words",
    ...over,
    navigated,
    confirmations,
  };
}

/** An open record as a page registers it (store/AssistantContext.tsx), remembering what Mitra commits and reopens. */
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
  // A locked record can be reopened unless the test says outright that it cannot (`reopen: undefined`).
  if (!("reopen" in over) && over.editable === false) target.reopen = (reason) => reopened.push(reason);
  return { target, commits, reopened };
}

function tool(ctx: MitraToolContext, name: string): MitraTool {
  const found = mitraTools(ctx).find((x) => x.name === name);
  assert.ok(found, `${name} is offered here`);
  return found!;
}

const run = (ctx: MitraToolContext, name: string, args: unknown) => runTool(tool(ctx, name), JSON.stringify(args), ctx);

function record(id: string, documentId: string, dueDate: string, data: unknown, extra: Partial<RecordInstance> = {}): RecordInstance {
  return {
    id,
    documentId,
    periodKey: `${documentId}:${dueDate}:${id}`,
    dueDate,
    status: "Submitted",
    isDemo: false,
    data,
    createdAt: `${dueDate}T03:00:00.000Z`,
    updatedAt: `${dueDate}T06:00:00.000Z`,
    submittedAt: `${dueDate}T06:00:00.000Z`,
    submittedBy: "Unit Test",
    ...extra,
  } as RecordInstance;
}

// ---------------------------------------------------------------------------

test("the schema set stays small: under 9,000 characters with a record open, every description at most 140 characters", () => {
  const dpm = documentRepository.getById("daily-pest-monitoring");
  assert.ok(dpm);
  const data = createDefaultData(dpm!, today, masterRepository.get()) as Record<string, unknown>;
  const { target } = fakeTarget("daily-pest-monitoring", "daily-pest-monitoring", { ...data, photos: [] });
  const photo: MitraAttachment = { id: "att-1", name: "photo.jpg", kind: "image", size: 10, status: "ready", text: "", characters: 0, dataUrl: "data:image/jpeg;base64,AAAA" };
  const withRecord = mitraTools(ctxOf({ target, attachments: [photo], runWidgetAction: () => {}, currentRoute: "/record/rec-fake" }));
  const withRecordSize = JSON.stringify(toolSchemas(withRecord)).length;
  const bare = mitraTools(ctxOf());
  const bareSize = JSON.stringify(toolSchemas(bare)).length;
  console.log(`Mitra's schema set: ${withRecordSize} characters with a record open (${withRecord.length} tools); ${bareSize} characters on a plain page (${bare.length} tools).`);
  assert.ok(withRecordSize < 9000, `the whole schema set is ${withRecordSize} characters`);
  assert.equal(withRecord.length, ALL_TOOLS.length, "with a record, a picture and the widget, every tool is offered");
  assert.equal(new Set(ALL_TOOLS.map((x) => x.name)).size, ALL_TOOLS.length, "tool names are unique");
  for (const x of ALL_TOOLS) {
    assert.ok(x.description.length <= 140, `${x.name}'s description is ${x.description.length} characters`);
    assert.equal((x.parameters as { type: string }).type, "object", `${x.name}'s parameters are an object schema`);
  }
  const names = new Set(bare.map((x) => x.name));
  for (const n of ["get_open_record", "edit_open_record", "record_action", "fill_open_record_with_sample_data", "add_photo_to_open_record", "read_attachment", "change_format", "start_guided_fill"]) {
    assert.ok(!names.has(n), `${n} is not offered on a plain page`);
  }
  for (const n of ["navigate", "find_documents", "open_document", "search_records", "list_records", "get_record", "history_figures", "todays_facts", "ask_user", "hr_master_lookup"]) {
    assert.ok(names.has(n), `${n} is offered everywhere`);
  }
  // A format's own page offers the format change; the record's tools stay away.
  const page = new Set(mitraTools(ctxOf({ currentRoute: "/document/qc-viscosity" })).map((x) => x.name));
  assert.ok(page.has("change_format") && !page.has("edit_open_record"));
});

test("navigate opens only a page the router knows, and unreadable arguments are a failed result the model can read", async () => {
  const ctx = ctxOf();
  const bad = await run(ctx, "navigate", { route: "/nowhere/at/all" });
  assert.equal(bad.ok, false);
  assert.match(bad.content, /not a page/);
  assert.deepEqual(ctx.navigated, []);
  const good = await run(ctx, "navigate", { route: "dashboard" });
  assert.equal(good.ok, true);
  assert.equal(good.navigated, "/dashboard");
  assert.deepEqual(ctx.navigated, ["/dashboard"]);
  assert.match(good.card, /Dashboard/);
  const broken = await runTool(tool(ctx, "navigate"), "{not json", ctx);
  assert.equal(broken.ok, false);
  assert.match(broken.content, /valid JSON/);
  const day = await run(ctx, "navigate", { route: `/day/${today}` });
  assert.equal(day.ok, true);
});

test("find_documents finds a document by its format number and by the words the plant uses", async () => {
  const ctx = ctxOf();
  const ids = (r: { result: unknown }) => ((r.result as { documents?: { id: string }[] }).documents ?? []).map((d) => d.id);
  const byNumber = await run(ctx, "find_documents", { query: "F/HR/17" });
  assert.equal(byNumber.ok, true);
  assert.ok(ids(byNumber).includes("daily-pest-monitoring"), byNumber.content);
  const byWords = await run(ctx, "find_documents", { query: "daily monitoring" });
  assert.ok(ids(byWords).includes("daily-pest-monitoring"), byWords.content);
  const first = (byWords.result as { documents: Record<string, unknown>[] }).documents[0];
  for (const key of ["id", "name", "formatNo", "module", "kind", "schedule"]) assert.ok(key in first, `${key} is given`);
  const none = await run(ctx, "find_documents", { query: "zqxnothing whatsoever" });
  assert.equal(none.ok, false);
  const many = await run(ctx, "find_documents", { query: "hr module" });
  assert.ok(ids(many).length > 1 && ids(many).length <= 12);
});

test("open_document with create starts today's record and opens it; without create it opens the record there is, or the document's page", async () => {
  const ctx = ctxOf();
  const r = await run(ctx, "open_document", { documentId: "daily-pest-monitoring", create: true });
  assert.equal(r.ok, true, r.content);
  const res = r.result as { recordId: string; route: string; existed: boolean };
  assert.ok(res.recordId);
  assert.equal(res.route, `/record/${res.recordId}`);
  assert.equal(r.navigated, res.route);
  assert.deepEqual(ctx.navigated, [res.route]);
  const stored = recordRepository.getById(res.recordId);
  assert.ok(stored);
  assert.equal(stored!.dueDate, today);
  assert.equal(stored!.isDemo, true);
  // Asked again, by number and without create: the same record, not a second one.
  const again = await run(ctx, "open_document", { documentId: "F/HR/17" });
  assert.equal((again.result as { recordId: string }).recordId, res.recordId);
  assert.equal((await run(ctx, "open_document", { documentId: "daily-pest-monitoring", create: true })).result && (recordRepository.query({ documentId: "daily-pest-monitoring", isDemo: true, dueDate: today }).length), 1);
  // A day with no record and no create: the document's own page.
  const page = await run(ctx, "open_document", { documentId: "daily-pest-monitoring", dateISO: addDays(today, -400) });
  assert.equal(page.ok, true);
  assert.equal((page.result as { route: string }).route, "/pest/daily");
  assert.equal((await run(ctx, "open_document", { documentId: "no-such-document" })).ok, false);
  assert.equal((await run(ctx, "open_document", { documentId: "daily-pest-monitoring", dateISO: "not a date" })).ok, false);
});

test("edit_open_record applies a checked patch through the open record's commit, with a note that starts 'Asked of Mitra'", async () => {
  const dpm = documentRepository.getById("daily-pest-monitoring")!;
  const data = createDefaultData(dpm, today, masterRepository.get());
  const { target, commits } = fakeTarget("daily-pest-monitoring", "daily-pest-monitoring", data);
  const ctx = ctxOf({ target, userWords: "checker is Ramesh, time 9:15 am" });
  const r = await run(ctx, "edit_open_record", { patch: { checker: "Ramesh", timeOfChecking: "9:15 am", checkpoints: { 1: "yes" }, nonsense: 1 } });
  assert.equal(r.ok, true, r.content);
  assert.equal(commits.length, 1);
  const next = commits[0].data as { checker: string; timeOfChecking: string; checkpoints: Record<string, { value: unknown }> };
  assert.equal(next.checker, "Ramesh");
  assert.equal(next.timeOfChecking, "09:15", "normalised as the patch checker normalises");
  assert.equal(next.checkpoints["1"]?.value, "Yes");
  assert.ok(commits[0].note.startsWith("Asked of Mitra: checker is Ramesh"), commits[0].note);
  const res = r.result as { changes: { field: string; from: string; to: string }[]; rejected?: string[] };
  assert.ok(res.changes.length >= 3, JSON.stringify(res.changes));
  assert.ok(res.rejected?.some((p) => /nonsense/.test(p)), "an unknown field is reported, not written");
  assert.ok(r.content.length <= MAX_TOOL_RESULT_CHARS);
  assert.match(r.card, /Filled \d+ boxes/);
  // Nothing to change: a failed result, and no commit.
  const same = await run(ctx, "edit_open_record", { patch: { checker: "Ramesh" } });
  assert.equal(same.ok, false);
  assert.equal(commits.length, 1);
  assert.equal((await run(ctx, "edit_open_record", {})).ok, false);
});

test("a submitted record is changed only after the person confirms reopening it, and the reopening carries the note", async () => {
  const dpm = documentRepository.getById("daily-pest-monitoring")!;
  const data = createDefaultData(dpm, today, masterRepository.get());
  const yes = fakeTarget("daily-pest-monitoring", "daily-pest-monitoring", data, { editable: false, status: "Submitted" });
  const ctxYes = ctxOf({ target: yes.target, userWords: "checker is Vijay" }, true);
  const r = await run(ctxYes, "edit_open_record", { patch: { checker: "Vijay" } });
  assert.equal(r.ok, true, r.content);
  assert.equal(ctxYes.confirmations.length, 1);
  assert.match(ctxYes.confirmations[0], /Submitted/);
  assert.deepEqual(yes.reopened.map((s) => s.startsWith("Asked of Mitra")), [true]);
  assert.equal(yes.commits.length, 1);

  const no = fakeTarget("daily-pest-monitoring", "daily-pest-monitoring", data, { editable: false, status: "Verified" });
  const ctxNo = ctxOf({ target: no.target }, false);
  const declined = await run(ctxNo, "edit_open_record", { patch: { checker: "Vijay" } });
  assert.equal(declined.ok, false);
  assert.equal(no.reopened.length, 0);
  assert.equal(no.commits.length, 0);

  // No way to reopen it: refused without asking.
  const locked = fakeTarget("daily-pest-monitoring", "daily-pest-monitoring", data, { editable: false, status: "Verified", reopen: undefined });
  const ctxLocked = ctxOf({ target: locked.target });
  const refused = await run(ctxLocked, "edit_open_record", { patch: { checker: "Vijay" } });
  assert.equal(refused.ok, false);
  assert.equal(ctxLocked.confirmations.length, 0);
});

test("get_open_record describes a log sheet's layout by key and strips _layout from the data, within the wire's limit", async () => {
  const layout = getLogSheetLayout("qc-viscosity") as LogSheetLayout;
  assert.ok(layout);
  const slots = layout.rowMode.kind === "timeSlots" ? layout.rowMode.slots : [];
  const data = { header: {}, rows: slots.map((s, i) => ({ id: `r${i}`, time: s, viscosity: i === 0 ? 20.1 : null, testedBy: i === 0 ? "Jeni" : "" })) };
  const { target } = fakeTarget("log-sheet", "qc-viscosity", data, { currentData: { ...data, _layout: layout }, title: "F-QC-30 of today" });
  const ctx = ctxOf({ target });
  const r = await run(ctx, "get_open_record", {});
  assert.equal(r.ok, true);
  const res = r.result as { title: string; editable: boolean; layout: { columns: string[]; boxes: string[]; rowMode: string; rows: number }; data: Record<string, unknown> };
  assert.equal(res.title, "F-QC-30 of today");
  assert.equal(res.editable, true);
  assert.ok(res.layout.columns.some((c) => c.startsWith("viscosity:") && /number/.test(c)), JSON.stringify(res.layout.columns));
  assert.ok(res.layout.columns.some((c) => c.startsWith("time:") && /printed/.test(c)));
  assert.equal(res.layout.rowMode, "timeSlots");
  assert.equal(res.layout.rows, 24);
  assert.ok(!("_layout" in res.data), "the layout the target adds for the model is not repeated as data");
  assert.ok(r.content.length <= MAX_TOOL_RESULT_CHARS, `${r.content.length} characters`);
});

test("list_records and search_records read the records on file, with the route to each", async () => {
  const due = addDays(today, -3);
  recordRepository.upsert(
    record("unit-gap-zqx", "gap-inspection", due, {
      inspectionDate: due,
      premisesName: "Plant",
      premisesAddress: "",
      contactPerson: "",
      findings: [
        {
          id: "f1",
          sNo: 1,
          findingOfInspection: "zqxmitra gap under the shutter",
          commentsOnFindings: "",
          correctiveActionContractor: "",
          correctiveActionClient: "",
          targetDate: null,
          actualDateOfAction: null,
          verifiedByServiceProvider: "",
          status: "Open",
          source: "Internal",
        },
      ],
      generalComments: [],
    })
  );
  const ctx = ctxOf({ isDemo: false });
  const listed = await run(ctx, "list_records", { documentId: "gap-inspection", from: addDays(today, -10), to: today });
  assert.equal(listed.ok, true, listed.content);
  const l = listed.result as { count: number; records: { recordId: string; status: string }[] };
  assert.ok(l.count >= 1);
  assert.ok(l.records.some((x) => x.recordId === "unit-gap-zqx"), listed.content);
  const onlyOpen = await run(ctx, "list_records", { documentId: "gap-inspection", from: addDays(today, -10), to: today, status: "In Progress" });
  assert.ok(!((onlyOpen.result as { records: { recordId: string }[] }).records ?? []).some((x) => x.recordId === "unit-gap-zqx"), "a status filter is applied");
  assert.equal((await run(ctx, "list_records", { documentId: "no-such" })).ok, false);

  const found = await run(ctx, "search_records", { query: "zqxmitra" });
  assert.equal(found.ok, true, found.content);
  const f = found.result as { hits: { recordId: string; snippet: string; route: string; name: string }[]; total: number };
  const hit = f.hits.find((h) => h.recordId === "unit-gap-zqx");
  assert.ok(hit, found.content);
  assert.match(hit!.snippet, /zqxmitra/);
  assert.equal(hit!.route, "/gap/unit-gap-zqx");
  assert.ok(found.content.length <= MAX_TOOL_RESULT_CHARS);
  const none = await run(ctx, "search_records", { query: "zqxabsent" });
  assert.equal(none.ok, true);
  assert.equal((none.result as { total: number }).total, 0);
});

test("get_record reads one record by id, and refuses an id that is not there", async () => {
  const ctx = ctxOf({ isDemo: false });
  const r = await run(ctx, "get_record", { recordId: "unit-gap-zqx" });
  assert.equal(r.ok, true, r.content);
  const res = r.result as { documentId: string; route: string; data: { findings: { findingOfInspection: string }[] } };
  assert.equal(res.documentId, "gap-inspection");
  assert.equal(res.route, "/gap/unit-gap-zqx");
  assert.match(res.data.findings[0].findingOfInspection, /zqxmitra/);
  assert.equal((await run(ctx, "get_record", { recordId: "nope" })).ok, false);
});

test("history_figures works the figures out for a question about history, and declines what is not one", async () => {
  const line = (id: string, date: string, name: string, idNo: string) => ({
    id,
    failureDate: date,
    failureTime: "10:00",
    equipmentName: name,
    equipmentIdNo: idNo,
    faultReported: "Web break",
    repairedDate: date,
    repairedTime: "11:00",
    productionLossMinutes: 60,
    reason: "bearing",
  });
  recordRepository.upsert(
    record("unit-bd-figures", "mnt-breakdown-record", addDays(today, -2), {
      header: {},
      rows: [line("r1", addDays(today, -6), "Delta 330", "M-13"), line("r2", addDays(today, -5), "Delta 330", "M-13"), line("r3", addDays(today, -4), "Lombardi", "M-07")],
    })
  );
  const ctx = ctxOf({ isDemo: false });
  const r = await run(ctx, "history_figures", { question: "which machine breaks down most this year" });
  assert.equal(r.ok, true, r.content);
  const res = r.result as { period: string; evidence: string; recordIds: string[] };
  assert.ok(res.evidence.length > 0, "an evidence pack came back");
  assert.match(res.period, /2026|year/i);
  assert.ok(Array.isArray(res.recordIds));
  assert.ok(r.content.length <= MAX_TOOL_RESULT_CHARS, `${r.content.length} characters`);
  const notOne = await run(ctx, "history_figures", { question: "checker is Ramesh" });
  assert.equal(notOne.ok, false);
  assert.match(notOne.content, /not a question about history/);
});

test("ask_user ends the turn with the question and its options", async () => {
  const ctx = ctxOf();
  const ask = tool(ctx, "ask_user");
  assert.equal(ask.endsTurn, true);
  const r = await run(ctx, "ask_user", { question: "Which record do you mean?", options: ["Today's", "Yesterday's", 3] });
  assert.equal(r.ok, true);
  assert.deepEqual((r.result as { options: string[] }).options, ["Today's", "Yesterday's", "3"]);
  assert.equal((await run(ctx, "ask_user", { options: ["a"] })).ok, false);
});

test("record_action: delete needs a reason and the person's yes; submit reports the page's own errors; verify only where the page offers it", async () => {
  const removed: string[] = [];
  const { target } = fakeTarget("gap", "gap-inspection", {}, { remove: (why) => removed.push(why), submit: () => ({ ok: false, errors: ["Inspection date is missing."] }) });
  const ctx = ctxOf({ target });
  const noReason = await run(ctx, "record_action", { action: "delete" });
  assert.equal(noReason.ok, false);
  assert.match(noReason.content, /reason needed/);
  assert.equal(removed.length, 0);
  const done = await run(ctx, "record_action", { action: "delete", reason: "made in error" });
  assert.equal(done.ok, true, done.content);
  assert.deepEqual(removed, ["made in error"]);
  assert.equal(ctx.confirmations.length, 1);
  const submit = await run(ctx, "record_action", { action: "submit" });
  assert.equal(submit.ok, false);
  assert.match(submit.content, /Inspection date/);
  const verify = await run(ctx, "record_action", { action: "verify" });
  assert.equal(verify.ok, false, "no verify on this page");
  assert.equal((await run(ctx, "record_action", { action: "dance" })).ok, false);

  const kept = fakeTarget("gap", "gap-inspection", {}, { remove: (why) => removed.push(why) });
  const declined = await run(ctxOf({ target: kept.target }, false), "record_action", { action: "delete", reason: "oops" });
  assert.equal(declined.ok, false);
  assert.deepEqual(removed, ["made in error"], "kept when the person says so");
});

test("change_format changes a designable format after the person's yes and saves it as the next revision; a program-drawn form only changes its header", async () => {
  const id = "qc-adhesive-mixing";
  const before = documentRepository.getById(id)!;
  const layout = getLogSheetLayout(id)!;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const everything = [...layout.columns, ...layout.headerFields, ...(layout.footerFields ?? [])];
  const column = layout.columns.find((c) => !c.fixed && !c.computed && !c.label.includes("(") && everything.filter((x) => norm(x.label) === norm(c.label)).length === 1);
  assert.ok(column, "a column with a name of its own to rename");
  const ctx = ctxOf({ currentRoute: `/document/${id}`, userWords: `rename ${column!.label} to Unit Test Column` });
  const r = await run(ctx, "change_format", { change: { op: "rename", label: column!.label, newLabel: "Unit Test Column" } });
  assert.equal(r.ok, true, r.content);
  assert.equal(ctx.confirmations.length, 1);
  assert.match(ctx.confirmations[0], /Rev/);
  const after = documentRepository.getById(id)!;
  assert.notEqual(after.revisionNo, before.revisionNo);
  assert.ok(getLogSheetLayout(id)!.columns.some((c) => c.label === "Unit Test Column"));
  assert.match((r.result as { described: string }).described, /renamed/);

  // Declined: nothing saved.
  const declined = await run(ctxOf({ currentRoute: `/document/${id}` }, false), "change_format", { change: { op: "rename", label: "Unit Test Column", newLabel: "Another" } });
  assert.equal(declined.ok, false);
  assert.equal(documentRepository.getById(id)!.revisionNo, after.revisionNo);

  // A name that is not on the sheet: the engine's question comes back, not a change.
  const missing = await run(ctxOf({ currentRoute: `/document/${id}` }), "change_format", { change: { op: "remove", label: "Zqx Nowhere" } });
  assert.equal(missing.ok, false);
  assert.match(missing.content, /can't find/);

  // A form the program draws: the grid is refused, the header is not.
  const { target } = fakeTarget("daily-pest-monitoring", "daily-pest-monitoring", {});
  const c2 = ctxOf({ target });
  const grid = await run(c2, "change_format", { change: { op: "add_column", label: "Batch" } });
  assert.equal(grid.ok, false);
  assert.match(grid.content, /header/);
  const header = await run(c2, "change_format", { change: { op: "set_header", field: "revisionDate", value: "01.09.2026" } });
  assert.equal(header.ok, true, header.content);
  assert.equal(documentRepository.getById("daily-pest-monitoring")!.revisionDate, "2026-09-01");
  assert.equal((await run(c2, "change_format", { change: { op: "set_header", field: "colour", value: "red" } })).ok, false);
  assert.ok(!mitraTools(ctxOf()).some((x) => x.name === "change_format"), "no document on screen: not even offered");
});

test("fill_open_record_with_sample_data fills a draft through commit with the sample-data note", async () => {
  const doc = documentRepository.getById("gap-inspection")!;
  const { record: fresh } = createRecordForDocument(doc, { dateISO: today, isDemo: true });
  const { target, commits } = fakeTarget("gap", "gap-inspection", fresh.data, { recordId: fresh.id });
  const ctx = ctxOf({ target });
  const r = await run(ctx, "fill_open_record_with_sample_data", {});
  assert.equal(r.ok, true, r.content);
  assert.equal(commits.length, 1);
  assert.equal(commits[0].note, SAMPLE_FILL_NOTE);
  assert.ok((commits[0].data as { findings: unknown[] }).findings.length >= 3);
  assert.ok(((r.result as { summary: string[] }).summary ?? []).length > 0);
});

test("start_guided_fill hands the widget its own interview; add_photo_to_open_record puts an attached picture on the record's list", async () => {
  const actions: unknown[] = [];
  const ctx = ctxOf({ runWidgetAction: (a) => actions.push(a) });
  const r = await run(ctx, "start_guided_fill", { documentId: "F/HR/17", dateISO: today });
  assert.equal(r.ok, true, r.content);
  assert.deepEqual(actions, [{ type: "startInterview", documentId: "daily-pest-monitoring", dateISO: today }]);
  assert.equal(mitraTools(ctxOf()).some((x) => x.name === "start_guided_fill"), false, "not offered where no widget hosts it");

  const photo: MitraAttachment = { id: "att-p", name: "shade.jpg", kind: "image", size: 10, status: "ready", text: "", characters: 0, dataUrl: "data:image/jpeg;base64,AAAA" };
  const { target, commits } = fakeTarget("complaint-ack", "capa-complaint-ack", { photos: [], scenario: "" });
  const c2 = ctxOf({ target, attachments: [photo] });
  const added = await run(c2, "add_photo_to_open_record", { attachmentId: "att-p" });
  assert.equal(added.ok, true, added.content);
  const photos = (commits[0].data as { photos: { name: string; dataUrl: string }[] }).photos;
  assert.equal(photos.length, 1);
  assert.equal(photos[0].name, "shade.jpg");
  assert.equal(photos[0].dataUrl, photo.dataUrl);
  assert.ok(commits[0].note.startsWith("Asked of Mitra"));
  assert.equal((await run(c2, "add_photo_to_open_record", { attachmentId: "nope" })).ok, false);
});

test("runTool caps a result at 1,500 characters and turns a throw into a failed result; fitValue cuts long lists first", async () => {
  const ctx = ctxOf();
  const big: MitraTool = { name: "big", description: "", parameters: { type: "object" }, run: () => ({ ok: true, result: { text: "x".repeat(5000) }, card: "big" }) };
  const r = await runTool(big, "{}", ctx);
  assert.equal(r.content.length, MAX_TOOL_RESULT_CHARS);
  assert.ok(r.content.endsWith("…(truncated)"));
  const boom: MitraTool = {
    name: "boom",
    description: "",
    parameters: { type: "object" },
    run: () => {
      throw new Error("kaboom");
    },
  };
  const e = await runTool(boom, "{}", ctx);
  assert.equal(e.ok, false);
  assert.match(e.content, /kaboom/);
  const fitted = fitValue({ rows: Array.from({ length: 200 }, (_, i) => ({ i, v: "abc" })) }, 400);
  assert.ok(JSON.stringify(fitted.value).length <= 400);
  assert.equal(fitted.truncated, true);
  assert.match(JSON.stringify(fitted.value), /more/);
  assert.deepEqual(fitValue({ a: 1 }, 400), { value: { a: 1 }, truncated: false });
});

test("todays_facts, read_attachment and hr_master_lookup answer from the app's own tables; step labels and the document on a path read right", async () => {
  const attachment: MitraAttachment = { id: "att-9", name: "notes.txt", kind: "text", size: 3000, status: "ready", text: "a".repeat(3000), characters: 3000 };
  const ctx = ctxOf({ attachments: [attachment] });
  const facts = await run(ctx, "todays_facts", {});
  assert.equal(facts.ok, true);
  assert.match((facts.result as { facts: string }).facts, /Today:/);
  assert.ok(Array.isArray((facts.result as { pending: unknown[] }).pending));
  assert.ok(facts.content.length <= MAX_TOOL_RESULT_CHARS);

  const slice = await run(ctx, "read_attachment", { id: "att-9", from: 100 });
  assert.equal(slice.ok, true);
  const s = slice.result as { from: number; to: number; text: string; more: boolean };
  assert.equal(s.from, 100);
  assert.equal(s.to, 1400);
  assert.equal(s.text.length, 1300);
  assert.equal(s.more, true);
  assert.ok(slice.content.length <= MAX_TOOL_RESULT_CHARS);
  const tail = await run(ctx, "read_attachment", { id: "notes.txt", from: 2500, to: 9999 });
  assert.equal((tail.result as { to: number; more?: boolean }).to, 3000);
  assert.equal((tail.result as { more?: boolean }).more, undefined);
  const missing = await run(ctx, "read_attachment", { id: "nope" });
  assert.equal(missing.ok, false);
  assert.match(missing.content, /att-9/, "the attachments there are, so the model can pick one");

  const nobody = await run(ctx, "hr_master_lookup", { query: "zqx nobody" });
  assert.equal(nobody.ok, false);
  const first = hrMasterRepository.all()[0];
  assert.ok(first, "HR Master Data is seeded");
  const someone = await run(ctx, "hr_master_lookup", { query: first.fullName });
  assert.equal(someone.ok, true, someone.content);
  assert.ok((someone.result as { people: { name: string }[] }).people.some((p) => p.name === first.fullName));

  assert.equal(documentOnPath("/document/qc-viscosity"), "qc-viscosity");
  assert.equal(documentOnPath("/hr/competence"), "hr-competence");
  assert.equal(documentOnPath("/dashboard"), null);
  assert.match(describeStep("navigate", { route: "/reports" }), /Opening Reports/);
  assert.match(describeStep("record_action", { action: "submit" }), /Submitting/);
  assert.match(describeStep("open_document", { documentId: "daily-pest-monitoring", create: true }), /Daily Pest Control Monitoring Record record/);
  assert.match(describeStep("whatever", {}), /whatever/);
});
