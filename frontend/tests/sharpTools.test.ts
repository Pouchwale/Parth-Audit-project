// THE SHARP OBJECTS & BLADES SHEETS FILL THEMSELVES FROM THEIR MASTER DATA AND THEIR STOCK (REQUIREMENTS §254; the owner,
// 17-Nov-2026). Run: npm run test:unit -- sharpTools
import test from "node:test";
import type { LogSheetRow, RecordInstance } from "../src/types";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { bladeClosing, BLADE_STOCK, razorBladeRow, sharpIssueRows, sharpSheetUnwritten, shiftsOf, shiftWord, sharpPeople } from "../src/engine/sharpTools";

const ROOT = process.env.DCRS_REPO_ROOT ?? process.cwd();
const src = (f: string) => readFileSync(path.join(ROOT, "frontend", "src", ...f.split("/")), "utf8");

const person = (i: number, shift: string, department = "Pouching") => ({ id: `p${i}`, name: `Person ${i}`, department, shift });
const master = { sharpToolPeople: [...Array.from({ length: 20 }, (_, i) => person(i, "I")), ...Array.from({ length: 4 }, (_, i) => person(100 + i, "2", "Lamination"))] };

test("the shifts as the sheets write them; each shift's people counted", () => {
  assert.equal(shiftWord("2"), "II");
  assert.equal(shiftWord("iii"), "III");
  assert.deepEqual(shiftsOf(sharpPeople(master)), [{ shift: "I", count: 20 }, { shift: "II", count: 4 }]);
});

test("F/PRD/10: one line a day, shift I only (§258): issued and returned = shift I's people, never more than the note's stock (15 scissors, 20 cutters)", () => {
  const rows = sharpIssueRows("prd-sharp-object-issue", "2026-11-17", master)!;
  assert.equal(rows.length, 1, "the instruments are given in the first shift only");
  assert.deepEqual([rows[0].shift, rows[0].issuedScissor, rows[0].issuedManualCutter, rows[0].returnedScissor, rows[0].returnedManualCutter], ["I", 15, 20, 15, 20]);
  assert.equal(rows[0].date, "2026-11-17");
  assert.equal(rows[0].supervisorSign ?? "", "", "the supervisor signs");
  const few = { sharpToolPeople: [person(1, "I"), person(2, "I"), person(3, "II")] };
  assert.deepEqual([sharpIssueRows("prd-sharp-object-issue", "2026-11-17", few)![0].issuedScissor], [2], "shift II's people are not counted");
  assert.equal(sharpIssueRows("prd-sharp-object-issue", "2026-11-17", { sharpToolPeople: [] }), null, "nothing while the list is empty");
  assert.equal(sharpIssueRows("prd-sharp-object-issue", "2026-11-17", { sharpToolPeople: [person(1, "II")] }), null, "nothing with nobody in shift I");
});

test("F/PRD/23: the pouching section's shift I people only, up to 40 cutters", () => {
  const rows = sharpIssueRows("prd-pouching-cutter-issue", "2026-11-17", master)!;
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].shift, rows[0].qtyIssued, rows[0].qtyReturned], ["I", 20, 20]);
});

test("a worn-out item now and then, broken and as many new issued, so the stock stays the note's (§258)", () => {
  let cutters = 0;
  let scissors = 0;
  let pouching = 0;
  const days = 400;
  for (let d = 0; d < days; d++) {
    const iso = new Date(Date.UTC(2027, 0, 1 + d)).toISOString().slice(0, 10);
    const r = sharpIssueRows("prd-sharp-object-issue", iso, master)![0];
    assert.equal(r.issuedManualCutter, r.returnedManualCutter, "every one issued comes back");
    if (r.brokenCutterBlade === "Nil") assert.equal(r.newCutterBlade, "NA");
    else {
      assert.equal(r.newCutterBlade, r.brokenCutterBlade, "as many new as broken: the stock stays 20");
      assert.match(String(r.remarks), /Cutter blade worn out/);
      cutters++;
    }
    if (r.brokenScissor !== "Nil") {
      assert.equal(r.newScissor, r.brokenScissor);
      scissors++;
    }
    const p = sharpIssueRows("prd-pouching-cutter-issue", iso, master)![0];
    if (p.brokenQty !== "Nil") {
      assert.equal(p.newQtyIssued, p.brokenQty);
      pouching++;
    } else assert.equal(p.newQtyIssued, "NA");
    assert.deepEqual(sharpIssueRows("prd-sharp-object-issue", iso, master)![0].brokenCutterBlade, r.brokenCutterBlade, "the same each time");
  }
  assert.ok(cutters > days * 0.05 && cutters < days * 0.16, `cutter blades worn out on ${cutters} of ${days} days`);
  assert.ok(scissors >= 1 && scissors < days * 0.06, `scissors on ${scissors} days`);
  assert.ok(pouching > days * 0.05 && pouching < days * 0.16, `F/PRD/23 on ${pouching} days`);
});

