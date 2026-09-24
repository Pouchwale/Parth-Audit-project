// ONE ANSWER, WHEREVER IT IS ASKED (REQUIREMENTS §75).
//
// The Insights page, the Management Summary, Mitra's evidence and the search
// each read the same records. Where two of them answered the same question in
// two ways, the app contradicted itself: the Summary graded a supplier C from a
// half-rated draft that the SUP insight rightly ignored, and the search called
// a sheet "written by a person" after the assistant had filled it again, which
// the insights no longer did. These checks pin the shared answers.

import test from "node:test";
import assert from "node:assert/strict";
import type { DocumentDefinition, LogSheetData, LogSheetRow, RecordInstance } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { computeInsights, isHumanRecord, type InsightInput } from "../src/engine/insights";
import { supplierStandings } from "../src/engine/insightRules";
import { computeMonthlySummary } from "../src/engine/monthlySummary";
import { writtenByAPerson } from "../src/engine/recordSearch";

ensureDocumentsSeeded();
ensureMasterSeeded();

const TODAY = "2026-09-24";
const documents: DocumentDefinition[] = documentRepository.getAll();

function input(records: readonly RecordInstance[]): InsightInput {
  return { records, documents, today: TODAY, isDemo: false };
}

function rec(id: string, dueDate: string, rows: Partial<LogSheetRow>[], extra: Partial<RecordInstance> = {}): RecordInstance {
  const data: LogSheetData = { header: {}, rows: rows.map((r, i) => ({ id: `${id}-r${i}`, ...r }) as LogSheetRow), footer: {} } as LogSheetData;
  return {
    id,
    documentId: "pur-supplier-performance",
    periodKey: `pur-supplier-performance:${dueDate}`,
    dueDate,
    status: "Submitted",
    isDemo: false,
    data,
    createdAt: `${dueDate}T03:00:00.000Z`,
    updatedAt: `${dueDate}T12:00:00.000Z`,
    submittedAt: `${dueDate}T06:00:00.000Z`,
    submittedBy: "Buyer",
    ...extra,
  };
}

const lastYear = rec("pur-2025", "2025-12-01", [
  { supplierName: "Supplier F", period: "Apr-25 to Nov-25", productSafetyRating: 80, qualityRating: 70, deliveryRating: 75 },
  { supplierName: "Supplier A", period: "Apr-25 to Nov-25", productSafetyRating: 100, qualityRating: 95, deliveryRating: 90 },
]);
// This year's sheet, begun: product safety written for both, nothing else yet.
const begun = rec(
  "pur-2026",
  "2026-09-01",
  [
    { supplierName: "Supplier F", productSafetyRating: 100, qualityRating: null, deliveryRating: null },
    { supplierName: "Supplier A", productSafetyRating: 100, qualityRating: "", deliveryRating: "" },
  ],
  { status: "In Progress", submittedAt: undefined, history: [{ id: "h1", at: "2026-09-01T09:00:00.000Z", by: "Buyer", action: "edited" }] }
);

test("a supplier's grade is the same on the Insights page, in the Management Summary and in the shared reading", () => {
  const standing = supplierStandings([lastYear, begun]);
  const grades = Object.fromEntries(standing.graded.map((g) => [g.supplier, `${g.cells.grade} ${g.cells.overallRating}`]));
  assert.deepEqual(grades, { "Supplier F": "C 75.50", "Supplier A": "A 97.00" }, "each supplier is graded from its newest fully rated line");

  const sup = computeInsights(input([lastYear, begun])).filter((i) => i.rule === "SUP");
  assert.deepEqual(sup.map((i) => i.metric?.value), ["75.50"], "SUP names Supplier F's C, from last year's sheet");

  // September 2026: the half-rated draft is the newest sheet. Before, the
  // Summary graded both suppliers C (50.00) from it.
  const purchase = computeMonthlySummary({ ...input([lastYear, begun]), people: [] }, 2026, 8).purchase;
  assert.ok(purchase, "the Purchase part is there");
  assert.deepEqual([purchase.a, purchase.b, purchase.c], [1, 0, 1], `A/B/C: ${purchase.sentences.join(" ")}`);
  assert.deepEqual(purchase.gradedC.map((g) => `${g.supplier} ${g.overall}`), ["Supplier F 75.50"], "the Summary's C is SUP's C");
});

test('a sheet the assistant filled again is nobody\'s writing — for the search as for the insights', () => {
  const at = (h: number) => `2026-09-20T${String(h).padStart(2, "0")}:00:00.000Z`;
  const refilled: RecordInstance = {
    ...rec("refilled", "2026-09-20", [{ supplierName: "Supplier Q", productSafetyRating: 90 }]),
    status: "In Progress",
    submittedAt: undefined,
    prepared: { at: at(8), by: "assistant", notes: [], basedOn: "the specimen" },
    history: [
      { id: "h1", at: at(8), by: "Assistant", action: "prepared" },
      { id: "h2", at: at(9), by: "Buyer", action: "edited" },
      // "Fill again": every value replaced by the assistant's.
      { id: "h3", at: at(10), by: "Assistant", action: "assistant-edit" },
    ],
  };
  assert.equal(isHumanRecord(refilled), false, "insights");
  assert.equal(writtenByAPerson(refilled), false, "search: the buyer's entry was before the refill, and describes nothing on the sheet now");

  // Typed into again after the refill: a person's, for both.
  const typedAgain: RecordInstance = { ...refilled, history: [...(refilled.history ?? []), { id: "h4", at: at(11), by: "Buyer", action: "edited" }] };
  assert.equal(isHumanRecord(typedAgain), true);
  assert.equal(writtenByAPerson(typedAgain), true);
});
