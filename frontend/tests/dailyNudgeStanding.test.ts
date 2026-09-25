// THE DAY'S NOTIFICATION SAYS THE SCORECARD'S OWN SCORE (REQUIREMENTS §69, §75).
//
// Once a day a person is told what is waiting for them and where they are on
// the Performance Scorecard (components/common/DailyNudge.tsx). The scorecard
// works a person's score out with every account in the list, because where a
// department has two accounts (HR has two) a record one of them handed in
// counts for that one only (engine/latenessCore.ts attribute). The notification
// once worked it out with the person alone in the list — so every record the
// colleague handed in on time counted for them as well, and the notification
// said 75% where the scorecard said 25%.
//
// ownStanding is the notification's own working-out; these tests hold it to the
// scorecard's figure (engine/performance.ts scorecards with the whole list, as
// pages/PerformancePage.tsx calls it), and hold it to leaving the score out,
// rather than saying a wrong one, when the list of accounts cannot be read.
import test from "node:test";
import assert from "node:assert/strict";
import type { DocumentDefinition, RecordInstance } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { departmentOfDocument } from "../src/data/seed/departments";
import { scorecards, type Person, type PlantCalendar } from "../src/engine/performance";

// The notification is a component, and the router it imports reads the
// address bar the moment it is loaded (store/router.tsx): an address first,
// then the component, loaded after it.
Object.defineProperty(globalThis, "location", { value: { hash: "#/dashboard", pathname: "/", search: "", href: "http://localhost/#/dashboard" }, configurable: true, writable: true });
const { ownStanding } = await import("../src/components/common/DailyNudge");

ensureDocumentsSeeded();

const TODAY = "2026-09-24";
// Every day open, so the figures below are the records' alone.
const CALENDAR: PlantCalendar = { isClosedDay: () => false };
const documents: DocumentDefinition[] = documentRepository.getAll();

// An HR document filled in every day.
const hrDaily = documents.find((d) => !d.isReferenceOnly && d.schedule.type === "daily" && departmentOfDocument(d.id, d.formatNo) === "HR");

const ASHA: Person = { id: "hr-asha", name: "Asha Patel", role: "staff", departments: ["HR"] };
const BHAVNA: Person = { id: "hr-bhavna", name: "Bhavna Shah", role: "staff", departments: ["HR"] };
const QC: Person = { id: "qc-jeni", name: "Jeni", role: "staff", departments: ["QC"] };
const DIRECTORY = [ASHA, BHAVNA, QC];

function day(n: number): string {
  return `2026-09-${String(n).padStart(2, "0")}`;
}

/** One day's sheet of the HR document: handed in by `by`, `daysLate` after its day — or never, with `by` null. */
function sheet(n: number, by: string | null, daysLate = 0): RecordInstance {
  const dueDate = day(n);
  const base = { id: `hr-${n}`, documentId: hrDaily!.id, periodKey: `${hrDaily!.id}:${dueDate}`, dueDate, isDemo: false, data: {}, createdAt: `${dueDate}T03:00:00.000Z`, updatedAt: `${dueDate}T12:00:00.000Z` };
  if (by === null) return { ...base, status: "Due" } as RecordInstance;
  return { ...base, status: "Submitted", submittedAt: `${day(n + daysLate)}T06:00:00.000Z`, submittedBy: by } as RecordInstance;
}

// September: Bhavna handed in the 1st to the 4th on time, Asha the 5th two days
// late, and the 6th was never handed in by anybody.
const SEPTEMBER: RecordInstance[] = [sheet(1, "Bhavna Shah"), sheet(2, "Bhavna Shah"), sheet(3, "Bhavna Shah"), sheet(4, "Bhavna Shah"), sheet(5, "Asha Patel", 2), sheet(6, null)];

/** The Performance Scorecard's line for a person this month, from the whole list — the page's own call. */
function scorecardLine(person: Person, records: readonly RecordInstance[], people: readonly Person[] = DIRECTORY) {
  return scorecards(records, documents, people, "this-month", TODAY, CALENDAR).byPerson.find((p) => p.person.id === person.id);
}

test("there is an HR document filled in every day to build the month from", () => {
  assert.ok(hrDaily, "no daily HR document in the seeded library");
});

test("in a department two accounts share, the notification's score is the scorecard's, not the person's alone", () => {
  const onPage = scorecardLine(ASHA, SEPTEMBER);
  // Asha answers for her own late sheet and the one nobody handed in; Bhavna's four count for Bhavna.
  assert.deepEqual([onPage?.onTime, onPage?.late, onPage?.overdue, onPage?.score], [0, 1, 1, 25]);
  const standing = ownStanding(ASHA, DIRECTORY, SEPTEMBER, documents, TODAY, CALENDAR);
  assert.equal(standing?.score, onPage?.score, "the notification and the Performance Scorecard give Asha different scores");
  assert.equal(standing?.grade, onPage?.grade.label);
  // Bhavna's own line too: her four on time and the one nobody handed in.
  assert.equal(ownStanding(BHAVNA, DIRECTORY, SEPTEMBER, documents, TODAY, CALENDAR)?.score, scorecardLine(BHAVNA, SEPTEMBER)?.score);
  assert.equal(scorecardLine(BHAVNA, SEPTEMBER)?.score, 80);
});

test("a directory that leaves the person out still scores them, with everybody else in it", () => {
  const standing = ownStanding(ASHA, [BHAVNA, QC], SEPTEMBER, documents, TODAY, CALENDAR);
  assert.equal(standing?.score, 25);
});

test("without the list of accounts, a score a colleague's records could have changed is left out, not guessed", () => {
  assert.equal(ownStanding(ASHA, null, SEPTEMBER, documents, TODAY, CALENDAR), null);
});

test("without the list, a score nobody else's records touch is still said — and it is the scorecard's", () => {
  // Only Asha handed anything in, and one sheet nobody did: the list could not change her line.
  const hers = [sheet(1, "Asha Patel"), sheet(2, "  asha  PATEL "), sheet(5, "Asha Patel", 2), sheet(6, null)];
  const standing = ownStanding(ASHA, null, hers, documents, TODAY, CALENDAR);
  assert.ok(standing, "a score that cannot be wrong was left out");
  assert.equal(standing.score, scorecardLine(ASHA, hers)?.score);
  assert.equal(standing.rank, null, "no place is claimed without the list");
});

test("the administrator answers for no document: no score, with or without the list", () => {
  const admin: Person = { id: "admin", name: "Super Admin", role: "admin", departments: [] };
  assert.equal(ownStanding(admin, [...DIRECTORY, admin], SEPTEMBER, documents, TODAY, CALENDAR), null);
  assert.equal(ownStanding(admin, null, SEPTEMBER, documents, TODAY, CALENDAR), null);
});