test("a sheet still the assistant's own is worked out again when its figures change; a person's line never", () => {
  const prep = src("engine/assistantPrepare.ts");
  assert.match(prep, /const own = sharpSheetAssistantOwn\(record\);/);
  assert.match(prep, /if \(!due \|\| \(written && !own\)\) \{/);
});

test("F/PRD/22 and 24: the day's blades from the day before; always the note's 20, the machines' included; low stock renewed", () => {
  for (const id of ["prd-pouching-blade", "prd-slitting-blade"]) {
    const plan = BLADE_STOCK[id];
    let before: { ok: number; discarded: number } | null = null;
    for (let d = 1; d <= 60; d++) {
      const row: LogSheetRow = razorBladeRow(id, `2026-12-${String((d % 28) + 1).padStart(2, "0")}-${d}`.slice(0, 10), before)!;
      const opening: number = Number(row.openingStock);
      assert.equal(opening, before ? before.ok : plan.start, "opening = yesterday's closing");
      assert.equal(Number(row.totalStock), opening + Number(row.newIssuedFromStore));
      assert.equal(Number(row.closingOkStock), Number(row.totalStock) - Number(row.replacedNos));
      assert.ok(Number(row.replacedNos) >= 1 && Number(row.replacedNos) <= plan.most);
      assert.equal(Number(row.closingOkStock) + Number(row.closingDiscarded) + plan.onMachine, plan.maintained, `${id} day ${d}: always ${plan.maintained}`);
      assert.ok(Number(row.closingOkStock) >= 0);
      before = bladeClosing({ header: {}, rows: [row] });
    }
  }
});

test("a sheet a person has written on is never filled over", () => {
  assert.ok(sharpSheetUnwritten("prd-pouching-blade", { header: {}, rows: [{ id: "r", date: "2026-11-17", openingStock: 12 }] }), "only the carried opening stock: still unwritten");
  assert.ok(!sharpSheetUnwritten("prd-pouching-blade", { header: {}, rows: [{ id: "r", replacedNos: 2 }] }));
  assert.ok(!sharpSheetUnwritten("prd-sharp-object-issue", { header: {}, rows: [{ id: "r", issuedScissor: 3 }] }));
});

test("two shifts only, shown I and II (the owner, 18-Nov-2026)", () => {
  const page = src("pages/SharpToolMasterPage.tsx");
  assert.match(page, /const SHIFTS = \["I", "II"\];/);
  assert.match(page, /\{shiftNo\(s\)\}/);
  assert.match(page, /shiftWord\(s\) === "II" \? "II" : "I"/, "shown as Roman numerals, I and II");
  assert.deepEqual(shiftsOf(sharpPeople({ sharpToolPeople: [person(1, "III"), person(2, "2")] })), [{ shift: "I", count: 1 }, { shift: "II", count: 1 }]);
});

test("wired: the page in the Production menu, the daily fill in the prepare", () => {
  assert.match(src("components/layout/Sidebar.tsx"), /\{ to: "\/production\/sharp-master", labelKey: "nav\.prdSharpMaster", icon: FiDatabase \}/);
  assert.match(src("engine/assistantPrepare.ts"), /\.\.\.fillSharpToolsDue\(referenceISO\)/);
  assert.match(src("App.tsx"), /rest\[0\] === "sharp-master" \? <SharpToolMasterPage \/>/);
});

// ---------------------------------------------------------------------------
// ONE SHEET A MONTH, A LINE FOR EVERY DATE (the owner, 20-Nov-2026, REQUIREMENTS §259)

test("a line for every date of the month, 1 to 28, 29, 30 or 31, a line already dated kept", async () => {
  const { monthDays, withMonthDays } = await import("../src/engine/sharpTools");
  assert.equal(monthDays("2026-11").length, 30);
  assert.equal(monthDays("2026-12").length, 31);
  assert.equal(monthDays("2027-02").length, 28);
  assert.equal(monthDays("2028-02").length, 29);
  const kept = { id: "mine", date: "2026-11-17", shift: "I", issuedScissor: 4 };
  const sheet = withMonthDays("prd-sharp-object-issue", { header: {}, rows: [{ id: "blank", date: "", shift: "" }, kept] }, "2026-11")!;
  assert.equal(sheet.rows.length, 30, "the day sheet's blank line goes, a line for each of November's 30 days");
  assert.deepEqual(sheet.rows.map((r) => r.date), monthDays("2026-11"));
  assert.equal(sheet.rows[16], kept, "17-11's line as written");
  assert.equal(withMonthDays("prd-sharp-object-issue", sheet, "2026-11"), null, "already so: nothing to do");
});

test("the month's sheet: each day's line filled on its day, a closed day so written, the days ahead blank; a person's line kept", async () => {
  const { ensureSeeded: docsSeeded, documentRepository } = await import("../src/data/repositories/documentRepository");
  const { ensureSeeded: masterSeeded, masterRepository } = await import("../src/data/repositories/masterRepository");
  const { recordRepository } = await import("../src/data/repositories/recordRepository");
  const { fillSharpToolsDue } = await import("../src/engine/assistantPrepare");
  const { periodKeyFor } = await import("../src/engine/recordGenerator");
  const { isCompanyHoliday } = await import("../src/engine/holidays");
  const { sharpDaySheetsFolded } = await import("../src/data/sharpMonthMigration");
  docsSeeded();
  masterSeeded();
  masterRepository.update({ ...masterRepository.get(), sharpToolPeople: [person(1, "I"), person(2, "I"), person(3, "I"), person(4, "II")] });
  const now = new Date().toISOString();
  const shell = (documentId: string, dueDate: string, extra: Partial<RecordInstance> = {}): RecordInstance => ({
    id: `t-${documentId}-${dueDate}`,
    documentId,
    periodKey: periodKeyFor(documentRepository.getByIdUnscoped(documentId)!, dueDate),
    dueDate,
    status: "Due",
    isDemo: false,
    createdAt: now,
    updatedAt: now,
    data: { header: {}, rows: [{ id: "r0", date: "", shift: "" }] },
    ...extra,
  } as RecordInstance);
  // November's sheet (its key the 30th's, held by a day's blank sheet from before), a day's sheet the assistant filled
  // (17-11, to go), and a day's sheet a person wrote on (18-11, kept, its line laid on the month's).
  const mine = { id: "p", date: "2026-11-18", shift: "II", issuedScissor: 6, issuedManualCutter: 6, returnedScissor: 6, returnedManualCutter: 6, brokenScissor: "Nil", brokenCutterBlade: "Nil", newScissor: "NA", newCutterBlade: "NA", supervisorSign: "Ramesh", remarks: "" };
  recordRepository.upsertMany([
    shell("prd-sharp-object-issue", "2026-11-30"),
    shell("prd-sharp-object-issue", "2026-11-17", { status: "In Progress", prepared: { at: now, by: "assistant", notes: [], knownPartsOnly: true } }),
    shell("prd-sharp-object-issue", "2026-11-18", { status: "Submitted", submittedAt: now, data: { header: {}, rows: [mine] } }),
    shell("prd-pouching-blade", "2026-11-30"),
  ]);
  assert.equal(sharpDaySheetsFolded(), 1, "the assistant's day sheet of 17-11 goes; the person's and the month's stay");
  fillSharpToolsDue("2026-11-20");
  const month = recordRepository.getById("t-prd-sharp-object-issue-2026-11-30")!;
  const rows = (month.data as { rows: LogSheetRow[] }).rows;
  assert.equal(rows.length, 30);
  assert.equal(month.status, "In Progress");
  for (const r of rows) {
    const d = String(r.date);
    if (d > "2026-11-20") assert.ok(r.issuedScissor === null || r.issuedScissor === "", `${d}: blank until its day`);
    else if (d === "2026-11-18") assert.equal(r.supervisorSign, "Ramesh", "the person's line laid on its date");
    else if (isCompanyHoliday(d, masterRepository.get())) assert.equal(Number(r.issuedScissor), 0, `${d}: closed, nothing issued`);
    else {
      assert.equal(r.shift, "I");
      assert.equal(Number(r.issuedScissor), 3, `${d}: shift I's three people`);
    }
  }
  assert.ok(rows.some((r) => String(r.remarks).includes("Weekly off")), "the weekly off named");
  // Run again: nothing to do.
  assert.equal(fillSharpToolsDue("2026-11-20").length, 0);
  // The blade sheet: each line opens with the line before's closing, always the note's 20.
  const blade = (recordRepository.getById("t-prd-pouching-blade-2026-11-30")!.data as { rows: LogSheetRow[] }).rows;
  const plan = BLADE_STOCK["prd-pouching-blade"];
  let before: number | null = null;
  for (const r of blade.filter((x) => String(x.date) <= "2026-11-20")) {
    if (before !== null) assert.equal(Number(r.openingStock), before, `${r.date}: opens with the closing before`);
    assert.equal(Number(r.closingOkStock) + Number(r.closingDiscarded) + plan.onMachine, plan.maintained, `${r.date}: always 20`);
    before = Number(r.closingOkStock);
  }
  assert.equal(blade.find((x) => x.date === "2026-11-21")!.openingStock, null, "21-11 blank");
});

test("the four are a sheet a month from November 2026, the Shift chosen I or II", async () => {
  const { SEED_DOCUMENTS } = await import("../src/data/seed/documentDefinitions");
  const { getLogSheetLayout } = await import("../src/data/seed/logSheetLayouts");
  for (const id of ["prd-sharp-object-issue", "prd-pouching-blade", "prd-pouching-cutter-issue", "prd-slitting-blade"]) {
    const d = SEED_DOCUMENTS.find((x) => x.id === id)!;
    assert.deepEqual(d.schedule, { type: "monthly", dayOfMonth: 31 }, id);
    assert.equal(d.frequency, "Monthly");
    assert.equal(d.scheduleSince, "2026-11-01");
    const shift = getLogSheetLayout(id)!.columns.find((c) => c.key === "shift" || c.key === "replacedShift")!;
    assert.equal(shift.type, "select", id);
    assert.deepEqual(shift.options, ["I", "II"]);
  }
  assert.match(src("data/bootstrap.ts"), /sharpDaySheetsFolded\(\);\n  removeOffScheduleShells\(\);/);
});

test("the month prints on one A4 page: the print fits it however tall, the Word file sets its lines close", async () => {
  const { getLogSheetLayout } = await import("../src/data/seed/logSheetLayouts");
  for (const id of ["prd-sharp-object-issue", "prd-pouching-blade", "prd-pouching-cutter-issue", "prd-slitting-blade"]) assert.equal(getLogSheetLayout(id)!.onePage, true, id);
  assert.match(src("components/records/LogSheetRecordView.tsx"), /data-one-page=\{layout\.onePage \? "" : undefined\}/);
  assert.match(src("utils/print.ts"), /if \(tallest <= FIT_DRAWN_TO \|\| \(!drawn && !onePage && tallest > FIT_OWN_OVER\)\) return;/);
  const { buildDocx } = await import("../src/utils/docx");
  const { unzipSync, strFromU8 } = await import("fflate").catch(() => ({ unzipSync: null, strFromU8: null }) as never);
  const rows = [["Sr. No.", "Date", "Shift"], ...Array.from({ length: 31 }, (_, i) => [String(i + 1), `${String(i + 1).padStart(2, "0")}-12-2026`, ""])];
  const close = buildDocx([{ type: "table", rows, headerRows: 1 }], { onePage: true });
  const plain = buildDocx([{ type: "table", rows, headerRows: 1 }]);
  const text = (b: Uint8Array) => (unzipSync ? strFromU8(unzipSync(b)["word/document.xml"]) : Buffer.from(b).toString("latin1"));
  assert.match(text(close), /<w:noWrap\/>/, "a date kept on one line");
  assert.match(text(close), /w:trHeight w:val="240"/);
  assert.match(text(close), /w:top="567"/, "10 mm margins");
  assert.doesNotMatch(text(plain), /<w:noWrap\/>|w:trHeight w:val="240"/, "every other Word file as before");
});
