// ONE NUMBER PER LINE (REQUIREMENTS §102).
//
// The owner, 9-Oct-2026, with a picture of F/HR/20 drawn "SR. NO. 1 | 1. I can
// freely speak up ...": "there is mutiple where sr no written again in document
// ... like wise there are many records i found that so fix it also".
//
//   * no printed line of any form opens with the number the sheet's Sr. No.
//     already gives it, and no sample line either (the guard for every form,
//     now and every one added later);
//   * a form that numbers its own lines (a "#", "No.", "Sr.No.", "Number" or
//     "Index" column, or its own numbering in its words) says so, and is drawn
//     with no Sr. No. of the sheet's;
//   * a record made before keeps its words, and the sheet still shows one
//     number per line: F/HR/20 with "1. I can freely ..." on file;
//   * the two seeded records that carried the numbers in their words are
//     brought in step once, with a line in their history, and never again.
// Run: npm run test:unit -- lineNumbers
import test from "node:test";
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server.edge";
import type { DocumentDefinition, LogSheetData, LogSheetLayout, RecordInstance } from "../src/types";
import { LOG_SHEET_LAYOUTS } from "../src/data/seed/logSheetLayouts";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { recordRepository } from "../src/data/repositories/recordRepository";
import { SEED_HISTORICAL_RECORDS } from "../src/data/seed/historicalRecords";
import { PSC_ATTRIBUTES } from "../src/data/seed/hrLayouts";
import { oneNumberLabel, withoutLineNumber } from "../src/engine/lineNumbers";
import { numbersOwnLines, printedWordsOnce } from "../src/engine/formLineNumbers";
import { LINE_NUMBER_NOTE, alignSeededLineNumbers } from "../src/data/lineNumbersMigration";
import { getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import { MINUTES_GANGWAL_POINTS } from "../src/data/seed/qcReportLayouts";
import { FORMAT_EDITS_KEY } from "../src/data/formatEdits";
import { writeJSON } from "../src/data/storageAdapter";
import { diffRecordData } from "../src/engine/recordHistory";
import { validateForSubmit } from "../src/engine/validation";
import { logRowName } from "../src/engine/roundTrip/bindingsFor";

// store/router.tsx reads window.location the moment it loads; the harness stands up none.
if (typeof (globalThis as { location?: unknown }).location === "undefined") {
  Object.defineProperty(globalThis, "location", { value: { hash: "#/dashboard", hostname: "localhost" }, configurable: true, writable: true });
}

ensureDocumentsSeeded();
ensureMasterSeeded();

const layouts = (): [string, LogSheetLayout][] => {
  const out: [string, LogSheetLayout][] = [];
  for (const [id, layout] of Object.entries(LOG_SHEET_LAYOUTS)) {
    out.push([id, layout]);
    for (const [rev, s] of Object.entries(layout.supersededRevisions ?? {})) out.push([`${id} (Rev ${rev})`, s.layout]);
  }
  return out;
};

test("a line's own number comes off its words, and nothing else does", () => {
  assert.equal(withoutLineNumber("1. I can freely speak up", 1), "I can freely speak up");
  assert.equal(withoutLineNumber("1. I can freely speak up", 2), "1. I can freely speak up", "another line's number stays");
  assert.equal(withoutLineNumber("01. Have you suffered", 1), "Have you suffered");
  assert.equal(withoutLineNumber("1.Anilox line issue", 1), "Anilox line issue");
  assert.equal(withoutLineNumber("3.  Foil line issue", 3), "Foil line issue");
  assert.equal(withoutLineNumber("(3) Foil line issue", 3), "Foil line issue");
  assert.equal(withoutLineNumber("5.5% – 8.5%", 5), "5.5% – 8.5%", "a figure is not a number of a line");
  assert.equal(withoutLineNumber("7.1 TOP PAPER", 7), "7.1 TOP PAPER");
  assert.equal(withoutLineNumber("01.12.21", 1), "01.12.21", "nor is a date");
  assert.equal(withoutLineNumber("2 Nos. of rolls", 2), "2 Nos. of rolls");
  assert.equal(withoutLineNumber(4, 4), 4);
  assert.equal(withoutLineNumber(null, 1), null);
});

test("no printed line repeats the Sr. No. the sheet gives it, on any form, and no sample line either", () => {
  const doubled: string[] = [];
  for (const [id, layout] of layouts()) {
    if (layout.ownLineNumbers) continue;
    const lines = layout.rowMode.kind === "fixedRows" ? layout.rowMode.rows : [];
    lines.forEach((row, i) => {
      for (const [k, v] of Object.entries(row)) if (typeof v === "string" && withoutLineNumber(v, i + 1) !== v) doubled.push(`${id} line ${i + 1} ${k}: ${v.slice(0, 50)}`);
    });
    (layout.specimenRows ?? []).forEach((row, i) => {
      for (const [k, v] of Object.entries(row)) if (typeof v === "string" && withoutLineNumber(v, i + 1) !== v) doubled.push(`${id} sample line ${i + 1} ${k}: ${v.slice(0, 50)}`);
    });
  }
  assert.deepEqual(doubled, []);
});

test("a form that numbers its own lines says so, and only such a form", () => {
  // A number heading in English or in the paper's Gujarati (F/DISP/02's "ક્રમ નં.").
  const SERIAL = /^\s*(#|no\.?|number|index|s\.?\s*r?\.?\s*no\.?|ક્રમ\s*નં\.?)\s*$/iu;
  const OWN = /^\s*\(?\d{1,3}\s*[.)](?:\s|\p{L})/u;
  const unsaid: string[] = [];
  for (const [id, layout] of layouts()) {
    const first = layout.columns.find((c) => c.fixed);
    const serialColumn = !!first && layout.columns.indexOf(first) <= 1 && SERIAL.test(first.label);
    const lines = layout.rowMode.kind === "fixedRows" ? layout.rowMode.rows : [];
    // A first printed column that is nothing but numbers counts the lines itself: F/HR/22's and F/MNT/04's
    // Date 1 to 31, the COAs' No. of Colors 1 to 10 (the second pass of 9-Oct-2026).
    const countingColumn = !!first && lines.length > 0 && lines.every((row) => /^\d+$/.test(String(row[first.key] ?? "").trim()));
    // Its own numbering in its words, which the sheet's running count cannot give (F/HR/04's 06 over twelve lines).
    const numberedWords = lines.filter((row) => Object.values(row).some((v) => typeof v === "string" && OWN.test(v))).length;
    const ownWords = lines.length > 0 && numberedWords * 2 >= lines.length;
    if ((serialColumn || countingColumn || ownWords) && !layout.ownLineNumbers) unsaid.push(id);
  }
  assert.deepEqual(unsaid, [], "these forms number their lines themselves but are drawn with a second Sr. No.");
  const flagged = Object.entries(LOG_SHEET_LAYOUTS)
    .filter(([, l]) => l.ownLineNumbers)
    .map(([id]) => id)
    .sort();
  assert.deepEqual(flagged, [
    "disp-container-stuffing",
    "hr-daily-cleaning",
    "hr-hygiene-report",
    "hr-monthly-cleaning",
    "hr-pre-employment-health",
    "mnt-daily-health",
    "pur-supplier-audit-report",
    "qc-coa-corrugated",
    "qc-coa-label",
    "qc-coa-sleeve",
    "qc-gsm-plate-calibration",
    "sys-audit-risk",
  ]);
});

async function sheet(documentId: string, rows: LogSheetData["rows"]): Promise<string> {
  const [view, auth, store, router] = await Promise.all([
    import("../src/components/records/LogSheetRecordView"),
    import("../src/store/AuthContext"),
    import("../src/store/AppStore"),
    import("../src/store/router"),
  ]);
  const doc = documentRepository.getById(documentId) as DocumentDefinition;
  assert.ok(doc, documentId);
  const record = {
    id: `lines-${documentId}`,
    documentId,
    periodKey: `${documentId}:2026-09-01`,
    dueDate: "2026-09-01",
    status: "Verified",
    isDemo: false,
    data: { header: {}, rows },
    createdAt: "2026-09-01T03:00:00.000Z",
    updatedAt: "2026-09-01T03:00:00.000Z",
  } as unknown as RecordInstance<LogSheetData>;
  return renderToStaticMarkup(
    h(auth.AuthProvider, null, h(store.AppStoreProvider, null, h(router.RouterProvider, null, h(view.LogSheetRecordView, { doc, record, editable: false, onChange: () => undefined }))))
  );
}

const count = (html: string, part: string) => html.split(part).length - 1;

test("F/HR/20 as it was made before: the Sr. No. numbers each attribute once, and its words carry no number", async () => {
  const rows = PSC_ATTRIBUTES.map((a, i) => ({ id: `r${i + 1}`, parameter: `${i + 1}. ${a}`, response: "7 — Strongly Agree" }));
  const html = await sheet("hr-psc-survey", rows);
  assert.equal(count(html, ">Sr. No.<"), 1, "one Sr. No. column");
  assert.ok(html.includes("I can freely speak up if I see something"), "the attribute is there");
  assert.ok(!html.includes("1. I can freely speak up"), "without its number in its words");
  assert.ok(!html.includes("8. When there is pressure"), "...the eighth too");
});

test("F/HR/04 numbers its own questions: no Sr. No. of the sheet's beside them, and the paper's 01 to 10 kept", async () => {
  const layout = LOG_SHEET_LAYOUTS["hr-pre-employment-health"];
  assert.ok(layout.rowMode.kind === "fixedRows" && numbersOwnLines(layout));
  const rows = layout.rowMode.kind === "fixedRows" ? layout.rowMode.rows.map((r, i) => ({ id: `r${i + 1}`, ...r, answer: "No", details: "" })) : [];
  const html = await sheet("hr-pre-employment-health", rows);
  assert.equal(count(html, ">Sr. No.<"), 0);
  assert.ok(html.includes("01. Have you suffered") && html.includes("06. — Diabetes") && html.includes("10. Is there a family history"));
});

test("F/QC/25 is drawn with its own Sr.No. column alone", async () => {
  const layout = LOG_SHEET_LAYOUTS["qc-coa-corrugated"];
  const rows = layout.rowMode.kind === "fixedRows" ? layout.rowMode.rows.map((r, i) => ({ id: `r${i + 1}`, ...r })) : [];
  const html = await sheet("qc-coa-corrugated", rows);
  assert.equal(count(html, ">Sr. No.<"), 0, "no Sr. No. of the sheet's");
  assert.ok(html.includes("Sr.No."), "the certificate's own");
});

test("the two seeded records with numbered words are brought in step once, with a line in their history", () => {
  const minutes = SEED_HISTORICAL_RECORDS.find((r) => r.id === "qc-minutes-of-meetings-2022-06")!;
  const analysis = SEED_HISTORICAL_RECORDS.find((r) => r.documentId === "hr-psc-survey-analysis")!;
  assert.ok(minutes && analysis);
  // As they were stored before: each line's number in its words.
  const numbered = (r: RecordInstance, key: string, glue: (n: number) => string) => {
    const data = r.data as LogSheetData;
    return { ...r, data: { ...data, rows: data.rows.map((row, i) => ({ ...row, [key]: `${glue(i + 1)}${String(row[key])}` })) } } as RecordInstance;
  };
  const before = [numbered(minutes, "keyPointsDiscussed", (n) => (n === 1 ? "1." : `${n}. `)), numbered(analysis, "parameter", (n) => `${n}. `)];
  recordRepository.upsertMany(before);
  assert.ok(String((recordRepository.getById(minutes.id)!.data as LogSheetData).rows[0].keyPointsDiscussed).startsWith("1.Anilox"));

  assert.equal(alignSeededLineNumbers(), 2);
  for (const seed of [minutes, analysis]) {
    const now = recordRepository.getById(seed.id)!;
    assert.deepEqual((now.data as LogSheetData).rows, (seed.data as LogSheetData).rows, `${seed.id}: its lines are the seed's again`);
    assert.equal(now.status, seed.status, "its status stays");
    assert.equal(now.updatedAt, seed.updatedAt, "and so does updatedAt");
    const last = now.history![now.history!.length - 1];
    assert.equal(last.note, LINE_NUMBER_NOTE);
    assert.equal(last.by, "System");
  }
  assert.equal(alignSeededLineNumbers(), 0, "nothing to do the second time");
});

// ---------------------------------------------------------------------------
// The second pass (9-Oct-2026): the owner still saw "1. I can freely" — the phone, Mitra,
// the History panel and the submit checks read what a record STORES, not the sheet as drawn.

test("a stored change's name says the line's number once; the paper's other number stays", () => {
  assert.equal(oneNumberLabel("Row 1 (1. I can freely speak up…) · Response"), "Row 1 (I can freely speak up…) · Response");
  assert.equal(oneNumberLabel("Finding 1 (1) · Finding of inspection"), "Finding 1 · Finding of inspection");
  assert.equal(oneNumberLabel("Row 12 (12) · Observation"), "Row 12 · Observation");
  assert.equal(oneNumberLabel("Section 2 · Item 1 (7) · Done"), "Section 2 · Item 1 (7) · Done", "the checklist's own item number");
  assert.equal(oneNumberLabel("Row 7 (06. — Diabetes) · YES / NO"), "Row 7 (06. — Diabetes) · YES / NO");
  assert.equal(oneNumberLabel("Row 1 (10:00) · Viscosity"), "Row 1 (10:00) · Viscosity");
  assert.equal(oneNumberLabel("Row 1 (1.5 mm gap) · Size"), "Row 1 (1.5 mm gap) · Size", "a figure is not the line's number");
  assert.equal(oneNumberLabel("3 field(s): Row 1 (1. I can freely…) · Response"), "3 field(s): Row 1 (I can freely…) · Response");
});

test("a new change's name, the submit checks and a downloaded box's name say each number once", () => {
  const before = { header: {}, rows: [{ id: "r1", parameter: "1. I can freely speak up", response: "" }] };
  const after = { header: {}, rows: [{ id: "r1", parameter: "1. I can freely speak up", response: "7 — Strongly Agree" }] };
  const label = diffRecordData(before, after)[0]?.label ?? "";
  assert.match(label, /^Row 1 \(I can freely speak up\)/, label);
  const finding = diffRecordData({ findings: [{ sNo: 1, finding: "" }] }, { findings: [{ sNo: 1, finding: "Gap at door" }] })[0]?.label ?? "";
  assert.ok(!/\b1 \(1\)/.test(finding), finding);

  // A form whose printed lines carry a box that must be filled, with a line stored as "1. <its words>".
  const [checkedId, checked] = Object.entries(LOG_SHEET_LAYOUTS).find(
    ([, l]) => !l.ownLineNumbers && l.rowMode.kind === "fixedRows" && l.columns.some((c) => c.key === "parameter" && c.fixed) && l.columns.some((c) => c.required && !c.fixed && !c.computed)
  )!;
  assert.ok(checked, "a form whose printed lines carry a required box");
  const printedLines = checked.rowMode.kind === "fixedRows" ? checked.rowMode.rows : [];
  const words = String(printedLines[0].parameter);
  const record = {
    id: `checks-${checkedId}`,
    documentId: checkedId,
    periodKey: `${checkedId}:2026-09-01`,
    dueDate: "2026-09-01",
    status: "In Progress",
    isDemo: false,
    data: { header: {}, rows: printedLines.map((r, i) => ({ id: `r${i + 1}`, ...r, parameter: i === 0 ? `1. ${words}` : r.parameter })) },
    createdAt: "2026-09-01T03:00:00.000Z",
    updatedAt: "2026-09-01T03:00:00.000Z",
  } as unknown as RecordInstance;
  const errors = validateForSubmit(documentRepository.getById(checkedId) as DocumentDefinition, record).errors.join(" | ");
  assert.ok(errors.includes(`${words}:`), `${checkedId}: ${errors.slice(0, 300)}`);
  assert.ok(!errors.includes(`1. ${words}`), `the checks name the line without its number: ${errors.slice(0, 300)}`);

  const cleaning = LOG_SHEET_LAYOUTS["hr-daily-cleaning"];
  const firstLine = cleaning.rowMode.kind === "fixedRows" ? cleaning.rowMode.rows[0] : {};
  assert.equal(logRowName({ id: "r1", ...firstLine } as never, cleaning.columns), "Canteen", "a downloaded line is named by its area, not by the paper's #");
});

test("Mitra reads a sheet's printed lines with each number once", () => {
  const layout = LOG_SHEET_LAYOUTS["hr-psc-survey"];
  const rows = PSC_ATTRIBUTES.slice(0, 3).map((a, i) => ({ id: `r${i + 1}`, parameter: `${i + 1}. ${a}`, response: "" }));
  const once = printedWordsOnce(rows, layout);
  assert.deepEqual(once.map((r) => r.parameter), PSC_ATTRIBUTES.slice(0, 3));
  assert.equal(printedWordsOnce(once, layout), once, "nothing to take off: the same lines");
  const own = LOG_SHEET_LAYOUTS["hr-pre-employment-health"];
  const asked = [{ id: "r1", parameter: "01. Have you suffered" }];
  assert.equal(printedWordsOnce(asked, own), asked, "a form that numbers its own lines keeps them");
});

test("every stored record's printed lines, and the minutes' copied points, are brought in step once", () => {
  const survey = {
    id: "stored-hr-psc-2026-09",
    documentId: "hr-psc-survey",
    periodKey: "hr-psc-survey:2026-09-02",
    dueDate: "2026-09-02",
    status: "Verified",
    isDemo: false,
    data: { header: {}, rows: PSC_ATTRIBUTES.map((a, i) => ({ id: `r${i + 1}`, parameter: `${i + 1}. ${a}`, response: "5 — Agree" })) },
    createdAt: "2026-09-02T03:00:00.000Z",
    updatedAt: "2026-09-02T05:00:00.000Z",
  } as unknown as RecordInstance;
  const minutes = {
    id: "stored-minutes-2026-09",
    documentId: "qc-minutes-of-meetings",
    periodKey: "qc-minutes-of-meetings:2026-09-03",
    dueDate: "2026-09-03",
    status: "Submitted",
    isDemo: false,
    data: { header: {}, rows: MINUTES_GANGWAL_POINTS.slice(0, 2).map((p, i) => ({ id: `r${i + 1}`, keyPointsDiscussed: `${i + 1}. ${p.keyPointsDiscussed}` })).concat([{ id: "r3", keyPointsDiscussed: "3. Our own point, typed by a person" }]) },
    createdAt: "2026-09-03T03:00:00.000Z",
    updatedAt: "2026-09-03T05:00:00.000Z",
  } as unknown as RecordInstance;
  const question = LOG_SHEET_LAYOUTS["hr-pre-employment-health"];
  const health = {
    id: "stored-hr-health-2026-09",
    documentId: "hr-pre-employment-health",
    periodKey: "hr-pre-employment-health:2026-09-04",
    dueDate: "2026-09-04",
    status: "Submitted",
    isDemo: false,
    data: { header: {}, rows: question.rowMode.kind === "fixedRows" ? question.rowMode.rows.map((r, i) => ({ id: `r${i + 1}`, ...r, answer: "No" })) : [] },
    createdAt: "2026-09-04T03:00:00.000Z",
    updatedAt: "2026-09-04T05:00:00.000Z",
  } as unknown as RecordInstance;
  const demo = { ...survey, id: "stored-demo-psc", isDemo: true } as RecordInstance;
  recordRepository.upsertMany([survey, minutes, health, demo]);

  assert.equal(alignSeededLineNumbers(), 2, "the survey and the minutes");
  const s = recordRepository.getById(survey.id)!;
  assert.deepEqual((s.data as LogSheetData).rows.map((r) => r.parameter), PSC_ATTRIBUTES);
  assert.ok((s.data as LogSheetData).rows.every((r) => r.response === "5 — Agree"), "the answers are untouched");
  assert.equal(s.status, "Verified");
  assert.equal(s.updatedAt, survey.updatedAt);
  assert.equal(s.history![s.history!.length - 1].note, LINE_NUMBER_NOTE);
  const m = (recordRepository.getById(minutes.id)!.data as LogSheetData).rows.map((r) => r.keyPointsDiscussed);
  assert.deepEqual(m, [MINUTES_GANGWAL_POINTS[0].keyPointsDiscussed, MINUTES_GANGWAL_POINTS[1].keyPointsDiscussed, "3. Our own point, typed by a person"], "a point a person typed stays as typed");
  assert.deepEqual(recordRepository.getById(health.id)!.data, health.data, "F/HR/04 numbers its own questions: untouched");
  assert.deepEqual(recordRepository.getById(demo.id)!.data, demo.data, "Demo Mode's records are left as made");
  assert.equal(alignSeededLineNumbers(), 0, "nothing to do the second time");
});

test("a format the plant edited before §102 is read without its lines' own numbers", () => {
  const issued = LOG_SHEET_LAYOUTS["hr-psc-survey"];
  const numbered: LogSheetLayout = {
    ...issued,
    rowMode: { kind: "fixedRows", rows: PSC_ATTRIBUTES.map((a, i) => ({ parameter: `${i + 1}. ${a}` })) },
  };
  try {
    writeJSON(FORMAT_EDITS_KEY, { "hr-psc-survey": { revisionNo: "01", revisionDate: "2026-09-30", layout: numbered, revisions: [] } });
    const read = getLogSheetLayout("hr-psc-survey")!;
    assert.ok(read.rowMode.kind === "fixedRows");
    assert.deepEqual(
      read.rowMode.kind === "fixedRows" ? read.rowMode.rows.map((r) => r.parameter) : [],
      PSC_ATTRIBUTES,
      "the edited format's lines without their numbers"
    );
    assert.equal(getLogSheetLayout("hr-psc-survey"), read, "the same object each time, for the views that remember work by it");
  } finally {
    writeJSON(FORMAT_EDITS_KEY, {});
  }
});
