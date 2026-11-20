// A NAME TAKEN OUT OF A PERSON'S BOX TAKES WHAT WAS FETCHED FOR THEM WITH IT; ANOTHER NAME BRINGS ITS OWN (REQUIREMENTS §268;
// the owner, 20-Nov-2026, with F/HR/20's Employee name empty and its Department "Label", Designation "Supervisor" left:
// "if user enter delete name then it should also vanished from there").
// Run: npm run test:unit -- hrNameCleared
import test from "node:test";
import assert from "node:assert/strict";
import { ensureSeeded as ensureHrSeeded, hrMasterRepository } from "../src/data/repositories/hrMasterRepository";
import { HR_MASTER_LINKS, HR_MASTER_TAG, hrMasterLinkFor, linkedValue, withPersonNamed } from "../src/engine/hrMaster";

ensureHrSeeded();
const people = hrMasterRepository.all();
const link = hrMasterLinkFor("hr-psc-survey")!;
const [a, b] = people.filter((p) => p.department && p.designation && p.gp3No).filter((p, _i, all) => p.department !== all[0].department || p === all[0]);

const fetched = (p: (typeof people)[number]) => withPersonNamed(link, { surveyDate: "2026-11-20" }, p.fullName, people)!;

test("a name written in fetches the person's department and designation, with the sheet's mark", () => {
  const h = fetched(a);
  assert.equal(h.department, a.department);
  assert.equal(h.designation, a.designation);
  assert.equal(h[HR_MASTER_TAG], a.gp3No.trim());
});

test("the name taken out: department and designation go with it, the mark too; the date stays", () => {
  const h = withPersonNamed(link, fetched(a), "", people)!;
  assert.deepEqual([h.employeeName, h.department, h.designation, h[HR_MASTER_TAG]], ["", "", "", undefined]);
  assert.equal(h.surveyDate, "2026-11-20");
});

test("the name taken out of a header fetched before the mark (as on the plant: Label / Supervisor): they go too", () => {
  const old = { employeeName: "", department: a.department, designation: a.designation };
  const h = withPersonNamed(link, old, "", people)!;
  assert.deepEqual([h.department, h.designation], ["", ""]);
});

test("another person named: the first one's details are replaced by theirs", () => {
  const h = withPersonNamed(link, fetched(a), b.fullName, people)!;
  assert.deepEqual([h.employeeName, h.department, h.designation, h[HR_MASTER_TAG]], [b.fullName, b.department, b.designation, b.gp3No.trim()]);
});

test("a box typed by hand stays: only what the person's details filled goes", () => {
  const typed = { ...fetched(a), designation: "Shift In-charge (typed)" };
  const h = withPersonNamed(link, typed, "", people)!;
  assert.equal(h.department, "");
  assert.equal(h.designation, "Shift In-charge (typed)");
  // and a header nobody fetched for - a department typed with no name - is left alone
  assert.equal(withPersonNamed(link, { employeeName: "", department: "Some Dept typed" }, "", people), null);
});

test("a name not on the sheet: the details stay unless the mark said whose they were", () => {
  const h = withPersonNamed(link, fetched(a), "Somebody Notonsheet", people)!;
  assert.deepEqual([h.department, h.designation, h[HR_MASTER_TAG]], ["", "", undefined], "marked: they were the other person's");
  const unmarked = withPersonNamed(link, { employeeName: a.fullName, department: a.department, designation: a.designation }, "Somebody Notonsheet", people)!;
  assert.deepEqual([unmarked.department, unmarked.designation], [a.department, a.designation], "unmarked: the name may only be spelt otherwise");
});

test("the same name again changes nothing", () => {
  assert.equal(withPersonNamed(link, fetched(a), a.fullName, people), null);
});

test("every HR format that fetches a person: the name out empties what it fetched (header or line)", () => {
  for (const l of HR_MASTER_LINKS) {
    const filled: Record<string, unknown> = {};
    const named = withPersonNamed(l, filled, a.fullName, people);
    if (!named) continue;
    const cleared = withPersonNamed(l, named, "", people)!;
    for (const f of l.fields) if (f.key !== l.nameField && linkedValue(a, f)) assert.equal(String(cleared[f.key] ?? ""), "", `${l.formatNo} ${f.key}`);
  }
});
