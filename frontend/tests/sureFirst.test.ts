// ARE YOU SURE? BEFORE ANY CHANGE TO WHAT A FORM PRINTS (REQUIREMENTS §138; the owner, 28-Oct-2026: "whenever any user
// make any change in format then system will ask him that are you sure or not? so user will click yes i am sure and no
// if not sure"). The checks a save makes come first, on their own, so a change that would be refused says so before the
// question; and every place in the app that saves a format, restores the issued one, or keeps printed words typed over
// on a record does it only on "Yes, I am sure". Without a browser: the engine, the words and the sources.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import type { DocumentDefinition } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { formatEditFor } from "../src/data/formatEdits";
import { commitFormatChange, draftOf, formatChangeRefusal, restoreIssuedFormat } from "../src/engine/formatOps";
import { STRINGS } from "../src/i18n/strings";

ensureDocumentsSeeded();
ensureMasterSeeded();

const root = process.env.DCRS_REPO_ROOT ?? process.cwd();
const read = (...p: string[]) => readFileSync(path.join(root, ...p), "utf8").replace(/\r\n/g, "\n");
const doc = (id: string): DocumentDefinition => {
  const d = documentRepository.getByIdUnscoped(id);
  assert.ok(d, `${id} is in the catalogue`);
  return d!;
};

test("a change that would be refused says why before anything is asked; one that would be saved is not refused", () => {
  const d = doc("qc-bopp-film");
  const before = draftOf(d);
  assert.equal(formatChangeRefusal(d, before, { reason: "the lab asked" }), "Nothing about the format has been changed yet.");
  const renamed = { ...before, name: `${before.name} (lab copy)` };
  assert.match(formatChangeRefusal(d, renamed, { reason: "  " }) ?? "", /Say why the format is changing/);
  assert.equal(formatChangeRefusal(d, renamed, { reason: "the lab asked" }), null);
  assert.equal(formatChangeRefusal(d, renamed, { reason: "the lab asked", revisionNo: " " }), "Give the new revision number.");
  assert.ok(!formatEditFor(d.id), "asking stores nothing");
  // The save refuses in the same words.
  assert.deepEqual(commitFormatChange(d, renamed, { actor: "Test Desk", reason: "" }), { ok: false, error: formatChangeRefusal(d, renamed, { reason: "" }) });
  assert.ok(!formatEditFor(d.id));
});

/** Every call of `call` in `src` sits inside a `sure.ask(...)` of the same function: nothing between them starts another. */
function everyCallAsksFirst(src: string, call: string, file: string): void {
  let at = src.indexOf(call);
  assert.ok(at >= 0, `${file} calls ${call}`);
  for (; at >= 0; at = src.indexOf(call, at + call.length)) {
    const ask = src.lastIndexOf("sure.ask(", at);
    assert.ok(ask >= 0, `${file}: ${call} with no question before it`);
    const between = src.slice(ask, at);
    assert.ok(!/\n {2}(const|function|export) /.test(between) && !/\n\}/.test(between), `${file}: ${call} is not inside the question's Yes`);
  }
}

test("every save of a format, every restore, and every printed word or page number typed over on a record waits for Yes, I am sure", () => {
  const editor = read("frontend", "src", "components", "documents", "FormatEditor.tsx");
  everyCallAsksFirst(editor, "commitFormatChange(doc, draft, { ...opts, ...choice })", "FormatEditor");
  everyCallAsksFirst(editor, "restoreIssuedFormat(doc)", "FormatEditor");
  everyCallAsksFirst(read("frontend", "src", "components", "documents", "SheetDesigner.tsx"), "commitFormatChange(doc, draft,", "SheetDesigner");
  const header = read("frontend", "src", "components", "documents", "HeaderEditing.tsx");
  everyCallAsksFirst(header, "commitFormatChange(latest,", "HeaderEditing");
  everyCallAsksFirst(header, "record.save(", "HeaderEditing");
  everyCallAsksFirst(read("frontend", "src", "components", "records", "EditableWords.tsx"), "onChange(next, choice)", "EditableWords");
  // The service report's printed words are the format's (REQUIREMENTS §154): saved only from those words' own Yes.
  const service = read("frontend", "src", "components", "records", "ServiceReportRecordView.tsx");
  assert.equal(service.split("saveFormatWords(").length - 1, 1, "called from one place only: the words' own Yes");
  assert.match(service, /onChange=\{\(typed, choice\) => saveFormatWords\(place, typed, shown, choice, legacy\)\}/);
  // A line added or removed on the service report (REQUIREMENTS §154 item 6) is saved only from its question's Yes.
  everyCallAsksFirst(service, "commitServiceLineChange(", "ServiceReportRecordView");
  // Mitra's change to a format is asked in her chat, as it always was: "Yes, save as Rev NN" or "No, leave it".
  assert.match(read("frontend", "src", "components", "common", "DocumentAssistant.tsx"), /label: `Yes, save as Rev \$\{rev\}`, action: \{ type: "confirmFormatChange" \}/);

  // Nowhere else on a page is a format saved or restored.
  const callers: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(name) && /\b(commitFormatChange|restoreIssuedFormat)\(/.test(readFileSync(full, "utf8"))) callers.push(name);
    }
  };
  walk(path.join(root, "frontend", "src", "components"));
  walk(path.join(root, "frontend", "src", "pages"));
  assert.deepEqual(callers.sort(), ["DocumentAssistant.tsx", "FormatEditor.tsx", "HeaderEditing.tsx", "ServiceReportRecordView.tsx", "SheetDesigner.tsx"]);
});

