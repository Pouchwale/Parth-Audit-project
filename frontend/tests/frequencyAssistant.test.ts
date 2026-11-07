// A FREQUENCY SET BY WORD TO MITRA (REQUIREMENTS §202; the owner, 7-Nov-2026: "from now user can tell for any module to ai
// to set frequency so make sure even ai assistant can do that perfectly"):
//   * the words a frequency is said in - the kind, a weekday, a day, a month, every so many days, the weekdays, the days -
//     make the same schedule the picker makes, and what is not understood is said;
//   * set_document_frequency finds the document, asks first, writes Master Data's override as the panel does (the same
//     line in the activity log), drops it on "issued", and refuses a reference document;
//   * offered wherever the person has a document to set.
// Run: npm run test:unit -- frequencyAssistant
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { MitraToolContext } from "../src/engine/mitraTypes";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded, masterRepository } from "../src/data/repositories/masterRepository";
import { ensureSeeded as ensureRecordsSeeded } from "../src/data/repositories/recordRepository";
import { frequencyFromWords, kindOf, monthOf, weekdayOf } from "../src/engine/frequencyChoice";
import { scheduleLabel } from "../src/engine/frequencyEngine";
import { mitraTools, runTool } from "../src/engine/mitraTools";

ensureDocumentsSeeded();
ensureMasterSeeded();
ensureRecordsSeeded();
if (typeof (globalThis as { location?: unknown }).location === "undefined") {
  Object.defineProperty(globalThis, "location", { value: { hash: "" }, configurable: true, writable: true });
}

const TODAY = "2026-11-07";
const now = { type: "yearly", month: 9, dayOfMonth: 1 } as const;

test("the words a frequency is said in: the kinds, a weekday, a month, and the custom forms", () => {
  assert.equal(kindOf("every week"), "weekly");
  assert.equal(kindOf("Twice a month"), "fortnightly");
  assert.equal(kindOf("half yearly"), "half-yearly");
  assert.equal(kindOf("annual"), "yearly");
  assert.equal(kindOf("as required"), "as-required");
  assert.equal(kindOf("as issued"), "issued");
  assert.equal(kindOf("customly"), "custom");
  assert.equal(kindOf("sometimes"), null);
  assert.equal(weekdayOf("Thursday"), 4);
  assert.equal(weekdayOf("thu"), 4);
  assert.equal(weekdayOf(2), 2);
  assert.equal(weekdayOf("someday"), null);
  assert.equal(monthOf("April"), 3);
  assert.equal(monthOf(12), 11);
  assert.equal(monthOf(13), null);
  assert.deepEqual(frequencyFromWords({ kind: "weekly", weekday: "Thursday" }, now, TODAY), { schedule: { type: "weekly", weekday: 4 }, frequency: "Weekly" });
  assert.deepEqual(frequencyFromWords({ kind: "monthly", dayOfMonth: 28 }, now, TODAY), { schedule: { type: "monthly", dayOfMonth: 28 }, frequency: "Monthly" });
  assert.deepEqual(frequencyFromWords({ kind: "half yearly", month: "April", dayOfMonth: 10 }, now, TODAY), { schedule: { type: "half-yearly", anchorMonth: 3, dayOfMonth: 10 }, frequency: "Half-yearly" });
  assert.deepEqual(frequencyFromWords({ kind: "yearly", month: "Dec", dayOfMonth: 31 }, now, TODAY), { schedule: { type: "yearly", month: 11, dayOfMonth: 31 }, frequency: "Yearly" });
  assert.deepEqual(frequencyFromWords({ kind: "daily" }, now, TODAY), { schedule: { type: "daily" }, frequency: "Daily" });
  assert.deepEqual(frequencyFromWords({ kind: "custom", everyDays: 10 }, now, TODAY), { schedule: { type: "custom", everyDays: 10, from: TODAY }, frequency: "Custom" }, "every 10 days from today");
  assert.deepEqual(frequencyFromWords({ kind: "custom", everyDays: "3", from: "2026-12-01" }, now, TODAY), { schedule: { type: "custom", everyDays: 3, from: "2026-12-01" }, frequency: "Custom" });
  assert.deepEqual(frequencyFromWords({ kind: "custom", weekdays: ["mon", "Thursday"] }, now, TODAY), { schedule: { type: "custom", weekdays: [1, 4] }, frequency: "Custom" });
  assert.deepEqual(frequencyFromWords({ kind: "custom", daysOfMonth: "5, 15, 25" }, now, TODAY), { schedule: { type: "custom", daysOfMonth: [5, 15, 25] }, frequency: "Custom" });
  assert.deepEqual(frequencyFromWords({ kind: "custom", daysOfMonth: [25, 5] }, now, TODAY), { schedule: { type: "custom", daysOfMonth: [5, 25] }, frequency: "Custom" });
  for (const bad of [{ kind: "sometimes" }, { kind: "weekly", weekday: "someday" }, { kind: "monthly", dayOfMonth: 40 }, { kind: "custom" }, { kind: "custom", everyDays: 0 }, { kind: "custom", weekdays: ["noday"] }]) {
    const made = frequencyFromWords(bad, now, TODAY);
    assert.ok("error" in made, JSON.stringify(bad));
  }
});

