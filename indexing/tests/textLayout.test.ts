// TEXT & LAYOUT (indexing/textLayout.ts): a format's printed words changed and moved from the index — saved as a
// version, compared, restored and reset like every other change; a signed record keeps the words it was signed with.
// Run: node --no-warnings=ExperimentalWarning indexing/tests/run.ts
import test from "node:test";
import assert from "node:assert/strict";
import { ensureSeeded } from "../../frontend/src/data/repositories/documentRepository";
import { emptySnapshot, readIndexState, writeIndexState } from "../indexState";
import { compareSnapshots, emptyDraft, restoreVersion, saveIndexDraft } from "../indexActions";
import { cleanEdits, describeTextEdit, diffEdits, textEditsFor, type TextEdit } from "../textLayout";

ensureSeeded();
const reset = () => writeIndexState({ schema: 1, current: emptySnapshot(), versions: [], formulas: {}, ranges: {}, texts: {} });
const DOC = "qc-gsm-plate-calibration";
const heading: TextEdit = { orig: "Checked By", path: "table>tbody>tr>th", occ: 0, text: "Verified By", dx: 12, bold: true };
const title: TextEdit = { orig: "CALIBRATION RECORD", path: "div", occ: 0, align: "center", size: 120 };

test("a change that changes nothing is not kept; the rest are tidied", () => {
  const edits = cleanEdits([heading, { orig: "Date", path: "th", occ: 0, text: "Date", size: 100 }, { ...heading, dy: -4 }]);
  assert.equal(edits.length, 1, "the empty one dropped, the repeated one kept once (the last)");
  assert.equal(edits[0].dy, -4);
  assert.equal(describeTextEdit(edits[0]), '→ "Verified By"; moved 12px right; moved 4px up; bold');
  assert.deepEqual(diffEdits([], [title]), [{ words: '"CALIBRATION RECORD"', before: "as issued", after: "aligned centre; size 120%" }]);
});

test("saved as an index version; the change list says each word; a signed record keeps the words it was signed with", () => {
  reset();
  const before = new Date(Date.now() - 60_000).toISOString();
  const r = saveIndexDraft({ ...emptyDraft(), texts: { [DOC]: [heading, title] } }, "Wording as the paper", "Super Admin", "text & layout");
  assert.ok(r.ok, r.ok ? "" : r.error);
  if (!r.ok) return;
  assert.equal(r.versionNo, 1);
  assert.equal(r.changes.length, 2);
  assert.ok(r.changes.every((c) => c.area === "text" && /F\/QC\/11/.test(c.label)));
  const state = readIndexState();
  assert.equal(state.versions[0].kind, "text & layout");
  assert.equal(textEditsFor(DOC).length, 2, "in force now");
  assert.equal(textEditsFor(DOC, before).length, 0, "a record signed before keeps the issued words");
  assert.equal(state.current.texts?.[DOC]?.length, 2);

  const again = saveIndexDraft({ ...emptyDraft(), texts: { [DOC]: [heading, title] } }, "Same again", "Super Admin");
  assert.equal(again.ok, false, "nothing changed is not a version");
});

test("compared, restored and reset like every other change", () => {
  reset();
  saveIndexDraft({ ...emptyDraft(), texts: { [DOC]: [heading] } }, "v1", "Super Admin");
  saveIndexDraft({ ...emptyDraft(), texts: { [DOC]: [heading, title] } }, "v2", "Super Admin");
  const [v2, v1] = readIndexState().versions;
  const diff = compareSnapshots(v1.snapshot, v2.snapshot);
  assert.deepEqual(
    diff.map((d) => [d.field, d.a, d.b]),
    [['Text "CALIBRATION RECORD"', "as issued", "aligned centre; size 120%"]]
  );
  const back = restoreVersion(1, "Back to v1", "Super Admin");
  assert.ok(back.ok);
  assert.deepEqual(textEditsFor(DOC).map((e) => e.orig), ["Checked By"]);
  const issued = restoreVersion(0, "As issued", "Super Admin");
  assert.ok(issued.ok);
  assert.deepEqual(textEditsFor(DOC), []);
  assert.equal(readIndexState().versions.length, 4, "nothing lost: every step a version");
  reset();
});
