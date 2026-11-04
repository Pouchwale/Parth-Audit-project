// EVERY FORMAT'S WORD, EXCEL AND PRINT CHECKED (REQUIREMENTS §183, the owner, 4-Nov-2026): what was put right, held here.
//   - DCRS's own explanation lines are screen notes, never the paper's instructions: printed and downloaded sheets carry
//     the paper's words only;
//   - the HR registers' dates are written as the app writes dates, dd-mm-yyyy, whatever spelling a line carried over from
//     the paper (F/HR/01 dotted and slashed month first, F/HR/09 in its month's column, the periods);
//   - a dashed date is read day first on every register (the app's own "05-07-2024");
//   - a page with no header band gives the number it prints at its foot (F/QC/12's own Word file read "F/QC/13").
// Run: npm run test:unit -- printsAndDownloads
import test from "node:test";
import assert from "node:assert/strict";
import { LOG_SHEET_LAYOUTS } from "../src/data/seed/logSheetLayouts";
import { asAppDate, withRegisterDates } from "../src/engine/registerDates";
import { parseWrittenDate } from "../src/engine/hrMaster";
import { withComputedCells } from "../src/engine/computedCells";
import { numberPrinted } from "../src/utils/originalFill/text";

// The words that gave DCRS's explanations away: none is the paper's.
const EXPLAINS = /\bone (line|record|form|sheet) per\b|\bis the X on the paper\b|\bTO BE CONFIRMED\b|\bwhere the paper prints\b|\bboxes BELOW\b|\bare the boxes below\b|\bworked out here\b|\bnothing is recomputed\b|\bPage 5 of the format\b|\bis below the grid\b|\bnot pre-filled\b/i;

test("no layout prints an explanation of DCRS's above its grid: those are screen notes (REQUIREMENTS §183)", () => {
  const printed = Object.entries(LOG_SHEET_LAYOUTS).flatMap(([id, l]) => (l.instructions ?? []).filter((line) => EXPLAINS.test(line)).map((line) => `${id}: ${line.slice(0, 80)}`));
  assert.deepEqual(printed, []);
  const notes = ["hr-competence", "hr-skill-matrix", "hr-pre-employment-health", "hr-induction-staff", "hr-induction-operators", "hr-job-responsibility", "hr-training-needs", "hr-training-calendar", "hr-training-imparted", "hr-training-feedback", "hr-gmp-checklist", "hr-psc-survey", "hr-psc-survey-analysis", "hr-hygiene-report", "pur-supplier-registration", "pur-supplier-audit-report", "pur-approved-suppliers", "pur-supplier-performance", "pur-service-provider-performance"];
  for (const id of notes) assert.ok((LOG_SHEET_LAYOUTS[id].screenNotes?.length ?? 0) > 0, `${id} keeps its explanation on the screen`);
  // The paper's own words stay printed.
  assert.deepEqual(LOG_SHEET_LAYOUTS["hr-pre-employment-health"].instructions?.[0], "Only to be completed by applicants prior to employment.");
  assert.deepEqual(LOG_SHEET_LAYOUTS["hr-training-effectiveness"].instructions, ["TRAINER'S EVALUATION BY TRAINEE", "On a scale of 1 to 10 (1 being the worst, 10 being the best), how you would rate this workshop"]);
  assert.equal(LOG_SHEET_LAYOUTS["hr-training-effectiveness"].notesBelow?.[0], "TRAINEE'S EVALUATION BY – TRAINER / REPORTING OFFICER");
  // The foot the paper prints once.
  for (const id of ["disp-safe-transporter-agreement", "hr-gmp-checklist", "pur-supplier-registration", "pur-supplier-audit-report", "sys-hara-annual"]) assert.equal(LOG_SHEET_LAYOUTS[id].footOnce, true, id);
});

test("a dashed date is read day first on every register, a slashed one in the register's own order (REQUIREMENTS §183)", () => {
  assert.equal(parseWrittenDate("05-07-2024", "mdy"), "2024-07-05", "the app's own writing on F/HR/01, whose slashes are month first");
  assert.equal(parseWrittenDate("4/30/2025", "mdy"), "2025-04-30");
  assert.equal(parseWrittenDate("3/8/2025", "mdy"), "2025-03-08");
  assert.equal(parseWrittenDate("01/06/2025", "dmy"), "2025-06-01");
  assert.equal(parseWrittenDate("01.04.2014", "mdy"), "2014-04-01", "dots are day first");
});

test("the HR registers' dates are written dd-mm-yyyy wherever they are shown or stored; other words are left alone (REQUIREMENTS §183)", () => {
  assert.equal(asAppDate("4/30/2025", "mdy"), "30-04-2025");
  assert.equal(asAppDate("01.04.2014", "mdy"), "01-04-2014");
  assert.equal(asAppDate("01.04.2026 ~ 31.03.2027", "mdy"), "01-04-2026 ~ 31-03-2027");
  for (const kept of ["Fresher", "NA", "Yes", "5 Years", "", "30-04-2025"]) assert.equal(asAppDate(kept, "mdy"), kept);
  const f01 = {
    header: { reviewedOn: "01.10.2026" },
    rows: [
      { id: "a", name: "Jay Vyas", dateOfJoining: "01.03.2011", dateOfLeaving: "4/30/2025", expAvailable: "11 Years" },
      { id: "b", name: "Ayushi Patel", dateOfJoining: "3/8/2025", dateOfLeaving: "" },
    ],
  };
  const out = withComputedCells("hr-competence", f01) as typeof f01;
  assert.deepEqual(out.header, { reviewedOn: "01-10-2026" });
  assert.deepEqual(
    out.rows.map((r) => [r.dateOfJoining, r.dateOfLeaving]),
    [
      ["01-03-2011", "30-04-2025"],
      ["08-03-2025", ""],
    ],
  );
  assert.equal(out.rows[0].expAvailable, "11 Years", "a box that is not a date stays as it is");
  assert.equal(withRegisterDates("hr-competence", out), out, "nothing to change: the very same object");
  // F/HR/09: each month's column read in its own month; the period in the header.
  const f09 = { header: { period: "01.04.2026 ~ 31.03.2027" }, rows: [{ id: "t", parameter: "GMP Principles", m0Plan: "Yes", m0Actual: "4/9/2026", m10Plan: "Yes", m10Actual: "2/4/2027", m3Actual: "7/22/2026" }] };
  const cal = withRegisterDates("hr-training-calendar", f09);
  assert.equal(cal.header.period, "01-04-2026 ~ 31-03-2027");
  assert.deepEqual([cal.rows[0].m0Actual, cal.rows[0].m10Actual, cal.rows[0].m3Actual, cal.rows[0].m0Plan], ["09-04-2026", "04-02-2027", "22-07-2026", "Yes"]);
  // Another document's data passes straight through.
  const other = { header: { date: "4/30/2025" }, rows: [] };
  assert.equal(withRegisterDates("qc-viscosity", other), other);
});

test("a page with no header band gives the number it prints at its foot (REQUIREMENTS §183: F/QC/12's own Word file read F/QC/13)", () => {
  assert.deepEqual(numberPrinted(["PROCEDURE: Calibration to be done by qualified QA person ...", "F/QC/12 (01/01-01-2022)"]), { formatNo: "F/QC/12", revNo: "01", revDate: "01-01-2022" });
  assert.equal(numberPrinted(["No number here"]), null);
});
