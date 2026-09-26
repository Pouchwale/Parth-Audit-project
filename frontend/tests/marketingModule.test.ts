// THE MARKETING MODULE'S ARITHMETIC (REQUIREMENTS §77), held to the company's own
// workbooks: F/MKT/02's Average Rating, Ideal Rating, Satisfied % average, the
// tallies and the % Satisfaction Index, and F/MKT/04's Pareto — each cause's
// cumulative percentage against the cut-off, in the order written. The seeded
// records must hold exactly what the engine works out, so the pages on file and
// a sheet typed today agree.
import test from "node:test";
import assert from "node:assert/strict";
import type { LogSheetData, RecordInstance } from "../src/types";
import { COMPLAINT_TREND_ID, FEEDBACK_ANALYSIS_ID, withMarketingCalc } from "../src/engine/marketingCalc";
import { withComputedCells } from "../src/engine/computedCells";
import { MKT_LAYOUTS } from "../src/data/seed/mktLayouts";
import { SEED_MKT_RECORDS } from "../src/data/seed/mktRecords";

const ATTRIBUTES = [
  "Product Quality",
  "Condition of packaging on receipt",
  "Product Delivery - as per your requirements",
  "Completeness of documents - Invoice, Test certificate, Packing list",
  "Response time & approach to your query",
  "Technical knowledge & competency",
];

const analysis = (counts: (number | null)[][], header: Record<string, string> = {}): LogSheetData => ({
  header: { product: "LABELS", ...header },
  rows: ATTRIBUTES.map((attribute, i) => ({
    id: `r${i + 1}`,
    attribute,
    count5: counts[i]?.[0] ?? null,
    count4: counts[i]?.[1] ?? null,
    count3: counts[i]?.[2] ?? null,
    count2: counts[i]?.[3] ?? null,
    countPoor: counts[i]?.[4] ?? null,
  })),
});

test("F/MKT/02: a line's Average Rating, Ideal Rating and Satisfied % — 8 Excellent and 1 Very Good make 44 of 45, 97.78%", () => {
  const out = withMarketingCalc(FEEDBACK_ANALYSIS_ID, analysis([[8, 1]]));
  const [quality, ...rest] = out.rows;
  assert.equal(quality.averageRating, "44");
  assert.equal(quality.idealRating, "45");
  assert.equal(quality.satisfiedPct, "97.78%");
  for (const r of rest) assert.deepEqual([r.averageRating, r.idealRating, r.satisfiedPct], ["", "", ""], "a line with no count written works out to nothing");
  assert.equal(out.header.tally5, "8");
  assert.equal(out.header.tally4, "1");
  assert.equal(out.header.weighted5, "40");
  assert.equal(out.header.weighted4, "4");
  assert.equal(out.header.averageRatingTotal, "44");
  assert.equal(out.header.idealRatingTotal, "45");
  assert.equal(out.header.satisfactionIndex, "98%", "the index is a whole per cent, as the page prints it");
});

test("F/MKT/02: the LABELS page — 249 of 270, 92% — and the weights the headings print, 2 for Average and minus five for Poor", () => {
  const labels = withMarketingCalc(
    FEEDBACK_ANALYSIS_ID,
    analysis([
      [8, 1],
      [7, 2],
      [4, 4, 1],
      [6, 3],
      [5, 3, 1],
      [5, 4],
    ])
  );
  assert.deepEqual(
    labels.rows.map((r) => [r.averageRating, r.idealRating, r.satisfiedPct]),
    [
      ["44", "45", "97.78%"],
      ["43", "45", "95.56%"],
      ["39", "45", "86.67%"],
      ["42", "45", "93.33%"],
      ["40", "45", "88.89%"],
      ["41", "45", "91.11%"],
    ]
  );
  assert.deepEqual([labels.header.tally5, labels.header.tally4, labels.header.tally3, labels.header.tally2, labels.header.tallyPoor], ["35", "17", "2", "", ""]);
  assert.deepEqual([labels.header.weighted5, labels.header.weighted4, labels.header.weighted3], ["175", "68", "6"]);
  assert.deepEqual([labels.header.averageRatingTotal, labels.header.idealRatingTotal, labels.header.satisfactionIndex], ["249", "270", "92%"]);
  // An Average and a Poor rating: 2 and −5, as the headings are printed (TBC 30).
  const mixed = withMarketingCalc(FEEDBACK_ANALYSIS_ID, analysis([[1, 0, 0, 1, 1]]));
  assert.equal(mixed.rows[0].averageRating, "2", "5 + 2 − 5");
  assert.equal(mixed.rows[0].idealRating, "15", "three customers × 5");
  assert.equal(mixed.header.tallyPoor, "1");
  assert.equal(mixed.header.weightedPoor, "-5");
  // Nothing counted anywhere: nothing worked out (a box never written stays absent).
  const blank = withMarketingCalc(FEEDBACK_ANALYSIS_ID, analysis([]));
  assert.equal(blank.header.satisfactionIndex ?? "", "");
  assert.equal(blank.header.averageRatingTotal ?? "", "");
  assert.ok(blank.rows.every((r) => (r.averageRating ?? "") === "" && (r.satisfiedPct ?? "") === ""));
});

