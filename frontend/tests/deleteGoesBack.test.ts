// AFTER A RECORD IS DELETED, BACK WHERE THE PERSON WAS (REQUIREMENTS §209; the owner, 15-Nov-2026: "when user delete any
// document in any module and when click on back button so it should be back where he is it previous and not on record
// calendar"). Read from the source; clicked through locally.
// Run: npm run test:unit -- deleteGoesBack
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.env.DCRS_REPO_ROOT ?? process.cwd();
const page = (name: string) => readFileSync(path.join(root, "frontend", "src", "pages", name), "utf8").replace(/\r\n/g, "\n");

test("every page that deletes a record goes back, never to the Record Calendar", () => {
  const record = page("RecordPage.tsx");
  assert.match(record, /deleteRecordWithTrail\(stored, currentUser, reason\);\n\s+bump\(\);\n\s+\/\/[^\n]*\n\s+back\(`\/document\/\$\{stored\.documentId\}`\);/);
  assert.doesNotMatch(record, /navigate\("\/calendar"\)/, "the record page never sends anybody to the calendar");
  const capa = page("CapaPage.tsx");
  assert.equal((capa.match(/back\("\/gap\/external"\)/g) ?? []).length, 2, "the checklist's Delete and Mitra's");
  assert.doesNotMatch(capa, /deleteRecordWithTrail\([^)]*\);\n\s+bump\(\);\n\s+navigate\(/);
  assert.match(page("GapPage.tsx"), /deleteRecordWithTrail\(current\(\) \?\? record, currentUser, reason\);\n\s+bump\(\);\n\s+\/\/[^\n]*\n\s+back\("\/gap\/internal"\);/);
  assert.match(page("TrainingPage.tsx"), /deleteRecordWithTrail\(record, currentUser, reason\);\n\s+bump\(\);\n\s+\/\/[^\n]*\n\s+back\("\/training"\);/);
});
