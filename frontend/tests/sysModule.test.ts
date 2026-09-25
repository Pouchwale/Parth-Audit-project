// THE SYSTEM / MANAGEMENT MODULE (REQUIREMENTS §76), HELD TO ITS OWN PAGES.
//
// The PSTL's eighteen F/SYS formats were supplied as pages, most of them filled
// in, and are on file as live records. These check what the module promises
// beyond "the sheet draws":
//   * F/SYS/07's Sum and Audit frequency are the printed criteria, worked out
//     — and they give back what the 2024 page itself printed;
//   * a judgement is made afresh: a new monthly HARA verification is prepared
//     with the printed questions and the team, never last time's answers;
//   * the pages supplied are on file whole (the counts the pages print);
//   * the Insights read the PSTL's records together (S1–S6) and find, on the
//     plant's own pages, what an auditor would: the mock withdrawals and the
//     traceability tests more than a year old, the NC report Feb -25/02 never
//     verified closed although the audit plan marks its clause Closed, the
//     audit's NC - 01 with no NC report at all, and the backward traceability
//     test's printing date of 21.07.2027 — after its own dispatch.
// "Today" is fixed, so the answers do not move with the clock.
import test from "node:test";
import assert from "node:assert/strict";
import type { DocumentDefinition, LogSheetData, RecordInstance } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { masterRepository, ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { ensureSeeded as ensureHrMasterSeeded } from "../src/data/repositories/hrMasterRepository";
import { recordRepository, ensureSeeded as ensureRecordsSeeded } from "../src/data/repositories/recordRepository";
import { auditFrequency, auditRiskCells, withAuditRisk } from "../src/engine/auditRisk";
import { autoFillRecord } from "../src/engine/autoFill";
import { computeInsights, type Insight } from "../src/engine/insights";
import { parseAssistantCommand } from "../src/engine/assistantCommands";
import { matchDocuments } from "../src/engine/assistantLocal";

ensureDocumentsSeeded();
ensureMasterSeeded();
ensureHrMasterSeeded();
ensureRecordsSeeded();

const TODAY = "2026-09-25";
const documents: DocumentDefinition[] = documentRepository.getAll();
const live = recordRepository.query({ isDemo: false });
const byId = (id: string): RecordInstance | undefined => live.find((r) => r.id === id);
const rows = (r: RecordInstance | undefined) => ((r?.data as LogSheetData | undefined)?.rows ?? []) as Record<string, string | number | null>[];
const header = (r: RecordInstance | undefined) => (r?.data as LogSheetData | undefined)?.header ?? {};
const insightsAsOf = (today: string): Insight[] => computeInsights({ records: live, documents, today, isDemo: false });
const byRule = (all: Insight[], rule: string) => all.filter((i) => i.rule === rule);

test("F/SYS/07: the printed criteria — up to 4 once a year, 5 to 15 twice, 16 or more three times", () => {
  assert.equal(auditFrequency(0), "Once / Year");
  assert.equal(auditFrequency(4), "Once / Year");
  assert.equal(auditFrequency(5), "Twice / Year");
  assert.equal(auditFrequency(15), "Twice / Year");
  assert.equal(auditFrequency(16), "3 times / Year");
  assert.deepEqual(auditRiskCells({ iqaNc: 3, externalNc: 4 }), { sum: "7", frequency: "Twice / Year" });
  assert.deepEqual(auditRiskCells({ iqaNc: 10, externalNc: "7" }), { sum: "17", frequency: "3 times / Year" });
  // A section with neither figure written works out to nothing, not to "0, Once / Year".
  assert.deepEqual(auditRiskCells({ iqaNc: null, externalNc: "" }), { sum: "", frequency: "" });
  // One written beside a blank counts the blank as none found.
  assert.deepEqual(auditRiskCells({ iqaNc: 2, externalNc: null }), { sum: "2", frequency: "Once / Year" });
});

test("F/SYS/07: the 2024 page's own Sum and frequency, section by section, are what the criteria give", () => {
  const risk = byId("seed-sys-audit-risk-2024");
  assert.ok(risk, "the 2024 risk assessment is on file");
  const data = withAuditRisk("sys-audit-risk", risk!.data as LogSheetData);
  const worked = (data.rows as Record<string, string | number | null>[])
    .filter((r) => String(r.sum ?? "") !== "")
    .map((r) => [String(r.sum), String(r.frequency)]);
  // Sections 1 to 6 as printed: 0/0, 0/1, 0/0, 3/4, 1/1, 2/0.
  assert.deepEqual(worked, [
    ["0", "Once / Year"],
    ["1", "Once / Year"],
    ["0", "Once / Year"],
    ["7", "Twice / Year"],
    ["2", "Once / Year"],
    ["2", "Once / Year"],
  ]);
});

test("a new monthly HARA verification carries the questions and the team, never last time's answers", () => {
  const doc = documents.find((d) => d.id === "sys-hara-monthly");
  assert.ok(doc, "F/SYS/12 is in the catalogue");
  const previous = byId("seed-sys-hara-monthly-2024-04");
  assert.ok(previous, "the April 2024 verification is on file");
  const filled = autoFillRecord(doc!, "2026-09-22", masterRepository.get(), previous as RecordInstance<LogSheetData>);
  assert.ok(filled);
  const data = filled!.data as LogSheetData;
  const lines = data.rows;
  assert.equal(lines.length, 24, "the 24 printed questions");
  assert.ok(lines.every((r) => String(r.attribute ?? "").trim() !== ""), "every question is printed on it");
  for (const key of ["status", "verification", "comments"]) {
    assert.ok(lines.every((r) => r[key] === "" || r[key] === null || r[key] === undefined), `no ${key} carried from April 2024`);
  }
  assert.ok(Object.values(data.header).some((v) => /Kapila Barad/.test(String(v))), "the HARA team is carried");
});

test("the supplied pages are on file whole", () => {
  assert.equal(rows(byId("seed-sys-document-list")).length, 173, "F/SYS/01: 173 documents");
  assert.equal(rows(byId("seed-sys-format-list")).length, 141, "F/SYS/02: 141 formats (the workbook as last updated)");
  assert.equal(rows(byId("seed-sys-mrm-2025-07")).length, 19, "F/SYS/04: 19 objectives reviewed");
  assert.equal(rows(byId("seed-sys-mrm-agenda-2025-07")).length, 8, "F/SYS/04-A: 8 participants");
  assert.equal(rows(byId("seed-sys-hara-monthly-2024-04")).length, 24, "F/SYS/12: 24 questions");
  assert.equal(rows(byId("seed-sys-site-security-2026")).length, 26, "F/SYS/17: 26 points");
  assert.equal(rows(byId("seed-sys-objectives-2026")).length, 18, "F/SYS/16: 18 objectives");
  assert.ok(rows(byId("seed-sys-audit-findings-2025-02")).length >= 119, "F/SYS/08: every clause 3.1.1 to 4.11.9");
  for (const id of ["seed-sys-mock-recall-label-2025-01", "seed-sys-mock-recall-pouch-2025-01", "seed-sys-mock-recall-sleeve-2025-02", "seed-sys-backward-trace-2024-12", "seed-sys-forward-trace-2024-12", "seed-sys-audit-nc-feb-25-02", "seed-sys-audit-plan-2025-01", "seed-sys-audit-schedule-2024", "seed-sys-audit-schedule-2025", "seed-sys-hara-annual-2026"]) {
    const r = byId(id);
    assert.ok(r, `${id} is on file`);
    assert.equal(r!.status, "Verified");
    assert.equal(r!.isDemo, false);
  }
  assert.ok(Object.values(header(byId("seed-sys-audit-nc-feb-25-02"))).some((v) => String(v).includes("4.7.6")), "Feb -25/02 is for clause 4.7.6");
});

test("S1 and S2: the plant's mock withdrawals and traceability tests, more than a year old by September 2026", () => {
  const now = insightsAsOf(TODAY);
  const s1 = byRule(now, "S1").filter((i) => i.severity === "high");
  assert.equal(s1.length, 3, `LABEL, Pouch and SHRINK SLEEVE are each overdue: ${s1.map((i) => i.title).join(" | ")}`);
  assert.ok(s1.some((i) => i.title.includes("10-Jan-2025")), "the label's was 10.01.2025");
  const s2 = byRule(now, "S2");
  assert.equal(s2.length, 2, "backward and forward traceability both overdue");
  // In March 2025 every one of them was less than a year old.
  const then = insightsAsOf("2025-03-01");
  assert.equal(byRule(then, "S1").length, 0);
  assert.equal(byRule(then, "S2").length, 0);
});

test("S3: Feb -25/02 was never verified closed — while the audit plan marks 4.7.6 Closed", () => {
  const s3 = byRule(insightsAsOf(TODAY), "S3");
  assert.equal(s3.length, 1, s3.map((i) => i.title).join(" | "));
  assert.equal(s3[0].severity, "high");
  assert.match(s3[0].title, /4\.7\.6/);
  assert.match(s3[0].detail, /Closed/, "the audit plan's summary is named");
  assert.ok(s3[0].evidence.some((e) => e.recordId === "seed-sys-audit-plan-2025-01"), "and read from");
  // Twelve days after the audit, with a month allowed and no planned date written, it is not yet raised.
  assert.equal(byRule(insightsAsOf("2025-03-01"), "S3").length, 0);
});

test("S4: the audit's NC - 01 at 4.2.1 has no NC report on file; NC - 02 at 4.7.6 has one", () => {
  const s4 = byRule(insightsAsOf(TODAY), "S4");
  assert.equal(s4.length, 1, s4.map((i) => i.title).join(" | "));
  assert.match(s4[0].title, /NC - 01 at clause 4\.2\.1/);
});

test("S5: the backward traceability test's printing date, 21.07.2027, is after its own dispatch", () => {
  const s5 = byRule(insightsAsOf(TODAY), "S5");
  assert.equal(s5.length, 1, s5.map((i) => i.title).join(" | "));
  assert.ok(s5[0].title.includes("Printing production date 21-Jul-2027 is after the dispatch of 23-Jul-2024"), s5[0].title);
  assert.equal(s5[0].severity, "medium");
});

// The plant's records with some changed or added, as a test of a rule needs them.
function edited(id: string, change: (data: LogSheetData) => void, as?: Partial<RecordInstance>): RecordInstance {
  const r = byId(id)!;
  const data = JSON.parse(JSON.stringify(r.data)) as LogSheetData;
  change(data);
  return { ...r, ...as, data };
}
const insightsWith = (today: string, ...changed: RecordInstance[]): Insight[] =>
  computeInsights({
    records: [...live.map((r) => changed.find((c) => c.id === r.id) ?? r), ...changed.filter((c) => !live.some((r) => r.id === c.id))],
    documents,
    today,
    isDemo: false,
  });

test("S1 and S2 count a year from the date itself: not overdue on the anniversary, a 29 February between or not", () => {
  const onDate = (date: string) => [
    ...["seed-sys-mock-recall-label-2025-01", "seed-sys-mock-recall-pouch-2025-01", "seed-sys-mock-recall-sleeve-2025-02"].map((id) => edited(id, (d) => (d.header.date = date))),
    edited("seed-sys-backward-trace-2024-12", (d) => (d.header.traceabilityDate = date)),
    edited("seed-sys-forward-trace-2024-12", (d) => (d.header.dateOfForwardTraceability = date)),
  ];
  // 2028 is a leap year: 1 June 2027 to 1 June 2028 is 366 days, and still a year.
  const anniversary = insightsWith("2028-06-01", ...onDate("2027-06-01"));
  assert.equal(byRule(anniversary, "S1").filter((i) => i.severity === "high").length, 0, byRule(anniversary, "S1").map((i) => i.title).join(" | "));
  assert.equal(byRule(anniversary, "S2").length, 0);
  const dayAfter = insightsWith("2028-06-02", ...onDate("2027-06-01"));
  const s1 = byRule(dayAfter, "S1").filter((i) => i.severity === "high");
  assert.equal(s1.length, 3);
  assert.ok(s1.every((i) => i.title.includes("is 1 day overdue")), s1.map((i) => i.title).join(" | "));
  assert.equal(byRule(dayAfter, "S2").length, 2);
});

test("S1: a withdrawal dated still to come does not hide the one that has lapsed", () => {
  const drafted = edited("seed-sys-mock-recall-label-2025-01", (d) => (d.header.date = "2027-01-10"), {
    id: "draft-label-2027",
    status: "In Progress",
    dueDate: "2027-01-10",
    periodKey: "sys-mock-recall:2027-01-10",
  });
  const s1 = byRule(insightsWith(TODAY, drafted), "S1").filter((i) => i.severity === "high");
  assert.equal(s1.length, 3, s1.map((i) => i.title).join(" | "));
  assert.ok(s1.some((i) => i.title.includes("10-Jan-2025")), "the label's lapsed test of 10.01.2025 is still named");
});

test("S3: an audit plan that marks the clause Not Closed agrees with the open report — no contradiction is claimed", () => {
  const plan = edited("seed-sys-audit-plan-2025-01", (d) => {
    for (const row of d.rows) for (const [k, v] of Object.entries(row)) if (v === "Closed, Closed") row[k] = "Not Closed, Not Closed";
  });
  const s3 = byRule(insightsWith(TODAY, plan), "S3");
  assert.equal(s3.length, 1, "the report is still open");
  assert.doesNotMatch(s3[0].detail, /audit plan's summary/, s3[0].detail);
  assert.ok(!s3[0].evidence.some((e) => e.recordId === "seed-sys-audit-plan-2025-01"));
});

test("S4: a non-conformity written in the column's own words, 'Non compliance', is one too — 'Compliance' is not", () => {
  const audit = edited("seed-sys-audit-findings-2025-02", (d) => {
    for (const row of d.rows) for (const [k, v] of Object.entries(row)) if (v === "NC - 01") row[k] = "Non compliance";
  });
  const s4 = byRule(insightsWith(TODAY, audit), "S4");
  assert.equal(s4.length, 1, s4.map((i) => i.title).join(" | "));
  assert.match(s4[0].title, /Non compliance at clause 4\.2\.1/);
});

test("S5: a job inspected before it was printed, and a forward trace dispatched before it was issued, are out of order", () => {
  const backward = edited("seed-sys-backward-trace-2024-12", (d) => {
    d.header.printingProductionDate = "2024-07-22";
    d.header.qcInspectionDated = "2024-07-19";
  });
  const forward = edited("seed-sys-forward-trace-2024-12", (d) => {
    d.rows[0].dispatchDated = "2024-12-10";
  });
  const s5 = byRule(insightsWith(TODAY, backward, forward), "S5");
  assert.equal(s5.length, 2, s5.map((i) => i.title).join(" | "));
  assert.ok(s5.some((i) => i.title.includes("Printing production date 22-Jul-2024 is after the QC Inspection dated 19-Jul-2024")), s5.map((i) => i.title).join(" | "));
  assert.ok(s5.some((i) => i.title.includes("Dispatch dated 10-Dec-2024 is before its issue, 14-Dec-2024")), s5.map((i) => i.title).join(" | "));
  // The forward trace as the page wrote it is in order.
  assert.equal(byRule(insightsAsOf(TODAY), "S5").filter((i) => i.id.includes("forward")).length, 0);
});

test("Mitra: F/SYS/13 asked for by name is walked through, not filled with made-up data — and the SYS names find the right format", () => {
  // "mock" is a word for made-up data — but it is also F/SYS/13's own name.
  const named = parseAssistantCommand("fill the mock recall record", false, TODAY);
  assert.equal(named?.kind, "guide", JSON.stringify(named));
  const sample = parseAssistantCommand("fill the mock recall record with sample data", false, TODAY);
  assert.equal(sample?.kind, "fill", JSON.stringify(sample));
  assert.deepEqual(matchDocuments("yearly hara verification"), ["sys-hara-annual"]);
  assert.deepEqual(matchDocuments("monthly hara review"), ["sys-hara-monthly"]);
  // "list of documents" asks for a listing of a module's documents, not for F/SYS/01.
  assert.ok(!matchDocuments("the list of documents for maintenance from 1 to 5 june").includes("sys-document-list"));
  assert.deepEqual(matchDocuments("master list of documents"), ["sys-document-list"]);
});

test("S6: the April 2024 verification answered every question C — no NC to report", () => {
  assert.equal(byRule(insightsAsOf("2024-05-01"), "S6").length, 0);
});
