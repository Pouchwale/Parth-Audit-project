// F/HR/18 FLIES CATCH COUNT APPROX. (REQUIREMENTS §257; the owner, 18-Nov-2026): "it should like 01 02 ... flyies will show
// according to season so it look very real ... some month in rainy season more". Run: npm run test:unit -- flyCountSeason
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { FLY_MONTH_RANGE, flyCountText, flyCountTyped, flyMonthRange, seasonalFlyCount } from "../src/engine/flyPattern";

const ROOT = process.env.DCRS_REPO_ROOT ?? process.cwd();
const src = (f: string) => readFileSync(path.join(ROOT, "frontend", "src", ...f.split("/")), "utf8");
const PCS = Array.from({ length: 13 }, (_, i) => `PC-${String(i + 1).padStart(2, "0")}`);

test("a count is written in two figures, 01, 02; typing and clearing a box work on them", () => {
  assert.equal(flyCountText(1), "01");
  assert.equal(flyCountText(0), "00");
  assert.equal(flyCountText(12), "12");
  assert.equal(flyCountText(null), "");
  assert.equal(flyCountTyped("5", ""), 5, "a figure typed into an empty box");
  assert.equal(flyCountTyped("012", "01"), 12, "a figure added to 01");
  assert.equal(flyCountTyped("0", "05"), null, "backspace from 05 empties the box");
  assert.equal(flyCountTyped("", "03"), null);
  assert.equal(flyCountTyped("0", ""), 0, "a nought typed is a nought");
  for (const f of ["components/records/FlyCatcherRecordView.tsx", "components/records/FlyCatcherRegisterSheet.tsx"]) {
    assert.ok(!/type="number"/.test(src(f)), `${f}: no number box (it cannot show 01)`);
    assert.match(src(f), /const paperCount = flyCountText;/);
  }
});

test("the counts follow the season: fewest in the summer heat, most in the monsoon", () => {
  const mean = (iso: string) => PCS.reduce((s, pc) => s + seasonalFlyCount(pc, iso, "2025-11-24"), 0) / PCS.length;
  const may = (mean("2026-05-02") + mean("2026-05-16")) / 2;
  const july = (mean("2026-07-04") + mean("2026-07-18")) / 2;
  const aug = (mean("2026-08-01") + mean("2026-08-15")) / 2;
  const nov = (mean("2026-11-07") + mean("2026-11-21")) / 2;
  assert.ok(july > nov && aug > nov && nov > may, `May ${may}, July ${july}, August ${aug}, November ${nov}`);
  assert.ok(Math.max(...FLY_MONTH_RANGE.map((r) => r[1])) === FLY_MONTH_RANGE[6][1], "July is the top");
  for (let m = 1; m <= 12; m++) {
    const iso = `2026-${String(m).padStart(2, "0")}-10`;
    const [low, high] = flyMonthRange(iso);
    const seen = new Set(PCS.map((pc) => seasonalFlyCount(pc, iso)));
    assert.ok([...seen].every((n) => n >= low && n <= high), `${iso}: ${[...seen]} not in ${low}-${high}`);
    assert.ok(seen.size > 1, `${iso}: not one number on every PC`);
  }
});

test("a draft's counts the assistant filled in before are filled in again for the season; a person's stay", async () => {
  const view = await import("../src/components/records/FlyCatcherRecordView");
  const install = "2025-11-24";
  const visit = "2026-11-16";
  const former = (pc: string) => view.formerAutoFlyCount(pc, visit, install);
  const entries = PCS.map((pc) => ({ pcId: pc, catchCountApprox: former(pc), tubeLightInstallDate: install, tubeLightDueDate: null, cleaningDoneBy: "", verifiedBy: "" }));
  const data = { monthYear: "", entries } as never;
  const fresh = view.withSeasonalCounts(data, visit, []);
  assert.ok(fresh, "some counts brought to the season");
  for (const e of (fresh as { entries: typeof entries }).entries) assert.equal(e.catchCountApprox, seasonalFlyCount(e.pcId, visit, install), e.pcId);
  // PC-03's count typed by a person: it stays.
  const typed = [{ id: "h", at: "", by: "u", action: "edited" as const, changes: [{ field: "entries[#2].catchCountApprox", label: "Entry PC-03 · Flies catch count", before: "", after: "" }] }];
  const kept = (view.withSeasonalCounts(data, visit, typed) as { entries: typeof entries } | null)?.entries.find((e) => e.pcId === "PC-03");
  assert.equal(kept?.catchCountApprox ?? entries[2].catchCountApprox, entries[2].catchCountApprox);
  // A person's change not listed in full: nothing touched.
  assert.equal(view.withSeasonalCounts(data, visit, [{ ...typed[0], changes: [], moreChanges: 3 }]), null);
  // A count that is not the former rule's figure (a person's 7): kept.
  assert.equal(view.withSeasonalCounts({ monthYear: "", entries: [{ ...entries[0], catchCountApprox: 7 }] } as never, visit, []), null);
});
