// THE MANAGEMENT SUMMARY REMEMBERS FOR ONE ACCOUNT ONLY (REQUIREMENTS §75, §40).
//
// Reports > Management Summary (components/reports/MonthlySummaryReport.tsx)
// remembers the summary it last worked out, and the list of accounts it last
// read, so going to another tab and back shows it at once (§56). That memory
// lives as long as the browser tab — longer than a sign-in. It was once keyed by
// the month, the mode and the store's version alone, so the next person to sign
// in on the same tab — an account kept to Maintenance after one that sees every
// department — was shown the last person's summary, with the other departments'
// CAPA, quality and purchase parts in it, and started from the last person's
// list of accounts.
//
// These tests hold the memory to its account: a summary and a list kept for one
// account are never read out for another (another person, or the same person
// kept to other departments), and keeping for the next account forgets the last.
import test from "node:test";
import assert from "node:assert/strict";
import type { DirectoryPerson } from "../src/api/client";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { recordRepository, ensureSeeded as ensureRecordsSeeded } from "../src/data/repositories/recordRepository";
import { departmentScope, setDepartmentScope } from "../src/engine/departmentScope";
import { computeMonthlySummary } from "../src/engine/monthlySummary";
import { todayISO } from "../src/utils/date";

// The report is a component, and the router it imports reads the address bar
// the moment it is loaded (store/router.tsx): an address first, then the
// component, loaded after it.
Object.defineProperty(globalThis, "location", { value: { hash: "#/reports", pathname: "/", search: "", href: "http://localhost/#/reports" }, configurable: true, writable: true });
const { summaryAccount, summaryMemory } = await import("../src/components/reports/MonthlySummaryReport");

ensureDocumentsSeeded();
ensureMasterSeeded();
ensureRecordsSeeded();

const KEY = "false|2025|7"; // Live, August 2025 — the page's own key for the month and the mode
const VERSION = 7;

const EVERYONE: DirectoryPerson[] = [
  { id: "u-all", name: "Insights All QA", role: "staff", departments: [] },
  { id: "u-mnt", name: "Insights MNT QA", role: "staff", departments: ["MNT"] },
  { id: "u-qc", name: "Insights QC QA", role: "staff", departments: ["QC"] },
];
const MAINTENANCE_ONLY: DirectoryPerson[] = [{ id: "u-mnt", name: "Insights MNT QA", role: "staff", departments: ["MNT"] }];

/** The summary as the page works it out for whoever is signed in (the repositories are scoped to them). */
function summaryFor(scope: string[] | null) {
  setDepartmentScope(scope);
  try {
    return computeMonthlySummary({ records: recordRepository.query({ isDemo: false }), documents: documentRepository.getAll(), today: todayISO(), isDemo: false, people: null }, 2025, 7);
  } finally {
    setDepartmentScope(null);
  }
}

test("whose the page is: the account and its departments, in any order", () => {
  assert.equal(summaryAccount("u-1", null), summaryAccount("u-1", null));
  assert.equal(summaryAccount("u-1", ["QC", "PRD"]), summaryAccount("u-1", ["PRD", "QC"]));
  assert.notEqual(summaryAccount("u-1", null), summaryAccount("u-2", null), "two people are two accounts");
  assert.notEqual(summaryAccount("u-1", null), summaryAccount("u-1", ["MNT"]), "the same person kept to other departments reads other records");
});

