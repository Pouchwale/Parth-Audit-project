// THE OWNER'S SWITCHES OF 24-NOV-2026 (REQUIREMENTS §305): Statements of Compliance Automatic = their renewal reminded;
// Master List lines with no format marked Automatic and still shown as having none; As Required formats made Automatic
// on a Daily frequency (and refused without one).
// Run: node --no-warnings=ExperimentalWarning indexing/tests/run.ts
import test from "node:test";
import assert from "node:assert/strict";
import { documentRepository, ensureSeeded } from "../../frontend/src/data/repositories/documentRepository";
import { writeIndexState, emptySnapshot } from "../indexState";
import { NO_FORMAT_TAG, buildFormatLines } from "../indexRows";
import { emptyDraft, saveIndexDraft } from "../indexActions";
import { indexModeOf, renewalReminderOn, systemFills } from "../modes";

const fresh = () => {
  ensureSeeded();
  writeIndexState({ schema: 1, current: emptySnapshot(), versions: [], formulas: {}, ranges: {} });
};
const lineOfDoc = (id: string) => buildFormatLines().find((l) => l.doc?.id === id)!;
const save = (formats: Record<string, Record<string, string>>) => {
  const draft = emptyDraft();
  draft.formats = formats as typeof draft.formats;
  return saveIndexDraft(draft, "The owner's switches of 24-Nov-2026", "Super Admin");
};

test("F/QC/09, 10, 38 Automatic: still read only, their renewal reminded", () => {
  fresh();
  const ids = ["soc-labels", "soc-shrink-sleeves", "soc-flexible-packaging"];
  for (const id of ids) {
    const l = lineOfDoc(id);
    assert.equal(l.values.mode, "Reference only", id);
    assert.ok(l.automation.options.includes("Automatic"), id);
    assert.equal(renewalReminderOn(id), false, "no reminder until switched");
  }
  const saved = save(Object.fromEntries(ids.map((id) => [lineOfDoc(id).key, { mode: "Automatic" }])));
  assert.ok(saved.ok, saved.ok ? "" : saved.error);
  for (const id of ids) {
    const l = lineOfDoc(id);
    assert.equal(l.automation.mode, "Automatic", id);
    assert.ok(l.automation.tags.some((t) => /^Valid until \d\d-\d\d-\d{4}$/.test(t)), `${id}: ${l.automation.tags.join(" | ")}`);
    assert.ok(l.automation.tags.includes("Renewal reminded 90 days before (daily briefing)"));
    assert.equal(renewalReminderOn(id), true);
    assert.equal(documentRepository.getByIdUnscoped(id)!.isReferenceOnly, true, "still a reference document");
  }
  // A reference document that is not a statement cannot be Automatic.
  const other = buildFormatLines().find((l) => l.values.mode === "Reference only" && l.doc?.kind !== "compliance-statement");
  if (other) assert.equal(other.automation.options.includes("Automatic"), false);
});

test("F/PRD/11 and 12, no format in DCRS: marked Automatic, still shown as having no format", () => {
  fresh();
  const lines = buildFormatLines().filter((l) => !l.doc && /PRD.1[12]$/.test(l.values.formatNo));
  assert.equal(lines.length, 2, lines.map((l) => l.values.formatNo).join(","));
  const saved = save(Object.fromEntries(lines.map((l) => [l.key, { mode: "Automatic" }])));
  assert.ok(saved.ok, saved.ok ? "" : saved.error);
  for (const before of lines) {
    const l = buildFormatLines().find((x) => x.key === before.key)!;
    assert.equal(l.automation.mode, "Automatic");
    assert.equal(l.automation.tags[0], NO_FORMAT_TAG);
    assert.equal(l.doc, undefined);
  }
});

test("F/STR/02 and F/MNT/02, 05, 06, 07 Automatic on Daily; Automatic without a frequency is refused", () => {
  fresh();
  const ids = ["str-sharp-metal-objects", "mnt-pm-record", "mnt-breakdown-memo", "mnt-breakdown-clearance", "mnt-breakdown-record", "mnt-temporary-engineering"];
  for (const id of ids) assert.equal(lineOfDoc(id).values.mode, "Manual start", id);

  const refused = save({ [lineOfDoc(ids[0]).key]: { mode: "Automatic" } });
  assert.equal(refused.ok, false);
  assert.match(refused.ok ? "" : refused.error, /needs a frequency/);

  const saved = save(Object.fromEntries(ids.map((id) => [lineOfDoc(id).key, { mode: "Automatic", frequency: "Daily" }])));
  assert.ok(saved.ok, saved.ok ? "" : saved.error);
  for (const id of ids) {
    const doc = documentRepository.getByIdUnscoped(id)!;
    assert.equal(doc.frequency, "Daily", id);
    assert.notEqual(doc.schedule.type, "as-required", id);
    assert.ok(documentRepository.getRecordableUnscoped().some((d) => d.id === id));
    assert.equal(lineOfDoc(id).automation.mode, "Automatic", id);
    assert.equal(systemFills(id), true);
    assert.notEqual(indexModeOf(id), "Manual start");
  }
});
