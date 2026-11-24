// HOW EACH FORMAT IS KEPT (REQUIREMENTS §304): the super admin's switch on the Indexing page — Automatic, Manual,
// Manual start, Reference only, SAP — saved as a version, laid over the format, obeyed by the fill, and restored.
// Run: node --no-warnings=ExperimentalWarning indexing/tests/run.ts
import test from "node:test";
import assert from "node:assert/strict";
import { documentRepository, ensureSeeded } from "../../frontend/src/data/repositories/documentRepository";
import { readIndexState, writeIndexState, emptySnapshot } from "../indexState";
import { buildFormatLines } from "../indexRows";
import { emptyDraft, restoreVersion, saveIndexDraft } from "../indexActions";
import { indexModeOf, modeOptions, systemFills } from "../modes";

const fresh = () => {
  ensureSeeded();
  writeIndexState({ schema: 1, current: emptySnapshot(), versions: [], formulas: {}, ranges: {} });
};

const switchTo = (key: string, mode: string, reason = "Owner's choice") => {
  const draft = emptyDraft();
  draft.formats[key] = { mode };
  const saved = saveIndexDraft(draft, reason, "Super Admin");
  assert.ok(saved.ok, saved.ok ? "" : saved.error);
};

test("each line shows its mode as issued, and the modes it may be switched to", () => {
  fresh();
  const lines = buildFormatLines();
  const auto = lines.find((l) => l.doc && l.values.mode === "Automatic")!;
  assert.ok(auto, "a scheduled format is Automatic as issued");
  assert.deepEqual(auto.automation.options, ["Automatic", "Manual", "Manual start", "Reference only", "SAP"]);
  assert.equal(auto.changed.has("mode"), false);
  const notHeld = lines.find((l) => !l.doc);
  if (notHeld) assert.deepEqual(notHeld.automation.options, ["Not in DCRS", "Automatic", "SAP"]);
  assert.deepEqual(modeOptions("Reference only"), ["Reference only", "SAP"]);
  assert.deepEqual(modeOptions("Reference only", true), ["Reference only", "Automatic", "SAP"]);
  assert.deepEqual(modeOptions("Manual start"), ["Manual start", "Automatic", "Manual", "Reference only", "SAP"]);
  assert.ok(lines.every((l) => systemFills(l.doc?.id ?? "x")), "nothing is switched yet");
});

test("Manual: still falls due, but the system fills nothing", () => {
  fresh();
  const line = buildFormatLines().find((l) => l.doc && l.values.mode === "Automatic")!;
  const id = line.doc!.id;
  const schedule = documentRepository.getByIdUnscoped(id)!.schedule;
  switchTo(line.key, "Manual");
  assert.equal(indexModeOf(id), "Manual");
  assert.equal(systemFills(id), false);
  assert.deepEqual(documentRepository.getByIdUnscoped(id)!.schedule, schedule, "the frequency stands");
  assert.ok(documentRepository.getRecordableUnscoped().some((d) => d.id === id));
  const after = buildFormatLines().find((l) => l.key === line.key)!;
  assert.equal(after.automation.mode, "Manual");
  assert.ok(after.changed.has("mode"));
  assert.ok(after.automation.tags.includes("Nothing filled by the system"));
  assert.equal(readIndexState().versions[0].changes[0].field, "Automatic / manual");
});

test("Manual start makes it As Required; SAP and Reference only take it off the recordable list; restore puts it back", () => {
  fresh();
  const line = buildFormatLines().find((l) => l.doc && l.values.mode === "Automatic")!;
  const id = line.doc!.id;
  const issued = documentRepository.getByIdUnscoped(id)!;

  switchTo(line.key, "Manual start");
  const ms = documentRepository.getByIdUnscoped(id)!;
  assert.equal(ms.schedule.type, "as-required");
  assert.equal(ms.frequency, "As Required");
  assert.equal(systemFills(id), true, "a record a person starts is still filled with what is known");

  switchTo(line.key, "SAP");
  assert.equal(documentRepository.getByIdUnscoped(id)!.isReferenceOnly, true);
  assert.equal(documentRepository.getRecordableUnscoped().some((d) => d.id === id), false);
  assert.equal(systemFills(id), false);
  assert.equal(buildFormatLines().find((l) => l.key === line.key)!.automation.tags[0], "Kept in SAP");

  switchTo(line.key, "Reference only");
  assert.equal(documentRepository.getRecordableUnscoped().some((d) => d.id === id), false);

  const back = restoreVersion(0, "Back to the issued index", "Super Admin");
  assert.ok(back.ok, back.ok ? "" : back.error);
  const restored = documentRepository.getByIdUnscoped(id)!;
  assert.deepEqual(restored.schedule, issued.schedule);
  assert.equal(!!restored.isReferenceOnly, !!issued.isReferenceOnly);
  assert.equal(systemFills(id), true);
  assert.equal(buildFormatLines().find((l) => l.key === line.key)!.values.mode, "Automatic");
});

test("switching back to the issued mode keeps nothing stored for it", () => {
  fresh();
  const line = buildFormatLines().find((l) => l.doc && l.values.mode === "Automatic")!;
  switchTo(line.key, "Manual");
  switchTo(line.key, "Automatic");
  assert.equal(readIndexState().current.formats[line.key]?.mode, undefined);
  assert.equal(indexModeOf(line.doc!.id), undefined);
});
