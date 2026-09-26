// THE HEADER BLOCK OF EVERY FORMAT IS THE PLANT'S TO CHANGE (REQUIREMENTS §77):
// the company's name, the format number, the revision and its date join the
// name in a format draft, are described in the change history like any other
// change, are laid over the issued definition once saved, and go with
// "Restore the issued format". Without a browser: the engine and the repository.
import test from "node:test";
import assert from "node:assert/strict";
import type { DocumentDefinition } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { COMPANY } from "../src/data/seed/masterData";
import { formatEditFor, nextRevisionNo } from "../src/data/formatEdits";
import { commitFormatChange, describeFormatChange, draftOf, restoreIssuedFormat, validateDraft } from "../src/engine/formatOps";
import { todayISO } from "../src/utils/date";

ensureDocumentsSeeded();
ensureMasterSeeded();

const doc = (id: string): DocumentDefinition => {
  const d = documentRepository.getByIdUnscoped(id);
  assert.ok(d, `${id} is in the catalogue`);
  return d!;
};

test("a draft carries the whole header, and the paper's own company spelling where the format prints one", () => {
  const hr = draftOf(doc("hr-competence"));
  assert.equal(hr.companyName, undefined, "F/HR/01 prints the registered name");
  assert.equal(hr.formatNo, "F/HR/01");
  assert.equal(hr.revisionNo, doc("hr-competence").revisionNo);
  const mkt = draftOf(doc("mkt-customer-feedback"));
  assert.equal(mkt.companyName, "GUJARAT PRINT PACK PUBLICATION PRIVATE LIMITED", "the Marketing papers print PRINT PACK, two words");
  assert.equal(mkt.formatNo, "F/MKT/01");
  assert.equal(mkt.revisionDate, "2021-12-01");
});

test("each part of the header changed is a change in words — the next revision number alone is not", () => {
  const d = doc("hr-competence");
  const before = draftOf(d);
  assert.deepEqual(describeFormatChange(before, { ...before }), []);
  assert.deepEqual(describeFormatChange(before, { ...before, companyName: "GUJARAT PRINT PACK PUBLICATIONS PVT. LTD." }), ["changed the company name to “GUJARAT PRINT PACK PUBLICATIONS PVT. LTD.”"]);
  assert.deepEqual(describeFormatChange(before, { ...before, companyName: COMPANY.name }), [], "the registered name is what it prints already");
  assert.deepEqual(describeFormatChange(before, { ...before, formatNo: "F/HR/01-A" }), ["changed the format number from “F/HR/01” to “F/HR/01-A”"]);
  assert.deepEqual(describeFormatChange(before, { ...before, revisionDate: "2026-09-01" }), ["dated the revision 01-Sep-2026"]);
  assert.deepEqual(describeFormatChange(before, { ...before, revisionNo: nextRevisionNo(d.revisionNo) }), [], "every save is numbered the next one — that is not a change to describe");
  assert.deepEqual(describeFormatChange(before, { ...before, revisionNo: "07" }), ["numbered the revision 07"]);
  // A blank is refused before it can be saved.
  assert.equal(validateDraft({ ...before, formatNo: " " }), "The format needs its number.");
  assert.equal(validateDraft({ ...before, companyName: "" }), "The header needs the company's name.");
  assert.equal(validateDraft({ ...before, revisionDate: "1-9-2026" }), "The revision needs a real date.");
});

test("saved, the header change is laid over the format and every reader sees it; restored, the paper's own is back", () => {
  const id = "mkt-feedback-analysis";
  const issued = doc(id);
  const before = draftOf(issued);
  const result = commitFormatChange(issued, { ...before, companyName: "GUJARAT PRINT PACK PUBLICATIONS PVT. LTD.", revisionDate: "2026-09-01" }, { actor: "Test Desk", reason: "the letterhead prints the name in full" });
  assert.ok(result.ok, JSON.stringify(result));
  if (!result.ok) return;
  assert.equal(result.revision.revisionNo, "02");
  assert.equal(result.revision.revisionDate, "2026-09-01", "dated as the header was dated, not today");
  assert.match(result.revision.summary, /changed the company name/);
  const now = doc(id);
  assert.equal(now.companyName, "GUJARAT PRINT PACK PUBLICATIONS PVT. LTD.");
  assert.equal(now.revisionNo, "02");
  assert.equal(now.revisionDate, "2026-09-01");
  assert.equal(now.formatNo, "F/MKT/02", "untouched");
  // A second change, to the number, keeps the company name.
  const again = commitFormatChange(now, { ...draftOf(now), formatNo: "F/MKT/02-A" }, { actor: "Test Desk", reason: "renumbered on the master list" });
  assert.ok(again.ok, JSON.stringify(again));
  assert.equal(doc(id).formatNo, "F/MKT/02-A");
  assert.equal(doc(id).companyName, "GUJARAT PRINT PACK PUBLICATIONS PVT. LTD.");
  assert.equal(doc(id).revisionNo, "03");
  assert.equal(doc(id).revisionDate, todayISO(), "a date left as the header had it means today — every save is dated the day it is made");
  assert.equal(formatEditFor(id)?.formatNo, "F/MKT/02-A");
  // Typed back to what the paper prints, nothing is stored for it.
  const back = commitFormatChange(doc(id), { ...draftOf(doc(id)), companyName: "GUJARAT PRINT PACK PUBLICATION PRIVATE LIMITED" }, { actor: "Test Desk", reason: "as the paper" });
  assert.ok(back.ok, JSON.stringify(back));
  assert.equal(formatEditFor(id)?.companyName, undefined, "the issued spelling is not an override");
  assert.equal(doc(id).companyName, "GUJARAT PRINT PACK PUBLICATION PRIVATE LIMITED");
  // Restored: the issued format, at its own revision, its own spelling.
  assert.equal(restoreIssuedFormat(doc(id)), true);
  const restored = doc(id);
  assert.equal(restored.companyName, "GUJARAT PRINT PACK PUBLICATION PRIVATE LIMITED");
  assert.equal(restored.formatNo, "F/MKT/02");
  assert.equal(restored.revisionNo, "01");
  assert.equal(restored.revisionDate, "2021-12-01");
  assert.equal(formatEditFor(id), undefined);
});

test("a form the program draws — no layout — changes its header the same way", () => {
  const id = "daily-pest-monitoring";
  const d = doc(id);
  assert.equal(d.kind !== "log-sheet", true);
  const result = commitFormatChange(d, { name: d.name, companyName: `${COMPANY.name}, MEHSANA`, formatNo: d.formatNo, revisionDate: "2026-09-26" }, { actor: "Test Desk", reason: "the plant's place on the header" });
  assert.ok(result.ok, JSON.stringify(result));
  assert.equal(doc(id).companyName, `${COMPANY.name}, MEHSANA`);
  assert.equal(doc(id).revisionNo, nextRevisionNo(d.revisionNo));
  assert.equal(restoreIssuedFormat(doc(id)), true);
  assert.equal(doc(id).companyName, undefined);
  assert.equal(doc(id).revisionNo, d.revisionNo);
});
