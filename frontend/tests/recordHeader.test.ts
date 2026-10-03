// THE HEADER BLOCK ON EVERY DOCUMENT, AND THE FIVE FORMATS OF 02-OCT-2026
// (REQUIREMENTS §86). Without a browser: the engine and the repositories.
//
//   * a record's own Date and Page No. are saved on it alone, with a history
//     line naming what the header said before and after; typed back to what the
//     header prints anyway, the record's own is dropped; a signed-off record
//     takes no change; Edit then Cancel edit puts the header back too;
//   * the format's own header changed from a record is a header-only change
//     (no copy of the layout), and a revision number typed alone is a re-issue;
//   * the five formats are on file as their papers print them, in their own
//     departments, and no longer listed as "not in DCRS yet".
// Run: npm run test:unit -- recordHeader
import test from "node:test";
import assert from "node:assert/strict";
import type { DocumentDefinition, LogSheetLayout, RecordInstance } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { recordRepository } from "../src/data/repositories/recordRepository";
import { getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import { departmentOfDocument } from "../src/data/seed/departments";
import { formatEditFor } from "../src/data/formatEdits";
import { createRecordForDocument } from "../src/engine/recordCrud";
import { ensureRecordsGeneratedForMonth } from "../src/engine/recordGenerator";
import { cancelCorrection, cleanHeaderBlock, correctionChanges, recordHeaderDefaults, reopenForCorrection, saveHeaderBlock } from "../src/engine/recordLifecycle";
import { commitFormatChange, draftOf, printedCompanyName, restoreIssuedFormat } from "../src/engine/formatOps";
import { masterListFormatsNotInDcrs } from "../src/engine/documentFinder";
import { documentFileKind } from "../src/utils/documentExport";
import { todayISO } from "../src/utils/date";

ensureDocumentsSeeded();
ensureMasterSeeded();

const doc = (id: string): DocumentDefinition => {
  const d = documentRepository.getByIdUnscoped(id);
  assert.ok(d, `${id} is in the catalogue`);
  return d!;
};
const layout = (id: string): LogSheetLayout => {
  const l = getLogSheetLayout(id);
  assert.ok(l, `${id} has a layout`);
  return l!;
};

const DEFAULTS = (r: RecordInstance) => ({ date: r.dueDate, page: "1 of 1 (digital)" });

function freshRecord(docId: string, dateISO: string): RecordInstance {
  const { record } = createRecordForDocument(doc(docId), { dateISO });
  return record;
}

test("a record's own Date and Page No. are saved on it alone, with a history line", () => {
  const r = freshRecord("qc-incoming-lamination-film", "2026-09-15");
  const saved = saveHeaderBlock(r, { date: "2026-09-16", page: "1 of 2" }, "Test Desk", DEFAULTS(r));
  assert.deepEqual(saved.headerBlock, { date: "2026-09-16", page: "1 of 2" });
  assert.equal(recordRepository.getById(r.id)?.headerBlock?.page, "1 of 2", "stored");
  assert.equal(saved.status, "In Progress", "an edit like any other");
  const last = saved.history?.at(-1);
  assert.equal(last?.action, "edited");
  assert.deepEqual(
    last?.changes?.map((c) => [c.label, c.before, c.after]),
    [
      ["Header · Date", "15-Sep-2026", "16-Sep-2026"],
      ["Header · Page No.", "1 of 1 (digital)", "1 of 2"],
    ]
  );
  assert.deepEqual(saved.data, r.data, "the form's boxes are untouched — the header is beside the data, never in it");
  // Typed back to what the header prints anyway, the record's own is dropped.
  const back = saveHeaderBlock(saved, { date: r.dueDate, page: "1 of 1 (digital)" }, "Test Desk", DEFAULTS(r));
  assert.equal(back.headerBlock, undefined);
  // Nothing changed: nothing saved, no history line.
  assert.equal(saveHeaderBlock(back, {}, "Test Desk", DEFAULTS(r)), back);
});

test("only a real date and a page written as something are kept", () => {
  const d = { date: "2026-09-15", page: "1 of 1 (digital)" };
  assert.equal(cleanHeaderBlock({ date: "15-09-2026" }, d), undefined, "not an ISO date");
  assert.equal(cleanHeaderBlock({ page: "   " }, d), undefined, "rubbed out");
  assert.deepEqual(cleanHeaderBlock({ date: " 2026-09-20 ", page: " 2 of 2 " }, d), { date: "2026-09-20", page: "2 of 2" });
  assert.deepEqual(cleanHeaderBlock({ date: "2026-09-15", page: "2 of 2" }, d), { page: "2 of 2" }, "the due date repeated is not kept");
});

test("a signed-off record takes no change to its header; Edit then Cancel edit puts the header back", () => {
  const r = freshRecord("disp-vehicle-cleaning", "2026-09-10");
  const verified = recordRepository.upsert({ ...r, status: "Verified", verifiedBy: "QA", verifiedAt: new Date().toISOString() });
  assert.equal(saveHeaderBlock(verified, { page: "1 of 3" }, "Test Desk", DEFAULTS(r)), verified, "signed off: through Edit, with a reason, only");
  const reopened = reopenForCorrection(verified, "Test Desk", "the page number was wrong");
  assert.equal(reopened.correction?.headerBlockBefore, null, "it had no header of its own when reopened");
  const changed = saveHeaderBlock(reopened, { page: "1 of 3" }, "Test Desk", DEFAULTS(r));
  assert.equal(changed.headerBlock?.page, "1 of 3");
  assert.deepEqual(
    correctionChanges(changed).map((c) => c.label),
    ["Header · Page No."],
    "what the correction changed names the header line"
  );
  const cancelled = cancelCorrection(changed, "Test Desk");
  assert.equal(cancelled.status, "Verified");
  assert.equal(cancelled.headerBlock, undefined, "put back as it was");
  assert.match(cancelled.history?.at(-1)?.note ?? "", /1 change put back/);
});

test("the format's header changed from a record is the header alone; a revision number typed alone is a re-issue", () => {
  const id = "hr-monthly-cleaning";
  const issued = doc(id);
  // What a record page saves: the header, never a copy of the layout.
  const result = commitFormatChange(issued, { ...draftOf(issued), layout: undefined, formatNo: "F/HR/16-A" }, { actor: "Test Desk", reason: "renumbered" });
  assert.ok(result.ok, JSON.stringify(result));
  assert.equal(doc(id).formatNo, "F/HR/16-A");
  assert.equal(formatEditFor(id)?.layout, undefined, "no frozen copy of the sheet — later fixes to its layout still reach it");
  assert.equal(getLogSheetLayout(id), layout(id));
  // The revision number alone: refused as nothing changed, unless it is a re-issue.
  const now = doc(id);
  const plain = commitFormatChange(now, { ...draftOf(now), layout: undefined, revisionNo: "03" }, { actor: "Test Desk", reason: "re-issued" });
  assert.equal(plain.ok, false, "the next number alone describes no change");
  const reissued = commitFormatChange(now, { ...draftOf(now), layout: undefined, revisionNo: "03" }, { actor: "Test Desk", reason: "re-issued", reissue: true });
  assert.ok(reissued.ok, JSON.stringify(reissued));
  if (reissued.ok) assert.equal(reissued.revision.summary, "re-issued as Rev 03");
  assert.equal(doc(id).revisionNo, "03");
  assert.equal(restoreIssuedFormat(doc(id)), true);
  assert.equal(doc(id).formatNo, "F/HR/16");
  assert.equal(doc(id).revisionNo, "01");
  // The revision's date typed over as today: every save is dated today, so no description names it — a re-issue too.
  const issuedAgain = doc(id);
  const redated = commitFormatChange(issuedAgain, { ...draftOf(issuedAgain), layout: undefined, revisionDate: todayISO() }, { actor: "Test Desk", reason: "re-issued today", reissue: true });
  assert.ok(redated.ok, JSON.stringify(redated));
  if (redated.ok) assert.equal(redated.revision.summary, "re-issued as Rev 02");
  assert.equal(doc(id).revisionDate, todayISO());
  assert.equal(restoreIssuedFormat(doc(id)), true);
});

test("a day of the daily register prints its row of the month's register, and Cancel edit's history says so", () => {
  const r = freshRecord("daily-pest-monitoring", "2026-10-05");
  const defaults = recordHeaderDefaults(r);
  assert.deepEqual(defaults, { date: "2026-10-05", page: "row 5 of the October register" });
  assert.equal(recordHeaderDefaults(freshRecord("disp-vehicle-cleaning", "2026-10-05")).page, "1 of 1 (digital)", "any other record");
  const verified = recordRepository.upsert({ ...r, status: "Verified", verifiedBy: "QA", verifiedAt: new Date().toISOString() });
  const changed = saveHeaderBlock(reopenForCorrection(verified, "Test Desk", "the page was wrong"), { page: "1 of 1" }, "Test Desk", defaults);
  assert.equal(changed.headerBlock?.page, "1 of 1");
  const cancelled = cancelCorrection(changed, "Test Desk");
  assert.deepEqual(
    cancelled.history?.at(-1)?.changes?.map((c) => [c.label, c.before, c.after]),
    [["Header · Page No.", "1 of 1", "row 5 of the October register"]],
    "what the header prints again, not \"1 of 1 (digital)\""
  );
});

test("F/HR/15 and F/HR/16: the plant's areas, the days and the months, as the papers print them", () => {
  const daily = layout("hr-daily-cleaning");
  assert.equal(doc("hr-daily-cleaning").formatNo, "F/HR/15");
  assert.equal(doc("hr-daily-cleaning").revisionNo, "01");
  assert.equal(doc("hr-daily-cleaning").companyName, undefined, "no spelling of its own: the paper's PACA1:AH16K is not printed");
  assert.equal(printedCompanyName(doc("hr-daily-cleaning")), "GUJARAT PRINT PACK PUBLICATIONS PVT LTD", "the company's name as the owner gave it on 02-Oct-2026");
  assert.deepEqual(daily.columns.slice(3).map((c) => c.label), Array.from({ length: 31 }, (_, i) => String(i + 1)));
  const rows = daily.rowMode.kind === "fixedRows" ? daily.rowMode.rows : [];
  assert.equal(rows.length, 19, "seventeen areas and the two signature lines");
  assert.equal(rows[0].parameter, "Canteen", "the area is the line's name, as every printed line's is");
  assert.equal(rows[1].cleaning, "Floor,  Hand wash stations - Dry & Wet mopping", "the paper's double space");
  assert.deepEqual(rows.slice(-2).map((r) => r.parameter), ["Cleaning done by", "Cleaning verified by"]);
  assert.ok(daily.columns.every((c) => c.label.trim()), "every column is named, so the format can be designed");

  const monthly = layout("hr-monthly-cleaning");
  assert.equal(doc("hr-monthly-cleaning").formatNo, "F/HR/16");
  assert.deepEqual(monthly.columns.slice(3).map((c) => c.label), ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]);
  const mrows = monthly.rowMode.kind === "fixedRows" ? monthly.rowMode.rows : [];
  assert.equal(mrows.length, 20, "the Date line, eighteen areas and the verification line");
  assert.equal(mrows[0].parameter, "Date");
  assert.equal(mrows[17].parameter, "Ink store - Ground floor");
  assert.equal(mrows[1].cleaning, "Walls & Ceiling + Glass doors\nCleaning by");
  assert.deepEqual(doc("hr-monthly-cleaning").schedule, { type: "yearly", month: 11, dayOfMonth: 31 }, "due at the year's end, as a month sheet at the month's");
  for (const id of ["hr-daily-cleaning", "hr-monthly-cleaning"]) {
    assert.equal(departmentOfDocument(id, doc(id).formatNo), "HR", id);
    assert.equal(documentFileKind(doc(id)), "xlsx", `${id} downloads as the company's own spreadsheet`);
  }
});

