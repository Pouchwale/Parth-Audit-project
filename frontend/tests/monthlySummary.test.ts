// THE MONTHLY MANAGEMENT SUMMARY'S FIGURES, HELD TO THE RECORDS (REQUIREMENTS §75).
//
// Reports > Management Summary (engine/monthlySummary.ts) writes the month for
// management in fixed sentences filled with counted numbers. Management will
// act on those numbers, so each is checked here against records whose answer is
// known: the plant's own seeded records (the December 2023 CAPA report, the two
// lux rounds, the calibration pages) and a handful built for the purpose — two
// breakdowns in one month, a record handed in late, a lot on deviation, a
// supplier graded C, a month with nothing in it. Where another screen already
// counts the same thing (the Performance Scorecard, the Insights page), the
// summary is checked against that screen's own engine, because the app must
// never say two different numbers for one question.
//
// "Today" is fixed here, not the clock: the summary takes it as an argument,
// so the figures are the same whatever day the tests run.
import test from "node:test";
import assert from "node:assert/strict";
import type { DocumentDefinition, RecordInstance } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { masterRepository, ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { ensureSeeded as ensureHrMasterSeeded } from "../src/data/repositories/hrMasterRepository";
import { recordRepository, ensureSeeded as ensureRecordsSeeded } from "../src/data/repositories/recordRepository";
import { GLASS_BREAKAGE_ROW, LUX_REV00_READINGS, LUX_REV01_READINGS } from "../src/data/seed/maintenanceLayouts";
import { setDepartmentScope } from "../src/engine/departmentScope";
import { computeInsights } from "../src/engine/insights";
import { computeMonthlySummary, startMonthlySummary, type MonthlySummary, type MonthlySummaryInput } from "../src/engine/monthlySummary";
import { monthRange, scorecards, type Person } from "../src/engine/performance";

ensureDocumentsSeeded();
ensureMasterSeeded();
ensureHrMasterSeeded();
ensureRecordsSeeded();

const TODAY = "2026-09-24";
const documents: DocumentDefinition[] = documentRepository.getAll();
const checkpoints = masterRepository.get().checkpoints;

function input(records: readonly RecordInstance[], extra: Partial<MonthlySummaryInput> = {}): MonthlySummaryInput {
  return { records, documents, today: TODAY, isDemo: false, checkpoints, people: [], ...extra };
}

/** A record as a person handed it in (Submitted), on its own due date unless told otherwise. */
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

const sheet = (rows: Record<string, string | number | null>[], header: Record<string, string> = {}) => ({ header, rows: rows.map((r, i) => ({ id: `r${i}`, ...r })) });

function allSentences(s: MonthlySummary): string[] {
  return [s.records, s.capa, s.quality, s.maintenance, s.purchase, s.pest, s.insights].flatMap((p) => (p ? p.sentences : []));
}

// ---------------------------------------------------------------------------
// the plant's own seeded records

const live = recordRepository.query({ isDemo: false });

test("the December 2023 CAPA report: five findings raised, none closed, none yet past a target of the 31st", () => {
  const s = computeMonthlySummary(input(live), 2023, 11);
  assert.equal(s.state, "past");
  assert.equal(s.asOf, "2023-12-31");
  assert.ok(s.capa?.internal, "the CAPA part is there for an account that sees every department");
  assert.equal(s.capa.internal.raised, 5);
  assert.equal(s.capa.internal.closed, 0);
  assert.equal(s.capa.internal.open, 5);
  // Target 31-Dec-2023 is not yet past on 31-Dec-2023 itself.
  assert.equal(s.capa.internal.overdue, 0);
});

test("a month later the same five findings are past their target, the oldest by 31 days", () => {
  const s = computeMonthlySummary(input(live), 2024, 0);
  assert.equal(s.capa?.internal?.raised, 0);
  assert.equal(s.capa?.internal?.overdue, 5);
  assert.equal(s.capa?.internal?.oldestOverdue?.days, 31);
  assert.equal(s.capa?.internal?.oldestOverdue?.targetDate, "2023-12-31");
  assert.match(s.headline.join(" "), /5 past their target date at the month's end/);
});

test("the current month reads CAPA as of today, and agrees with the Insights page's B4", () => {
  const s = computeMonthlySummary(input(live), 2026, 8);
  assert.equal(s.state, "current");
  assert.equal(s.asOf, TODAY);
  const b4 = computeInsights(input(live)).filter((i) => i.rule === "B4");
  const b4Findings = b4.reduce((n, i) => n + i.evidence.length, 0);
  assert.equal(s.capa?.internal?.overdue, b4Findings, "the summary and rule B4 count the findings past target differently");
});

test("the lux rounds: 12-Aug-2025 is one round of every Rev 01 area, and its falls are M1's", () => {
  const s = computeMonthlySummary(input(live), 2025, 7);
  const lux = s.maintenance?.lux;
  assert.ok(lux, "the lux line is there");
  assert.equal(lux.rounds, 1);
  assert.equal(lux.areas, LUX_REV01_READINGS.length);
  // The falls are the M1 insights of that round, as of the month's end — and there are some (the colour-matching cabinet).
  const m1 = computeInsights({ ...input(live.filter((r) => r.dueDate <= "2025-08-31")), today: "2025-08-31" }).filter(
    (i) => i.rule === "M1" && !i.id.startsWith("m1|summary|")
  );
  assert.ok(m1.length > 0, "the seeded rounds give no M1 fall");
  assert.equal(lux.falls.length, m1.length);
  assert.deepEqual(lux.falls.map((i) => i.id).sort(), m1.map((i) => i.id).sort());
});

test("11-May-2024 is a Rev 00 round with no earlier one to fall from", () => {
  const s = computeMonthlySummary(input(live), 2024, 4);
  assert.equal(s.maintenance?.lux?.rounds, 1);
  assert.equal(s.maintenance?.lux?.areas, LUX_REV00_READINGS.length);
  assert.equal(s.maintenance?.lux?.falls.length, 0);
});

test("calibration today is what rule C3 says today", () => {
  const s = computeMonthlySummary(input(live), 2026, 8);
  const c3 = computeInsights(input(live)).filter((i) => i.rule === "C3");
  assert.equal(s.quality?.calibrationExpired?.length, c3.filter((i) => i.severity === "high").length);
  assert.equal(s.quality?.calibrationExpiring?.length, c3.filter((i) => i.severity !== "high").length);
  assert.ok((s.quality?.calibrationExpired?.length ?? 0) > 0, "the seeded calibration pages have an expired device");
});

// ---------------------------------------------------------------------------
// records built for the purpose

const JULY = "2026-07";
const synthetic: RecordInstance[] = [
  // F/MNT/06 — two breakdowns in July: 90 minutes and 100 minutes (across midnight).
  rec("bd-1", "mnt-breakdown-record", `${JULY}-10`, sheet([
    { failureDate: `${JULY}-10`, failureTime: "08:00", equipmentName: "Delta 330", equipmentIdNo: "M-47", faultReported: "Web break", repairedDate: `${JULY}-10`, repairedTime: "09:30", productionLossMinutes: 60 },
  ])),
  rec("bd-2", "mnt-breakdown-record", `${JULY}-20`, sheet([
    { failureDate: `${JULY}-20`, failureTime: "22:30", equipmentName: "Delta 330", equipmentIdNo: "M-47", faultReported: "Tension roller", repairedDate: `${JULY}-21`, repairedTime: "00:10", productionLossMinutes: 40 },
  ])),
  // …and one in August, which July must not count.
  rec("bd-3", "mnt-breakdown-record", "2026-08-03", sheet([
    { failureDate: "2026-08-03", failureTime: "10:00", equipmentName: "ELLen-7", equipmentIdNo: "M-34", faultReported: "Compressor trip", repairedDate: "2026-08-03", repairedTime: "10:30" },
  ])),
  // F-QC-30 — one handed in on its day, one three days late, one never handed in.
  rec("v-on-time", "qc-viscosity", `${JULY}-06`, sheet([{ time: "09:00", viscosity: 20.1 }]), { submittedBy: "Jeni" }),
  rec("v-late", "qc-viscosity", `${JULY}-07`, sheet([{ time: "09:00", viscosity: 21.6 }]), { submittedAt: `${JULY}-10T06:00:00.000Z`, submittedBy: "Jeni" }),
  rec("v-never", "qc-viscosity", `${JULY}-08`, sheet([]), { status: "Due", submittedAt: undefined, submittedBy: undefined }),
  // F/QC/37 — three lots: accepted, accepted on deviation, rejected.
  rec("lot-1", "qc-inspection-pouching", `${JULY}-06`, sheet([], { lotStatus: "Accepted" })),
  rec("lot-2", "qc-inspection-pouching", `${JULY}-07`, sheet([], { lotStatus: "Accepted on Deviation", deviationReason: "Seal width 8 mm against 10 mm" })),
  rec("lot-3", "qc-inspection-pouching", `${JULY}-08`, sheet([], { lotStatus: "Reject / Scrap", deviationReason: "Delamination" })),
  // F/PUR/05 — one supplier of each grade (weights 50 / 40 / 10).
  rec("pur", "pur-supplier-performance", `${JULY}-01`, sheet([
    { supplierName: "Supplier A", productSafetyRating: 100, qualityRating: 95, deliveryRating: 90 },
    { supplierName: "Supplier B", productSafetyRating: 90, qualityRating: 80, deliveryRating: 80 },
    { supplierName: "Supplier C", productSafetyRating: 80, qualityRating: 70, deliveryRating: 75 },
  ])),
  // F/MNT/03 — August: one PM done ten days after its plan, one not done; July's is on time.
  rec("pm", "mnt-yearly-pm-schedule", "2026-01-01", sheet([
    { equipment: "PRINTING MACHINE", frequency: "Monthaly", julPlan: "05.07", julActual: "06.07", augPlan: "10.08", augActual: "20.08" },
    { equipment: "SLITTING MACHINE", frequency: "Monthaly", augPlan: "12.08" },
  ])),
  // F/MNT/09 — breakage marked YES in week 2 of July.
  rec("glass", "mnt-glass-breakage", `${JULY}-01`, sheet([{ parameter: GLASS_BREAKAGE_ROW, week1: "NO", week2: "YES", week3: "NO" }], { monthYear: "July 2026" })),
  // F/HR/17 — a catch of two rodents on one day, a "Yes" with no details on another (counted as one).
  rec("hr17-1", "daily-pest-monitoring", `${JULY}-13`, { isHoliday: false, checkpoints: { 1: { value: "Yes" }, 7: { value: "Yes" } }, timeOfChecking: "10:00", checker: "Vinay", summaryActions: [], rodentCatches: [{ id: "c", trapBoxNo: "RB-27", location: "Canteen", count: 2 }] }),
  rec("hr17-2", "daily-pest-monitoring", `${JULY}-14`, { isHoliday: false, checkpoints: { 1: { value: "Yes" }, 7: { value: "Yes" } }, timeOfChecking: "10:00", checker: "Vinay", summaryActions: [] }),
  rec("hr17-3", "daily-pest-monitoring", `${JULY}-15`, { isHoliday: false, checkpoints: { 1: { value: "Yes" }, 7: { value: "No" } }, timeOfChecking: "10:00", checker: "Vinay", summaryActions: [] }),
];

const JENI: Person = { id: "jeni", name: "Jeni", role: "staff", departments: ["QC"] };

test("two F/MNT/06 breakdowns in one month: two, 190 minutes, MTTR 95 — and August's is not July's", () => {
  const s = computeMonthlySummary(input(synthetic), 2026, 6);
  const b = s.maintenance?.breakdown;
  assert.ok(b, "the breakdown line is there");
  assert.equal(b.breakdowns, 2);
  assert.equal(b.timed, 2);
  assert.equal(b.minutes, 190);
  assert.equal(b.mttr, 95);
  assert.equal(b.lossMinutes, 100);
  assert.equal(b.machines[0].machine, "M-47");
  assert.equal(b.machines[0].breakdowns, 2);
  assert.match(s.maintenance!.sentences.join(" "), /broke down twice in July 2026/);
  assert.match(s.maintenance!.sentences.join(" "), /95 minutes on average to repair/);
});

test("a breakdown with no repair time is counted, but not in the minutes or the MTTR", () => {
  const open = rec("bd-open", "mnt-breakdown-record", `${JULY}-25`, sheet([
    { failureDate: `${JULY}-25`, failureTime: "11:00", equipmentName: "ELLen-7", equipmentIdNo: "M-34", faultReported: "Motor noise" },
  ]));
  const b = computeMonthlySummary(input([...synthetic, open]), 2026, 6).maintenance?.breakdown;
  assert.equal(b?.breakdowns, 3);
  assert.equal(b?.timed, 2);
  assert.equal(b?.minutes, 190);
  assert.equal(b?.mttr, 95, "MTTR is the minutes over the TIMED breakdowns, not over every line");
});

test("a record handed in late is counted late, one never handed in never done — the Performance Scorecard's rule", () => {
  const s = computeMonthlySummary(input(synthetic, { people: [JENI] }), 2026, 6);
  const r = s.records;
  assert.ok(r);
  // Only F-QC-30 had anything due on a schedule in July here; the three as-required
  // registers above were handed in on their own day, so they are on time.
  const viscosity = r.worstDocuments.find((d) => d.doc.id === "qc-viscosity");
  assert.ok(viscosity, "F-QC-30 is among the documents most behind");
  assert.equal(viscosity.onTime, 1);
  assert.equal(viscosity.late, 1);
  assert.equal(viscosity.overdue, 1);
  // The same figures the scorecard gives for July as a range.
  const cards = scorecards(synthetic, documents, [JENI], monthRange(2026, 6), TODAY);
  const fromCards = cards.byDocument.find((d) => d.doc.id === "qc-viscosity");
  assert.deepEqual([viscosity.onTime, viscosity.late, viscosity.overdue, viscosity.score], [fromCards?.onTime, fromCards?.late, fromCards?.overdue, fromCards?.score]);
  assert.equal(r.late, cards.byDepartment.reduce((n, d) => n + d.late, 0));
  assert.equal(r.never, cards.byDepartment.reduce((n, d) => n + d.overdue, 0));
  // The person who answers for QC is named with the late and the missed record.
  assert.equal(r.peopleBehind?.[0]?.person.name, "Jeni");
  assert.equal(r.peopleBehind?.[0]?.late, 1);
  assert.equal(r.peopleBehind?.[0]?.overdue, 1);
});

test("without the list of accounts nobody is named, and the part says so", () => {
  const s = computeMonthlySummary(input(synthetic, { people: null }), 2026, 6);
  assert.equal(s.records?.peopleBehind, null);
  assert.match(s.records!.sentences.join(" "), /Nobody is named here/);
});

test("a month given as a range scores exactly as the scorecard's own 'last month'", () => {
  const today = "2026-08-15";
  const byKey = scorecards(synthetic, documents, [JENI], "last-month", today);
  const byRange = scorecards(synthetic, documents, [JENI], monthRange(2026, 6, "July 2026"), today);
  assert.equal(byRange.period.key, "custom");
  assert.equal(byRange.period.label, "July 2026");
  assert.deepEqual([byRange.period.from, byRange.period.to], [byKey.period.from, byKey.period.to]);
  const figures = (c: typeof byKey) => c.byDocument.map((d) => `${d.doc.id}:${d.onTime}/${d.late}/${d.overdue}/${d.pending}`);
  assert.deepEqual(figures(byRange), figures(byKey));
});

test("lots: three inspected, two not simply accepted, one of them on deviation", () => {
  const q = computeMonthlySummary(input(synthetic), 2026, 6).quality;
  assert.ok(q);
  assert.equal(q.lotsInspected, 3);
  assert.equal(q.lotsNotAccepted, 2);
  assert.equal(q.lotsOnDeviation, 1);
  const pouching = q.lots.find((l) => l.documentId === "qc-inspection-pouching");
  assert.deepEqual([pouching?.accepted, pouching?.onDeviation, pouching?.rejected], [1, 1, 1]);
  // 21.6 Sec. is outside F-QC-30's printed 19–21.
  assert.equal(q.outOfBandReadings, 1);
});

test("suppliers graded by the form's own table: one A, one B, one C, and the C is named", () => {
  const p = computeMonthlySummary(input(synthetic), 2026, 6).purchase;
  assert.ok(p);
  assert.deepEqual([p.a, p.b, p.c], [1, 1, 1]);
  assert.equal(p.gradedC[0]?.supplier, "Supplier C");
  assert.equal(p.gradedC[0]?.overall, "75.50");
  assert.equal(p.sheet?.inMonth, true);
});

test("preventive maintenance for August: two planned, one done ten days late, one not done", () => {
  const pm = computeMonthlySummary(input(synthetic), 2026, 7).maintenance?.pm;
  assert.deepEqual(pm, { scheduleWritten: true, planned: 2, done: 1, doneLate: 1, notDone: 1, notYetDue: 0 });
  const july = computeMonthlySummary(input(synthetic), 2026, 6).maintenance?.pm;
  assert.deepEqual(july, { scheduleWritten: true, planned: 1, done: 1, doneLate: 0, notDone: 0, notYetDue: 0 });
});

test("glass breakage is M4's week, and rodents are counted as the Rodent Trend counts them", () => {
  const s = computeMonthlySummary(input(synthetic), 2026, 6);
  assert.equal(s.maintenance?.glass?.breakages.length, 1);
  assert.equal(s.maintenance?.glass?.breakages[0]?.rule, "M4");
  assert.equal(s.pest?.daily?.daysRecorded, 3);
  assert.equal(s.pest?.daily?.rodents, 3, "two caught, and a Yes with no details counts one");
  assert.equal(s.pest?.daily?.catchDays, 2);
});

test("a month with nothing in it says so, part by part, instead of going quiet", () => {
  const s = computeMonthlySummary(input(synthetic), 2022, 5);
  assert.equal(s.humanRecords, 0);
  for (const [name, part] of Object.entries({ records: s.records, capa: s.capa, quality: s.quality, maintenance: s.maintenance, purchase: s.purchase, pest: s.pest })) {
    assert.ok(part, `${name} is shown to an account that sees every department`);
    assert.ok(part.empty, `${name} should report nothing in an empty month`);
    assert.ok(part.sentences.length > 0, `${name} says nothing at all`);
  }
  assert.equal(s.records?.sentences[0], "No record fell due in June 2022.");
  assert.ok(allSentences(s).includes("No breakdown was written on F/MNT/06 in June 2022."));
  assert.ok(s.headline.length >= 3 && s.headline.length <= 5, `the headline has ${s.headline.length} sentences`);
});

test("a month not begun says so", () => {
  const s = computeMonthlySummary(input(synthetic), 2027, 3);
  assert.equal(s.state, "future");
  assert.equal(s.headline[0], "April 2027 has not begun yet.");
  assert.equal(s.insights.total, 0);
});

test("the headline is three to five sentences, whatever the month", () => {
  for (const [records, y, m] of [[synthetic, 2026, 6], [synthetic, 2026, 7], [live, 2023, 11], [live, 2025, 7], [live, 2026, 8], [live, 2019, 0]] as const) {
    const s = computeMonthlySummary(input(records), y, m);
    assert.ok(s.headline.length >= 3 && s.headline.length <= 5, `${s.label}: ${s.headline.length} sentences — ${s.headline.join(" ")}`);
    assert.match(s.headline[0], /across every department/);
  }
});

test("taken a slice at a time it comes out the same as in one go", () => {
  const whole = computeMonthlySummary(input(synthetic, { people: [JENI] }), 2026, 6);
  const run = startMonthlySummary(input(synthetic, { people: [JENI] }), 2026, 6);
  let sliced: MonthlySummary | null = null;
  let slices = 0;
  while (!sliced && slices < 10000) {
    sliced = run.step(0.001);
    slices += 1;
  }
  assert.ok(sliced, "the run never finished");
  assert.ok(slices > 1, "the run was not cut into slices");
  assert.deepEqual(JSON.parse(JSON.stringify(sliced)), JSON.parse(JSON.stringify(whole)));
});

test("an account kept to Maintenance reads Maintenance's part only, and the headline says so", () => {
  setDepartmentScope(["MNT"]);
  try {
    const scoped = documentRepository.getAll();
    const s = computeMonthlySummary({ ...input(synthetic), documents: scoped }, 2026, 6);
    assert.equal(s.everyDepartment, false);
    assert.equal(s.scope, "Maintenance");
    assert.equal(s.capa, null, "CAPA is Quality Assurance's and Marketing's");
    assert.equal(s.quality, null, "no quality document is Maintenance's");
    assert.equal(s.purchase, null);
    assert.equal(s.pest, null);
    assert.ok(s.maintenance, "Maintenance's own part is there");
    assert.equal(s.maintenance.breakdown?.breakdowns, 2);
    assert.match(s.headline[0], /in Maintenance only/);
    assert.ok(s.records && s.records.byDepartment.every((d) => d.code === "MNT"), "the scorecard reads only Maintenance's documents");
    assert.ok(s.insights.top.every((i) => i.module === "Maintenance"), "an insight about another department's document reached a Maintenance account");
  } finally {
    setDepartmentScope(null);
  }
});
