// THE DOCUMENTS FETCH A SUPPLIER FROM PURCHASE MASTER DATA (REQUIREMENTS §186; the owner, 5-Nov-2026: "so it can be used in
// other document for fetching details from him"):
//   * every box the fetch writes is a box of its format (F/PUR/01, 02, 03, 05, 06 and the fourteen QC incoming records);
//   * a supplier is found by its Vendor Code or its name; two lines sharing a name are told apart by the product, or
//     offered to choose from;
//   * a form's blank boxes are filled at once and a written one only on "Replace" (supplierFill's conflicts);
//   * a register takes a line per supplier — the whole list at once: F/PUR/03 every line, F/PUR/05 the material
//     suppliers with their X / Y / Z, F/PUR/06 the service providers — on its blank lines first, never twice;
//   * "Fill blanks" fills only the blank boxes of the lines whose supplier is on the list.
// Run: npm run test:unit -- purchaseMasterLinks
import test from "node:test";
import assert from "node:assert/strict";
import type { ApprovedSupplier, LogSheetData, LogSheetRow } from "../src/types";
import { getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import { purchaseMasterSeed } from "../src/data/seed/purchaseMasterSeed";
import { isServiceProvider } from "../src/engine/purchaseMaster";
import {
  SUPPLIER_LINKS,
  addAllSuppliers,
  describeSupplier,
  fillBlanksFromSuppliers,
  lineForSupplier,
  searchSuppliers,
  serviceRatings50,
  startRegisterFromMaster,
  supplierBlankFills,
  supplierFill,
  supplierLinkFor,
  supplierNamedIn,
  suppliersForRegister,
  supplierValue,
} from "../src/engine/purchaseMasterLinks";
import { QC_INCOMING_DOC_IDS, SUPPLIER_LINK_DOC_IDS } from "../src/engine/supplierLinkDocs";

const seed = purchaseMasterSeed();
const line = (id: string): ApprovedSupplier => seed.find((s) => s.id === id)!;
const link = (docId: string) => supplierLinkFor(docId)!;
let n = 0;
const blankRow = (): LogSheetRow => ({ id: `r${++n}` });
const sheet = (rows: LogSheetRow[] = [], header: Record<string, string> = {}): LogSheetData => ({ header, rows });

test("every document that fetches a supplier has the boxes the fetch writes, and is the server's list too", () => {
  assert.equal(SUPPLIER_LINKS.length, 5 + 14);
  assert.deepEqual(
    SUPPLIER_LINKS.map((l) => l.docId),
    [...SUPPLIER_LINK_DOC_IDS]
  );
  for (const l of SUPPLIER_LINKS) {
    const layout = getLogSheetLayout(l.docId);
    assert.ok(layout, l.docId);
    const keys = new Set((l.where === "header" ? [...layout.headerFields, ...(layout.footerFields ?? [])] : layout.columns).map((f) => f.key));
    for (const f of l.fields) assert.ok(keys.has(f.key), `${l.docId}: ${f.key}`);
    assert.ok(keys.has(l.idField), `${l.docId}: the supplier's box ${l.idField}`);
    if (l.productField) assert.ok(keys.has(l.productField), `${l.docId}: the product's box ${l.productField}`);
  }
  assert.equal(QC_INCOMING_DOC_IDS.length, 14);
  for (const id of QC_INCOMING_DOC_IDS) assert.deepEqual(link(id).fields.map((f) => f.key), ["supplierName", "productDescription"], id);
  assert.equal(supplierLinkFor("hr-competence"), undefined);
});

test("a supplier is found by its Vendor Code or its name; two lines of one name are both offered", () => {
  assert.equal(searchSuppliers("S0137", seed).exact?.id, "pur-sup-32");
  assert.equal(searchSuppliers("s0137", seed).exact?.id, "pur-sup-32", "the code as anyone types it");
  assert.equal(searchSuppliers("K S Inctech Pvt Ltd", seed).exact?.id, "pur-sup-32", "the name, its full stops aside");
  const shikha = searchSuppliers("Shikha Trading Co.", seed);
  assert.equal(shikha.exact, null);
  assert.deepEqual(shikha.candidates.map((s) => s.productService), ["HMA", "Gum"]);
  assert.deepEqual(searchSuppliers("S0240", seed).candidates.length, 2, "one Vendor Code, two lines");
  assert.ok(searchSuppliers("printing ink", seed).candidates.length >= 4, "words: name, code and product");
  assert.deepEqual(searchSuppliers("gurudev", seed).candidates.map((s) => s.id), ["pur-sup-55"]);
  assert.deepEqual(searchSuppliers("No Such Supplier", seed).candidates, []);
  assert.equal(describeSupplier(line("pur-sup-32")), "S0137 · K S Inctech Pvt.Ltd. · Printing Ink · Grade A");
});

test("F/PUR/01, F/PUR/02 and a QC incoming record: blank boxes filled, a written one only on Replace", () => {
  const ks = line("pur-sup-32");
  const registration = supplierFill(link("pur-supplier-registration"), ks, { supplierName: "", telephoneNos: "0000" });
  assert.deepEqual(
    registration.fills.map((f) => [f.key, f.after]),
    [
      ["supplierName", "K S Inctech Pvt.Ltd."],
      ["contactPerson", "Rajnarayan"],
      ["companyActivities", "Manufacturing"],
      ["rangeOfProducts", "Printing Ink"],
      ["approvedProductsServices", "Printing Ink"],
    ]
  );
  assert.deepEqual(registration.conflicts, [{ key: "telephoneNos", before: "0000", after: "8754013955" }]);

  const audit = supplierFill(link("pur-supplier-audit-report"), ks, {});
  assert.deepEqual(audit.fills.find((f) => f.key === "contacts")?.after, "Rajnarayan, 8754013955");
  // A box that already says the same, its case and full stops aside, is left as written.
  assert.deepEqual(supplierFill(link("pur-supplier-audit-report"), ks, { supplier: "k s inctech pvt ltd" }).conflicts, []);

  const qc = supplierFill(link("qc-bopp-film"), line("pur-sup-r13"), {});
  assert.deepEqual(qc.fills.map((f) => [f.key, f.after]), [["supplierName", "Dimple Enterprise"], ["productDescription", "BOPP Lamination Film"]]);
  // A name left in the supplier's box fills that supplier's blank boxes, and nothing written.
  assert.deepEqual(supplierBlankFills(link("qc-bopp-film"), { productDescription: "" }, "Dimple Enterprise", seed), [{ key: "productDescription", before: "", after: "BOPP Lamination Film" }]);
  assert.deepEqual(supplierBlankFills(link("qc-bopp-film"), { productDescription: "BOPP 20 micron" }, "Dimple Enterprise", seed), [], "a written Product Description is left as written");
  assert.deepEqual(supplierBlankFills(link("qc-bopp-film"), {}, "Unknown Mills", seed), [], "a name not on the list fills nothing");
});

test("the list's own words stay on the list: a date box takes a date, a placeholder fills nothing, a service provider's activity is Services", () => {
  assert.equal(supplierValue(line("pur-sup-32"), "approvalDate"), "2025-01-17");
  assert.equal(supplierValue(line("pur-sup-53"), "approvalDate"), "", "Approved Prior to 01.1.2021 is not a date");
  assert.equal(supplierValue(line("pur-sup-56"), "contactPerson"), "", "the list's \"-\"");
  assert.equal(supplierValue(line("pur-sup-55"), "companyActivity"), "Services");
  assert.equal(supplierValue(line("pur-sup-36"), "companyActivity"), "Trading");
  assert.equal(supplierValue(line("pur-sup-32"), "qualityRating"), "100");
});

test("two lines of one supplier are told apart by the product the form names; otherwise none is taken for the other", () => {
  const audit = link("pur-supplier-audit-report");
  assert.equal(supplierNamedIn(audit, { supplier: "Shikha Trading Co.", productSupplied: "Gum" }, seed)?.id, "pur-sup-46");
  assert.equal(supplierNamedIn(audit, { supplier: "Shikha Trading Co." }, seed), null);
  assert.equal(supplierNamedIn(audit, { supplier: "S0137" }, seed)?.id, "pur-sup-32", "the Vendor Code in the box");
});

test("F/PUR/03: every supplier on the register at once, on its blank lines first, and never twice", () => {
  const l = link("pur-approved-suppliers");
  const start = sheet(Array.from({ length: 7 }, blankRow));
  const { data, added, already } = addAllSuppliers(l, start, blankRow, seed);
  assert.equal(added, seed.length);
  assert.equal(already, 0);
  assert.equal(data.rows.length, seed.length, "the seven blank lines used first");
  assert.equal(data.rows[0].id, start.rows[0].id);
  assert.deepEqual(
    [data.rows[0].vendorCode, data.rows[0].supplierName, data.rows[0].productService, data.rows[0].applicableProduct, data.rows[0].category, data.rows[0].contactNumber],
    ["S0137", "K S Inctech Pvt.Ltd.", "Printing Ink", "PRESSURE LABEL", "MANUFACTURER", "8754013955"]
  );
  // The list's own columns, as the plant's list writes them (REQUIREMENTS §188): the documents, the dates as written, the file.
  assert.deepEqual(
    [data.rows[0].srf, data.rows[0].isoCertificate, data.rows[0].approvalDate, data.rows[0].reapprovalDueDate, data.rows[0].fileNo],
    ["YES", "YES", "17-01-2025", "16-01-2028", "1"]
  );
  const byName = (name: string) => data.rows.find((r) => r.supplierName === name)!;
  assert.equal(byName("Gurudev Pest Control").srf, "SERVICE AGREEMENT", "a service provider's one document cell");
  assert.equal(byName("Gurudev Pest Control").tdsSpecs, undefined);
  assert.equal(byName("Hubergroup India Pvt.Ltd").traceability, "??", "copied as the list writes it");
  assert.equal(byName("Industrial Solution").contactPerson, "-", "copied as the list writes it");
  assert.equal(byName("Shilp Gravures Ltd.").approvalDate, "Approved Prior to 01.1.2021");
  const again = addAllSuppliers(l, data, blankRow, seed);
  assert.deepEqual([again.added, again.already], [0, seed.length], "a supplier already on the register is not added again");
  assert.deepEqual(
    data.rows.filter((r) => r.supplierName === "Shikha Trading Co.").map((r) => r.productService),
    ["HMA", "Gum"]
  );
});

test("F/PUR/05: the material suppliers with their X / Y / Z, a figure typed over on the list carried as typed; F/PUR/06: the service providers, 50 and 50, Continue", () => {
  const rmpm = link("pur-supplier-performance");
  const materials = suppliersForRegister(rmpm, seed);
  assert.equal(materials.length, seed.length - 12);
  assert.ok(materials.every((s) => !isServiceProvider(s)));
  const { data } = addAllSuppliers(rmpm, sheet([blankRow()]), blankRow, seed);
  assert.deepEqual(
    [data.rows[0].supplierName, data.rows[0].material, data.rows[0].productSafetyRating, data.rows[0].qualityRating, data.rows[0].deliveryRating],
    ["K S Inctech Pvt.Ltd.", "Printing Ink", "100", "100", "100"]
  );
  // The weightages, the Overall Rating and the Grade are the register's to work out: nothing of them is written...
  assert.deepEqual([data.rows[0].productSafetyWeightage, data.rows[0].overallRating, data.rows[0].grade, data.rows[0].typedCells], [undefined, undefined, undefined, undefined]);
  // ...unless typed over on the list (REQUIREMENTS §190): then carried, and marked typed on the line as on the list.
  const typed = { ...line("pur-sup-32"), grade: "B", overallRating: "88.00" };
  const one = lineForSupplier(rmpm, typed, blankRow());
  assert.deepEqual([one.grade, one.overallRating, one.productSafetyWeightage, one.typedCells], ["B", "88.00", undefined, "overallRating,grade"]);
  assert.deepEqual(supplierFill(rmpm, typed, { supplierName: "K S Inctech Pvt.Ltd." }).fills.map((f) => f.key), ["material", "productSafetyRating", "qualityRating", "deliveryRating", "overallRating", "grade"]);

  const services = link("pur-service-provider-performance");
  const sp = addAllSuppliers(services, sheet(), blankRow, seed);
  assert.equal(sp.added, 12);
  // The two ratings out of 50 from the list's full ratings - a good grade - and Continue (the owner, 6-Nov-2026: "give good grade only").
  assert.deepEqual(
    [sp.data.rows[0].supplierName, sp.data.rows[0].serviceDescription, sp.data.rows[0].deliveryRating, sp.data.rows[0].qualityRating, sp.data.rows[0].status],
    ["Gurudev Pest Control", "PEST CONTROL", "50", "50", "Continue"]
  );
  assert.ok(sp.data.rows.every((r) => r.deliveryRating === "50" && r.qualityRating === "50" && r.status === "Continue"));
  // A service provider rated lower on the list: its ratings halved, the decision the buyer's own.
  const low = { ...line("pur-sup-55"), deliveryRating: "70", qualityRating: "97", productSafetyRating: "80" };
  assert.deepEqual(serviceRatings50(low), { delivery: 35, quality: 44 });
  assert.deepEqual([supplierValue(low, "serviceDelivery50"), supplierValue(low, "serviceQuality50"), supplierValue(low, "serviceStatus")], ["35", "44", ""]);
});

test("the registers start as the list (§190): F/PUR/03 every supplier, F/PUR/05 the material suppliers, F/PUR/06 the service providers; any other sheet as it was", () => {
  const start = sheet(Array.from({ length: 7 }, blankRow));
  const all = startRegisterFromMaster("pur-approved-suppliers", start, blankRow, seed);
  assert.equal(all.rows.length, seed.length);
  assert.equal(all.rows[0].id, start.rows[0].id, "on its blank lines first");
  assert.equal(startRegisterFromMaster("pur-supplier-performance", sheet(), blankRow, seed).rows.length, seed.length - 12);
  const services = startRegisterFromMaster("pur-service-provider-performance", sheet(Array.from({ length: 13 }, blankRow)), blankRow, seed);
  assert.equal(services.rows.length, 13, "twelve service providers on the thirteen printed lines");
  assert.equal(services.rows[11].status, "Continue");
  assert.equal(services.rows[12].supplierName, undefined, "the thirteenth line blank");
  const other = sheet([blankRow()]);
  assert.equal(startRegisterFromMaster("pur-supplier-registration", other, blankRow, seed), other, "a form of one supplier starts blank");
  assert.equal(startRegisterFromMaster("qc-bopp-film", other, blankRow, seed), other);
});

test("Fill blanks: only the blank boxes of the lines whose supplier is on the list; a name not on it is said", () => {
  const l = link("pur-approved-suppliers");
  const rows: LogSheetRow[] = [
    { id: "a", supplierName: "Intertek", contactNumber: "" },
    { id: "b", supplierName: "K S Inctech Pvt.Ltd.", location: "Pune" },
    { id: "c", supplierName: "Unknown Mills" },
    { id: "d", supplierName: "" },
  ];
  const { data, filled, notOnList } = fillBlanksFromSuppliers(l, sheet(rows), seed);
  assert.deepEqual(notOnList, ["Unknown Mills"]);
  assert.equal(data.rows[0].contactNumber, "9837617259");
  assert.equal(data.rows[0].category, "SERVICE PROVIDER");
  assert.equal(data.rows[1].location, "Pune", "a written box is never changed");
  assert.equal(data.rows[1].contactNumber, "8754013955", "its blank ones are filled");
  assert.deepEqual(filled.map((f) => f.index), [0, 1]);
  assert.equal(data.rows[3].supplierName, "", "a blank line stays blank");
  // A line written for a supplier keeps the line's own id.
  assert.equal(lineForSupplier(l, line("pur-sup-58"), { id: "keep" }).id, "keep");
});