test("F/DISP/04, F/QC/33 and F/QC/36, in Dispatch and Quality Control", () => {
  const vehicle = layout("disp-vehicle-cleaning");
  assert.deepEqual(vehicle.headerFields[0].options, ["GJ02ZZ6403 – ECHO", "GJ02AT4947 – BOLERO PICK UP", "GJ02AT2070 – EICHER TRUCK", "GJ02AT5340 – EICHER TRUCK"]);
  assert.deepEqual(vehicle.columns.map((c) => c.label), ["Date", "Type of cleaning (Dry / Wet)", "Driver sign", "Dispatch In-charge (Random verification)"]);
  assert.equal(vehicle.rowMode.kind, "free");
  assert.equal(doc("disp-vehicle-cleaning").revisionNo, "01");
  assert.equal(doc("disp-vehicle-cleaning").revisionDate, "2023-11-01");

  const incoming = layout("qc-incoming-lamination-film");
  const params = incoming.rowMode.kind === "fixedRows" ? incoming.rowMode.rows.map((r) => r.parameter) : [];
  assert.deepEqual(params, ["SIZE (mm)", "THICKNESS OF FILM (µm)", "CORONA TREATMENT (Dynes)", "COF", "DART IMPACT", "ODOUR TEST"]);
  assert.equal(incoming.rowMode.kind === "fixedRows" ? incoming.rowMode.rows[0].specification : "", "Should be as per P.O.  (+ 2/- 0.0)");

  const sb = layout("qc-inspection-sb-lamination");
  assert.deepEqual(sb.headerFields.map((f) => f.label), ["JOB CODE (FG CODE)", "PO NUMBER", "Date / SHIFT", "Laminated Roll number", "1st SUBSTRATE DETAILS", "2nd  SUBSTRATE DETAILS", "1st Pass / 2nd Pass / 3rd Pass"]);
  assert.equal(sb.rowMode.kind === "fixedRows" ? sb.rowMode.rows.length : 0, 3);
  assert.deepEqual(sb.footerFields?.[0].options, ["ACCEPTED", "REJECT / SCRAP", "SEGREGATION", "ACCEPTED ON DEVIATION"]);

  assert.equal(departmentOfDocument("disp-vehicle-cleaning", doc("disp-vehicle-cleaning").formatNo), "DISP");
  assert.equal(departmentOfDocument("qc-incoming-lamination-film", doc("qc-incoming-lamination-film").formatNo), "QC");
  assert.equal(departmentOfDocument("qc-inspection-sb-lamination", doc("qc-inspection-sb-lamination").formatNo), "QC");
  for (const id of ["disp-vehicle-cleaning", "qc-incoming-lamination-film", "qc-inspection-sb-lamination"]) {
    assert.equal(documentFileKind(doc(id)), "docx", `${id} downloads as the company's own Word form`);
  }
});

