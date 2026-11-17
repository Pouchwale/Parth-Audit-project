// F/HR/18: THE TUBE LIGHT CHANGED EVERY YEAR ON ITS DUE DATE (REQUIREMENTS §253; the owner, 17-Nov-2026: "DUE DATE FOR TUBE
// LIGHT REPLACEMENT is 23-11-2026 so after that new date ... like wise it will repeat every year"; asked: "23-11-2026 ->
// 22-11-2027", from the "first visit on/after due date"). Run: npm run test:unit -- tubeLightYears
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { tubeLightCycle, tubeLightPairOn, withTubeLightsOn } from "../src/engine/flyPattern";

const ROOT = process.env.DCRS_REPO_ROOT ?? process.cwd();
const src = (f: string) => readFileSync(path.join(ROOT, "frontend", "src", ...f.split("/")), "utf8");

test("before the due date the pair stands; on it and after, installed on the due date, due a year less a day later", () => {
  assert.deepEqual(tubeLightCycle("2026-11-16"), { installed: "2025-11-24", due: "2026-11-23" });
  assert.deepEqual(tubeLightCycle("2026-11-22"), { installed: "2025-11-24", due: "2026-11-23" });
  assert.deepEqual(tubeLightCycle("2026-11-23"), { installed: "2026-11-23", due: "2027-11-22" }, "the first visit on the due date");
  assert.deepEqual(tubeLightCycle("2026-12-07"), { installed: "2026-11-23", due: "2027-11-22" });
  assert.deepEqual(tubeLightCycle("2027-11-22"), { installed: "2027-11-22", due: "2028-11-21" }, "and again every year");
  assert.deepEqual(tubeLightCycle("2029-01-01"), { installed: "2028-11-21", due: "2029-11-20" });
});

test("a date typed by hand rolls on the same way; a visit before it is left alone", () => {
  assert.deepEqual(tubeLightPairOn("2026-03-10", "2027-03-09", "2027-03-15"), { install: "2027-03-09", due: "2028-03-08" });
  assert.deepEqual(tubeLightPairOn("2026-03-10", "2027-03-09", "2027-01-01"), { install: "2026-03-10", due: "2027-03-09" });
  const data = { entries: [{ pcId: "PC-01", tubeLightInstallDate: "2025-11-24", tubeLightDueDate: "2026-11-23" }, { pcId: "PC-02", tubeLightInstallDate: null, tubeLightDueDate: null }] };
  const rolled = withTubeLightsOn(data, "2026-12-07");
  assert.equal(rolled?.entries[0].tubeLightInstallDate, "2026-11-23");
  assert.equal(rolled?.entries[0].tubeLightDueDate, "2027-11-22");
  assert.equal(rolled?.entries[1].tubeLightInstallDate, null, "a unit with no date stays blank");
  assert.equal(withTubeLightsOn(data, "2026-11-16"), null, "nothing changes before the due date");
});

test("every place a visit gets its tube light dates moves them on: a new visit, the next one, a draft opened, a draft at start", () => {
  assert.match(src("engine/recordDefaults.ts"), /tubeLightInstallDate: tubeLightCycle\(dueDateISO\)\.installed,/);
  assert.match(src("engine/autoFill.ts"), /tubeLightPairOn\(prev\?\.tubeLightInstallDate \?\? cycle\.installed/);
  assert.match(src("engine/knownParts.ts"), /tubeLightPairOn\(p\?\.tubeLightInstallDate \|\| e\.tubeLightInstallDate/);
  assert.match(src("engine/flyRegister.ts"), /tubeLightPairOn\(p\.tubeLightInstallDate \|\| e\.tubeLightInstallDate/);
  assert.match(src("components/records/FlyCatcherRecordView.tsx"), /const carried = withTubeLightsOn\(down, it\.r\.dueDate\) \?\? down;/);
  assert.match(src("engine/tubeLightMigration.ts"), /tubeLightPairOn\(fixedInstall, fixedDue, r\.dueDate\)/);
  assert.ok(!/TUBE_LIGHT_INSTALLED|TUBE_LIGHT_DUE/.test(src("components/records/FlyCatcherRegisterSheet.tsx")), "the register's blanks follow the visit's day");
});
