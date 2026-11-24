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
  // 20 people in shift I, one or two away some days: never more than the note's 15 scissors and 20 cutters; all returned.
  assert.equal(rows[0].shift, "I");
  assert.equal(rows[0].issuedScissor, 15);
  assert.ok(Number(rows[0].issuedManualCutter) >= 16 && Number(rows[0].issuedManualCutter) <= 20, String(rows[0].issuedManualCutter));
  assert.deepEqual([rows[0].returnedScissor, rows[0].returnedManualCutter], [rows[0].issuedScissor, rows[0].issuedManualCutter]);
  assert.equal(rows[0].date, "2026-11-17");
  assert.equal(rows[0].supervisorSign ?? "", "", "the supervisor signs");
  const few = { sharpToolPeople: [person(1, "I"), person(2, "I"), person(3, "II")] };
  assert.ok(Number(sharpIssueRows("prd-sharp-object-issue", "2026-11-17", few)![0].issuedScissor) <= 2, "shift II's people are not counted");
  // Nobody named in shift I (the plant's list, 20-Nov-2026: four rows, no names): the paper's usual count, within the note (§260).
  for (const people of [[], [person(1, "II")], [{ id: "x", name: "", department: "", shift: "I" }]]) {
    const usual = sharpIssueRows("prd-sharp-object-issue", "2026-11-17", { sharpToolPeople: people })![0];
    assert.equal(usual.shift, "I");
    const [sc, cu] = [Number(usual.issuedScissor), Number(usual.issuedManualCutter)];
    assert.ok(cu >= 10 && cu <= 13 && sc <= cu && sc >= cu - 1, `about F/PRD/10's own 12 / 13: ${sc} / ${cu}`);
    assert.deepEqual([usual.returnedScissor, usual.returnedManualCutter], [sc, cu]);
  }
  const p23 = Number(sharpIssueRows("prd-pouching-cutter-issue", "2026-11-17", { sharpToolPeople: [] })![0].qtyIssued);
  assert.ok(p23 >= 10 && p23 <= 13);
});

test("F/PRD/23: the pouching section's shift I people only, up to 40 cutters", () => {
  const rows = sharpIssueRows("prd-pouching-cutter-issue", "2026-11-17", master)!;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].shift, "I");
  assert.ok(Number(rows[0].qtyIssued) >= 16 && Number(rows[0].qtyIssued) <= 20);
  assert.equal(rows[0].qtyReturned, rows[0].qtyIssued);
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
    if (r.brokenCutterBlade === "-") assert.equal(r.newCutterBlade, "-");
    else {
      assert.equal(r.newCutterBlade, r.brokenCutterBlade, "as many new as broken: the stock stays 20");
      assert.equal(r.remarks, "", "no remark of the assistant's (§264)");
      cutters++;
    }
    if (r.brokenScissor !== "-") {
      assert.equal(r.newScissor, r.brokenScissor);
      scissors++;
    }
    const p = sharpIssueRows("prd-pouching-cutter-issue", iso, master)![0];
    if (p.brokenQty !== "-") {
      assert.equal(p.newQtyIssued, p.brokenQty);
      pouching++;
    } else assert.equal(p.newQtyIssued, "-");
    assert.deepEqual(sharpIssueRows("prd-sharp-object-issue", iso, master)![0].brokenCutterBlade, r.brokenCutterBlade, "the same each time");
  }
  assert.ok(cutters > days * 0.05 && cutters < days * 0.16, `cutter blades worn out on ${cutters} of ${days} days`);
  assert.ok(scissors >= 1 && scissors < days * 0.06, `scissors on ${scissors} days`);
  assert.ok(pouching > days * 0.05 && pouching < days * 0.16, `F/PRD/23 on ${pouching} days`);
});

