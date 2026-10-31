// THE PEST CONTROL SERVICE REPORT AS THE CONTRACTOR'S MARCH-2026 SHEET (REQUIREMENTS §118; the owner, 17-Oct-2026:
// "make sure it looks like it only"). The rodent report's standard plan is the contractor's: areas 1-8 on Glue Board
// (Trouble gum placement), areas 9-16 on Bromadiolone Cake (Baiting), the quantity written once for each block, the
// remarks one cell for the visit. The quantities, the remarks, the signatures are the person's, from the contractor's
// paper: a new record carries none of the specimen's. The other two services keep their own data.
//
// Run: npm run test:unit -- serviceReportPaper
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { DocumentDefinition, ServiceReportData } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { masterRepository, ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { createDefaultData } from "../src/engine/recordDefaults";
import { prepareKnownParts } from "../src/engine/knownParts";
import { fixedMaterialForServiceArea, isQuantityLine, normalizeServiceLines, serviceGroups } from "../src/engine/serviceMaterials";
import { SERVICE_PAPER_COLUMNS, SERVICE_PAPER_LABELS, servicePaperDate } from "../src/data/seed/serviceReportPaper";
import { validateForSubmit, validateForVerify } from "../src/engine/validation";

ensureDocumentsSeeded();
ensureMasterSeeded();

const master = masterRepository.get();
const docOf = (id: string): DocumentDefinition => {
  const d = documentRepository.getById(id);
  assert.ok(d, `${id} is in the catalogue`);
  return d;
};
const blank = (id: string, due = "2026-03-07"): ServiceReportData => createDefaultData(docOf(id), due, master) as ServiceReportData;

// The sixteen areas, as the contractor's March-2026 sheet numbers them.
const MARCH_AREAS = [
  "Printing machine - Ground Floor",
  "Anilox cleaning area - Ground floor",
  "Store - Label stock & PVC / PET Films - Ground floor",
  "First floor - Ink store",
  "RM Inward & FG Dispatch room - Ground floor",
  "Walkways - Ground Floor",
  "First floor - Walkways",
  "First floor - Slitting & Packing",
  "First floor - Offline punching & QC Inspection",
  "First floor - Printing machine",
  "First floor - Ink Kitchen",
  "First floor - Shrink Sleeve production",
  "First floor - Intermediate Store",
  "Change room & Locker room - Ground Floor",
  "QC Lab",
  "Canteen",
];

describe("the rodent service report is the March-2026 plan", () => {
  const doc = docOf("service-report-rodent");
  const data = blank(doc.id);

  it("has the contractor's sixteen areas, in the paper's order", () => {
    assert.deepEqual(
      data.lines.map((l) => l.areaName),
      MARCH_AREAS
    );
    assert.deepEqual(
      data.lines.map((l) => l.slNo),
      MARCH_AREAS.map((_, i) => i + 1)
    );
  });

  it("puts Glue Board / Trouble gum placement on areas 1-8 and Bromadiolone Cake / Baiting on areas 9-16", () => {
    data.lines.forEach((l, i) => {
      const [material, method] = i < 8 ? ["Glue Board", "Trouble gum placement"] : ["Bromadiolone Cake", "Baiting"];
      assert.equal(l.materialName, material, `line ${l.slNo}`);
      assert.equal(l.methodOfApplication, method, `line ${l.slNo}`);
    });
  });

  it("draws the report as two merged blocks of eight, the quantity typed on the first line of each", () => {
    const groups = serviceGroups(data.lines);
    assert.deepEqual(
      groups.map((g) => [g.first, g.size, g.materialName, g.methodOfApplication]),
      [
        [0, 8, "Glue Board", "Trouble gum placement"],
        [8, 8, "Bromadiolone Cake", "Baiting"],
      ]
    );
    assert.deepEqual(
      data.lines.map((_, i) => isQuantityLine(data.lines, i)).flatMap((q, i) => (q ? [i] : [])),
      [0, 8]
    );
  });

  it("a new record carries none of the specimen: no quantity, no remark, no signature", () => {
    for (const l of data.lines) {
      assert.equal(l.qtyUsed, "", `line ${l.slNo} quantity`);
      assert.equal(l.remarks, "", `line ${l.slNo} remarks`);
    }
    assert.equal(data.technicianSign, "");
    assert.equal(data.customerSign, "");
    assert.equal(data.serviceName, "Rodent Control Service");
  });

  it("the daily preparation writes the areas and the fixed materials only", () => {
    const prepared = prepareKnownParts(doc, "2026-03-07", master, undefined);
    assert.ok(prepared);
    const d = prepared.data as ServiceReportData;
    assert.equal(d.lines.length, 16);
    assert.ok(d.lines.every((l) => l.qtyUsed === "" && l.remarks === ""));
    assert.equal(d.technicianSign, "");
    assert.equal(d.customerSign, "");
  });

  it("the March data entered once per block is the paper: 3 on the eight glue-board lines, 50 gramms on the eight bait lines", () => {
    const typed = data.lines.map((l, i) => (i === 0 ? { ...l, qtyUsed: "3", remarks: "No Rodent Trapped" } : i === 8 ? { ...l, qtyUsed: "50 gramms" } : l));
    const lines = normalizeServiceLines(doc.variantKey, typed);
    assert.deepEqual(
      lines.map((l) => l.qtyUsed),
      [...Array(8).fill("3"), ...Array(8).fill("50 gramms")]
    );
    assert.equal(lines[0].remarks, "No Rodent Trapped");
    assert.equal(lines[1].remarks, "", "the remark is the visit's, written once, on the first line");
    assert.deepEqual(
      lines.map((l) => l.materialName),
      data.lines.map((l) => l.materialName)
    );
  });

  it("a typed-over material or method is set back to the area's own", () => {
    const lines = normalizeServiceLines(doc.variantKey, data.lines.map((l, i) => (i === 9 ? { ...l, materialName: "Rat poison", methodOfApplication: "Spraying" } : l)));
    assert.equal(lines[9].materialName, "Bromadiolone Cake");
    assert.equal(lines[9].methodOfApplication, "Baiting");
  });

  it("is filed without the technician's name and verified without the customer's (the owner, 31-Oct-2026, REQUIREMENTS s154 item 7)", () => {
    const record = { id: "r", documentId: doc.id, periodKey: "p", dueDate: "2026-03-07", status: "In Progress", isDemo: false, data, createdAt: "", updatedAt: "" } as never;
    assert.deepEqual(validateForSubmit(docOf(doc.id), record), { valid: true, errors: [] });
    const submitted = { ...(record as object), status: "Submitted" } as never;
    assert.deepEqual(validateForVerify(docOf(doc.id), submitted), { valid: true, errors: [] });
  });
});

describe("the other two services are unchanged", () => {
  it("General Pest Control Services: nine areas, one block of Deltamethrin 2.5% SC / Spraying", () => {
    const d = blank("service-report-general");
    assert.equal(d.lines.length, 9);
    assert.deepEqual(
      serviceGroups(d.lines).map((g) => [g.first, g.size, g.materialName, g.methodOfApplication]),
      [[0, 9, "Deltamethrin 2.5% SC", "Spraying"]]
    );
    assert.equal(d.lines[8].areaName, "Canteen");
  });

  it("Fly Control Services: nine areas, one block of Beta-Cyfluthrin 2.45% SC / Spraying", () => {
    const d = blank("service-report-fly");
    assert.equal(d.lines.length, 9);
    assert.deepEqual(
      serviceGroups(d.lines).map((g) => [g.first, g.size, g.materialName, g.methodOfApplication]),
      [[0, 9, "Beta-Cyfluthrin 2.45% SC", "Spraying"]]
    );
  });

  it("an area shared by name with the rodent report ('Canteen') is bait on the rodent report only", () => {
    assert.equal(fixedMaterialForServiceArea("Rodent Control Service", "Canteen").materialName, "Bromadiolone Cake");
    assert.equal(fixedMaterialForServiceArea("General Pest Control Services", "Canteen").materialName, "Deltamethrin 2.5% SC");
    assert.equal(fixedMaterialForServiceArea("Fly Control Services", "Canteen").materialName, "Beta-Cyfluthrin 2.45% SC");
  });
});

describe("the sheet's own words and measures", () => {
  it("writes the date as the paper does: 07.03.2026", () => {
    assert.equal(servicePaperDate("2026-03-07"), "07.03.2026");
    assert.equal(servicePaperDate(null), "");
  });

  it("has the contractor's six columns and headings", () => {
    assert.deepEqual(SERVICE_PAPER_COLUMNS, [9.29, 32.86, 18.29, 12.86, 15, 15.86]);
    assert.deepEqual([...SERVICE_PAPER_LABELS.headings], ["Sl.No", "Area of Pesticide Applied", "Material Name", "Qty used Nos/Grams", "Method of Application", "Remarks"]);
    assert.equal(SERVICE_PAPER_LABELS.technician, "GPC Technician Sign");
    assert.equal(SERVICE_PAPER_LABELS.customer, "Customer's representative sign");
  });
});

describe("the plant's stored area list follows the contractor's name for the fourth area", () => {
  it("renames 'Ink store - Ground floor' to 'First floor - Ink store' while the stored line still reads the old seed's words", () => {
    const stored = masterRepository.get();
    masterRepository.update({ areas: stored.areas.map((a) => (a.id === "area-rcs-4" ? { ...a, name: "Ink store - Ground floor" } : a)) });
    ensureMasterSeeded();
    assert.equal(masterRepository.get().areas.find((a) => a.id === "area-rcs-4")?.name, "First floor - Ink store");
  });

  it("leaves a name the plant itself wrote alone", () => {
    const stored = masterRepository.get();
    masterRepository.update({ areas: stored.areas.map((a) => (a.id === "area-rcs-4" ? { ...a, name: "Ink store (new building)" } : a)) });
    ensureMasterSeeded();
    assert.equal(masterRepository.get().areas.find((a) => a.id === "area-rcs-4")?.name, "Ink store (new building)");
    masterRepository.resetToSeed();
  });
});
