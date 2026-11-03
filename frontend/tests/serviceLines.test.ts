// A LINE ADDED BELOW ANOTHER, OR REMOVED, ON THE PEST CONTROL SERVICE REPORT (the owner, 31-Oct-2026, REQUIREMENTS §154
// item 6: "can able to add 17, 18, 19 and more or can remove also ... applied for other two pest control also"): the
// format's area list in Master Data changes, asked with the revision, and every report not handed in follows.
//
// Run: npm run test:unit -- serviceLines
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { DocumentDefinition, ServiceReportData } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { masterRepository, ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { recordRepository } from "../src/data/repositories/recordRepository";
import { createDefaultData } from "../src/engine/recordDefaults";
import { formatEditFor } from "../src/data/formatEdits";
import { restoreIssuedFormat } from "../src/engine/formatOps";
import { normalizeServiceLines } from "../src/engine/serviceMaterials";
import { alignedServiceLines, commitServiceLineChange, serviceAreasAfter, serviceAreasOf, serviceLineRefusal } from "../src/engine/serviceLines";

ensureDocumentsSeeded();
ensureMasterSeeded();

const docOf = (id: string): DocumentDefinition => {
  const d = documentRepository.getById(id);
  assert.ok(d, `${id} is in the catalogue`);
  return d;
};
const blank = (id: string): ServiceReportData => createDefaultData(docOf(id), "2026-11-18", masterRepository.get()) as ServiceReportData;

describe("a line added below another, or removed, is the format's area list changed (§154 item 6)", () => {
  it("adds the line after the one chosen, in its block - on the format, in Master Data, on every open report and on the next; removes it the same way", () => {
    const doc = docOf("service-report-general");
    const before = serviceAreasOf(masterRepository.get(), doc.variantKey).map((a) => a.name);
    assert.equal(before.length, 9);
    const draft = {
      id: "svc-lines-draft",
      documentId: doc.id,
      periodKey: "2026-11",
      dueDate: "2026-11-18",
      status: "In Progress",
      isDemo: false,
      data: blank(doc.id),
      createdAt: "2026-11-01T00:00:00.000Z",
      updatedAt: "2026-11-01T00:00:00.000Z",
    } as never;
    recordRepository.upsertMany([draft]);
    const add = { kind: "add" as const, afterArea: "1st floor - Stair case", name: "Ground floor - Main gate", material: "Deltamethrin 2.5% SC", method: "Spraying" };
    const areas = serviceAreasOf(masterRepository.get(), doc.variantKey);
    assert.equal(serviceLineRefusal(areas, { ...add, name: "  " }), "Give the new line its area.");
    assert.match(serviceLineRefusal(areas, { ...add, name: "canteen" }) ?? "", /on the report already/, "the same name in other letters is the same line");
    assert.equal(serviceLineRefusal(areas, add), null);

    const added = commitServiceLineChange(doc, add, { actor: "Test Desk", keepRevision: true });
    assert.ok(added.ok, JSON.stringify(added));
    const after = serviceAreasOf(masterRepository.get(), doc.variantKey);
    assert.deepEqual(after.map((a) => a.name).slice(2, 5), ["1st floor - Stair case", "Ground floor - Main gate", "Ground floor - Mono carton area"]);
    assert.equal(after[3].material, "Deltamethrin 2.5% SC", "the Master Data area carries its block's material");
    assert.equal(after[3].method, "Spraying");
    assert.match(formatEditFor(doc.id)?.revisions[0].summary ?? "", /added the line “Ground floor - Main gate” after “1st floor - Stair case”/);
    assert.equal(formatEditFor(doc.id)?.revisionNo, doc.revisionNo, "saved without a new revision, as asked");
    const next = blank(doc.id);
    assert.equal(next.lines.length, 10, "the next report has the line");
    assert.deepEqual(
      next.lines.map((l) => l.slNo),
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      "numbered through"
    );
    assert.equal(next.lines[3].areaName, "Ground floor - Main gate");
    assert.ok(next.lines.every((l) => l.materialName === "Deltamethrin 2.5% SC" && l.methodOfApplication === "Spraying"), "one block still");
    const open = recordRepository.getById("svc-lines-draft");
    assert.equal((open?.data as ServiceReportData).lines.length, 10, "a report not yet handed in has the line too");
    assert.ok(JSON.stringify(open?.history ?? []).includes("The format's lines changed"), "with a line in its history");

    const removed = commitServiceLineChange(docOf(doc.id), { kind: "remove", area: "Ground floor - Main gate" }, { actor: "Test Desk", keepRevision: true });
    assert.ok(removed.ok, JSON.stringify(removed));
    assert.deepEqual(
      serviceAreasOf(masterRepository.get(), doc.variantKey).map((a) => a.name),
      before,
      "Master Data's list as before"
    );
    assert.equal(blank(doc.id).lines.length, 9);
    assert.equal((recordRepository.getById("svc-lines-draft")?.data as ServiceReportData).lines.length, 9);
    assert.match(formatEditFor(doc.id)?.revisions[0].summary ?? "", /removed the line “Ground floor - Main gate”/);

    recordRepository.remove("svc-lines-draft");
    restoreIssuedFormat(docOf(doc.id));
  });

  it("a rodent line added below a bait line joins the bait block with its quantity; what is written is kept; the visit's remark moves when its line goes; the last line stays", () => {
    const doc = docOf("service-report-rodent");
    const areas = serviceAreasOf(masterRepository.get(), doc.variantKey);
    assert.equal(areas.length, 16);
    const written = normalizeServiceLines(
      doc.variantKey,
      blank(doc.id).lines.map((l, i) => (i === 0 ? { ...l, qtyUsed: "3", remarks: "No Rodent Trapped" } : i === 8 ? { ...l, qtyUsed: "50 gramms" } : l))
    );
    const next = serviceAreasAfter(areas, { kind: "add", afterArea: "QC Lab", name: "Boiler room", material: "Bromadiolone Cake", method: "Baiting" }, `service-report:${doc.variantKey}`);
    const lines = alignedServiceLines(doc.variantKey, next, written);
    assert.equal(lines.length, 17);
    assert.equal(lines[15].areaName, "Boiler room");
    assert.equal(lines[15].slNo, 16);
    assert.equal(lines[15].materialName, "Bromadiolone Cake");
    assert.equal(lines[15].methodOfApplication, "Baiting");
    assert.equal(lines[15].qtyUsed, "50 gramms", "the block's quantity");
    assert.equal(lines[16].areaName, "Canteen");
    assert.equal(lines[0].qtyUsed, "3");
    assert.equal(lines[0].remarks, "No Rodent Trapped");
    assert.ok(lines.slice(0, 8).every((l) => l.materialName === "Glue Board"), "the glue-board block untouched");

    const fewer = alignedServiceLines(doc.variantKey, areas.slice(1), written);
    assert.equal(fewer.length, 15);
    assert.equal(fewer[0].areaName, "Anilox cleaning area - Ground floor");
    assert.equal(fewer[0].remarks, "No Rodent Trapped", "the visit's remark moves to the new first line");
    assert.equal(fewer[0].qtyUsed, "3", "the glue-board quantity stays with its block");
    assert.equal(serviceLineRefusal(areas.slice(0, 1), { kind: "remove", area: areas[0].name }), "The report keeps at least one line.");
    assert.equal(serviceLineRefusal(areas, { kind: "remove", area: "Nowhere" }), "That line is not on the report.");
  });

  it("a new report is made from the list as it stands, so a line added below a glue-board line is a glue-board line", () => {
    const doc = docOf("service-report-rodent");
    const added = commitServiceLineChange(doc, { kind: "add", afterArea: "First floor - Walkways", name: "Ground floor - Main gate", material: "Glue Board", method: "Trouble gum placement" }, { actor: "Test Desk", revisionNo: "09", revisionDate: "2026-10-31" });
    assert.ok(added.ok, JSON.stringify(added));
    assert.equal(formatEditFor(doc.id)?.revisionNo, "09");
    const next = blank(doc.id);
    assert.equal(next.lines.length, 17);
    assert.equal(next.lines[7].areaName, "Ground floor - Main gate");
    assert.equal(next.lines[7].materialName, "Glue Board");
    assert.equal(next.lines[8].areaName, "First floor - Slitting & Packing");
    assert.ok(next.lines.slice(0, 9).every((l) => l.materialName === "Glue Board") && next.lines.slice(9).every((l) => l.materialName === "Bromadiolone Cake"), "two blocks, nine and eight");
    const removed = commitServiceLineChange(docOf(doc.id), { kind: "remove", area: "Ground floor - Main gate" }, { actor: "Test Desk", keepRevision: true });
    assert.ok(removed.ok, JSON.stringify(removed));
    assert.equal(blank(doc.id).lines.length, 16);
    restoreIssuedFormat(docOf(doc.id));
  });
});
