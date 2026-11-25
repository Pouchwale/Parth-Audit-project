// F/MNT/01 TO F/MNT/10 AS THE OWNER'S OWN PAPERS (REQUIREMENTS §351; the owner: "same format present in my system which is
// present in google drive ... whenever user download any document of any module or take a print on A4 size paper, that should
// be very perfect").
// Run: npm run test:unit -- mntPapers351
import test from "node:test";
import assert from "node:assert/strict";
import { getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import { MNT_PAPERS_351 } from "../src/data/seed/mntPapers351";
import { MNT_PAPER_TABLES } from "../src/data/seed/mntPaperTables";
import { lineRow, paperTableFits, paperTableFor, paperTablePrint, type PaperCell, type PaperRow, type PaperTable } from "../src/data/seed/qcPaperTables";
import { paperNeedsReading } from "../src/engine/paperReadable";

const rowsOf = (f: PaperTable): PaperRow[] => [...f.head, ...f.body, ...f.foot];
const cellsOf = (f: PaperTable): PaperCell[] => rowsOf(f).flatMap((r) => r.cells).concat(f.lines?.cells ?? []);
const wordsOf = (f: PaperTable): string[] => cellsOf(f).flatMap((c) => [c.t ?? "", c.sentence?.before ?? ""]).filter(Boolean);
const widthOf = (cells: PaperCell[]): number => cells.reduce((a, c) => a + c.w, 0);
const paper = (id: string): PaperTable => MNT_PAPERS_351[id];

/** Each document: its company line as its paper prints it, its title and its format number line. */
const OWN_WORDS: Record<string, string[]> = {
  "mnt-equipment-list": ["GUJARAT PRINT PACK PUBLICATION PRIVATE LIMITED", "LIST OF EQUIPMENTS & UTILITIES", "F/MNT/01 (00/01.12.2021)"],
  "mnt-pm-record": ["GUJARAT PRINT PACK PUBLICATION PRIVATE LIMITED", "PREVENTIVE MAINTENANCE SCHEDULE & RECORD", "Format No.: F/MNT/02", "Rev No: 01", "Date: 01.12.2021", "Page No.: 1 Of 2"],
  "mnt-yearly-pm-schedule": ["GUJARAT PRINT PACK PUBLICATION PRIVATE LIMITED", "YEARLY PREVENTIVE MAINTENANCE SCHEDULE - 2023", "F/MNT/03 (01/15.07.2026)"],
  "mnt-daily-health": ["Daily Equipment Health Status & Cleaning Record", "F/MNT/04 (00/01.12.2021)"],
  "mnt-breakdown-memo": ["GUJARAT PRINT PACK PUBLICATION PRIVATE LIMITED", "BREAKDOWN MAINTENANCE MEMO & POST MAINTENANCE HYGIENE RECORD", "F/MNT/05 (00/01.12.2021)"],
  "mnt-breakdown-clearance": ["GUJARAT PRINT PACK PUBLICATION LIMITED", "BREAKDOWN MAINTENANCE MEMO & HYGIENE CLEARANCE RECORD", "F/MNT/05 (00/01.12.2021)"],
  "mnt-breakdown-record": ["EQUIPMENTS BREAKDOWN MAINTENANCE RECORD", "F/MNT/06 (00/01.12.2021)"],
  "mnt-temporary-engineering": ["GUJARAT PRINT PACK PUBLICATION PRIVATE LIMITED", "TEMPORARY ENGINEERING LOG", "F/MNT/07 (00/01.12.2021)"],
  "mnt-new-equipment": ["NEW EQUIPMENT INSTALLATION REPORT", "F/MNT/08\n(00/01.12.2021)"],
  "mnt-glass-breakage": ["LIST OF GLASS ARTICLES & WEEKLY GLASS BREKAGE MONITORING RECORD", "F/MNT/09 (02 / 01.09.2025)"],
  "mnt-wooden-articles": ["GUJARAT PRINT PACK PUBLICATION PRIVATE LIMITED", "LIST OF WOODEN ARTICLES & WEEKLY WOODEN ARTICLE MONITORING RECORD", "Format No.:  F/MNT/10", "Rev No: 02", "Date: 15.12.2024", "Page No.: 1 Of 3"],
};

test("F/MNT/01 to F/MNT/10 are drawn as the owner's papers, F/MNT/11 as before", () => {
  assert.deepEqual(Object.keys(MNT_PAPERS_351).sort(), Object.keys(OWN_WORDS).sort());
  for (const id of Object.keys(OWN_WORDS)) {
    assert.equal(paperTableFor(id), paper(id), `${id} is looked up`);
    assert.equal(MNT_PAPER_TABLES[id], paper(id));
  }
  assert.equal(paperTableFor("mnt-lux-level"), MNT_PAPER_TABLES["mnt-lux-level"], "F/MNT/11's page (§316) stays");
  assert.equal(paperTableFor("mnt-lux-level")?.top, 15);
});

for (const [id, own] of Object.entries(OWN_WORDS)) {
  test(`${id}: the paper's own words, every box and column bound, printed on A4 at 8 pt or more, no colour`, () => {
    const f = paper(id);
    const layout = getLogSheetLayout(id)!;
    assert.ok(f.ownWords, "every printed word is the record's to type over");
    assert.ok(f.fillA4, "printed as large as the A4 page holds it");
    const words = wordsOf(f);
    for (const w of own) assert.ok(words.includes(w), `${id} prints ${JSON.stringify(w)}`);
    assert.ok(!words.some((w) => /PUBLICATIONS PVT LTD|SR\. NO\.|REV DATE|PAGE NO\. 1 of 1/.test(w)), "none of DCRS's own header words");
    assert.ok(paperTableFits(f, layout), "every box and column of the format has its place, or is named off the paper");
    // every layout key is bound, or named off the paper
    const cells = cellsOf(f);
    const inner = (c: PaperCell) => [...(c.over ?? []), ...(c.pick ?? [])];
    const boxes = new Set(cells.flatMap((c) => [c.box, c.sentence?.box, ...inner(c).map((o) => o.box)]).filter(Boolean));
    const cols = new Set(cells.flatMap((c) => [c.col, ...inner(c).map((o) => o.col)]).filter(Boolean));
    const off = new Set(f.offPaper ?? []);
    for (const k of [...layout.headerFields, ...(layout.footerFields ?? [])].map((x) => x.key)) assert.ok(boxes.has(k) || off.has(k), `${id}: box ${k}`);
    for (const k of layout.columns.map((c) => c.key)) assert.ok(cols.has(k) || off.has(k), `${id}: column ${k}`);
    // every row is the paper's width
    const width = widthOf(rowsOf(f)[0].cells);
    for (const r of rowsOf(f)) assert.ok(Math.abs(widthOf(r.cells) - width) < 0.05, `${id}: a row ${widthOf(r.cells)} mm against ${width}`);
    if (f.lines) assert.ok(Math.abs(widthOf(lineRow(f, 0)) - width) < 0.05, `${id}: its ruled lines are the paper's width`);
    // printed on A4: every letter at 8 pt or more, so the paper is printed as drawn (engine/paperReadable.ts)
    const print = paperTablePrint(f, true);
    assert.ok(!paperNeedsReading(f), `${id}: its letters print at 8 pt or more (scale ${print.scale})`);
    assert.ok(print.left >= 12, "12 mm from the page's edge or more");
    // a merge down over n rows has n - 1 places under it
    rowsOf(f).forEach((r, i) => {
      r.cells.forEach((c, ci) => {
        if ((c.rs ?? 1) < 2) return;
        for (let k = 1; k < c.rs!; k++) {
          const under = rowsOf(f)[i + k];
          let x = 0;
          const at = r.cells.slice(0, ci).reduce((a, d) => a + d.w, 0);
          const cell = under.cells.find((d) => {
            const here = Math.abs(x - at) < 0.05;
            x += d.w;
            return here;
          });
          assert.ok(cell?.skip, `${id}: row ${i + k} keeps the place of the merge above`);
        }
      });
    });
    // no colour on the paper (§282)
    assert.ok(!cells.some((c) => c.bg || c.bgIf), "no shading");
  });
}

test("F/MNT/02: the nineteen PM slots in the paper's bands, page 2 the findings of each visit, the slots' names the bands' words", () => {
  const f = paper("mnt-pm-record");
  const slots = (col: string) => cellsOf(f).filter((c) => c.col === col).map((c) => c.ln);
  // page 1: each slot's Date, Maintenance and Supervisor once; page 2: the visit's date written again beside its findings
  assert.deepEqual(slots("maintenance"), Array.from({ length: 19 }, (_, i) => i));
  assert.deepEqual(slots("findings"), Array.from({ length: 19 }, (_, i) => i));
  assert.deepEqual(slots("date"), [...Array.from({ length: 19 }, (_, i) => i), ...Array.from({ length: 19 }, (_, i) => i)]);
  assert.deepEqual(f.offPaper, ["parameter"]);
  const w = wordsOf(f);
  for (const t of ["Monthly Preventive maintenance", "Quarterly Preventive maintenance", "Six monthly Preventive maintenance", "Yearly Preventive maintenance", "Maint.", "S/visor", "Remarks / Any abnormal observation or findings during preventive maintenance", "Page No.: 2 Of 2", "Date of Preventive\nmaintenance"])
    assert.ok(w.includes(t), t);
  assert.equal(w.filter((t) => t === "Monthly Check points").length, 2, "the second list headed as the original prints it");
  assert.equal(rowsOf(f).filter((r) => r.pb).length, 1, "two pages");
});

test("F/MNT/03: one block for each machine, Plan over Actual, the months across; four pages headed alike", () => {
  const f = paper("mnt-yearly-pm-schedule");
  const lines = (col: string) => cellsOf(f).filter((c) => c.col === col).map((c) => c.ln);
  assert.deepEqual(lines("janPlan"), Array.from({ length: 42 }, (_, i) => i));
  assert.deepEqual(lines("decActual"), Array.from({ length: 42 }, (_, i) => i));
  assert.equal(lines("machineNo").length, 21, "the machine's number once, down its block");
  assert.equal(lines("frequency").length, 42);
  assert.equal(rowsOf(f).filter((r) => r.pb).length, 3, "four pages");
  assert.equal(wordsOf(f).filter((t) => t === "YEARLY PREVENTIVE MAINTENANCE SCHEDULE - 2023").length, 4, "every page heads with the title");
  assert.ok(!wordsOf(f).some((t) => /SR\. NO/i.test(t)));
});

test("F/MNT/04: the dates across the page for each shift, the back side a line for each day; Hindi and Gujarati as printed", () => {
  const f = paper("mnt-daily-health");
  const lines = (col: string) => cellsOf(f).filter((c) => c.col === col).map((c) => c.ln);
  assert.deepEqual(lines("dayCheck"), Array.from({ length: 31 }, (_, i) => i));
  assert.deepEqual(lines("nightOperator"), Array.from({ length: 31 }, (_, i) => i));
  assert.deepEqual(lines("backObservation"), Array.from({ length: 31 }, (_, i) => i));
  const w = wordsOf(f);
  for (const t of ["मशीन को साफ करे ।", "મશીન સાફ કરવું .", "DAY SHIFT", "NIGHT  SHIFT", "PTO", "Observation / Concerns reported", "Check Parameter"]) assert.ok(w.includes(t), t);
  assert.equal(w.filter((t) => t === "PTO").length, 2, "PTO under each shift");
  assert.deepEqual(f.offPaper, ["observations"]);
});

test("F/MNT/05 (1): two slips to the page, both this record's; F/MNT/05 (2): Yes / No to ring", () => {
  const memo = paper("mnt-breakdown-memo");
  assert.equal(wordsOf(memo).filter((t) => t === "BREAKDOWN MAINTENANCE MEMO & POST MAINTENANCE HYGIENE RECORD").length, 2);
  const boxes = cellsOf(memo).flatMap((c) => [c.box, ...(c.over ?? []).map((o) => o.box)]).filter(Boolean);
  assert.equal(boxes.filter((b) => b === "machineName").length, 2, "the lower slip is the record's copy");
  const slip = paper("mnt-breakdown-clearance");
  const picks = cellsOf(slip).flatMap((c) => c.pick ?? []);
  assert.deepEqual(picks.map((p) => [p.box, p.value, p.mark]), [["trainingOrPmChangeNeeded", "Yes", "ring"], ["trainingOrPmChangeNeeded", "No", "ring"]]);
});

test("F/MNT/06 and F/MNT/07: their ruled lines, the paper's own Sr.No. and no added one", () => {
  const record = paper("mnt-breakdown-record");
  assert.equal(record.lines?.count, 26);
  assert.equal(record.lines?.cells[0].num, "rows", "SR.NO. numbers the record's lines");
  assert.ok(wordsOf(record).includes("REASON For Breakdown"));
  const qty = record.lines!.cells.find((c) => c.col === "qty")!;
  assert.ok(qty.w >= 22, "QTY. as wide as the paper's");
  const log = paper("mnt-temporary-engineering");
  assert.equal(log.lines?.count, 9);
  const widest = log.lines!.cells.reduce((a, c) => (c.w > a.w ? c : a));
  assert.equal(widest.col, "description", "the description the widest column, as printed");
  assert.ok(!log.lines!.cells.some((c) => c.num), "no Sr. No.");
});

test("F/MNT/09 and F/MNT/10: the article lists and revision histories printed, Month & Year and Monitoring Weeks as table rows", () => {
  const glass = paper("mnt-glass-breakage");
  const gw = wordsOf(glass);
  for (const t of ["Nos. & Type of articles", "QC+Slitting", "Gallus Area + PPC", "TOTAL", "3015", "Revision history for update in addition / removal of Glass & Brittle plastic articles", "01.09.2025", "Month & Year", "Monitoring Weeks", "Week – 2"])
    assert.ok(gw.includes(t), t);
  const notes = cellsOf(glass).find((c) => c.t?.includes("CA / Incident record"))!;
  assert.equal(notes.t!.slice(notes.bs![0], notes.bs![1]), "CA / Incident record", "in bold, as printed");
  const wood = paper("mnt-wooden-articles");
  const ww = wordsOf(wood);
  for (const t of ["Location / Area of Wooden Articles", "Ink kitchen And Screen Room", "560", "Revision history for update in addition / removal of Wooden articles", "Page No.: 3 Of 3", "Monitoring Weeks"]) assert.ok(ww.includes(t), t);
  assert.equal(rowsOf(wood).filter((r) => r.pb).length, 2, "three pages");
  const pallets = cellsOf(wood).filter((c) => c.col === "parameter").map((c) => c.ln);
  assert.deepEqual(pallets, Array.from({ length: 17 }, (_, i) => i), "every line of the month's sheet once");
});
