// F/QC/11'S RECORDS LISTED BY A RUNNING SERIAL NUMBER IN PLACE OF DETAILS (REQUIREMENTS §226; the owner, 16-Nov-2026:
// "here also remove detail from screen and instead of that add serial number"; asked: 1, 2, 3 in date order). By source.
// Run: npm run test:unit -- gsmSerialNumber
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.env.DCRS_REPO_ROOT ?? process.cwd();
const page = readFileSync(path.join(root, "frontend", "src", "pages", "DocumentRecordsPage.tsx"), "utf8").replace(/\r\n/g, "\n");

test("F/QC/11's list says Serial number, numbered oldest first; F/QC/17 keeps its rulers' Serial numbers", () => {
  assert.match(page, /const RUNNING_NUMBER_DOCS: ReadonlySet<string> = new Set\(\["qc-gsm-plate-calibration"\]\);/);
  assert.match(page, /const oldestFirst = records\.slice\(\)\.sort\(\(a, b\) => compareISO\(a\.dueDate, b\.dueDate\)/);
  assert.match(page, /return new Map\(oldestFirst\.map\(\(r, i\) => \[r\.id, String\(i \+ 1\)\] as const\)\);/);
  assert.match(page, /const detailsTitle = isRulerVerification\(doc\.id\) \|\| numbers \? "Serial number" : hr\?\.labelTitle \?\? "Details";/);
  assert.match(page, /if \(numbers\) return numbers\.get\(record\.id\) \?\? "";/);
});
