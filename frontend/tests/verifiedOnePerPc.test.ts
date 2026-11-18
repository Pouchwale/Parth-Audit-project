// F/HR/18 (REQUIREMENTS §256; the owner, 18-Nov-2026): "user manually also change date for DATE OF TUBE LIGHT INSTALLATION
// so from that date to one year date will come for example 18-11-2026 then ... 17-11-2027", and "remove line in verified
// name ... in each pc there is one name only for per pc". Run: npm run test:unit -- verifiedOnePerPc
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { tubeLightDueFor } from "../src/engine/flyPattern";

const ROOT = process.env.DCRS_REPO_ROOT ?? process.cwd();
const src = (f: string) => readFileSync(path.join(ROOT, "frontend", "src", ...f.split("/")), "utf8");

test("an installation date typed gives the due date a year less a day after it", () => {
  assert.equal(tubeLightDueFor("2026-11-18"), "2027-11-17");
  assert.equal(tubeLightDueFor("2027-03-01"), "2028-02-29", "a leap year's last day of February");
  assert.equal(tubeLightDueFor(""), null);
  // On the visit's page (installPatch) and on the month's register both.
  assert.match(src("components/records/FlyCatcherRecordView.tsx"), /const due = tubeLightDueFor\(value\);/);
  assert.match(src("components/records/FlyCatcherRegisterSheet.tsx"), /const due = tubeLightDueFor\(ev\.target\.value\);[\s\S]{0,200}tubeLightDueDate: due/);
});

test("Verified By is one cell a PC, merged down the unit's lines, on the visit's page and the register", () => {
  const rec = src("components/records/FlyCatcherRecordView.tsx");
  assert.match(rec, /const vCell = i === 0 \? verifiedCell\(e\) : null;/);
  assert.equal((rec.match(/data-field="verified"/g) ?? []).length, 1, "one Verified By box a PC, not one a line");
  assert.match(rec, /verified-cell" rowSpan=\{lines\.length\}/);
  const reg = src("components/records/FlyCatcherRegisterSheet.tsx");
  assert.match(reg, /\{i === 0 && verifiedCell\}/);
  assert.equal((reg.match(/data-field="verified"/g) ?? []).length, 1);
  assert.match(reg, /rowSpan=\{rows\.length\} className="edit-cell verified-cell"/);
});