test("the next person to sign in on the tab is not shown the last one's summary or list of accounts", () => {
  // Signed in first: an account that sees every department opens August 2025.
  const first = summaryAccount("u-all", null);
  const firstPeople = summaryMemory.keepDirectory(first, EVERYONE);
  const firstSummary = summaryFor(null);
  assert.equal(firstSummary.everyDepartment, true);
  assert.ok(firstSummary.capa && firstSummary.purchase, "the first account's summary has the other departments' parts");
  summaryMemory.keepSummary(first, { key: KEY, people: firstPeople, summary: firstSummary, ms: 12 }, VERSION);
  // Back on the tab as the same account, nothing saved since: remembered.
  assert.equal(summaryMemory.directory(first), firstPeople);
  assert.equal(summaryMemory.summary(first, VERSION, KEY, firstPeople)?.summary, firstSummary);

  // Then a Maintenance account signs in on the same tab and opens the same month
  // — same mode, same store version. The page's first state is what is
  // remembered: the list of accounts, then the summary for that list.
  const next = summaryAccount("u-mnt", ["MNT"]);
  const leaked = summaryMemory.summary(next, VERSION, KEY, firstPeople);
  assert.equal(
    leaked,
    null,
    leaked ? `the Maintenance account would be shown the last person's summary (scope: ${leaked.summary.scope}, CAPA part: ${leaked.summary.capa ? "shown" : "left out"})` : ""
  );
  assert.equal(summaryMemory.directory(next), null, "the page would start from the last person's list of accounts");
  assert.equal(summaryMemory.summary(next, VERSION, KEY, null), null, "the last person's summary would be shown before any list came");
});

test("keeping for the next account forgets the last one's", () => {
  const first = summaryAccount("u-all", null);
  const firstPeople = summaryMemory.keepDirectory(first, EVERYONE);
  summaryMemory.keepSummary(first, { key: KEY, people: firstPeople, summary: summaryFor(null), ms: 12 }, VERSION);

  const next = summaryAccount("u-mnt", ["MNT"]);
  const nextPeople = summaryMemory.keepDirectory(next, MAINTENANCE_ONLY);
  const nextSummary = summaryFor(["MNT"]);
  assert.equal(nextSummary.scope, "Maintenance");
  summaryMemory.keepSummary(next, { key: KEY, people: nextPeople, summary: nextSummary, ms: 9 }, VERSION);
  assert.equal(summaryMemory.summary(next, VERSION, KEY, nextPeople)?.summary.scope, "Maintenance");

  // The first account signing back in works its summary out afresh.
  assert.equal(summaryMemory.directory(first), null);
  assert.equal(summaryMemory.summary(first, VERSION, KEY, nextPeople), null);
});

test("the page opening for the next account forgets the last one's there and then, even when its own list never comes", () => {
  const first = summaryAccount("u-all", null);
  const firstPeople = summaryMemory.keepDirectory(first, EVERYONE);
  summaryMemory.keepSummary(first, { key: KEY, people: firstPeople, summary: summaryFor(null), ms: 12 }, VERSION);

  // The Maintenance account's page opens — and the server cannot be reached, so nothing is ever kept for it.
  summaryMemory.claim(summaryAccount("u-mnt", ["MNT"]));
  assert.equal(summaryMemory.directory(first), null, "the last person's list of accounts is still held after the next person's page opened");
  assert.equal(summaryMemory.summary(first, VERSION, KEY, firstPeople), null, "the last person's summary is still held after the next person's page opened");
});

test("the same account keeps what it had: the same list again is the same list, and a save anywhere is a new summary", () => {
  const me = summaryAccount("u-qc", ["QC"]);
  const kept = summaryMemory.keepDirectory(me, [{ id: "u-qc", name: "Insights QC QA", role: "staff", departments: ["QC"] }]);
  // The same accounts read again keep the list already kept, so the summary is not worked out again for nothing.
  assert.equal(summaryMemory.keepDirectory(me, [{ id: "u-qc", name: "Insights QC QA", role: "staff", departments: ["QC"] }]), kept);
  summaryMemory.keepSummary(me, { key: KEY, people: kept, summary: summaryFor(["QC"]), ms: 5 }, VERSION);
  assert.ok(summaryMemory.summary(me, VERSION, KEY, kept));
  // Going to another tab and back: the page opens again for the same account, and what it had is still there.
  summaryMemory.claim(me);
  assert.equal(summaryMemory.directory(me), kept);
  assert.ok(summaryMemory.summary(me, VERSION, KEY, kept), "the same account's summary was forgotten when its own page opened again");
  assert.equal(summaryMemory.summary(me, VERSION + 1, KEY, kept), null, "a save since (the store's version) is a summary to work out again");
  assert.equal(summaryMemory.summary(me, VERSION, "false|2025|6", kept), null, "another month is another summary");
  assert.equal(departmentScope(), null);
});
