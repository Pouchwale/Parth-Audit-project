// F/HR/18 MONTH BY MONTH (REQUIREMENTS §238): the visit list the chosen month's, that month's visits made, New in that
// month; a visit's Month & Year its own month's; November 2026's two hand-moved visits back on their Mondays.
// Run: npm run test:unit -- flyMonthWise
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { FlyCatcherData, RecordInstance } from "../src/types";
import { ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { recordRepository } from "../src/data/repositories/recordRepository";
import { visitMonthYear, withVisitMonthYear } from "../src/engine/flyMonthYear";
import { changeRecordDate } from "../src/engine/recordLifecycle";
import { BACK_ON_MONDAY_NOTE, flyMonthYearsFollowDates, flyVisitsBackOnMondays } from "../src/data/flyVisitsMigration";

ensureDocumentsSeeded();
ensureMasterSeeded();
const ROOT = process.env.DCRS_REPO_ROOT ?? process.cwd();
const FLY = "fly-catcher";
const data = (monthYear: string): FlyCatcherData => ({ monthYear, entries: [{ pcId: "PC-01", catchCountApprox: 3, tubeLightInstallDate: "2025-11-24", tubeLightDueDate: "2026-11-23", cleaningDoneBy: "Meet Patel", verifiedBy: "" }] }) as FlyCatcherData;
const visit = (id: string, dueDate: string, key: string, status: RecordInstance["status"], monthYear = "Nov-26"): RecordInstance => {
  const now = new Date().toISOString();
  return recordRepository.upsert({ id, documentId: FLY, periodKey: `${FLY}:${key}`, dueDate, status, isDemo: false, data: data(monthYear), createdAt: now, updatedAt: now });
};
const clear = () => recordRepository.query({ documentId: FLY }).forEach((r) => recordRepository.remove(r.id));

test("a visit's Month & Year is its own month's, where DCRS wrote it; a person's words stay", () => {
  assert.equal(visitMonthYear("2026-12-07"), "Dec-26");
  assert.equal(withVisitMonthYear(data("Nov-26"), "2026-12-07")?.monthYear, "Dec-26");
  assert.equal(withVisitMonthYear(data("November-26"), "2026-12-07")?.monthYear, "Dec-26", "the demo's long name too");
  assert.equal(withVisitMonthYear(data(""), "2026-12-07")?.monthYear, "Dec-26");
  assert.equal(withVisitMonthYear(data("Dec-26"), "2026-12-07"), null);
  assert.equal(withVisitMonthYear(data("Winter round"), "2026-12-07"), null, "words a person wrote stay");
  // Dated into another month: headed with it.
  clear();
  const r = visit("v-move", "2026-11-16", "2026-11-16", "In Progress");
  const { record } = changeRecordDate(r, "2026-12-07", `${FLY}:2026-12-07`, "Kapila Barad");
  assert.equal((record.data as FlyCatcherData).monthYear, "Dec-26");
  assert.ok(record.history?.at(-1)?.changes?.some((c) => c.field === "monthYear"), "the Month & Year change in its history line");
  clear();
});

test("November 2026's visits back on their Mondays, in order, with what was written on them; once", () => {
  clear();
  visit("rec-mvtaykce-19-bmvydf", "2026-11-16", "2026-11-02", "In Progress");
  visit("rec-mvvzonba-7-em8tcc", "2026-12-16", "2026-11-16", "Verified");
  assert.equal(flyVisitsBackOnMondays(), 2);
  const a = recordRepository.getById("rec-mvtaykce-19-bmvydf")!;
  const b = recordRepository.getById("rec-mvvzonba-7-em8tcc")!;
  assert.deepEqual([a.dueDate, b.dueDate], ["2026-11-02", "2026-11-16"]);
  assert.equal(b.status, "Verified", "signed, it stays signed");
  assert.equal((b.data as FlyCatcherData).entries[0].cleaningDoneBy, "Meet Patel", "what was written on it, kept");
  assert.ok(b.history?.some((h) => h.note === BACK_ON_MONDAY_NOTE));
  assert.equal(flyVisitsBackOnMondays(), 0, "once");
  // A visit's Month & Year follows its date at start.
  visit("v-dec", "2026-12-07", "2026-12-07", "Due", "Nov-26");
  assert.equal(flyMonthYearsFollowDates(), 1);
  assert.equal((recordRepository.getById("v-dec")!.data as FlyCatcherData).monthYear, "Dec-26");
  clear();
});

test("the visit list is the chosen month's; the month's visits are made; New opens the chosen month", () => {
  const page = readFileSync(path.join(ROOT, "frontend", "src", "pages", "PestControlPages.tsx"), "utf8");
  assert.match(page, /useEnsureMonth\(year, month, \[FLY_DOC_ID\]\);/);
  assert.match(page, /recordRepository\.query\(\{ documentId: FLY_DOC_ID, isDemo, fromDate: monthFrom, toDate: monthTo \}\)/);
  assert.match(page, /Inspection & cleaning records — \{monthLabel\}/);
  assert.match(page, /createRecordForDocument\(doc, \{ dateISO: thisMonth \? today : monthFrom, isDemo \}\)/);
});
