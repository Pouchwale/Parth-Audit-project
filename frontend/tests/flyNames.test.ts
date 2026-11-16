// F/HR/18: PC-01'S CLEANING DONE BY AND VERIFIED BY WRITTEN ON EVERY UNIT'S LINE OF THE VISIT; WHAT IS TYPED IN THE MIDDLE OF
// ITS BOX (REQUIREMENTS §237). Run: npm run test:unit -- flyNames
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { FlyCatcherEntry } from "../src/types";
import { withFirstUnitNames } from "../src/engine/flyNames";
import { masterRepository, ensureSeeded } from "../src/data/repositories/masterRepository";

ensureSeeded();
const ROOT = process.env.DCRS_REPO_ROOT ?? process.cwd();
const line = (pcId: string, cleaningDoneBy = "", verifiedBy = ""): FlyCatcherEntry => ({ pcId, catchCountApprox: 2, tubeLightInstallDate: "2025-11-24", tubeLightDueDate: "2026-11-23", cleaningDoneBy, verifiedBy });
const blank = (pcId: string) => line(pcId);

test("PC-01's names written on every unit's line of the visit, over what they held; another unit's names are its own", () => {
  const units = masterRepository.get().pcLocations.map((pc) => pc.id);
  assert.equal(units[0], "PC-01", "the first unit is PC-01");
  const entries = [line("PC-01", "Vijay"), line("PC-02", "R", "V"), line("PC-03")];
  const named = withFirstUnitNames(entries, "PC-01", { cleaningDoneBy: "Vijay" }, units, blank);
  assert.equal(named.length, units.length, "every unit has its line");
  assert.ok(named.every((e) => e.cleaningDoneBy === "Vijay"), "Cleaning Done By on every line, the R overwritten");
  assert.equal(named.find((e) => e.pcId === "PC-02")!.verifiedBy, "V", "only the name typed is written");
  // (the page writes PC-01's own line, then the helper every other unit's)
  const both = withFirstUnitNames(named.map((e) => (e.pcId === "PC-01" ? { ...e, verifiedBy: "Roshni" } : e)), "PC-01", { verifiedBy: "Roshni" }, units, blank);
  assert.ok(both.every((e) => e.cleaningDoneBy === "Vijay" && e.verifiedBy === "Roshni"));
  assert.equal(both.find((e) => e.pcId === "PC-02")!.catchCountApprox, 2, "the counts and dates are each unit's own");
  assert.equal(withFirstUnitNames(entries, "PC-02", { cleaningDoneBy: "Meet" }, units, blank), entries, "another unit's names are its own");
  assert.equal(withFirstUnitNames(entries, "PC-01", { catchCountApprox: 5 }, units, blank), entries, "a count is the unit's own");
});

test("both pages write PC-01's names on every unit; the boxes' words stand in the middle", () => {
  const src = (f: string) => readFileSync(path.join(ROOT, "frontend", "src", ...f.split("/")), "utf8");
  assert.match(src("components/records/FlyCatcherRegisterSheet.tsx"), /withFirstUnitNames\(entries, pcId, patch, pcLocations\.map/);
  assert.equal((src("components/records/FlyCatcherRecordView.tsx").match(/withFirstUnitNames\(/g) ?? []).length, 2, "the visit's own lines and the month's other visit");
  assert.match(src("styles.css"), /\.fhr18-grid \.fhr18-input \{ text-align: center; \}/);
});
