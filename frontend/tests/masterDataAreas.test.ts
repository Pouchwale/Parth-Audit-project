// MASTER DATA: THE AREAS EDITABLE, THE CHECKPOINTS TAB GONE (REQUIREMENTS §174, the owner, 3-Nov-2026: "now give me
// edit option in area in that master list and remove checkpoints"). The page's source is held to the words (one table a
// service, the name a box, Add Row and the bin, no Checkpoints tab), and the repository to what the page does with it.
// Run: npm run test:unit -- masterDataAreas
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { masterRepository } from "../src/data/repositories/masterRepository";

const root = process.env.DCRS_REPO_ROOT ?? process.cwd();
const page = readFileSync(path.join(root, "frontend", "src", "pages", "MasterDataPage.tsx"), "utf8").replace(/\r\n/g, "\n");

test("the tabs: Areas kept, Checkpoints gone; nothing else of the page changes", () => {
  assert.doesNotMatch(page, /"checkpoints"/, "no Checkpoints tab, no checkpoints block");
  assert.doesNotMatch(page, /Checkpoint Text/);
  assert.match(page, /\{ key: "areas", label: "Areas" \},\n\s*\{ key: "documents", label: "Documents \/ Formats" \},/);
  for (const label of ["Employees", "Departments & access", "Chemicals", "PC IDs (Fly Catchers)", "Rodent Stations", "Areas", "Documents / Formats", "Holidays", "Working Hours & Briefing"]) {
    assert.ok(page.includes(`label: "${label}"`), label);
  }
});

test("the PC ID is a box too, like the rodent station's (REQUIREMENTS §176)", () => {
  assert.match(page, /columns=\{\["PC ID", "Location", "Floor"\]\}[\s\S]{0,600}editableCols=\{\[0, 1, 2\]\}/);
});

test("the Areas tab: one table a service, the name a box, a line added under its service, a line taken away", () => {
  assert.match(page, /\{tab === "areas" && \(/);
  assert.match(page, /areaGroups\(master\.areas\)\.map\(\(group\) =>/);
  assert.match(page, /columns=\{\["Area Name"\]\}/);
  assert.match(page, /rows=\{group\.areas\.map\(\(a\) => \[a\.name\]\)\}/);
  assert.match(page, /editableCols=\{\[0\]\}/);
  assert.match(page, /masterRepository\.update\(\{ areas: master\.areas\.map\(\(a\) => \(a\.id === id \? \{ \.\.\.a, name: value \} : a\)\) \}\);/, "a name typed over in place");
  assert.match(page, /const added = \{ id: generateId\("area"\), name: "TO BE CONFIRMED", context: group\.context \};/, "a line added under its service");
  assert.match(page, /masterRepository\.update\(\{ areas: master\.areas\.filter\(\(a\) => a\.id !== id\) \}\);/, "a line taken away");
  assert.match(page, /service: a\.context\.replace\(\/\^service-report:\/, ""\)/, "the heading is the service's name");
});

test("the repository does what the page does: the three lists, a name changed, a line added after its service's last, a line removed", () => {
  const before = masterRepository.get().areas;
  const contexts = Array.from(new Set(before.map((a) => a.context)));
  assert.deepEqual(contexts, ["service-report:Rodent Control Service", "service-report:General Pest Control Services", "service-report:Fly Control Services"], "the three lists, in the order they are kept");
  assert.equal(before.filter((a) => a.context === contexts[0]).length, 16, "the rodent report's sixteen areas");
  const first = before[0];
  masterRepository.update({ areas: before.map((a) => (a.id === first.id ? { ...a, name: "Printing machine - Ground Floor (east)" } : a)) });
  assert.equal(masterRepository.get().areas[0].name, "Printing machine - Ground Floor (east)");
  const rodent = masterRepository.get().areas.filter((a) => a.context === contexts[0]);
  const last = rodent[rodent.length - 1];
  const all = masterRepository.get().areas;
  const at = all.findIndex((a) => a.id === last.id) + 1;
  const added = { id: "area-test-1", name: "TO BE CONFIRMED", context: contexts[0] };
  masterRepository.update({ areas: [...all.slice(0, at), added, ...all.slice(at)] });
  const after = masterRepository.get().areas;
  assert.equal(after[at].id, "area-test-1", "after the rodent report's last line");
  assert.equal(after[at + 1].context, contexts[1], "before the next report's first line");
  assert.equal(after.filter((a) => a.context === contexts[0]).length, 17);
  masterRepository.update({ areas: after.filter((a) => a.id !== "area-test-1") });
  assert.equal(masterRepository.get().areas.length, before.length);
  masterRepository.update({ areas: before });
});
