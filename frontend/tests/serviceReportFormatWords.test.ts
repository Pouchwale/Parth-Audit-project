// THE SERVICE REPORT'S PRINTED WORDS ARE THE FORMAT'S (the owner, 31-Oct-2026, REQUIREMENTS §154: "whatever user change in
// format then it should be change from that format to all upcoming formats"), and Deltamethrin's quantity is fixed at
// 150 ml ("150 ml is fixed in quantity"), written when a person opens the report.
//
// Run: npm run test:unit -- serviceReportFormatWords
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { DocumentDefinition, ServiceReportData } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { masterRepository, ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { createDefaultData } from "../src/engine/recordDefaults";
import { formatEditFor, formatWordsAt } from "../src/data/formatEdits";
import { commitFormatChange, draftOf, restoreIssuedFormat } from "../src/engine/formatOps";
import { FIXED_SERVICE_QTY, serviceQtyFillOnOpen } from "../src/engine/serviceMaterials";

ensureDocumentsSeeded();
ensureMasterSeeded();

const docOf = (id: string): DocumentDefinition => {
  const d = documentRepository.getById(id);
  assert.ok(d, `${id} is in the catalogue`);
  return d;
};

describe("a printed word changed on the service report is the format's (§154)", () => {
  it("is saved on the format with the revision asked, and every report from then prints it; one handed in before keeps its words", () => {
    const doc = docOf("service-report-rodent");
    const before = new Date(Date.now() - 60_000).toISOString();
    const result = commitFormatChange(doc, { ...draftOf(doc), wordsAt: { place: "material:1", words: "Glue Pad", was: "Glue Board" } }, { actor: "Test Desk", reason: "Printed words reworded on the report", revisionNo: "07", revisionDate: "2026-10-31" });
    assert.ok(result.ok, JSON.stringify(result));
    const edit = formatEditFor(doc.id);
    assert.equal(edit?.revisionNo, "07");
    assert.equal(edit?.revisionDate, "2026-10-31");
    assert.match(edit?.revisions[0].summary ?? "", /reworded “Glue Board” to “Glue Pad”/);
    assert.equal(formatWordsAt(doc.id, "material:1", "Glue Board"), "Glue Pad", "a report open now, or made later");
    assert.equal(formatWordsAt(doc.id, "material:1", "Glue Board", before), "Glue Board", "a report handed in before the change");
    assert.equal(formatWordsAt(doc.id, "title", "Pest control Service Report"), "Pest control Service Report", "a place not changed");

    // Saved again without a new revision: the format keeps Rev 07, the newest words print.
    const now = docOf(doc.id);
    const kept = commitFormatChange(now, { ...draftOf(now), wordsAt: { place: "material:1", words: "Glue Board (yellow)", was: "Glue Pad" } }, { actor: "Test Desk", reason: "Printed words reworded on the report", keepRevision: true });
    assert.ok(kept.ok, JSON.stringify(kept));
    assert.equal(formatEditFor(doc.id)?.revisionNo, "07");
    assert.equal(formatWordsAt(doc.id, "material:1", "Glue Board"), "Glue Board (yellow)");
    assert.equal(formatEditFor(doc.id)?.printedWords?.["material:1"]?.length, 2);

    // Nothing changed is refused, as any format change is.
    const same = commitFormatChange(docOf(doc.id), { ...draftOf(docOf(doc.id)), wordsAt: { place: "title", words: "Pest control Service Report", was: "Pest control Service Report" } }, { actor: "Test Desk", reason: "x" });
    assert.equal(same.ok, false);

    restoreIssuedFormat(docOf(doc.id));
    assert.equal(formatWordsAt(doc.id, "material:1", "Glue Board"), "Glue Board", "restoring the issued format brings the paper's words back");
  });
});

describe("Deltamethrin's 150 ml is written when a person opens the report (§154)", () => {
  const master = masterRepository.get();
  const blank = (id: string): ServiceReportData => createDefaultData(docOf(id), "2026-11-18", master) as ServiceReportData;

  it("fills the general report's blank quantity on every Deltamethrin line, once", () => {
    const doc = docOf("service-report-general");
    const data = blank(doc.id);
    assert.ok(data.lines.length > 0);
    const filled = serviceQtyFillOnOpen(doc.variantKey, data);
    assert.ok(filled);
    for (const l of filled.lines.filter((x) => x.materialName === "Deltamethrin 2.5% SC")) assert.equal(l.qtyUsed, FIXED_SERVICE_QTY["Deltamethrin 2.5% SC"]);
    assert.equal(FIXED_SERVICE_QTY["Deltamethrin 2.5% SC"], "150 ml");
    assert.equal(serviceQtyFillOnOpen(doc.variantKey, filled), null, "a report already written is left as it is");
  });

  it("leaves a quantity a person wrote, and writes nothing on the rodent report (glue boards and bait are the technician's count)", () => {
    const general = docOf("service-report-general");
    const typed = blank(general.id);
    typed.lines = typed.lines.map((l) => ({ ...l, qtyUsed: "120 ml" }));
    assert.equal(serviceQtyFillOnOpen(general.variantKey, typed), null);
    const rodent = docOf("service-report-rodent");
    assert.equal(serviceQtyFillOnOpen(rodent.variantKey, blank(rodent.id)), null);
  });
});