test("the question in English and in Gujarati: Are you sure? - Yes, I am sure / No", () => {
  assert.equal(STRINGS.en["sure.title"], "Are you sure?");
  assert.equal(STRINGS.en["sure.yes"], "Yes, I am sure");
  assert.equal(STRINGS.en["sure.no"], "No");
  const keys = ["sure.title", "sure.yes", "sure.no", "sure.words", "sure.wordsRubbedOut", "sure.page", "sure.pageBack", "sure.format", "sure.restore", "sure.formatChange", "sure.revisionNew", "sure.revisionNo", "sure.revisionDate", "sure.revisionKeep", "sure.revisionNoNeeded", "sure.revisionDateNeeded", "sure.formatWords", "sure.formatLineAdd", "sure.formatLineRemove"] as const;
  for (const key of keys) {
    assert.ok(STRINGS.gu[key] && STRINGS.gu[key] !== STRINGS.en[key], `${key} in Gujarati`);
    for (const slot of STRINGS.en[key].match(/\{\w+\}/g) ?? []) assert.ok(STRINGS.gu[key].includes(slot), `${key} keeps ${slot} in Gujarati`);
  }
});

test("a format change is saved as a new revision with the number and date asked, or without a new revision, keeping both (REQUIREMENTS §148)", () => {
  const d = doc("qc-bopp-film");
  const before = { no: d.revisionNo, date: d.revisionDate };
  const renamed = { ...draftOf(d), name: `${draftOf(d).name} (lab copy)` };
  const kept = commitFormatChange(d, renamed, { actor: "Test Desk", reason: "the lab asked", keepRevision: true });
  assert.ok(kept.ok, JSON.stringify(kept));
  const now = documentRepository.getByIdUnscoped(d.id)!;
  assert.deepEqual([now.revisionNo, now.revisionDate], [before.no, before.date], "the format keeps its number and date");
  assert.ok(kept.ok && /saved without a new revision/.test(kept.revision.summary), "and its history says so");
  const renamedAgain = { ...draftOf(now), name: `${draftOf(now).name} again` };
  const asked = commitFormatChange(now, renamedAgain, { actor: "Test Desk", reason: "the lab asked", revisionNo: "07", revisionDate: "2026-11-02" });
  assert.ok(asked.ok, JSON.stringify(asked));
  const after = documentRepository.getByIdUnscoped(d.id)!;
  assert.deepEqual([after.revisionNo, after.revisionDate], ["07", "2026-11-02"], "the number and the date asked");
  restoreIssuedFormat(after);
  // Every screen that saves a format asks which revision (the dialog's revision offer), the re-issue of the header excepted.
  for (const file of ["FormatEditor.tsx", "SheetDesigner.tsx"]) {
    assert.match(read("frontend", "src", "components", "documents", file), /t\("sure\.formatChange"/, `${file} asks which revision`);
  }
  // A header cell typed over asks it in its own panel, before Save (the owner, 31-Oct-2026).
  const header = read("frontend", "src", "components", "documents", "HeaderEditing.tsx");
  assert.ok(header.includes('data-choice="revision-new"') && header.includes('data-choice="revision-keep"') && header.includes('data-field="revision-no"'), "the header panel asks which revision");
});