test("F/HR/16 is filed from the year's first day and due at its end; a yearly format due another day is not", () => {
  const year = new Date().getFullYear();
  const month = new Date().getMonth();
  const made = ensureRecordsGeneratedForMonth(year, month, { documentIds: ["hr-monthly-cleaning", "hr-competence"] });
  const sheet = recordRepository.query({ documentId: "hr-monthly-cleaning", isDemo: false }) as RecordInstance[];
  const thisYear = sheet.filter((r) => r.periodKey === `hr-monthly-cleaning:${year}-12-31`);
  assert.equal(thisYear.length, 1, "this year's sheet is on file now, whichever month it is");
  assert.ok(thisYear[0].dueDate >= `${year}-12-31`, "due at the year's end (or the first working day after it)");
  assert.ok(made.every((r) => r.documentId !== "hr-competence" || r.dueDate.slice(5, 7) === String(month + 1).padStart(2, "0")), "F/HR/01 is filed in its own month only");
  assert.equal(ensureRecordsGeneratedForMonth(year, month, { documentIds: ["hr-monthly-cleaning"] }).length, 0, "never twice");
});

test("the five are in DCRS now — the master list no longer says they are not", () => {
  const notYet = masterListFormatsNotInDcrs().map((l) => l.formatNo);
  for (const no of ["F-HR-15", "F-HR-16", "F-QC-33", "F-QC-36", "F-DISP-04"]) {
    assert.ok(!notYet.includes(no), `${no} is no longer listed as not in DCRS yet`);
  }
});
