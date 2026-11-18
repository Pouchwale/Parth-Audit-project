// THE SHARP OBJECTS & BLADES SHEETS FILL THEMSELVES FROM THEIR MASTER DATA AND THEIR STOCK (REQUIREMENTS §254; the owner,
// 17-Nov-2026). Run: npm run test:unit -- sharpTools
import test from "node:test";
import type { LogSheetRow } from "../src/types";
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

test("F/PRD/10: a line a shift, issued and returned = the shift's people, never more than the note's stock (15 scissors, 20 cutters)", () => {
  const rows = sharpIssueRows("prd-sharp-object-issue", "2026-11-17", master)!;
  assert.equal(rows.length, 2);
  assert.deepEqual([rows[0].shift, rows[0].issuedScissor, rows[0].issuedManualCutter, rows[0].returnedScissor, rows[0].returnedManualCutter], ["I", 15, 20, 15, 20]);
  assert.deepEqual([rows[1].shift, rows[1].issuedScissor, rows[1].issuedManualCutter], ["II", 4, 4]);
  assert.equal(rows[0].date, "2026-11-17");
  assert.equal(rows[0].brokenScissor, "Nil");
  assert.equal(rows[0].supervisorSign ?? "", "", "the supervisor signs");
  assert.equal(sharpIssueRows("prd-sharp-object-issue", "2026-11-17", { sharpToolPeople: [] }), null, "nothing while the list is empty");
});

test("F/PRD/23: the pouching section's people only, up to 40 cutters", () => {
  const rows = sharpIssueRows("prd-pouching-cutter-issue", "2026-11-17", master)!;
  assert.equal(rows.length, 1, "the Lamination shift II people are not the pouching section's");
  assert.deepEqual([rows[0].shift, rows[0].qtyIssued, rows[0].qtyReturned], ["I", 20, 20]);
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
