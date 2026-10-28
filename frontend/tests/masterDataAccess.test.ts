// MASTER DATA IS THE SUPER ADMIN'S (REQUIREMENTS §134, the owner, 28-Oct-2026: "from kapila barad id and other except
// superadmin id's no one can see in there id ... make sure there are lots of testing id which you have created for testing
// so that id should access of those all"): the page, its link, the assistant's way to it and its changes are the super
// admin's and the testing accounts' (their addresses at example.com); Kapila Barad and everybody else are not shown it. And
// the rodent station's ID is the plant's own to write ("make rodent Station id editable"). The server's half is proved in
// backend/tests/storageRoutes.test.ts, the screens in tests/e2e_working_hours.py, e2e_editing.py and e2e_departments.py.
// Run: npm run test:unit -- masterDataAccess
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { isTestAccount, mayOpenMasterData } from "../src/engine/masterDataAccess";

const root = process.env.DCRS_REPO_ROOT ?? process.cwd();
const read = (...p: string[]) => readFileSync(path.join(root, ...p), "utf8").replace(/\r\n/g, "\n");

test("who may open Master Data: the super admin and the testing accounts, nobody else", () => {
  assert.equal(mayOpenMasterData({ role: "admin", email: "admin@gpp.local" }), true, "the super admin");
  assert.equal(mayOpenMasterData({ role: "admin", email: "owner@pouchwale.com" }), true, "whatever the super admin's address");
  for (const email of ["e2e-1727000000000@example.com", "Dept-QC@Example.com", " trend-qa@example.com "]) {
    assert.equal(mayOpenMasterData({ role: "staff", email }), true, `a testing account: ${email}`);
  }
  for (const email of ["kapila.barad@gpp.local", "chirag.parmar@gpp.local", "someone@gmail.com", "x@notexample.com", "example.com@gpp.local"]) {
    assert.equal(mayOpenMasterData({ role: "staff", email }), false, `not shown it: ${email}`);
  }
  assert.equal(mayOpenMasterData(null), false);
  assert.equal(mayOpenMasterData(undefined), false);
  assert.equal(isTestAccount("e2e-buddy-1@example.com"), true);
  assert.equal(isTestAccount(""), false);
});

test("the link, the page, the assistant's way to it and the server follow the one rule", () => {
  const sidebar = read("frontend", "src", "components", "layout", "Sidebar.tsx");
  assert.match(sidebar, /const items = mayOpenMasterData\(user\) \? all : all\.filter\(\(item\) => item\.to !== "\/master-data"\);/);
  const page = read("frontend", "src", "pages", "MasterDataPage.tsx");
  assert.match(page, /if \(!mayOpenMasterData\(user\)\) \{\n {4}return \(\n {6}<div className="empty-state" data-state="master-not-allowed">/);
  const local = read("frontend", "src", "engine", "assistantLocal.ts");
  assert.match(local, /if \(!person \|\| mayOpenMasterData\(person\)\) chips\.push\(\{ label: t\("ai\.chip\.holidayMaster"\)/);
  const server = read("backend", "storageRoutes.ts");
  assert.match(server, /compose = mayOpenMasterData\(user\) \? \(stored\) => withStoredHours\(posted, stored\) : \(stored\) => withStoredMaster\(posted, stored\);/);
  const engine = read("frontend", "src", "engine", "masterDataAccess.ts");
  assert.doesNotMatch(engine, /^import /m, "import-free: the server runs the same file");
});

test("the rodent station's ID is the plant's to write: editable, and a new one numbered RBS-01, RBS-02 ...", () => {
  const page = read("frontend", "src", "pages", "MasterDataPage.tsx");
  assert.equal((page.match(/editableCols=\{\[0, 1, 2, 3\]\}/g) ?? []).length, 1, "the rodent stations' four columns, the Station ID among them");
  assert.match(page, /id: `RBS-\$\{String\(nextNum\)\.padStart\(2, "0"\)\}`/);
  assert.doesNotMatch(page, /generateId\("RBS"\)/, "no made-up code such as RBS-mvrtzde3-a-dbilag any more");
});
