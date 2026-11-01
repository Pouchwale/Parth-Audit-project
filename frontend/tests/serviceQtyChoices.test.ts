// THE GLUE BOARDS' AND THE BAIT'S QUANTITY IS A CHOICE, NOTHING ELSE; THE VISIT'S REMARK IS WRITTEN ONCE (the owner,
// 1-Nov-2026, REQUIREMENTS §154 item 10, with a rodent report reading "36 grams" and "2. No Rodent Trapped" ... "16. No
// Rodent Trapped" under an empty remark).
//
// Run: npm run test:unit -- serviceQtyChoices
import { test } from "node:test";
import assert from "node:assert/strict";
import type { DocumentDefinition, ServiceReportAreaLine, ServiceReportData } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { masterRepository, ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { createDefaultData } from "../src/engine/recordDefaults";
import {
  SERVICE_QTY_CHOICES,
  foldServiceRemarks,
  nearestServiceQty,
  normalizeServiceLines,
  otherServiceRemarks,
  serviceQtyChoiceOf,
  serviceQtyChoiceWords,
  serviceQtyProblems,
} from "../src/engine/serviceMaterials";
import { validateForSubmit } from "../src/engine/validation";

ensureDocumentsSeeded();
ensureMasterSeeded();

const docOf = (id: string): DocumentDefinition => {
  const d = documentRepository.getById(id);
  assert.ok(d, `${id} is in the catalogue`);
  return d;
};
const rodent = docOf("service-report-rodent");
const blank = (): ServiceReportData => createDefaultData(rodent, "2026-11-18", masterRepository.get()) as ServiceReportData;
const withQty = (glue: string, bait: string): ServiceReportAreaLine[] =>
  normalizeServiceLines(rodent.variantKey, blank().lines.map((l, i) => (i === 0 ? { ...l, qtyUsed: glue } : i === 8 ? { ...l, qtyUsed: bait } : l)));

test("the choices: glue boards 3, 4 or 5; the bait 30, 40 or 50 grams", () => {
  assert.deepEqual(SERVICE_QTY_CHOICES["Glue Board"], ["3", "4", "5"]);
  assert.deepEqual(SERVICE_QTY_CHOICES["Bromadiolone Cake"], ["30 grams", "40 grams", "50 grams"]);
  assert.equal(serviceQtyChoiceWords("Glue Board"), "3, 4 or 5");
  assert.equal(serviceQtyChoiceWords("Bromadiolone Cake"), "30, 40 or 50 grams");
});

test("a quantity written as a choice is that choice; anything else is none", () => {
  for (const w of ["40", "40 gm", "40gm", "40 g", "40 grams", "40 gramms", " 40 GMS "]) assert.equal(serviceQtyChoiceOf("Bromadiolone Cake", w), "40 grams", w);
  for (const w of ["36 grams", "35", "45 gm", "400", "forty", ""]) assert.equal(serviceQtyChoiceOf("Bromadiolone Cake", w), null, w);
  for (const w of ["4", "4 nos", "4 Nos.", "4 pcs"]) assert.equal(serviceQtyChoiceOf("Glue Board", w), "4", w);
  for (const w of ["2", "6", "10 nos"]) assert.equal(serviceQtyChoiceOf("Glue Board", w), null, w);
  assert.equal(serviceQtyChoiceOf("Deltamethrin 2.5% SC", "150 ml"), null, "a material without choices has none");
});

test("written on the report, a choice is said as the choice says it; another value stays as written, and Submit refuses it", () => {
  const lines = withQty("4 nos", "40 gm");
  assert.equal(lines[0].qtyUsed, "4");
  assert.equal(lines[8].qtyUsed, "40 grams");
  assert.deepEqual(serviceQtyProblems(lines), []);
  const odd = withQty("3", "36 grams");
  assert.equal(odd[8].qtyUsed, "36 grams", "never changed for the person: they choose");
  assert.deepEqual(serviceQtyProblems(odd), ['Bromadiolone Cake: the quantity is 30, 40 or 50 grams - "36 grams" is not one of them.']);
  const record = (lines: ServiceReportAreaLine[]) =>
    ({ id: "r", documentId: rodent.id, periodKey: "p", dueDate: "2026-11-18", status: "In Progress", isDemo: false, data: { ...blank(), lines }, createdAt: "", updatedAt: "" }) as never;
  assert.deepEqual(validateForSubmit(rodent, record(odd)).errors, ['Bromadiolone Cake: the quantity is 30, 40 or 50 grams - "36 grams" is not one of them.']);
  assert.ok(validateForSubmit(rodent, record(lines)).valid);
  assert.ok(validateForSubmit(rodent, record(blank().lines)).valid, "a quantity not yet written is not refused");
});

test("Demo Mode's simulated quantities take the nearest choice", () => {
  assert.equal(nearestServiceQty("Bromadiolone Cake", "36 grams"), "40 grams");
  assert.equal(nearestServiceQty("Bromadiolone Cake", "35 grams"), "40 grams", "half way goes up");
  assert.equal(nearestServiceQty("Bromadiolone Cake", "31 grams"), "30 grams");
  assert.equal(nearestServiceQty("Glue Board", "2"), "3");
  assert.equal(nearestServiceQty("Glue Board", "7"), "5");
  assert.equal(nearestServiceQty("Deltamethrin 2.5% SC", "150 ml"), null);
});

test("the visit's remark is written once: the same remark on many lines and none on the first becomes the first's", () => {
  const lines = blank().lines.map((l, i) => (i === 0 ? l : { ...l, remarks: "No Rodent Trapped" }));
  const folded = foldServiceRemarks(lines);
  assert.equal(folded[0].remarks, "No Rodent Trapped");
  assert.ok(folded.slice(1).every((l) => l.remarks === ""));
  assert.deepEqual(otherServiceRemarks(folded), []);
  assert.equal(foldServiceRemarks(folded), folded, "folded already: the same array back");
  assert.equal(normalizeServiceLines(rodent.variantKey, lines)[0].remarks, "No Rodent Trapped", "every change to the lines folds them");
});

test("a different note on a line stays, once, with its lines' numbers; a single note is not made the visit's", () => {
  const lines = blank().lines.map((l, i) =>
    i === 0 ? l : i === 4 || i === 6 || i === 7 || i === 8 ? { ...l, remarks: "Bait consumed - replaced" } : { ...l, remarks: "No Rodent Trapped" }
  );
  const folded = foldServiceRemarks(lines);
  assert.equal(folded[0].remarks, "No Rodent Trapped");
  assert.deepEqual(otherServiceRemarks(folded), ["5, 7-9. Bait consumed - replaced"]);
  const one = blank().lines.map((l, i) => (i === 2 ? { ...l, remarks: "bait replaced" } : l));
  assert.equal(foldServiceRemarks(one), one, "one line's note stays that line's");
  assert.deepEqual(otherServiceRemarks(one), ["3. bait replaced"]);
  const lead = blank().lines.map((l, i) => (i === 0 ? { ...l, remarks: "No Rodent Trapped" } : i < 4 ? { ...l, remarks: "no rodent trapped" } : l));
  assert.ok(foldServiceRemarks(lead).slice(1).every((l) => l.remarks === ""), "a copy of the visit's remark in other letters goes too");
});
