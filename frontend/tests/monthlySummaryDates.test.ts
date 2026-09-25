// THE MANAGEMENT SUMMARY'S DAYS: A PM'S WEEK AND A COMPLAINT'S APPROVAL DATE
// (REQUIREMENTS §75, the Monthly Management Summary).
//
// Two figures in engine/monthlySummary.ts turn on which day something counts on:
//
//   PREVENTIVE MAINTENANCE NOT DONE. Rule M6 (engine/insightRules.ts pmSlipRule)
//   gives a PM seven days after its plan before it calls it missed. The summary
//   once called a PM planned for today, or three days ago, "not done" — a figure
//   in the headline with no insight behind it on the Insights page. It now
//   counts "not done" only past those seven days, as M6 does, and says the ones
//   within them separately.
//
//   A CUSTOMER COMPLAINT'S APPROVAL DATE. The moment a checklist was verified is
//   stored in UTC; its first ten characters are the UTC date, so an approval at
//   01:30 on 1-Aug in the plant (20:00 on 31-Jul in UTC) counted as July's, and
//   July's summary called the complaint closed at its end. The date is now the
//   plant's, read as engine/latenessCore.ts reads a hand-in: this computer's own
//   clock (which in the plant's browsers is the plant's), or a zone passed in.
//
// "Today" is fixed, as in monthlySummary.test.ts.
import test from "node:test";
import assert from "node:assert/strict";
import type { DocumentDefinition, RecordInstance } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { COMPLAINT_DOC_ID } from "../src/data/seed/complaintChecklist";
import { computeInsights } from "../src/engine/insights";
import { dateInZone } from "../src/engine/latenessCore";
import { computeMonthlySummary, type MonthlySummaryInput } from "../src/engine/monthlySummary";

// This computer's clock is set to the plant's zone for this file — each test
// file runs in a process of its own, and Node takes a new TZ from the next
// date it reads — so the answer does not depend on where the tests are run.
process.env.TZ = "Asia/Kolkata";

ensureDocumentsSeeded();
ensureMasterSeeded();

const TODAY = "2026-09-24";
const documents: DocumentDefinition[] = documentRepository.getAll();

function input(records: readonly RecordInstance[], extra: Partial<MonthlySummaryInput> = {}): MonthlySummaryInput {
  return { records, documents, today: TODAY, isDemo: false, people: [], ...extra };
}

function rec(id: string, documentId: string, dueDate: string, data: unknown, extra: Partial<RecordInstance> = {}): RecordInstance {
  return {
    id,
    documentId,
    periodKey: `${documentId}:${dueDate}`,
    dueDate,
    status: "Submitted",
    isDemo: false,
    data,
    createdAt: `${dueDate}T03:00:00.000Z`,
    updatedAt: `${dueDate}T12:00:00.000Z`,
    submittedAt: `${dueDate}T06:00:00.000Z`,
    submittedBy: "Tester",
    ...extra,
  };
}

const sheet = (rows: Record<string, string | number | null>[]) => ({ header: {}, rows: rows.map((r, i) => ({ id: `r${i}`, ...r })) });

// ---------------------------------------------------------------------------
// preventive maintenance: M6's seven days

// F/MNT/03 for 2026, September's column, read on 24-Sep-2026.
const schedule = rec(
  "pm-2026",
  "mnt-yearly-pm-schedule",
  "2026-01-01",
  sheet([
    { equipment: "PRINTING MACHINE", frequency: "Monthaly", sepPlan: "24.09" }, // today: within its week
    { equipment: "SLITTING MACHINE", frequency: "Monthaly", sepPlan: "20.09" }, // 4 days ago: within its week
    { equipment: "LAMINATION MACHINE", frequency: "Monthaly", sepPlan: "17.09" }, // exactly 7 days ago: still within it, as M6 has it
    { equipment: "POUCHING MACHINE", frequency: "Monthaly", sepPlan: "16.09" }, // 8 days ago, never written: not done
    { equipment: "COMPRESSOR", frequency: "Monthaly", sepPlan: "28.09" }, // after today: not due yet
    { equipment: "CHILLER", frequency: "Monthaly", sepPlan: "05.09", sepActual: "06.09" }, // done, a day after the plan
  ])
);

