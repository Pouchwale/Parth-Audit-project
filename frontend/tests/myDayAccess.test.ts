// "YOUR DAY" COUNTS WHAT THE PERSON ANSWERS FOR (REQUIREMENTS §81, §96; the people review of 9-Oct-2026).
//
// The Dashboard's day card (components/common/MyDayCard.tsx over engine/motivation.ts motivationFor) counted every
// record of every document a person can SEE: Dharmik Mistry, who fills only F/PRD/10, read 0/8 with "Next up F-PRD-18"
// (Read only for him) and a score of -100; Vinay Bhojak was told F/HR/17 was next, a document he only reads; the
// super admin, who answers for no document, was given a personal score of -100. The card now counts what the bell,
// the briefing and the scorecard count: the documents the person answers for and may fill (engine/departmentScope.ts
// isMine). The super admin's card is the plant's day, with no score of their own.
// Run: npm run test:unit -- myDayAccess
import test from "node:test";
import assert from "node:assert/strict";
import type { RecordInstance } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded, masterRepository } from "../src/data/repositories/masterRepository";
import { recordRepository } from "../src/data/repositories/recordRepository";
import { departmentOfDocument } from "../src/data/seed/departments";
import { setAccessRules, setAccessScope, setDepartmentScope } from "../src/engine/departmentScope";
import type { AccessAccount } from "../src/engine/accessRules";
import { motivationFor } from "../src/engine/motivation";
import { createDefaultData } from "../src/engine/recordDefaults";
import { isCompanyHoliday } from "../src/engine/holidays";
import { addDays, todayISO } from "../src/utils/date";

ensureDocumentsSeeded();
ensureMasterSeeded();

const DHARMIK: AccessAccount = { email: "dharmik.mistry@gpp.local", role: "staff", departments: [] };
const VINAY: AccessAccount = { email: "vinay.bhojak@gpp.local", role: "staff", departments: ["HR"] };
const BOSS: AccessAccount = { email: "admin@gpp.local", role: "admin", departments: [] };

function as<T>(who: AccessAccount, run: () => T): T {
  setAccessScope(who, null);
  try {
    return run();
  } finally {
    setDepartmentScope(null);
    setAccessRules(null);
  }
}

/** The latest working day up to today: a record due then is on today's plate (due today, or still open from it). */
function lastWorkingDay(): string {
  let day = todayISO();
  for (let i = 0; i < 10 && isCompanyHoliday(day, masterRepository.get()); i++) day = addDays(day, -1);
  return day;
}

function open(documentId: string, dueDate: string): RecordInstance {
  const doc = documentRepository.getAllUnscoped().find((d) => d.id === documentId)!;
  return {
    id: `myday-${documentId}-${dueDate}`,
    documentId,
    periodKey: `${documentId}:myday:${dueDate}`,
    dueDate,
    status: "Due",
    isDemo: false,
    data: createDefaultData(doc, dueDate, masterRepository.get()),
    createdAt: `${dueDate}T03:00:00.000Z`,
    updatedAt: `${dueDate}T03:00:00.000Z`,
  };
}

const day = lastWorkingDay();
const daily = documentRepository
  .getAllUnscoped()
  .filter((d) => !d.isReferenceOnly && d.schedule.type === "daily" && departmentOfDocument(d.id, d.formatNo) === "PRD");
const prd10 = documentRepository.getAllUnscoped().find((d) => d.formatNo === "F/PRD/10");
const hr17 = documentRepository.getAllUnscoped().find((d) => d.formatNo === "F/HR/17");
recordRepository.upsertMany([...daily.map((d) => open(d.id, day)), ...(hr17 ? [open(hr17.id, day)] : [])]);

test("the day card holds the documents the plant has: several daily Production sheets, F/PRD/10 among them, and F/HR/17", () => {
  assert.ok(daily.length >= 2, `daily Production documents: ${daily.map((d) => d.formatNo).join(", ")}`);
  assert.ok(prd10 && daily.some((d) => d.id === prd10.id), "F/PRD/10 is a daily Production document");
  assert.ok(hr17, "F/HR/17 is in the catalogue");
});

test("Dharmik Mistry's day is F/PRD/10 alone, never the Production sheets he only reads", () => {
  const stats = as(DHARMIK, () => motivationFor({ id: "u-dharmik", name: "Dharmik Mistry", role: "staff", departments: [] }));
  assert.equal(stats.day.total, 1, `counted ${stats.day.total} of the ${daily.length} daily Production sheets`);
  assert.equal(stats.next?.documentId, prd10!.id, `next up was ${stats.next?.formatNo}`);
  assert.equal(stats.plantDay, false);
});

test("Vinay Bhojak is never told F/HR/17 is next: he reads it, Kapila Barad fills it", () => {
  const stats = as(VINAY, () => motivationFor({ id: "u-vinay", name: "Vinay Bhojak", role: "staff", departments: ["HR"] }));
  assert.notEqual(stats.next?.documentId, hr17!.id);
  assert.equal(stats.day.total, 0, "nothing of his is due on the day");
});

test("the super admin's card is the plant's day, with no score of their own", () => {
  const stats = as(BOSS, () => motivationFor({ id: "u-boss", name: "Super Admin", role: "admin", departments: [] }));
  assert.equal(stats.plantDay, true);
  assert.ok(stats.day.total >= daily.length, "the plant's open records are still shown to the boss");
});