test("a sheet still the assistant's own is worked out again when its figures change; a person's line never", () => {
  const prep = src("engine/assistantPrepare.ts");
  assert.match(prep, /const own = sharpSheetAssistantOwn\(record\);/);
  assert.match(prep, /if \(!due \|\| \(written && !mine\)\) \{/);
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

test("F/PRD/12 (§310): always exactly 30 NOS with the machines' 8, and a pattern of its own that never settles", () => {
  const id = "prd-label-sleeve-blade";
  const plan = BLADE_STOCK[id];
  assert.equal(plan.maintained, 30);
  let before: { ok: number; discarded: number } | null = null;
  const visits: number[] = [];
  const parts: boolean[] = [];
  const months = new Map<string, string>();
  for (let d = new Date(Date.UTC(2026, 10, 1)); d < new Date(Date.UTC(2028, 0, 1)); d.setUTCDate(d.getUTCDate() + 1)) {
    const date = d.toISOString().slice(0, 10);
    for (const shift of ["I", "II"] as const) {
      const row: LogSheetRow = razorBladeRow(id, date, before, shift)!;
      const [opening, issued, total, replaced, ok, discarded, returned] = ["openingStock", "newIssuedFromStore", "totalStock", "replacedNos", "closingOkStock", "closingDiscarded", "discardedReturned"].map((k) => Number(row[k]));
      assert.equal(opening, before ? before.ok : plan.start, `${date} ${shift}: opening = the line before's closing`);
      assert.equal(total, opening + issued);
      assert.equal(ok, total - replaced);
      assert.equal(discarded, (before ? before.discarded : 0) - returned + replaced);
      assert.equal(ok + discarded + plan.onMachine, 30, `${date} ${shift}: ${ok} OK + ${discarded} discarded + 8 = 30`);
      assert.ok(ok >= 0 && discarded >= 0 && returned >= 0 && issued >= 0);
      if (shift === "II") assert.ok(replaced === 0 && issued === 0 && returned === 0, `${date}: nothing in shift II`);
      else assert.ok(replaced >= 1 && replaced <= 3, `${date}: one to three blades put on`);
      if (issued > 0) {
        visits.push(opening);
        parts.push(returned < (before?.discarded ?? 0));
      }
      if (shift === "I") months.set(date.slice(0, 7), (months.get(date.slice(0, 7)) ?? "") + replaced);
      before = bladeClosing({ header: {}, rows: [row] });
    }
  }
  // The store visit on no fixed stock, sometimes only part of the discarded back, and no two months alike.
  assert.ok(new Set(visits).size >= 5, `visits at OK stock ${[...new Set(visits)].join(", ")}`);
  assert.ok(parts.some((p) => p) && parts.some((p) => !p), "all of the discarded back, and only part");
  const gaps = visits.length;
  assert.ok(gaps >= 20, `${gaps} store visits in 14 months`);
  assert.equal(new Set(months.values()).size, months.size, "every month's pattern its own");
  // A person's line that left the stock off 30: the next store visit brings it back to exactly 30.
  for (const stock of [{ ok: 5, discarded: 9 }, { ok: 20, discarded: 10 }, { ok: 2, discarded: 0 }]) {
    const odd = razorBladeRow(id, "2026-12-03", stock, "I")!;
    assert.equal(Number(odd.closingOkStock) + Number(odd.closingDiscarded) + 8, 30, JSON.stringify(stock));
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
  assert.equal(sheet.rows.length, 60, "the day sheet's blank line goes; two lines, shift I and II, for each of November's 30 days (§263)");
  assert.deepEqual(sheet.rows.map((r) => r.date), monthDays("2026-11").flatMap((d) => [d, d]));
  assert.deepEqual(sheet.rows.slice(0, 4).map((r) => r.shift), ["I", "II", "I", "II"], "the shift set on each");
  assert.equal(sheet.rows[32], kept, "17-11's shift I line as written");
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
  assert.equal(rows.length, 60, "two lines a date (§263)");
  assert.equal(month.status, "In Progress");
  for (const [i, r] of rows.entries()) {
    const d = String(r.date);
    assert.equal(r.shift, i % 2 === 0 ? "I" : "II", `${d}: shift I then II`);
    if (d > "2026-11-20") assert.ok(r.issuedScissor === null || r.issuedScissor === "", `${d}: blank until its day`);
    else if (d === "2026-11-18" && r.shift === "II") assert.equal(r.supervisorSign, "Ramesh", "the person's shift II line laid on its date and shift");
    else if (isCompanyHoliday(d, masterRepository.get())) assert.equal(Number(r.issuedScissor), 0, `${d}: closed, nothing issued`);
    else if (r.shift === "I") assert.ok(Number(r.issuedScissor) >= 1 && Number(r.issuedScissor) <= 3, `${d}: shift I's three people, less any away`);
    else assert.deepEqual([Number(r.issuedScissor), Number(r.issuedManualCutter), r.brokenScissor, r.newCutterBlade], [0, 0, "-", "-"], `${d}: nothing issued in shift II (§265)`);
  }
  assert.ok(rows.every((r) => (r.supervisorSign === "Ramesh" ? true : String(r.remarks ?? "") === "")), "no remark of the assistant's, a closed day's neither (§264)");
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
  assert.match(src("data/bootstrap.ts"), /sharpDailyFrequencyLifted\(\);\r?\n  sharpDaySheetsFolded\(\);[\s\S]*?sharpTypedLinesRestored\(\);\r?\n  removeOffScheduleShells\(\);/);
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

test("the plant's case (20-Nov-2026): the Daily set on 18-Nov lifted; a typed blade line laid on its date and its day sheet folded", async () => {
  const { ensureSeeded: docsSeeded, documentRepository } = await import("../src/data/repositories/documentRepository");
  const { ensureSeeded: masterSeeded, masterRepository } = await import("../src/data/repositories/masterRepository");
  const { recordRepository } = await import("../src/data/repositories/recordRepository");
  const { fillSharpToolsDue } = await import("../src/engine/assistantPrepare");
  const { periodKeyFor } = await import("../src/engine/recordGenerator");
  const { sharpDailyFrequencyLifted, sharpDaySheetsFolded } = await import("../src/data/sharpMonthMigration");
  docsSeeded();
  masterSeeded();
  const id = "prd-slitting-blade";
  masterRepository.update({
    scheduleOverrides: {
      ...(masterRepository.get().scheduleOverrides ?? {}),
      [id]: { schedule: { type: "daily" }, frequency: "Daily", since: "2026-11-18", by: "Super Admin" },
      "prd-alc-production": { schedule: { type: "as-required" }, frequency: "As Required", since: "2026-11-17", by: "Super Admin" },
    },
  });
  assert.equal(documentRepository.getByIdUnscoped(id)!.schedule.type, "daily", "the Daily set on 18-Nov wins until lifted");
  assert.equal(sharpDailyFrequencyLifted(), 1);
  assert.equal(documentRepository.getByIdUnscoped(id)!.schedule.type, "monthly");
  assert.ok(masterRepository.get().scheduleOverrides!["prd-alc-production"], "another document's frequency stays");
  const doc = documentRepository.getByIdUnscoped(id)!;
  const now = new Date().toISOString();
  const at = (dueDate: string, extra: Partial<RecordInstance>): RecordInstance => ({ id: `fold-${dueDate}`, documentId: id, periodKey: periodKeyFor(doc, dueDate), dueDate, status: "Due", isDemo: false, createdAt: now, updatedAt: now, data: { header: {}, rows: [{ id: "x", date: "", shift: "" }] }, ...extra } as RecordInstance);
  const typed = { id: "t", date: "2026-11-18", openingStock: 9, newIssuedFromStore: 0, totalStock: 9, replacedShift: "1", replacedNos: 2, closingOkStock: 7, closingDiscarded: 8, discardedReturned: 0 };
  recordRepository.upsertMany([
    at("2026-11-30", {}),
    at("2026-11-18", { status: "In Progress", updatedAt: "2026-11-18T04:14:00.000Z", history: [{ id: "h", at: "2026-11-18T04:14:00.000Z", by: "Super Admin", action: "edited" }], data: { header: {}, rows: [typed] } }),
    at("2026-11-16", { status: "In Progress", updatedAt: "2026-11-17T12:00:00.000Z", history: [{ id: "h", at: "", by: "Super Admin", action: "edited" }] }),
    at("2026-11-25", {}),
  ]);
  sharpDaySheetsFolded();
  assert.ok(!recordRepository.getById("fold-2026-11-16"), "opened by a person and left blank: folded");
  assert.ok(!recordRepository.getById("fold-2026-11-25"), "a blank sheet ahead: folded");
  assert.ok(recordRepository.getById("fold-2026-11-18"), "a typed line stays until the month holds it");
  fillSharpToolsDue("2026-11-20");
  const line = (recordRepository.getById("fold-2026-11-30")!.data as { rows: LogSheetRow[] }).rows.find((r) => r.date === "2026-11-18")!;
  assert.equal(Number(line.closingOkStock), 7, "the typed line on its date");
  assert.equal(line.replacedShift, "I", "its shift written I");
  const lines = (recordRepository.getById("fold-2026-11-30")!.data as { rows: LogSheetRow[] }).rows;
  const after = lines[lines.indexOf(line) + 1];
  assert.deepEqual([after.date, after.replacedShift, Number(after.openingStock)], ["2026-11-18", "II", 7], "the shift II line after it opens with it");
  assert.equal(Number(lines.find((r) => r.date === "2026-11-19")!.openingStock), Number(after.closingOkStock), "and the next day with shift II's closing");
  const prev = lines[lines.indexOf(line) - 1];
  assert.deepEqual([prev.date, prev.replacedShift, Number(prev.closingOkStock)], ["2026-11-17", "II", 9], "the line before closes with the 9 the typed line opens with");
  for (let i = 1; i < lines.length && String(lines[i].date) <= "2026-11-20"; i++) assert.equal(Number(lines[i].openingStock), Number(lines[i - 1].closingOkStock), `${lines[i].date} ${lines[i].replacedShift}: unbroken stock`);
  sharpDaySheetsFolded();
  assert.ok(!recordRepository.getById("fold-2026-11-18"), "...then folded");
});

test("a month as a real one reads (§261): the counts move with who is at work, within the note; the same on every run", async () => {
  const { sharpIssueRows: rowsOf, monthDays, SHARP_STOCK } = await import("../src/engine/sharpTools");
  for (const [id, people] of [["prd-sharp-object-issue", []], ["prd-pouching-cutter-issue", []], ["prd-sharp-object-issue", Array.from({ length: 9 }, (_, i) => person(i, "I"))]] as const) {
    const days = monthDays("2026-12").map((d) => rowsOf(id, d, { sharpToolPeople: [...people] })![0]);
    const cut = days.map((r) => Number(r.issuedManualCutter ?? r.qtyIssued));
    assert.ok(new Set(cut).size >= 3, `${id}: the counts move from day to day (${cut.join(" ")})`);
    const stock = SHARP_STOCK[id];
    for (const r of days) {
      assert.ok(Number(r.issuedManualCutter ?? r.qtyIssued) <= stock.cutter);
      if (r.issuedScissor !== undefined) assert.ok(Number(r.issuedScissor) <= stock.scissor!);
      assert.equal(r.returnedManualCutter ?? r.qtyReturned, r.issuedManualCutter ?? r.qtyIssued, "every one returned");
    }
    assert.ok(cut.filter((c) => c === Math.max(...cut)).length >= 8, `${id}: most days everybody is in`);
    assert.deepEqual(monthDays("2026-12").map((d) => rowsOf(id, d, { sharpToolPeople: [...people] })![0].issuedManualCutter ?? 0), days.map((r) => r.issuedManualCutter ?? 0), "the same figures every run");
  }
});

test("a line the assistant wrote carries its mark; changed by a person it is the person's (§261)", async () => {
  const { assistantsLine, lineFingerprint, ASSISTANT_LINE, sharpSteadyLine } = await import("../src/engine/sharpTools");
  const line = { ...sharpIssueRows("prd-pouching-cutter-issue", "2026-12-02", { sharpToolPeople: [] })![0] };
  line[ASSISTANT_LINE] = lineFingerprint("prd-pouching-cutter-issue", line);
  assert.ok(assistantsLine("prd-pouching-cutter-issue", line));
  assert.ok(!assistantsLine("prd-pouching-cutter-issue", { ...line, qtyIssued: 9 }), "a figure typed over");
  assert.ok(!assistantsLine("prd-pouching-cutter-issue", { ...line, supervisorSign: "Ramesh" }), "signed");
  assert.equal(sharpSteadyLine("prd-sharp-object-issue", "2026-11-05")!.issuedScissor, 12, "the 20-Nov fill, known again");
  assert.match(src("engine/assistantPrepare.ts"), /if \(!persons\) rows\[k\]\[ASSISTANT_LINE\] = lineFingerprint\(id, rows\[k\]\);/);
});

test("nothing broken, nothing new: a dash, not Nil or NA; every value printed in the middle of its box (§262)", async () => {
  const { NONE } = await import("../src/engine/sharpTools");
  assert.equal(NONE, "-");
  for (const d of ["2026-12-02", "2026-12-03", "2026-12-04"]) {
    for (const id of ["prd-sharp-object-issue", "prd-pouching-cutter-issue"]) {
      const r = sharpIssueRows(id, d, { sharpToolPeople: [] })![0];
      for (const v of Object.values(r)) assert.ok(v !== "Nil" && v !== "NA", `${id} ${d}: ${v}`);
    }
  }
  assert.doesNotMatch(src("engine/sharpTools.ts"), /"Nil"|"NA"/);
  assert.match(src("styles.css"), /\.paper-sheet\[data-one-page\] table\.log-sheet :is\(th, td\) \{ text-align: center; \}/);
  assert.match(src("utils/docx.ts"), /<w:jc w:val="center"\/>' : '<w:spacing w:before="20"/);
});

test("two fixed shifts a day (§263): shift II a smaller crew of about four, each shift within the note; the month on two pages", async () => {
  const { sharpIssueCounts, razorBladeRow: blade, monthDays } = await import("../src/engine/sharpTools");
  const { getLogSheetLayout } = await import("../src/data/seed/logSheetLayouts");
  // Nothing issued in shift II, on any of the four (§265).
  const two = monthDays("2026-12").map((d) => sharpIssueCounts("prd-sharp-object-issue", { sharpToolPeople: [] }, d, "II")!.cutters);
  assert.ok(two.every((n) => n === 0), two.join(" "));
  const one = monthDays("2026-12").map((d) => sharpIssueCounts("prd-sharp-object-issue", { sharpToolPeople: [] }, d, "I")!.cutters);
  assert.ok(one.every((n) => n >= 10), "shift I issues");
  // The blades through both shifts: each line opens with the one before, always the note's 20.
  const plan = BLADE_STOCK["prd-pouching-blade"];
  let before: { ok: number; discarded: number } | null = null;
  for (const d of monthDays("2026-12")) {
    for (const s of ["I", "II"] as const) {
      const r = blade("prd-pouching-blade", d, before, s)!;
      if (before) assert.equal(Number(r.openingStock), before.ok);
      assert.equal(r.replacedShift, s);
      if (s === "II") assert.deepEqual([Number(r.replacedNos), Number(r.newIssuedFromStore), Number(r.discardedReturned), Number(r.closingOkStock)], [0, 0, 0, Number(r.openingStock)], `${d} II: no blade in shift II`);
      assert.equal(Number(r.closingOkStock) + Number(r.closingDiscarded) + plan.onMachine, plan.maintained);
      before = bladeClosing({ header: {}, rows: [r] });
    }
  }
  for (const id of ["prd-sharp-object-issue", "prd-pouching-blade", "prd-pouching-cutter-issue", "prd-slitting-blade"]) assert.equal(getLogSheetLayout(id)!.printPages, 2, id);
  assert.match(src("styles.css"), /tr\[data-page-start\] \{ break-before: page;/);
});

test("a line laid from a person's day sheet stays, even on a sheet the assistant filled; the plant's typed lines put back (§263)", async () => {
  const { ensureSeeded: docsSeeded, documentRepository } = await import("../src/data/repositories/documentRepository");
  const { ensureSeeded: masterSeeded } = await import("../src/data/repositories/masterRepository");
  const { recordRepository } = await import("../src/data/repositories/recordRepository");
  const { fillSharpToolsDue } = await import("../src/engine/assistantPrepare");
  const { periodKeyFor } = await import("../src/engine/recordGenerator");
  const { withMonthDays, ASSISTANT_LINE, lineFingerprint } = await import("../src/engine/sharpTools");
  const { sharpTypedLinesRestored } = await import("../src/data/sharpMonthMigration");
  docsSeeded();
  masterSeeded();
  const id = "prd-pouching-blade";
  for (const r of recordRepository.queryUnscoped({ documentId: id, isDemo: false })) recordRepository.removeIds([r.id]);
  const doc = documentRepository.getByIdUnscoped(id)!;
  const now = new Date().toISOString();
  const month = withMonthDays(id, { header: {}, rows: [] }, "2026-11")!;
  // The sheet as the plant had it: the assistant's own (prepared.at = updatedAt), its 18-11 shift I line written over.
  const i18 = month.rows.findIndex((r) => r.date === "2026-11-18");
  const wrong = { ...month.rows[i18], openingStock: 11, newIssuedFromStore: 0, totalStock: 11, replacedShift: "I", replacedNos: 2, closingOkStock: 9, closingDiscarded: 3, discardedReturned: 0 };
  wrong[ASSISTANT_LINE] = lineFingerprint(id, wrong);
  month.rows[i18] = wrong;
  recordRepository.upsertMany([{ id: "restore-nov", documentId: id, periodKey: periodKeyFor(doc, "2026-11-30"), dueDate: "2026-11-30", status: "In Progress", isDemo: false, createdAt: now, updatedAt: now, prepared: { at: now, by: "assistant", notes: [], knownPartsOnly: true }, data: month } as RecordInstance]);
  assert.ok(sharpTypedLinesRestored() >= 1);
  const typed = () => (recordRepository.getById("restore-nov")!.data as { rows: LogSheetRow[] }).rows.find((r) => r.date === "2026-11-18" && r.replacedShift === "I")!;
  assert.deepEqual([Number(typed().openingStock), Number(typed().closingOkStock), Number(typed().closingDiscarded)], [7, 5, 7], "put back as typed");
  assert.equal(sharpTypedLinesRestored(), 0, "run again: nothing to do");
  fillSharpToolsDue("2026-11-20");
  assert.deepEqual([Number(typed().openingStock), Number(typed().closingOkStock)], [7, 5], "the fill leaves the typed line, the sheet the assistant's or not");
  const rows = (recordRepository.getById("restore-nov")!.data as { rows: LogSheetRow[] }).rows;
  const at = rows.indexOf(typed());
  assert.equal(Number(rows[at - 1].closingOkStock), 7, "the line before closes with what the typed line opens with");
  assert.equal(Number(rows[at + 1].openingStock), 5, "the line after opens with its closing");
});

test("the line before a typed one looks past a weekly off: the stock runs unbroken into it (§263)", async () => {
  const { ensureSeeded: docsSeeded, documentRepository } = await import("../src/data/repositories/documentRepository");
  const { ensureSeeded: masterSeeded, masterRepository } = await import("../src/data/repositories/masterRepository");
  const { recordRepository } = await import("../src/data/repositories/recordRepository");
  const { fillSharpToolsDue } = await import("../src/engine/assistantPrepare");
  const { periodKeyFor } = await import("../src/engine/recordGenerator");
  const { isCompanyHoliday } = await import("../src/engine/holidays");
  const { withMonthDays } = await import("../src/engine/sharpTools");
  docsSeeded();
  masterSeeded();
  const id = "prd-slitting-blade";
  for (const r of recordRepository.queryUnscoped({ documentId: id, isDemo: false })) recordRepository.removeIds([r.id]);
  assert.ok(isCompanyHoliday("2026-11-19", masterRepository.get()), "19-11-2026 is the weekly off");
  const month = withMonthDays(id, { header: {}, rows: [] }, "2026-11")!;
  const i20 = month.rows.findIndex((r) => r.date === "2026-11-20");
  month.rows[i20] = { ...month.rows[i20], openingStock: 7, newIssuedFromStore: 0, totalStock: 7, replacedShift: "I", replacedNos: 2, closingOkStock: 5, closingDiscarded: 10, discardedReturned: 0 };
  const now = new Date().toISOString();
  recordRepository.upsertMany([{ id: "wk-nov", documentId: id, periodKey: periodKeyFor(documentRepository.getByIdUnscoped(id)!, "2026-11-30"), dueDate: "2026-11-30", status: "Due", isDemo: false, createdAt: now, updatedAt: now, data: month } as RecordInstance]);
  fillSharpToolsDue("2026-11-20");
  const rows = (recordRepository.getById("wk-nov")!.data as { rows: LogSheetRow[] }).rows.filter((r) => String(r.date) <= "2026-11-20");
  for (let i = 1; i < rows.length; i++) assert.equal(Number(rows[i].openingStock), Number(rows[i - 1].closingOkStock), `${rows[i].date} ${rows[i].replacedShift}: unbroken`);
  assert.equal(Number(rows.find((r) => r.date === "2026-11-20")!.openingStock), 7, "the typed line as typed");
});

test("the assistant writes no remark on the four sheets (§264); a person's remark stays theirs", async () => {
  const { sharpIssueRows: rowsOf, monthDays, closedDayLine, assistantsLine, lineFingerprint, ASSISTANT_LINE } = await import("../src/engine/sharpTools");
  for (const id of ["prd-sharp-object-issue", "prd-pouching-cutter-issue"]) {
    for (const d of monthDays("2027-01")) for (const s of ["I", "II"] as const) assert.equal(rowsOf(id, d, { sharpToolPeople: [] }, s)![0].remarks, "", `${id} ${d} ${s}`);
    assert.equal(closedDayLine(id, "2027-01-07", { short: "Weekly off", name: "" }, null, "I").remarks, "");
  }
  assert.doesNotMatch(src("engine/sharpTools.ts"), /"Cutter blade worn out"|"Scissor damaged"/);
  const line = { ...rowsOf("prd-pouching-cutter-issue", "2027-01-05", { sharpToolPeople: [] })![0] };
  line[ASSISTANT_LINE] = lineFingerprint("prd-pouching-cutter-issue", line);
  assert.ok(!assistantsLine("prd-pouching-cutter-issue", { ...line, remarks: "Blade changed by fitter" }), "a remark typed: the line is the person's");
});

test("nothing is ever issued in shift II on any of the four - 0 issued, 0 returned, whoever is listed (§265)", async () => {
  const { sharpIssueRows: rowsOf, monthDays } = await import("../src/engine/sharpTools");
  const listed = { sharpToolPeople: [person(1, "II"), person(2, "II"), person(3, "I")] };
  for (const people of [{ sharpToolPeople: [] }, listed]) {
    for (const d of monthDays("2026-12")) {
      const r = rowsOf("prd-pouching-cutter-issue", d, people, "II")![0];
      assert.deepEqual([r.shift, r.qtyIssued, r.qtyReturned, r.brokenQty, r.newQtyIssued, r.remarks], ["II", 0, 0, "-", "-", ""], d);
    }
  }
  assert.ok(Number(rowsOf("prd-pouching-cutter-issue", "2026-12-02", listed, "I")![0].qtyIssued) >= 1, "shift I as before");
  for (const people of [{ sharpToolPeople: [] }, listed]) {
    const r = rowsOf("prd-sharp-object-issue", "2026-12-02", people, "II")![0];
    assert.deepEqual([r.shift, r.issuedScissor, r.issuedManualCutter, r.returnedScissor, r.returnedManualCutter, r.brokenScissor, r.brokenCutterBlade, r.newScissor, r.newCutterBlade], ["II", 0, 0, 0, 0, "-", "-", "-", "-"], "F/PRD/10's shift II: nothing");
  }
  const { razorBladeRow: blade } = await import("../src/engine/sharpTools");
  for (const id of ["prd-pouching-blade", "prd-slitting-blade"]) {
    const r = blade(id, "2026-12-02", { ok: 3, discarded: 9 }, "II")!;
    assert.deepEqual([Number(r.replacedNos), Number(r.newIssuedFromStore), Number(r.closingOkStock)], [0, 0, 3], `${id}: shift II takes nothing, not even with the OK stock low`);
  }
});

test("a line whose only change is the assistant's old remark taken off is still the assistant's (§264, §265)", async () => {
  const { assistantsLine, lineFingerprint, ASSISTANT_LINE } = await import("../src/engine/sharpTools");
  const id = "prd-pouching-cutter-issue";
  const old = { id: "x", date: "2026-11-04", shift: "II", qtyIssued: 4, qtyReturned: 4, brokenQty: "1", newQtyIssued: "1", remarks: "Cutter blade worn out", supervisorSign: "" };
  const marked = { ...old, [ASSISTANT_LINE]: lineFingerprint(id, old) };
  assert.ok(assistantsLine(id, { ...marked, remarks: "" }), "the remark taken off: still the assistant's");
  assert.ok(!assistantsLine(id, { ...marked, remarks: "" , qtyIssued: 6 }), "a figure changed too: the person's");
  assert.ok(!assistantsLine(id, { ...marked, remarks: "Fitter's note" }), "a remark of the person's own: the person's");
});

test("the HR module's print: numbers in the middle by column, short words on one line, a short table's lines one height (§266)", () => {
  const print = src("utils/print.ts");
  assert.match(print, /const HR_SHEET = '\[data-sheet\^="hr-"\]';/);
  assert.match(print, /active\.tidied = tidyHrCells\(pages\);/);
  assert.match(print, /active\.evened = evenHrLines\(docs\);/);
  assert.match(print, /cells\.filter\(\(c\) => CENTRED_VALUE\.test\(c\.text\)\)\.length >= Math\.max\(1, cells\.length \* 0\.8\)/, "centred by column");
  assert.match(print, /if \(pages\(\) > before\) \{/, "never onto a further page");
  const css = src("styles.css");
  assert.match(css, /td\.print-one-line\.print-one-line :is\(\.cell-text, \.print-box-text, span, div, \*\) \{ white-space: nowrap; \}/);
  assert.match(css, /td\.print-center :is\(\.print-box-text, \.cell-text, input, select\) \{ text-align: center;/);
});
