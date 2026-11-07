// NOT BEFORE ITS DAY (REQUIREMENTS §201; the owner, 7-Nov-2026, of F/HR/18's count against a visit nine days ahead: "make
// sure the third column ... is not filled before that particular date and user should get notification in reminder as
// well as notification and this applies to all the documents of every modules"):
//   * a live record may be written from the first day it covers - a visit's or a day's record from its due date, a
//     period's sheet from the period's first day, a sheet drawn up ahead from that many days before - and a demo record always;
//   * the record page, the CAPA, gap and training pages and F/HR/18's two views read the one rule (by source);
//   * Mitra's tools refuse a record that waits, naming the day;
//   * the plan tells the person: upcoming beforehand, due on the day.
// Run: npm run test:unit -- notBeforeDay
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { AssistantTarget } from "../src/store/AssistantContext";
import type { MitraToolContext } from "../src/engine/mitraTypes";
import { ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { ensureSeeded as ensureRecordsSeeded } from "../src/data/repositories/recordRepository";
import { waitsUntil, writableFrom } from "../src/engine/notBeforeDay";
import { mitraTools, runTool } from "../src/engine/mitraTools";
import { planNotifications } from "../src/engine/notificationPlan";

ensureDocumentsSeeded();
ensureMasterSeeded();
ensureRecordsSeeded();
if (typeof (globalThis as { location?: unknown }).location === "undefined") {
  Object.defineProperty(globalThis, "location", { value: { hash: "" }, configurable: true, writable: true });
}

const root = process.env.DCRS_REPO_ROOT ?? process.cwd();
const read = (...p: string[]) => readFileSync(path.join(root, ...p), "utf8").replace(/\r\n/g, "\n");

test("a record is written from the first day it covers: a visit's day, a month's, a quarter's, a half-year's or a year's first day", () => {
  const due = { dueDate: "2026-11-16" };
  assert.equal(writableFrom({ schedule: { type: "fortnightly", weekday: 1 } }, due), "2026-11-16", "a visit: its day");
  assert.equal(writableFrom({ schedule: { type: "daily" } }, due), "2026-11-16");
  assert.equal(writableFrom({ schedule: { type: "weekly", weekday: 4 } }, due), "2026-11-16");
  assert.equal(writableFrom({ schedule: { type: "as-required" } }, due), "2026-11-16");
  assert.equal(writableFrom(undefined, due), "2026-11-16", "no document: its day");
  assert.equal(writableFrom({ schedule: { type: "monthly", dayOfMonth: 28 } }, { dueDate: "2026-11-28" }), "2026-11-01", "a month's sheet from the 1st");
  assert.equal(writableFrom({ schedule: { type: "quarterly", anchorMonth: 3, dayOfMonth: 10 } }, { dueDate: "2026-12-10" }), "2026-10-01", "a quarter from its anchor (Apr, Jul, Oct, Jan)");
  assert.equal(writableFrom({ schedule: { type: "quarterly", anchorMonth: 3, dayOfMonth: 10 } }, { dueDate: "2026-02-10" }), "2026-01-01");
  assert.equal(writableFrom({ schedule: { type: "half-yearly", anchorMonth: 3, dayOfMonth: 1 } }, { dueDate: "2026-02-01" }), "2025-10-01", "a half-year across the new year");
  assert.equal(writableFrom({ schedule: { type: "yearly", month: 3, dayOfMonth: 1 } }, { dueDate: "2026-04-01" }), "2026-04-01", "a yearly sheet from its year's first day");
  assert.equal(writableFrom({ schedule: { type: "yearly", month: 3, dayOfMonth: 1 } }, { dueDate: "2027-03-31" }), "2026-04-01");
  assert.equal(writableFrom({ schedule: { type: "yearly", month: 11, dayOfMonth: 31 }, yearLong: true }, { dueDate: "2026-12-31" }), "2026-01-01", "a year-long sheet from the first of its twelve months");
  assert.equal(writableFrom({ schedule: { type: "yearly", month: 11, dayOfMonth: 31 }, yearLong: true, madeAheadDays: 30 }, { dueDate: "2026-12-31" }), "2025-12-02", "drawn up a month ahead");
  assert.equal(writableFrom({ schedule: { type: "daily" } }, { dueDate: "" }), "", "no date, no day");
});

test("a live record waits until that day; on the day, and any day after, it does not; a demo record never waits", () => {
  const visit = { schedule: { type: "fortnightly" as const, weekday: 1 } };
  assert.equal(waitsUntil(visit, { dueDate: "2026-11-16", isDemo: false }, "2026-11-07"), "2026-11-16");
  assert.equal(waitsUntil(visit, { dueDate: "2026-11-16", isDemo: false }, "2026-11-16"), null, "its day has come");
  assert.equal(waitsUntil(visit, { dueDate: "2026-11-16", isDemo: false }, "2026-11-20"), null, "late is still allowed: the paper waits to be filled");
  assert.equal(waitsUntil(visit, { dueDate: "2026-11-16", isDemo: true }, "2026-11-07"), null, "a demo record is sample data");
  assert.equal(waitsUntil({ schedule: { type: "monthly", dayOfMonth: 30 } }, { dueDate: "2026-11-30", isDemo: false }, "2026-11-07"), null, "the month's sheet is filled as the month goes");
  assert.equal(waitsUntil({ schedule: { type: "monthly", dayOfMonth: 30 } }, { dueDate: "2026-12-30", isDemo: false }, "2026-11-07"), "2026-12-01");
  assert.equal(waitsUntil(undefined, null, "2026-11-07"), null);
});

test("the pages and F/HR/18's views read the one rule, and the record page says the day it waits for (by source)", () => {
  const page = read("frontend", "src", "pages", "RecordPage.tsx");
  assert.match(page, /const waitsFor = record && doc \? waitsUntil\(doc, record\) : null;/);
  assert.match(page, /const editable = !!record && isEditableStatus\(record\.status\) && mayFill && !waitsFor;/);
  assert.match(page, /notBefore: waitsFor \?\? undefined,/, "Mitra is told the day");
  assert.match(page, /data-section="waits-for-day"/);
  assert.match(page, /t\("record\.waitsForDay", \{ date: formatDisplayDate\(waitsFor\) \}\)/);
  for (const file of ["CapaPage.tsx", "GapPage.tsx", "TrainingPage.tsx"]) {
    assert.match(read("frontend", "src", "pages", file), /isEditableStatus\(record\.status\) && mayDo\(record\.documentId, "fill"\) && !waitsUntil\(/, file);
  }
  const sheet = read("frontend", "src", "components", "records", "FlyCatcherRegisterSheet.tsx");
  assert.match(sheet, /const waits = !!r && !!waitsUntil\(doc, r\);\n[^\n]*\n\s+const canEdit = editing && !!r && !waits && /, "a future visit's line is locked on the register");
  assert.match(sheet, /paperCount\(waits \? null : e\?\.catchCountApprox\)/, "...and its count stays blank until the day");
  const view = read("frontend", "src", "components", "records", "FlyCatcherRecordView.tsx");
  assert.match(view, /editable && !!r && isEditableStatus\(r\.status\) && !waitsUntil\(flyDoc, r\)/);
  assert.match(view, /\(line\.current \|\| \(isEditableStatus\(r\.status\) && !waitsUntil\(flyDoc, r\)\)\)/);
  assert.match(view, /paperCount\(r && waitsUntil\(flyDoc, r\) \? null : o\?\.catchCountApprox\)/, "the record page's grid keeps a future visit's count blank too");
  const css = read("frontend", "src", "styles.css");
  assert.match(css, /\.fhr18-grid td\.pc-cell \{ font-weight: 700; text-align: center; vertical-align: middle;/, "the unit's number in the middle of its two lines");
  assert.match(css, /fhr18-input::-webkit-inner-spin-button/, "the count box's spinner off, its digits in the middle");
  // Counts as plain figures, the date boxes centred, a submitted visit edited from the register as a correction (§201, the owner's later pictures).
  assert.match(sheet, /return n === null \|\| n === undefined \? "" : String\(n\);/, "1, 2 - not 01, 02");
  assert.match(view, /\(n === null \|\| n === undefined \? "" : String\(n\)\)/);
  assert.match(css, /input\[type="date"\]\.fhr18-input \{ min-width: 118px; text-align: center; \}/);
  assert.match(sheet, /const canEdit = editing && !!r && !waits && \(isEditableStatus\(r\.status\) \|\| \(isCorrectableStatus\(r\.status\) && mayDo\(FLY_DOC_ID, "correct"\)\)\);/);
  assert.match(sheet, /if \(isCorrectableStatus\(r\.status\) && !pending\.current\.has\(r\.id\)\) r = reopenForCorrection\(r, user\.current, "Corrected on the register"\)/);
  const strings = read("frontend", "src", "i18n", "strings.ts");
  assert.equal((strings.match(/"record\.waitsForDay":/g) ?? []).length, 2, "in English and in Gujarati");
});

test("Mitra's tools refuse a record that waits for its day, naming the day", async () => {
  const commits: unknown[] = [];
  const target: AssistantTarget = {
    documentKind: "fly-catcher",
    documentId: "fly-catcher",
    recordId: "rec-fake",
    status: "Due",
    editable: false,
    notBefore: "2026-11-16",
    currentData: {},
    getData: () => ({ entries: [] }),
    commit: (next) => {
      commits.push(next);
    },
    title: "F/HR/18 of 16-11-2026",
  };
  const ctx: MitraToolContext = {
    today: "2026-11-07",
    isDemo: false,
    language: "en",
    userName: "Unit Test",
    currentRoute: "/record/rec-fake",
    navigate: () => {},
    target,
    bump: () => {},
    attachments: [],
    confirm: async () => true,
    userWords: "fill the count",
    runWidgetAction: () => {
      throw new Error("the guided fill must not start");
    },
  };
  const run = (name: string, args: unknown) => {
    const tool = mitraTools(ctx).find((x) => x.name === name);
    assert.ok(tool, name);
    return runTool(tool!, JSON.stringify(args), ctx);
  };
  for (const [name, args] of [
    ["edit_open_record", { patch: { fields: { x: 1 } } }],
    ["record_action", { action: "submit" }],
    ["start_guided_fill", {}],
  ] as const) {
    const r = await run(name, args);
    assert.equal(r.ok, false, name);
    assert.match(r.content, /16-11-2026/, `${name} names the day`);
    assert.match(r.content, /not before|from that day/, name);
  }
  assert.equal(commits.length, 0);
  // Printing a record that waits is fine: nothing is written.
  const print = mitraTools(ctx).find((x) => x.name === "record_action");
  assert.ok(print);
});

test("the plan reminds the person: upcoming beforehand and due on the day, for a live record of any document", () => {
  const doc = { id: "fly-catcher", formatNo: "F/HR/18", name: "Fly Catcher Inspection", module: "HR", schedule: { type: "fortnightly" } };
  const record = { id: "rec-1", documentId: "fly-catcher", dueDate: "2026-11-16", status: "Due", stored: true, prepared: false, problems: 0 };
  const person = { id: "u1", name: "Vijay", boss: false, answersFor: new Set(["fly-catcher"]), mayVerify: () => false };
  const plan = (today: string) => planNotifications({ today, time: "10:00", documents: [doc], records: [record], people: [person], isClosedDay: () => false });
  const onTheDay = plan("2026-11-16").filter((i) => i.userId === "u1");
  assert.ok(onTheDay.some((i) => i.kind === "due"), `due on the day: ${JSON.stringify(onTheDay.map((i) => i.kind))}`);
  const dayBefore = plan("2026-11-15").filter((i) => i.userId === "u1");
  assert.ok(dayBefore.every((i) => i.kind !== "due"), "not yet due the day before");
  assert.ok(dayBefore.some((i) => i.kind === "upcoming"), `a heads-up the day before: ${JSON.stringify(dayBefore.map((i) => i.kind))}`);
  const nineDaysBefore = plan("2026-11-07").filter((i) => i.userId === "u1");
  assert.ok(nineDaysBefore.every((i) => i.kind !== "due"));
});