test("F/MKT/04: the Pareto in the order written — the sleeve's seven causes, the first four within the 80% cut-off", () => {
  const causes: [string, number | null][] = [
    ["Prinint issue", 4],
    ["Size variation against specification", 3],
    ["Gluing & size issue", 2],
    ["Packing related", 2],
    ["Hotmelt not done in sleeve", 1],
    ["Small ink spot", 1],
    ["Wrong material dispatch", 1],
    ["Packing related", null],
  ];
  const data: LogSheetData = {
    header: { product: "SHRINK SLEEVE", cutoff: "80", complaints1: "2", complaints2: "3", complaints3: "4", complaints4: "3", complaints5: "1" },
    rows: causes.map(([cause, defects], i) => ({ id: `r${i + 1}`, cause, defects })),
  };
  const out = withMarketingCalc(COMPLAINT_TREND_ID, data);
  assert.deepEqual(
    out.rows.map((r) => r.cumulativePct),
    ["28.6%", "50.0%", "64.3%", "78.6%", "85.7%", "92.9%", "100.0%", ""],
    "a line with no defects written works out to nothing and is left out of the total"
  );
  assert.deepEqual(
    out.rows.map((r) => r.classification),
    ["Vital Few", "Vital Few", "Vital Few", "Vital Few", "Useful Many", "Useful Many", "Useful Many", ""]
  );
  assert.equal(out.header.paretoSummary, "The first 4 Causes cover 78.57% of the Total Defects");
  // The paper's "Total" row repeats each period's count — one series per sheet.
  assert.deepEqual([out.header.total1, out.header.total2, out.header.total5, out.header.total6], ["2", "3", "1", ""]);
  // A stricter cut-off moves the line.
  const strict = withMarketingCalc(COMPLAINT_TREND_ID, { ...data, header: { ...data.header, cutoff: "60" } } as LogSheetData);
  assert.equal(strict.header.paretoSummary, "The first 2 Causes cover 50.00% of the Total Defects");
  // Nothing written: nothing worked out.
  const empty = withMarketingCalc(COMPLAINT_TREND_ID, { header: { product: "LABELS" }, rows: [{ id: "r1" }] } as LogSheetData);
  assert.equal(empty.header.paretoSummary ?? "", "");
  assert.equal(empty.header.total1 ?? "", "");
  assert.equal(empty.rows[0].cumulativePct ?? "", "");
});

test("the pass hands back the very same object when nothing changed, and leaves other documents alone", () => {
  const data = analysis([[8, 1]]);
  const once = withMarketingCalc(FEEDBACK_ANALYSIS_ID, data);
  assert.notEqual(once, data);
  assert.equal(withMarketingCalc(FEEDBACK_ANALYSIS_ID, once), once, "already worked out: the same object");
  assert.equal(withMarketingCalc("sys-audit-risk", data), data);
  assert.equal(withMarketingCalc(undefined, data), data);
  // In the one pass every sheet goes through (engine/computedCells.ts).
  assert.equal(withComputedCells(FEEDBACK_ANALYSIS_ID, data).header.satisfactionIndex, "98%");
});

test("the pages on file hold exactly what the engine works out, and every key they use is on their layout", () => {
  assert.equal(SEED_MKT_RECORDS.length, 7);
  for (const record of SEED_MKT_RECORDS as RecordInstance<LogSheetData>[]) {
    const layout = MKT_LAYOUTS[record.documentId];
    assert.ok(layout, `${record.documentId} has a layout`);
    const keys = new Set([...layout.headerFields, ...(layout.footerFields ?? [])].map((f) => f.key));
    for (const k of Object.keys(record.data.header)) assert.ok(keys.has(k), `${record.id}: box ${k} is on the layout`);
    const columns = new Set(layout.columns.map((c) => c.key));
    for (const row of record.data.rows) for (const k of Object.keys(row)) if (k !== "id") assert.ok(columns.has(k), `${record.id}: column ${k} is on the layout`);
    assert.equal(withMarketingCalc(record.documentId, record.data), record.data, `${record.id} is worked out as written`);
    assert.equal(record.isDemo, false);
    assert.equal(record.status, "Verified");
  }
  const byId = (id: string) => SEED_MKT_RECORDS.find((r) => r.id === id) as RecordInstance<LogSheetData>;
  assert.equal(byId("seed-mkt-feedback-analysis-labels-2025").data.header.satisfactionIndex, "92%");
  assert.equal(byId("seed-mkt-feedback-analysis-pouches-2025").data.header.satisfactionIndex, "89%");
  assert.equal(byId("seed-mkt-feedback-analysis-sleeves-2025").data.header.satisfactionIndex, "83%");
  assert.equal(byId("seed-mkt-complaint-trend-labels-2025").data.header.paretoSummary, "The first 9 Causes cover 76.19% of the Total Defects");
  assert.equal(byId("seed-mkt-complaint-trend-labels-2025").data.rows.length, 14);
  assert.equal(byId("seed-mkt-complaint-trend-laminated-pouch-2025").data.header.seriesName, "LAMINATES");
  const pidilite = byId("seed-mkt-feedback-pidilite-2025-01");
  assert.equal(pidilite.data.header.organization, "Pidilite");
  assert.deepEqual(
    pidilite.data.rows.map((r) => r.rating),
    ["3 Good", "5 Excellent", "2 Average", "5 Excellent", "4 Very Good", "3 Good"]
  );
  // The charts the trend prints read boxes and columns that exist.
  const trend = MKT_LAYOUTS[COMPLAINT_TREND_ID];
  const boxKeys = new Set([...trend.headerFields, ...(trend.footerFields ?? [])].map((f) => f.key));
  const columnKeys = new Set(trend.columns.map((c) => c.key));
  assert.equal(trend.charts?.length, 2);
  for (const chart of trend.charts ?? []) {
    if (chart.kind === "bars") for (const b of chart.bars) assert.ok(boxKeys.has(b.labelKey) && boxKeys.has(b.valueKey), `bar ${b.labelKey}/${b.valueKey}`);
    else {
      assert.ok(columnKeys.has(chart.labelColumn) && columnKeys.has(chart.valueColumn));
      if (chart.cutoffKey) assert.ok(boxKeys.has(chart.cutoffKey));
      if (chart.titleKey) assert.ok(boxKeys.has(chart.titleKey));
    }
  }
});
