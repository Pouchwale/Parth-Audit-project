// MASTER DATA IS THE SUPER ADMIN'S, KAPILA BARAD'S AND THE TESTING ACCOUNTS' (REQUIREMENTS §134, the owner, 28-Oct-2026:
// "from kapila barad id and other except superadmin id's no one can see in there id ... make sure there are lots of testing
// id which you have created for testing so that id should access of those all"; §172, 3-Nov-2026: "for kapila barad ID
// just give this access only for master data in system, nothing more or less than that"): the page, its link, the
// assistant's way to it and its changes are the super admin's, Kapila Barad's (her sign-in, and the one it was before
// §110) and the testing accounts' (their addresses at example.com); everybody else is not shown it. And
// the rodent station's ID is the plant's own to write ("make rodent Station id editable"). The server's half is proved in
// backend/tests/storageRoutes.test.ts, the screens in tests/e2e_working_hours.py, e2e_editing.py and e2e_departments.py.
// Run: npm run test:unit -- masterDataAccess
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { isMasterDataPerson, isTestAccount, MASTER_DATA_PEOPLE, mayOpenDepartmentsAccess, mayOpenEmployeesTab, mayOpenMasterData, mayOpenRoute, mayOpenSystemPages, SYSTEM_ROUTES } from "../src/engine/masterDataAccess";

const root = process.env.DCRS_REPO_ROOT ?? process.cwd();
const read = (...p: string[]) => readFileSync(path.join(root, ...p), "utf8").replace(/\r\n/g, "\n");

test("who may open Master Data: the super admin, Kapila Barad and the testing accounts, nobody else", () => {
  assert.equal(mayOpenMasterData({ role: "admin", email: "admin@gpp.local" }), true, "the super admin");
  assert.equal(mayOpenMasterData({ role: "admin", email: "owner@pouchwale.com" }), true, "whatever the super admin's address");
  for (const email of ["e2e-1727000000000@example.com", "Dept-QC@Example.com", " trend-qa@example.com "]) {
    assert.equal(mayOpenMasterData({ role: "staff", email }), true, `a testing account: ${email}`);
  }
  // Kapila Barad's ID (§172): by its sign-in, however it is typed, and by the sign-in it had before §110 renamed it.
  assert.deepEqual(MASTER_DATA_PEOPLE, ["kapila.barad@gpp.local", "kapilabarad01@gmail.com", "vinay.bhojak@gpp.local"]);
  for (const email of ["kapila.barad@gpp.local", "Kapila.Barad@GPP.local", " kapila.barad@gpp.local ", "kapilabarad01@gmail.com"]) {
    assert.equal(mayOpenMasterData({ role: "staff", email }), true, `Kapila Barad: ${email}`);
    assert.equal(isMasterDataPerson(email), true, email);
  }
  // Vinay Bhojak the same (§178, 3-Nov-2026: "give same as to vinay bhojak also").
  for (const account of [{ email: "vinay.bhojak@gpp.local" }, { email: "Vinay.Bhojak@GPP.local" }, { email: "vb@gmail.com", name: "Vinay Bhojak" }, { email: "vb@gmail.com", name: "bhojak vinay" }]) {
    assert.equal(mayOpenMasterData({ role: "staff", ...account }), true, `Vinay Bhojak: ${JSON.stringify(account)}`);
    assert.equal(mayOpenSystemPages({ role: "staff", ...account }), false, "...and, like Kapila, nothing else of the System menu");
  }
  for (const email of ["chirag.parmar@gpp.local", "sandeep.parekh@gpp.local", "someone@gmail.com", "kapila@gpp.local", "vinay@gpp.local", "x@notexample.com", "example.com@gpp.local"]) {
    assert.equal(mayOpenMasterData({ role: "staff", email }), false, `not shown it: ${email}`);
    assert.equal(isMasterDataPerson(email), false, email);
  }
  // ...and by the name her account carries at the plant, whatever sign-in the super admin gave it (3-Nov-2026).
  for (const name of ["Kapila Barad", "kapila barad", "KAPILA BARAD", "Kapila B Barad", "Ms. Kapila Barad", "Barad Kapila"]) {
    assert.equal(mayOpenMasterData({ role: "staff", email: "someone.else@gmail.com", name }), true, `by name: ${name}`);
    assert.equal(isMasterDataPerson({ email: "kapila.qc@gmail.com", name }), true, name);
    assert.equal(mayOpenSystemPages({ role: "staff", email: "someone.else@gmail.com", name }), false, `the System menu's other pages: not hers (§173), by name: ${name}`);
  }
  for (const name of ["Kapila", "Barad", "Kapil Barad", "Kapila Patel", "Vinay", "Bhojak", "Sandeep Parekh", ""]) {
    assert.equal(isMasterDataPerson({ email: "someone.else@gmail.com", name }), false, `not her: "${name}"`);
    assert.equal(mayOpenSystemPages({ role: "staff", email: "someone.else@gmail.com", name }), false, `"${name}": the System menu is the super admin's (§193)`);
  }
  assert.equal(mayOpenMasterData({ role: "admin", email: "superadmin05@gmail.com", name: "Superadmin" }), true, "the owner's own account");
  assert.equal(mayOpenSystemPages({ role: "admin", email: "superadmin05@gmail.com", name: "Superadmin" }), true);
  assert.equal(isMasterDataPerson(""), false);
  assert.equal(isMasterDataPerson(null), false);
  assert.equal(mayOpenMasterData(null), false);
  assert.equal(mayOpenMasterData(undefined), false);
  assert.equal(isTestAccount("e2e-buddy-1@example.com"), true);
  assert.equal(isTestAccount(""), false);
});

