// THE INSIGHTS ENGINE, HELD TO RECORDS WHOSE ANSWER IS KNOWN (REQUIREMENTS §75).
//
// engine/insights.ts and engine/insightRules.ts read the plant's records
// together and say what stands out; people act on what they say, so each
// promise is checked here against records built for the purpose:
//   * only what people wrote is read — never a sheet the assistant filled
//     again, or one a start-up migration touched;
//   * one record written in a way nobody expected (a date column made Text
//     in the Format Editor) never stops the engine;
//   * two runs at once (the Insights page and Mitra, the monthly summary as of
//     another day) both finish;
//   * the early warning (A2) is decided sheet by sheet, the supplier grade
//     (SUP) only from lines rated in full, a CAPA raised from an insight names
//     every record it was read from, and an account that cannot see the CAPA
//     report is told nothing about CAPA;
//   * C1 and C2 find a record that contradicts itself, and nothing in a
//     generated demo year.
//
// "Today" is fixed, not the clock, so the answers are the same whatever day the
// tests run.
import test from "node:test";
import assert from "node:assert/strict";
import type { DailyPestMonitoringData, DocumentDefinition, GapInspectionData, HistoryEntry, LogSheetData, LogSheetRow, RecordInstance } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { ensureSeeded as ensureHrMasterSeeded } from "../src/data/repositories/hrMasterRepository";
import { recordRepository, ensureSeeded as ensureRecordsSeeded } from "../src/data/repositories/recordRepository";
import { ensureDemoRecordsGeneratedForYear } from "../src/data/demoGenerator";
import { getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import { setDepartmentScope } from "../src/engine/departmentScope";
import { computeInsights, isHumanRecord, startInsights, type Insight, type InsightInput } from "../src/engine/insights";
import { breakdownLines } from "../src/engine/insightRules";
import { raiseCapaFromInsight } from "../src/engine/raiseCapa";

ensureDocumentsSeeded();
ensureMasterSeeded();
ensureHrMasterSeeded();
ensureRecordsSeeded();

const TODAY = "2026-09-24";
const allDocuments: DocumentDefinition[] = documentRepository.getAll();

function input(records: readonly RecordInstance[], extra: Partial<InsightInput> = {}): InsightInput {
  return { records, documents: allDocuments, today: TODAY, isDemo: false, ...extra };
}

/** TODAY moved by `offset` days. */
function day(offset: number): string {
  const d = new Date(`${TODAY}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

/** A record as a person handed it in (Submitted) on its own due date, unless told otherwise. */
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

const sheet = (rows: Record<string, string | number | null>[], header: Record<string, string> = {}): LogSheetData => ({ header, rows: rows.map((r, i) => ({ id: `r${i}`, ...r })) });

const HOURS = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00", "22:00", "23:00", "00:00", "01:00", "02:00", "03:00", "04:00", "05:00", "06:00", "07:00", "08:00"];

/** An F-QC-30 viscosity sheet with these readings, one an hour from 09:00. */
const viscosity = (id: string, dueDate: string, values: number[], extra: Partial<RecordInstance> = {}): RecordInstance =>
  rec(id, "qc-viscosity", dueDate, sheet(values.map((v, i) => ({ time: HOURS[i], viscosity: v, testedBy: "Jeni" }))), extra);

// Readings that look like a process running steady on its nominal of 20 Sec.:
// a fixed pseudo-random scatter, so every run of the tests reads the same.
function steadyReadings(seed: number, n = 24, sd = 0.2): number[] {
  let s = seed;
  const next = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  return Array.from({ length: n }, () => {
    let g = 0;
    for (let i = 0; i < 12; i++) g += next();
    return Math.round(Math.min(20.85, Math.max(19.15, 20 + (g - 6) * sd)) * 100) / 100;
  });
}

const byRule = (insights: Insight[], rule: string) => insights.filter((i) => i.rule === rule);

// ---------------------------------------------------------------------------
// 1. only what people wrote

test("a draft only the assistant filled again, or only a start-up migration touched, is not a person's record", () => {
  const draft = (history: Partial<HistoryEntry>[]) =>
    rec("draft", "qc-viscosity", day(-2), sheet([]), {
      status: "In Progress",
      submittedAt: undefined,
      submittedBy: undefined,
      history: history.map((h, i) => ({ id: `h${i}`, at: `${day(-2)}T0${i}:00:00.000Z`, by: "Jeni", action: "edited", ...h }) as HistoryEntry),
    });
  // "Fill again" on the record page: every value replaced by a fresh synthetic fill.
  assert.equal(isHumanRecord(draft([{ by: "Assistant", action: "assistant-edit" }])), false, "a Fill again was read as a person's record");
  // A boot migration (engine/tubeLightMigration.ts) rewriting a cell.
  assert.equal(isHumanRecord(draft([{ by: "System", action: "edited" }])), false, "a System migration was read as a person's record");
  assert.equal(isHumanRecord(draft([{ by: "Assistant", action: "prepared" }])), false);
  // Typed into, then filled again: what was typed is gone.
  assert.equal(isHumanRecord(draft([{ by: "Jeni" }, { by: "Assistant", action: "assistant-edit" }])), false, "typing wiped by a Fill again still counted");
  // A person's hand on the sheet: typed, typed after a refill, or Mitra's sample fill saved under their own name.
  assert.equal(isHumanRecord(draft([{ by: "Jeni" }])), true);
  assert.equal(isHumanRecord(draft([{ by: "Assistant", action: "assistant-edit" }, { by: "Jeni" }])), true);
  assert.equal(isHumanRecord(draft([{ by: "Jeni", action: "assistant-edit" }])), true, "Mitra's sample fill is the person's own record");
});

test("a sheet the assistant filled again is not evidence: its readings raise nothing", () => {
  const refilled = viscosity("refilled", day(-1), [20, 21.6, 21.7, 21.8, 20.1], {
    status: "In Progress",
    submittedAt: undefined,
    history: [{ id: "h1", at: `${day(-1)}T08:00:00.000Z`, by: "Assistant", action: "assistant-edit", note: "Filled again" }],
  });
  assert.equal(byRule(computeInsights(input([refilled])), "A1").length, 0, "a Fill again's readings were reported as the plant's");
  // The same sheet once a person has typed on it is read.
  const typed = { ...refilled, history: [...(refilled.history ?? []), { id: "h2", at: `${day(-1)}T09:00:00.000Z`, by: "Jeni", action: "edited" } as HistoryEntry] };
  assert.equal(byRule(computeInsights(input([typed])), "A1").length, 1);
});

// ---------------------------------------------------------------------------
// 2. a record written in a way nobody expected never stops the engine

const outOfBandSheet = viscosity("visc-out", day(-3), [20, 20.1, 21.5, 21.6, 21.4, 20.2]);

test("a breakdown dated 12.09.2026 (a date column made Text) is shown as written, and every other insight still comes", () => {
  const bd = rec(
    "bd-text-date",
    "mnt-breakdown-record",
    "2026-09-12",
    sheet([{ failureDate: "12.09.2026", failureTime: "08:00", equipmentName: "Delta 330", equipmentIdNo: "M-47", faultReported: "Web break", repairedDate: "12.09.2026", repairedTime: "09:30" }])
  );
  assert.doesNotThrow(() => breakdownLines(bd), "breakdownLines threw on a date that is not ISO");
  const [line] = breakdownLines(bd);
  assert.equal(line.failure, "12.09.2026 08:00", "the date is shown as written");
  assert.equal(line.date, "2026-09-12", "the line is dated by its sheet");
  let insights: Insight[] = [];
  assert.doesNotThrow(() => (insights = computeInsights(input([bd, outOfBandSheet]))), "one breakdown line stopped every insight");
  assert.ok(insights.some((i) => i.id === `a1|qc-viscosity|viscosity|${day(-3)}`), "the viscosity excursion went missing");
  assert.ok(insights.some((i) => i.id === "m3|summary"), "the breakdown register was not read");
});

test("a CAPA finding whose target date is not a date does not take B2 down with it", () => {
  const pest = (id: string, date: string): RecordInstance =>
    rec(id, "daily-pest-monitoring", date, {
      isHoliday: false,
      checkpoints: {},
      timeOfChecking: "10:00",
      checker: "Vinay",
      summaryActions: [{ id: "s1", dateOfObservation: date, descriptionOfObservation: "RBS numbering not legible at RB-12", actionTaken: "Informed maintenance", remarks: "" }],
    } as unknown as DailyPestMonitoringData);
  const capa = rec("capa-text-target", "gap-inspection", day(-20), {
    inspectionDate: day(-20),
    premisesName: "GPP",
    premisesAddress: "",
    contactPerson: "",
    generalComments: [],
    findings: [
      { id: "f1", sNo: 1, findingOfInspection: "RBS numbering not legible at RB-12", commentsOnFindings: "", correctiveActionContractor: "NA", correctiveActionClient: "Renumber", targetDate: "15.10.2026", actualDateOfAction: null, verifiedByServiceProvider: "", status: "Open", source: "Internal" },
    ],
  } as unknown as GapInspectionData);
  const b2 = byRule(computeInsights(input([pest("p1", day(-30)), pest("p2", day(-20)), pest("p3", day(-10)), capa])), "B2");
  assert.equal(b2.length, 1, "B2 went missing when a finding's target date was not ISO");
  assert.match(b2[0].detail, /target 15\.10\.2026/, "the target date is shown as written");
});

test("a record no reader can read is left out of its rule, and the rest are read all the same", () => {
  const unreadable = rec("bd-unreadable", "mnt-breakdown-record", day(-5), {
    get rows(): LogSheetRow[] {
      throw new Error("a cell nobody expected");
    },
    header: {},
  });
  const logged: unknown[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => void logged.push(args);
  try {
    let insights: Insight[] = [];
    assert.doesNotThrow(() => (insights = computeInsights(input([unreadable, outOfBandSheet]))), "one unreadable record stopped the engine");
    assert.ok(insights.some((i) => i.id === `a1|qc-viscosity|viscosity|${day(-3)}`), "the other records' insights went missing");
  } finally {
    console.error = original;
  }
  assert.ok(logged.length > 0, "nothing said which record could not be read");
});

// ---------------------------------------------------------------------------
// 3. two runs at once

test("two runs taken a slice at a time, side by side over 6,000 records, both finish — and agree with a run in one go", () => {
  const records: RecordInstance[] = [];
  for (let i = 0; i < 6000; i++) records.push(viscosity(`v${i}`, day(-1 - (i % 400)), steadyReadings(i + 1, 4)));
  // Two arrays with the same records, as two calls of recordRepository.query
  // give; the second as of another day, as the monthly summary asks.
  const a = input(records);
  const b = input([...records], { today: day(-30) });
  const runA = startInsights(a);
  const runB = startInsights(b);
  let doneA: Insight[] | null = null;
  let doneB: Insight[] | null = null;
  let slices = 0;
  while ((!doneA || !doneB) && slices < 20000) {
    if (!doneA) doneA = runA.step(0.001);
    if (!doneB) doneB = runB.step(0.001);
    slices += 1;
  }
  assert.ok(doneA && doneB, `after ${slices} slices each: the first run ${doneA ? "finished" : "never finished"}, the second ${doneB ? "finished" : "never finished"}`);
  assert.deepEqual(JSON.parse(JSON.stringify(doneA)), JSON.parse(JSON.stringify(computeInsights(input([...records])))));
  assert.deepEqual(JSON.parse(JSON.stringify(doneB)), JSON.parse(JSON.stringify(computeInsights(input([...records], { today: day(-30) })))));
});

// ---------------------------------------------------------------------------
// 4. A2 sheet by sheet

test("A2 still warns of a shift when the newest sheet is a short one", () => {
  const records: RecordInstance[] = [];
  for (let off = -41; off <= -3; off++) records.push(viscosity(`steady${off}`, day(off), steadyReadings(1000 + off)));
  // Two days ago the process moved up: every reading still inside 19–21, six
  // of them well above the nominal.
  const shifted = steadyReadings(77);
  for (let h = 8; h < 14; h++) shifted[h] = h % 2 ? 20.8 : 20.72;
  records.push(viscosity("shifted", day(-2), shifted));
  // Today's sheet: five readings so far (a shift half done).
  records.push(viscosity("today-short", TODAY, steadyReadings(5, 5)));
  const a2 = computeInsights(input(records)).find((i) => i.id === `a2|qc-viscosity|viscosity|${day(-2)}`);
  assert.ok(a2, "one short sheet today switched the early warning off for every day before it");
  assert.equal(a2.severity, "medium");
});

// ---------------------------------------------------------------------------
// 5. SUP from lines rated in full

test("SUP grades a supplier from its newest line with all three ratings written, never from a half-rated draft", () => {
  const lastYear = rec(
    "pur-2025",
    "pur-supplier-performance",
    "2025-12-01",
    sheet([
      { supplierName: "Supplier F", period: "Apr-25 to Nov-25", productSafetyRating: 80, qualityRating: 70, deliveryRating: 75 },
      { supplierName: "Supplier A", period: "Apr-25 to Nov-25", productSafetyRating: 100, qualityRating: 95, deliveryRating: 90 },
    ]),
    { status: "Verified" }
  );
  // This year's sheet, begun: product safety written for both, the rest not yet.
  const begun = rec(
    "pur-2026",
    "pur-supplier-performance",
    "2026-09-01",
    sheet([
      { supplierName: "Supplier F", productSafetyRating: 100, qualityRating: null, deliveryRating: null },
      { supplierName: "Supplier A", productSafetyRating: 100, qualityRating: "", deliveryRating: "" },
    ]),
    { status: "In Progress", submittedAt: undefined, history: [{ id: "h1", at: "2026-09-01T09:00:00.000Z", by: "Buyer", action: "edited" }] }
  );
  const sup = byRule(computeInsights(input([lastYear, begun])), "SUP");
  assert.deepEqual(
    sup.map((i) => i.id),
    ["sup|pur-supplier-performance|supplier f"],
    `graded from the half-rated draft: ${sup.map((i) => i.title).join(" | ")}`
  );
  assert.equal(sup[0].metric?.value, "75.50", "Supplier F's real grade is last year's C");
  assert.equal(sup[0].evidence[0].recordId, "pur-2025");

  // A sheet handed in with one line only half rated: that line is not graded.
  const halfHandedIn = rec("pur-half", "pur-supplier-performance", "2026-09-02", sheet([{ supplierName: "Supplier N", productSafetyRating: 100 }]));
  assert.equal(byRule(computeInsights(input([halfHandedIn])), "SUP").length, 0, "a blank rating was weighed as 0 and graded C");
});

// ---------------------------------------------------------------------------
// 6. a CAPA raised from an insight names every record

test("a CAPA raised from A4 names all twenty verified sheets, and A4 does not come back for the eight its card did not list", () => {
  // Twenty verified sheets, each with a reading out of band and no remark (F-QC-30 prints no remark column).
  const sheets = Array.from({ length: 20 }, (_, i) => viscosity(`a4-${i}`, day(-70 + i * 3), [20, 21.4, 20.1], { status: "Verified", isDemo: true }));
  const a4 = computeInsights(input(sheets, { isDemo: true })).find((i) => i.rule === "A4");
  assert.ok(a4, "A4 is found");
  assert.equal(a4.evidence.length, 12, "the card lists twelve");
  assert.equal(a4.evidenceTotal, 20);
  const raised = raiseCapaFromInsight(a4, "Tester", true);
  assert.ok(raised, "the CAPA was raised");
  const finding = (raised.record.data.findings as (GapInspectionData["findings"][number] & { sourceRecordIds?: string[] })[]).find((f) => f.sourceRecordIds?.length);
  assert.equal(finding?.sourceRecordIds?.length, 20, "the finding names only the sheets its card listed");
  const again = computeInsights(input([...sheets, raised.record], { isDemo: true })).filter((i) => i.rule === "A4");
  assert.equal(again.length, 0, `A4 came back for ${again[0]?.evidenceTotal ?? again[0]?.evidence.length} sheets the CAPA already answers for`);
});

// ---------------------------------------------------------------------------
// 7. nothing about CAPA to an account that cannot see the CAPA report

test("an account that cannot see the CAPA report is told nothing about CAPA on A4 or B2", () => {
  const sheets = Array.from({ length: 3 }, (_, i) => viscosity(`qc-a4-${i}`, day(-30 + i), [20, 21.4, 20.1], { status: "Verified" }));
  const pest = (id: string, date: string): RecordInstance =>
    rec(id, "daily-pest-monitoring", date, {
      isHoliday: false,
      checkpoints: {},
      timeOfChecking: "10:00",
      checker: "Vinay",
      summaryActions: [{ id: "s1", dateOfObservation: date, descriptionOfObservation: "Door closer of the RM store not working", actionTaken: "Informed maintenance", remarks: "" }],
    } as unknown as DailyPestMonitoringData);
  const register = [pest("hr-1", day(-30)), pest("hr-2", day(-20)), pest("hr-3", day(-10))];

  const everything = computeInsights(input([...sheets, ...register]));
  assert.match(everything.find((i) => i.rule === "A4")?.detail ?? "", /no CAPA finding names the sheet/, "QA is told no finding names the sheets");
  assert.match(everything.find((i) => i.rule === "B2")?.detail ?? "", /needs a corrective action/, "QA is told the finding needs a corrective action");

  // What the CAPA report holds is not said to an account it is not handed to:
  // a finding there may well name these sheets, or this register finding.
  for (const [scope, rule, said] of [
    [["QC"], "A4", /CAPA finding/],
    [["HR"], "B2", /CAPA|corrective action/i],
  ] as const) {
    setDepartmentScope([...scope]);
    try {
      const insight = computeInsights(input([...sheets, ...register], { documents: documentRepository.getAll() })).find((i) => i.rule === rule);
      assert.ok(insight, `${rule} is found for a ${scope[0]} account`);
      assert.doesNotMatch(insight.detail, said, `${rule} told a ${scope[0]} account what the CAPA report it cannot see holds: ${insight.detail}`);
    } finally {
      setDepartmentScope(null);
    }
  }
});

// ---------------------------------------------------------------------------
// 8. C1 / C2 — a record that contradicts itself

/** An inspection record (F/QC/37, /35, /34) as its layout prints it: the specimen's observations, with these changed. */
function inspection(id: string, documentId: string, dueDate: string, header: Record<string, string>, observations: Record<string, string>, extra: Partial<RecordInstance> = {}): RecordInstance {
  const layout = getLogSheetLayout(documentId);
  assert.ok(layout && layout.rowMode.kind === "fixedRows", `${documentId} prints fixed parameters`);
  const rows = layout.rowMode.rows.map((fixed, i) => ({
    id: `r${i}`,
    ...fixed,
    observation: observations[String(fixed.parameter)] ?? String(layout.specimenRows?.[i]?.observation ?? ""),
  }));
  return rec(id, documentId, dueDate, { header: { ...(layout.specimenHeader ?? {}), ...header }, rows }, extra);
}

/** An F/QC/13 sheet with these grades and Pass? answers, the rest graded A. */
function printing(id: string, dueDate: string, lines: { grade: string; pass: string }[], extra: Partial<RecordInstance> = {}): RecordInstance {
  const layout = getLogSheetLayout("qc-inprocess-printing");
  assert.ok(layout && layout.rowMode.kind === "fixedRows");
  const rows = layout.rowMode.rows.map((fixed, i) => ({ id: `r${i}`, ...fixed, grade: lines[i]?.grade ?? "A", pass: lines[i]?.pass ?? "", defectCount: "-" }));
  return rec(id, "qc-inprocess-printing", dueDate, { header: { ...(layout.specimenHeader ?? {}) }, rows }, extra);
}

test("C1: a lot Accepted while its Leak Test reads FAIL, and an F grade marked Pass? — Yes", () => {
  const records = [
    inspection("leak-fail-accepted", "qc-inspection-pouching", day(-4), { lotStatus: "Accepted", deviationReason: "" }, { "Leak Test": "FAIL" }),
    // Consistent: a failed test on a lot that was segregated for it.
    inspection("leak-fail-segregated", "qc-inspection-pouching", day(-5), { lotStatus: "Segregation", deviationReason: "Leak test failed on 4 pouches of the first 50 — lot segregated." }, { "Leak Test": "FAIL" }),
    // Consistent: every test passed, lot accepted.
    inspection("all-pass", "qc-inspection-pouching", day(-6), { lotStatus: "Accepted", deviationReason: "" }, {}, { status: "Verified" }),
    // A draft still being written is not judged.
    inspection("draft", "qc-inspection-pouching", day(-1), { lotStatus: "Accepted" }, { "Leak Test": "FAIL" }, { status: "In Progress", history: [{ id: "h", at: `${day(-1)}T08:00:00.000Z`, by: "HNP", action: "edited" }] }),
    // Longer ago than a lot can be held back.
    inspection("old", "qc-inspection-pouching", day(-200), { lotStatus: "Accepted" }, { "Leak Test": "FAIL" }),
    // F/QC/35: "Fail" on the Odour Test of an Accepted slit roll.
    inspection("odour-fail", "qc-inspection-slitting", day(-3), { lotStatus: "Accepted" }, { "Odour Test": "Fail" }, { status: "Verified", verifiedBy: "Kapila Barad" }),
    // F/QC/34: "NOT OK" on the shade of an Accepted printed roll.
    inspection("shade-not-ok", "qc-inspection-printed-film", day(-2), { lotStatus: "Accepted" }, { "Shade / Colour": "NOT OK" }),
    printing("f-passed", day(-2), [{ grade: "F", pass: "Yes" }]),
    printing("f-stopped", day(-3), [{ grade: "F", pass: "No" }]),
  ];
  const c1 = byRule(computeInsights(input(records)), "C1");
  assert.deepEqual(c1.map((i) => i.id).sort(), [
    "c1|qc-inprocess-printing|f-passed",
    "c1|qc-inspection-pouching|leak-fail-accepted",
    "c1|qc-inspection-printed-film|shade-not-ok",
    "c1|qc-inspection-slitting|odour-fail",
  ]);
  for (const i of c1) {
    assert.equal(i.severity, "high", `${i.id} is not high`);
    assert.ok(i.suggestedCapa, `${i.id} suggests no CAPA`);
    assert.equal(i.evidence.length, 1);
  }
  const leak = c1.find((i) => i.id === "c1|qc-inspection-pouching|leak-fail-accepted");
  assert.match(leak?.title ?? "", /Leak Test reads "FAIL"/);
  assert.equal(leak?.evidence[0].recordId, "leak-fail-accepted");
});

test("C2: a lot's reason stating a figure its own observation does not read", () => {
  const reason = "Pouch height 178 mm against 181 mm specified (-3 mm) — within customer's agreed tolerance, accepted on deviation.";
  const bond = "Bond strength 0.240 kg against 0.300 kg specified — accepted on deviation for a non-retort application after QA review.";
  const records = [
    inspection("height-disagrees", "qc-inspection-pouching", day(-4), { lotStatus: "Accepted on Deviation", deviationReason: reason }, { "Pouch Height (mm)": "181" }),
    inspection("height-agrees", "qc-inspection-pouching", day(-5), { lotStatus: "Accepted on Deviation", deviationReason: reason }, { "Pouch Height (mm)": "178" }),
    // Nothing written beside it: a gap, not a second figure.
    inspection("height-blank", "qc-inspection-pouching", day(-6), { lotStatus: "Accepted on Deviation", deviationReason: reason }, { "Pouch Height (mm)": "-" }),
    inspection("bond-disagrees", "qc-inspection-slitting", day(-3), { lotStatus: "Accepted on Deviation", deviationReason: bond }, { "Bond Strength": "L1 = 0.306 kg (BRK); L2 = 0.435 kg (BRK)" }),
    inspection("bond-agrees", "qc-inspection-slitting", day(-2), { lotStatus: "Accepted on Deviation", deviationReason: bond }, { "Bond Strength": "L1 = 0.240 kg (BRK); L2 = 0.435 kg (BRK)" }),
    // A spread, not a reading: never compared.
    inspection("variation", "qc-inspection-printed-film", day(-2), { lotStatus: "Accepted on Deviation", deviationReason: "Print registration variation of 0.3 mm on the repeat — accepted on deviation." }, {}),
  ];
  const c2 = byRule(computeInsights(input(records)), "C2");
  assert.deepEqual(c2.map((i) => i.id).sort(), ["c2|qc-inspection-pouching|height-disagrees", "c2|qc-inspection-slitting|bond-disagrees"]);
  for (const i of c2) {
    assert.equal(i.severity, "medium");
    assert.equal(i.suggestedCapa, undefined, "correcting one record is not a CAPA");
  }
  assert.match(c2.find((i) => i.id.endsWith("height-disagrees"))?.detail ?? "", /the reason gives 178 against 181, the observation reads "181"/);
});

test("C1 and C2 are about records the person may open: a Maintenance account is told of neither", () => {
  const records = [inspection("leak-fail", "qc-inspection-pouching", day(-4), { lotStatus: "Accepted" }, { "Leak Test": "FAIL" })];
  setDepartmentScope(["MNT"]);
  try {
    assert.equal(computeInsights(input(records, { documents: documentRepository.getAll() })).filter((i) => i.rule === "C1").length, 0);
  } finally {
    setDepartmentScope(null);
  }
});

test("a generated demo year gives no C1 or C2, read as of every month's end", () => {
  ensureDemoRecordsGeneratedForYear(2026);
  const demo = recordRepository.query({ isDemo: true });
  assert.ok(demo.some((r) => r.documentId === "qc-inspection-pouching" && isHumanRecord(r)), "the demo year has inspection records to read");
  const found: string[] = [];
  for (const end of ["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31", "2026-06-30", "2026-07-31", "2026-08-31", TODAY]) {
    const asOf = demo.filter((r) => r.dueDate <= end);
    for (const i of computeInsights(input(asOf, { today: end, isDemo: true }))) if (i.rule === "C1" || i.rule === "C2") found.push(`${end}: ${i.title}`);
  }
  assert.deepEqual(found, [], "the generator's records contradict themselves, or C1 / C2 read them wrongly");
});