function ctxOf(answer = true, over: Partial<MitraToolContext> = {}): MitraToolContext & { asked: string[] } {
  const asked: string[] = [];
  return {
    today: TODAY,
    isDemo: false,
    language: "en",
    userName: "Sandeep",
    currentRoute: "/dashboard",
    navigate: () => {},
    target: null,
    bump: () => {},
    attachments: [],
    confirm: async (question) => {
      asked.push(question);
      return answer;
    },
    userWords: "set the frequency",
    ...over,
    asked,
  };
}

const run = (ctx: MitraToolContext, args: unknown) => {
  const tool = mitraTools(ctx).find((x) => x.name === "set_document_frequency");
  assert.ok(tool, "set_document_frequency is offered");
  return runTool(tool!, JSON.stringify(args), ctx);
};

test("set_document_frequency asks first, writes the override as the panel does, drops it on issued, and refuses what it cannot set", async () => {
  const id = "hr-competence";
  const before = masterRepository.get().scheduleOverrides?.[id];
  try {
    // "No" leaves it.
    const left = await run(ctxOf(false), { document: "F/HR/01", kind: "custom", everyDays: 10 });
    assert.equal(left.ok, false);
    assert.equal(masterRepository.get().scheduleOverrides?.[id], before);
    // "Yes" sets it: every 10 days from today, by the person, from today; the document reads it at once.
    const ctx = ctxOf(true);
    const set = await run(ctx, { document: "F/HR/01", kind: "custom", everyDays: 10 });
    assert.equal(set.ok, true, set.content);
    assert.match(ctx.asked[0], /F\/HR\/01.*every 10 days from 07-11-2026/i, ctx.asked[0]);
    const override = masterRepository.get().scheduleOverrides?.[id];
    assert.deepEqual(override?.schedule, { type: "custom", everyDays: 10, from: TODAY });
    assert.equal(override?.frequency, "Custom");
    assert.equal(override?.since, TODAY);
    assert.equal(override?.by, "Sandeep");
    assert.equal(scheduleLabel(documentRepository.getById(id)!), "Every 10 days from 07-11-2026");
    assert.match(set.content, /Every 10 days from 07-11-2026/);
    // The same again: nothing to set.
    const same = await run(ctxOf(true), { document: id, kind: "custom", everyDays: 10 });
    assert.equal(same.ok, false);
    assert.match(same.content, /already/);
    // A weekday every week, named by the document's words.
    const weekly = await run(ctxOf(true), { document: "Personal Competence Records", kind: "weekly", weekday: "Thursday" });
    assert.equal(weekly.ok, true, weekly.content);
    assert.deepEqual(masterRepository.get().scheduleOverrides?.[id]?.schedule, { type: "weekly", weekday: 4 });
    // Back as issued.
    const issued = await run(ctxOf(true), { document: id, kind: "as issued" });
    assert.equal(issued.ok, true, issued.content);
    assert.equal(masterRepository.get().scheduleOverrides?.[id], undefined);
    assert.equal(documentRepository.getById(id)!.schedule.type, "yearly");
    const again = await run(ctxOf(true), { document: id, kind: "issued" });
    assert.equal(again.ok, false, "already as issued");
    // Not understood; not a document; a reference document.
    const bad = await run(ctxOf(true), { document: id, kind: "sometimes" });
    assert.equal(bad.ok, false);
    assert.match(bad.content, /not one of/);
    const nobody = await run(ctxOf(true), { document: "zqx no such paper", kind: "daily" });
    assert.equal(nobody.ok, false);
    const reference = await run(ctxOf(true), { document: "chemical-master", kind: "daily" });
    assert.equal(reference.ok, false);
    assert.match(reference.content, /never scheduled|no frequency/);
  } finally {
    const overrides = { ...(masterRepository.get().scheduleOverrides ?? {}) };
    if (before) overrides[id] = before;
    else delete overrides[id];
    masterRepository.update({ scheduleOverrides: overrides });
  }
});

test("the tool is offered wherever the person has a document to set, and the server-side rule is the panel's (by source)", () => {
  const names = new Set(mitraTools(ctxOf()).map((x) => x.name));
  assert.ok(names.has("set_document_frequency"));
  const root = process.env.DCRS_REPO_ROOT ?? process.cwd();
  const tools = readFileSync(path.join(root, "frontend", "src", "engine", "mitraTools.ts"), "utf8");
  assert.match(tools, /if \(frequencyDocsFor\(documentRepository\.getRecordableUnscoped\(\), isBossSignedIn\(\)\)\.length > 0\) tools\.push\(SET_FREQUENCY\);/);
  assert.match(tools, /removeOffScheduleShells\(\);/, "the schedule's blank shells follow, as on the panel");
  assert.match(tools, /logActivity\("Frequency changed"/, "the same line in the activity log");
});