test("a PM planned for today, or up to seven days ago, is not 'not done' — only one past M6's week is", () => {
  const s = computeMonthlySummary(input([schedule]), 2026, 8);
  assert.equal(s.state, "current");
  const pm = s.maintenance?.pm;
  assert.ok(pm, "the PM line is there");
  assert.equal(pm.planned, 6);
  assert.equal(pm.done, 1);
  assert.equal(pm.doneLate, 0);
  assert.equal(pm.notDone, 1, "only 16-Sep, eight days past its plan, is not done");
  assert.equal(pm.notYetDue, 4, "today's, 20-Sep's and 17-Sep's are within their week and 28-Sep's is to come");
  assert.equal(pm.planned, pm.done + pm.notDone + pm.notYetDue);

  const words = s.maintenance!.sentences.join(" ");
  assert.match(words, /6 planned for September 2026, 1 done, 1 not done, 3 not written yet but still within 7 days of the plan, 1 not due yet\./);
  // The headline names only what M6 would call missed.
  assert.match(s.headline.join(" "), /1 planned PM not done/);
});

test("the summary's 'not done' is the Insights page's M6 'not done', plan for plan", () => {
  const s = computeMonthlySummary(input([schedule]), 2026, 8);
  const m6NotDone = computeInsights(input([schedule]))
    .filter((i) => i.rule === "M6")
    .flatMap((i) => i.evidence)
    .filter((e) => e.field === "sepPlan" && /not done$/.test(e.value ?? ""));
  assert.deepEqual(
    m6NotDone.map((e) => e.value),
    ["16.09 — not done"],
    "M6 should call exactly one of September's plans missed"
  );
  assert.equal(s.maintenance?.pm?.notDone, m6NotDone.length);
});

test("a month that has ended counts the week to today: still blank weeks after the plan is not done, six days after it is within its week", () => {
  const august = rec("pm-aug", "mnt-yearly-pm-schedule", "2026-01-01", sheet([{ equipment: "PRINTING MACHINE", frequency: "Monthaly", augPlan: "28.08" }]));
  // Read on 3-Sep, six days after the plan: still within its week.
  const early = computeMonthlySummary({ ...input([august]), today: "2026-09-03" }, 2026, 7).maintenance?.pm;
  assert.deepEqual([early?.notDone, early?.notYetDue], [0, 1]);
  // Read on 24-Sep, twenty-seven days after it and still blank: not done.
  const late = computeMonthlySummary(input([august]), 2026, 7).maintenance?.pm;
  assert.deepEqual([late?.notDone, late?.notYetDue], [1, 0]);
});

// ---------------------------------------------------------------------------
// a customer complaint approved just after midnight in the plant

const complaint = (verifiedAt: string) =>
  rec(
    "cc-1",
    COMPLAINT_DOC_ID,
    "2026-07-30",
    { complaintNo: "CC-26-07", customerName: "A Customer", complaintReceivedDate: "2026-07-30" },
    { status: "Verified", verifiedAt, verifiedBy: "QA Head" }
  );

test("a complaint approved at 01:30 on 1-Aug in the plant is August's approval, and open at July's end", () => {
  // 20:00 on 31-Jul in UTC is 01:30 on 1-Aug in the plant.
  const records = [complaint("2026-07-31T20:00:00.000Z")];
  const july = computeMonthlySummary(input(records), 2026, 6).capa?.external;
  assert.ok(july, "the complaints line is there");
  assert.equal(july.received, 1);
  assert.equal(july.approved, 0, "approved in August in the plant, not in July");
  assert.equal(july.openAtEnd, 1, "still waiting for approval when July ended in the plant");
  const august = computeMonthlySummary(input(records), 2026, 7).capa?.external;
  assert.equal(august?.approved, 1, "August's approval");
});

test("an approval at 23:00 on 31-Jul in the plant stays July's", () => {
  // 17:30 on 31-Jul in UTC is 23:00 on 31-Jul in the plant.
  const july = computeMonthlySummary(input([complaint("2026-07-31T17:30:00.000Z")]), 2026, 6).capa?.external;
  assert.deepEqual([july?.approved, july?.openAtEnd], [1, 0]);
});

test("a caller whose clock runs in another zone passes the plant's, as the server does for the lateness rule", () => {
  const records = [complaint("2026-07-31T20:00:00.000Z")];
  const july = computeMonthlySummary(input(records, { dateOf: (s) => dateInZone(s, "Asia/Kolkata") }), 2026, 6).capa?.external;
  assert.deepEqual([july?.approved, july?.openAtEnd], [0, 1]);
  // The same moment read in UTC is still 31-Jul: the zone is the caller's to say.
  const utc = computeMonthlySummary(input(records, { dateOf: (s) => dateInZone(s, "UTC") }), 2026, 6).capa?.external;
  assert.deepEqual([utc?.approved, utc?.openAtEnd], [1, 0]);
});
