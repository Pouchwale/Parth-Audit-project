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
import { FIXED_SERVICE_QTY, USUAL_SERVICE_QTY, serviceQtyFillOnOpen } from "../src/engine/serviceMaterials";

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

  it("fills the fly report's Beta-Cyfluthrin quantity with its fixed 100 ml the same way (the owner, 31-Oct-2026)", () => {
    const doc = docOf("service-report-fly");
    const filled = serviceQtyFillOnOpen(doc.variantKey, blank(doc.id));
    assert.ok(filled);
    assert.ok(filled.lines.length > 0 && filled.lines.every((l) => l.materialName === "Beta-Cyfluthrin 2.45% SC" && l.qtyUsed === "100 ml"), JSON.stringify(filled.lines.map((l) => l.qtyUsed)));
    assert.equal(FIXED_SERVICE_QTY["Beta-Cyfluthrin 2.45% SC"], "100 ml");
    assert.equal(serviceQtyFillOnOpen(doc.variantKey, filled), null);
  });

  it("leaves a quantity a person wrote", () => {
    const general = docOf("service-report-general");
    const typed = blank(general.id);
    typed.lines = typed.lines.map((l) => ({ ...l, qtyUsed: "120 ml" }));
    assert.equal(serviceQtyFillOnOpen(general.variantKey, typed), null);
  });

  it("writes the rodent report's usual quantities on opening: glue boards 3, 4 or 5, the bait 40 or 50 gms (the owner, 4-Nov-2026, §184)", () => {
    assert.deepEqual([...USUAL_SERVICE_QTY["Glue Board"]], ["3", "4", "5"]);
    assert.deepEqual([...USUAL_SERVICE_QTY["Bromadiolone Cake"]], ["40 gms", "50 gms"]);
    const rodent = docOf("service-report-rodent");
    const qtys = (data: ServiceReportData, material: string) => [...new Set(data.lines.filter((l) => l.materialName === material).map((l) => l.qtyUsed))];
    const low = serviceQtyFillOnOpen(rodent.variantKey, blank(rodent.id), () => 0);
    assert.ok(low);
    assert.deepEqual([qtys(low, "Glue Board"), qtys(low, "Bromadiolone Cake")], [["3"], ["40 gms"]], "one quantity per material, on every line of it");
    const high = serviceQtyFillOnOpen(rodent.variantKey, blank(rodent.id), () => 0.999);
    assert.ok(high);
    assert.deepEqual([qtys(high, "Glue Board"), qtys(high, "Bromadiolone Cake")], [["5"], ["50 gms"]]);
    const middle = serviceQtyFillOnOpen(rodent.variantKey, blank(rodent.id), () => 0.5);
    assert.deepEqual(qtys(middle!, "Glue Board"), ["4"]);
    // Every quantity drawn is one of the usual ones.
    for (let i = 0; i < 40; i++) {
      const any = serviceQtyFillOnOpen(rodent.variantKey, blank(rodent.id))!;
      assert.ok(USUAL_SERVICE_QTY["Glue Board"].includes(qtys(any, "Glue Board")[0]) && USUAL_SERVICE_QTY["Bromadiolone Cake"].includes(qtys(any, "Bromadiolone Cake")[0]));
    }
    assert.equal(serviceQtyFillOnOpen(rodent.variantKey, low), null, "a report already written is left as it is");
    const typed = blank(rodent.id);
    typed.lines = typed.lines.map((l) => ({ ...l, qtyUsed: l.materialName === "Glue Board" ? "6" : "" }));
    const kept = serviceQtyFillOnOpen(rodent.variantKey, typed, () => 0)!;
    assert.deepEqual([qtys(kept, "Glue Board"), qtys(kept, "Bromadiolone Cake")], [["6"], ["40 gms"]], "a quantity a person wrote stays; only the blank one is written");
  });
});