// KAPILA BARAD'S SYSTEM MENU IS MASTER DATA ALONE (REQUIREMENTS §173, the owner, 3-Nov-2026, with a picture of the menu:
// "remove all the thing from this system for kapila barad id except Master data"): Reports, the Activity Log, the
// Performance Scorecard, Insights and Demo Mode are not hers - not in her menu, not at their addresses, not through
// Mitra's shortcuts, and the Activity Log's lines not from the server. Since REQUIREMENTS §193 (the owner, 6-Nov-2026,
// with a picture of Chirag Parmar's menu: "remove this part") they are nobody's but the super admin's.
test("the System menu's other pages: the super admin's alone; no staff account's", () => {
  assert.deepEqual(SYSTEM_ROUTES, ["/reports", "/activity", "/performance", "/insights", "/demo"]);
  for (const email of ["kapila.barad@gpp.local", "Kapila.Barad@GPP.local", "kapilabarad01@gmail.com"]) {
    assert.equal(mayOpenSystemPages({ role: "staff", email }), false, `not Kapila's: ${email}`);
    for (const route of SYSTEM_ROUTES) assert.equal(mayOpenRoute({ role: "staff", email }, route), false, route);
    assert.equal(mayOpenRoute({ role: "staff", email }, "/reports/2026/9"), false, "nor a month of the reports");
    assert.equal(mayOpenRoute({ role: "staff", email }, "/master-data"), true, "Master Data: hers (§172)");
    assert.equal(mayOpenRoute({ role: "staff", email }, "/day/2026-11-03"), true, "every other address as before");
    assert.equal(mayOpenRoute({ role: "staff", email }, "/hr/master-data"), true, "HR Master Data is HR's page, not the System menu's");
  }
  for (const account of [{ role: "admin", email: "admin@gpp.local" }, { role: "admin", email: "superadmin05@gmail.com" }]) {
    assert.equal(mayOpenSystemPages(account), true, account.email);
    for (const route of SYSTEM_ROUTES) assert.equal(mayOpenRoute(account, route), true, `${account.email} ${route}`);
  }
  // Every staff account (§193): Chirag Parmar's among them, and a testing account's.
  for (const account of [{ role: "staff", email: "chirag.parmar@gpp.local" }, { role: "staff", email: "dept-qc@example.com" }, { role: "staff", email: "sandeep.parekh@gpp.local", name: "Sandeep Parekh" }]) {
    assert.equal(mayOpenSystemPages(account), false, account.email);
    for (const route of SYSTEM_ROUTES) assert.equal(mayOpenRoute(account, route), false, `${account.email} ${route}`);
    assert.equal(mayOpenRoute(account, "/library"), true, "every other address as before");
  }
  // ...and the heading goes with the pages: an account with nothing in the System menu is not shown it.
  assert.match(read("frontend", "src", "components", "layout", "Sidebar.tsx"), /\{systemItems\.length > 0 && \(\n\s+<>\n\s+<div className="nav-section-label">\{t\("nav\.system"\)\}<\/div>/);
  // ...nor a document's page its description (§193).
  assert.ok(!read("frontend", "src", "pages", "DocumentRecordsPage.tsx").includes("<p className=\"text-muted mb-4\">{doc.description}</p>"), "no description paragraph under the document's name");
  // The Departments & access tab (§178): the administrator's and the testing accounts', not Kapila's or Vinay's.
  assert.equal(mayOpenDepartmentsAccess({ role: "admin", email: "admin@gpp.local" }), true);
  assert.equal(mayOpenDepartmentsAccess({ role: "staff", email: "dept-qc@example.com" }), true, "a testing account");
  for (const account of [{ role: "staff", email: "kapila.barad@gpp.local" }, { role: "staff", email: "vinay.bhojak@gpp.local" }, { role: "staff", email: "x@gmail.com", name: "Kapila Barad" }, { role: "staff", email: "chirag.parmar@gpp.local" }, null]) {
    assert.equal(mayOpenDepartmentsAccess(account), false, JSON.stringify(account));
  }
  // The Employees tab (§179, §199): the super admin's and the testing accounts'; not Vinay Bhojak's, not Kapila Barad's.
  for (const account of [
    { role: "staff", email: "vinay.bhojak@gpp.local" },
    { role: "staff", email: "vb@gmail.com", name: "Vinay Bhojak" },
    { role: "staff", email: "kapila.barad@gpp.local" },
    { role: "staff", email: "kapilabarad01@gmail.com", name: "Kapila Barad" },
    { role: "staff", email: "x@gmail.com", name: "Kapila B Barad" },
    null,
  ]) {
    assert.equal(mayOpenEmployeesTab(account), false, JSON.stringify(account));
  }
  for (const account of [{ role: "admin", email: "admin@gpp.local" }, { role: "admin", email: "superadmin05@gmail.com", name: "Superadmin" }, { role: "staff", email: "dept-qc@example.com" }]) {
    assert.equal(mayOpenEmployeesTab(account), true, JSON.stringify(account));
  }
  const page = read("frontend", "src", "pages", "MasterDataPage.tsx");
  assert.match(page, /TABS\.filter\(\(t\) => \(t\.key !== "departments" \|\| mayOpenDepartmentsAccess\(user\)\) && \(t\.key !== "employees" \|\| mayOpenEmployeesTab\(user\)\)\)\.map\(\(t\) => \(/);
  assert.match(page, /useState<Tab>\(mayOpenEmployeesTab\(user\) \? "employees" : "chemicals"\)/, "Vinay and Kapila land on Chemicals, not on a tab they cannot see");
  assert.equal(mayOpenSystemPages(null), false);
  assert.equal(mayOpenRoute(null, "/reports"), false);
  const sidebar = read("frontend", "src", "components", "layout", "Sidebar.tsx");
  assert.match(sidebar, /const items = mayOpenSystemPages\(user\) \? withMaster : withMaster\.filter\(\(item\) => item\.to === "\/master-data"\);/);
  const app = read("frontend", "src", "App.tsx");
  assert.match(app, /const systemPages = mayOpenSystemPages\(user\);/);
  for (const page of ["PerformancePage", "InsightsPage", "ActivityLogPage", "DemoModePage"]) assert.ok(app.includes(`systemPages ? <${page} /> : <SystemPageNotAllowed />`), page);
  assert.match(app, /if \(!systemPages\) return <SystemPageNotAllowed \/>;\n\s*return <ReportsPage/);
  assert.match(app, /data-state="system-not-allowed"/);
  const assistant = read("frontend", "src", "components", "common", "DocumentAssistant.tsx");
  assert.match(assistant, /case "navigate":\n\s*me\(chip\.label\);\n[^\n]*\n\s*if \(!mayOpenRoute\(user, a\.route\)\) \{/);
  const server = read("backend", "activityRoutes.ts");
  assert.equal((server.match(/if \(notHers\(req, res\)\) return;/g) ?? []).length, 2, "the lines and the tally");
});

test("the link, the page, the assistant's way to it and the server follow the one rule", () => {
  const sidebar = read("frontend", "src", "components", "layout", "Sidebar.tsx");
  assert.match(sidebar, /const withMaster = mayOpenMasterData\(user\) \? all : all\.filter\(\(item\) => item\.to !== "\/master-data"\);/);
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
