// EVERY PERSON'S MINUS SCORE ON THE ADMINISTRATOR'S DASHBOARD (REQUIREMENTS §92, 9-Oct-2026).
//
// "score system like FMS style ... any user has assign 10 tasks and he has
// completed 8 of them so his is 80 percent work is done in real but on
// superadmin and on admin dashboard he will display -20 ... this applies to all
// users of all department" (the owner, 9-Oct-2026).
//
// components/common/TeamScoreCard.tsx lists every account with its minus score,
// worst first, beside the counts it comes from, and the whole plant's on top.
// These tests hold its lines to the Performance Scorecard's own figures, its
// order to worst first (then nothing due, then those who answer for no
// document), the plant's line to its own counts (percentages are never added
// up), and the rule to the day card's (engine/motivation.ts dayGapScore), so a
// person is never shown two answers. "Today" is fixed here, never the clock.
import test from "node:test";
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server.edge";
import type { DocumentDefinition, RecordInstance } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { departmentOfDocument } from "../src/data/seed/departments";
import { fmsScore, formatMinus, scorecards, type Person, type PlantCalendar } from "../src/engine/performance";
import { dayGapScore } from "../src/engine/motivation";

// store/router.tsx reads window.location the moment it loads; the harness stands up none.
if (typeof (globalThis as { location?: unknown }).location === "undefined") {
  Object.defineProperty(globalThis, "location", { value: { hash: "#/dashboard", hostname: "localhost" }, configurable: true, writable: true });
}
const { teamFrom } = await import("../src/components/common/TeamScoreCard");

ensureDocumentsSeeded();
ensureMasterSeeded();

const MINUS = String.fromCharCode(0x2212);
const TODAY = "2026-09-24";
const OPEN: PlantCalendar = { isClosedDay: () => false };
const documents: DocumentDefinition[] = documentRepository.getAll();
const dailyOf = (code: string) => {
  const d = documents.find((x) => !x.isReferenceOnly && x.schedule.type === "daily" && departmentOfDocument(x.id, x.formatNo) === code);
  assert.ok(d, `the catalogue has a daily ${code} document`);
  return d;
};
const qcDaily = dailyOf("QC");
const hrDaily = dailyOf("HR");

const JENI: Person = { id: "qc-jeni", name: "Jeni", role: "staff", departments: ["QC"] };
const ASHA: Person = { id: "hr-asha", name: "Asha Patel", role: "staff", departments: ["HR"] };
const KAVITA: Person = { id: "mkt-kavita", name: "Kavita", role: "staff", departments: ["MKT"] };
const ADMIN: Person = { id: "admin", name: "Super Admin", role: "admin", departments: [] };
const EVERYBODY = [ADMIN, KAVITA, JENI, ASHA];

let n = 0;
const sep = (d: number) => `2026-09-${String(d).padStart(2, "0")}`;
function rec(doc: DocumentDefinition, day: number, by: string | null): RecordInstance {
  n += 1;
  const dueDate = sep(day);
  const base = { id: `team-${n}`, documentId: doc.id, periodKey: `${doc.id}:${dueDate}:${n}`, dueDate, isDemo: false, data: {}, createdAt: `${dueDate}T03:00:00.000Z`, updatedAt: `${dueDate}T03:00:00.000Z` };
  return (by === null ? { ...base, status: "Due" } : { ...base, status: "Submitted", submittedAt: `${dueDate}T06:30:00.000Z`, submittedBy: by }) as RecordInstance;
}
const days = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

// September to the 23rd: Jeni handed in 8 of QC's 10 daily sheets; Asha 15 of HR's 20 sheets.
const RECORDS = [
  ...days(1, 8).map((d) => rec(qcDaily, d, "Jeni")),
  ...days(9, 10).map((d) => rec(qcDaily, d, null)),
  ...days(1, 15).map((d) => rec(hrDaily, d, "Asha Patel")),
  ...days(16, 20).map((d) => rec(hrDaily, d, null)),
];

test("the rule is the day card's: round(done ÷ due × 100) − 100, for every count up to 60", () => {
  for (let due = 0; due <= 60; due++) {
    for (let done = 0; done <= due; done++) assert.ok(Object.is(fmsScore(done, due), dayGapScore(done, due)), `${done} of ${due}`);
  }
});

test("every person's line is the Performance Scorecard's, worst first, with the plant's from its own counts", () => {
  const cards = scorecards(RECORDS, documents, EVERYBODY, "this-month", TODAY, OPEN);
  const team = teamFrom(cards);
  const line = (name: string) => team.lines.find((l) => l.name === name)!;

  // The owner's example: 10 due, 8 done is −20%.
  assert.deepEqual([line("Jeni").due, line("Jeni").done, line("Jeni").minus], [10, 8, -20]);
  assert.equal(formatMinus(line("Jeni").minus), `${MINUS}20%`);
  // 15 of 20 is −25%: worse, so first.
  assert.deepEqual([line("Asha Patel").due, line("Asha Patel").done, line("Asha Patel").minus], [20, 15, -25]);
  // Each line is the scorecard's own figure.
  for (const l of team.lines) assert.equal(l.minus, cards.byPerson.find((p) => p.person.id === l.id)?.minus, l.name);

  // Worst first; then whoever had nothing due; then whoever answers for no document.
  assert.deepEqual(
    team.lines.map((l) => l.name),
    ["Asha Patel", "Jeni", "Kavita", "Super Admin"]
  );
  assert.deepEqual([line("Kavita").scored, line("Kavita").due, line("Kavita").minus], [true, 0, 0], "Marketing had nothing due");
  assert.equal(line("Super Admin").scored, false, "the administrator answers for no document: no score");

  // The plant: 23 of 30 done is −23% (round(76.7) − 100), not −20 + −25 added up.
  assert.deepEqual(team.plant, { due: 30, done: 23, overdue: 7, minus: -23 });
});

test("the card itself: shown while the people are read, the minus score's words held for Gujarati", async () => {
  const { TeamScoreCard } = await import("../src/components/common/TeamScoreCard");
  const [auth, store, router] = await Promise.all([import("../src/store/AuthContext"), import("../src/store/AppStore"), import("../src/store/router")]);
  const html = renderToStaticMarkup(h(auth.AuthProvider, null, h(store.AppStoreProvider, null, h(router.RouterProvider, null, h(TeamScoreCard)))));
  assert.match(html, /data-section="team-minus"/);
  assert.match(html, /Minus score of every person/);
  assert.match(html, /8 of 10 records done is −20%/, "the rule says what −20% means");
  assert.match(html, /data-state="team-minus-loading"/, "before the accounts arrive, it says it is counting");
  assert.match(html, /data-action="open-performance"/);
});
