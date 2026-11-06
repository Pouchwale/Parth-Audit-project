// PURCHASE MASTER DATA — THE LIST OF APPROVED SUPPLIERS WITH THEIR RATING (REQUIREMENTS §186; the owner, 5-Nov-2026, with
// "LIST OF APPROVED SUPPLIERS.pdf": "all the rating will be full which is 100 and quality rating will be 97 to 100 so every
// time by default it is 100 and it should be editable ... product safety weightage ... 50% ... quality weightage 40% ...
// delivery weightage ... 10 ... overall rating ... 100 % by default"):
//   * every rating starts at 100, so a supplier reads 50.00 + 40.00 + 10.00 = 100.00, Grade A; the arithmetic is F/PUR/05's
//     own (the 2025 register's Avery Dennison line, 100 / 97 / 90, gives its printed 50.00 / 38.80 / 9.00 / 97.80);
//   * a changed rating is checked: Quality 97 to 100, the other two 0 to 100; an emptied cell is 100 again;
//   * the seed is the shared list cell by cell — F/PUR/03's Sr. No. 32 to 72 and the 2025 register's 24 suppliers — with a
//     service provider's one document cell, the dates as dates (or the list's own words), and the unreadable cells noted;
//   * the re-approval due date the list writes (three years less a day; a year for a service provider) is every seeded line's;
//   * the download, uploaded back, changes nothing; an upload matches by Vendor Code and PRODUCT / SERVICE, adds a new
//     supplier at 100, and leaves out a rating outside its band;
//   * the store: seeded once, a removed seeded line stays removed, an edit is kept;
//   * a heading typed over (the owner, 6-Nov-2026: "Make this part also editable", §189) is printed, downloaded and read
//     back from an upload as typed, kept on the list through edits and seeding; emptied, the list's own again;
//   * the Excel prints on A4 as the page does (§189): landscape, one page wide, its heading row on every page, the company
//     at the top, page numbers at the foot, the screen's notes left off the paper, every cell's words wrapped.
// Run: npm run test:unit -- purchaseMaster
import test from "node:test";
import assert from "node:assert/strict";
import type { ApprovedSupplier } from "../src/types";
import {
  DOCUMENT_KEYS,
  LIST_COLUMNS,
  RATING_BANDS,
  RATING_DEFAULT,
  blankSupplierValues,
  checkRating,
  checkWorked,
  dateOrWords,
  isServiceProvider,
  planSupplierImport,
  reapprovalDue,
  shownDate,
  supplierProblems,
  supplierRating,
  supplierSheet,
  typedWorked,
  headingOf,
  supplierHeaderColumns,
} from "../src/engine/purchaseMaster";
import { purchaseMasterSeed, PURCHASE_MASTER_SEEDED_BY } from "../src/data/seed/purchaseMasterSeed";
import { ensureSeeded, purchaseMasterRepository } from "../src/data/repositories/purchaseMasterRepository";
import { readJSON, storage, writeJSON } from "../src/data/storageAdapter";
import { buildXlsx, isoToSerial, unzip } from "../src/utils/xlsx";

const KEY = "purchaseMasterData";
const line = (id: string): ApprovedSupplier => {
  const found = purchaseMasterSeed().find((s) => s.id === id);
  assert.ok(found, id);
  return found;
};

test("every rating starts at 100: 50.00 + 40.00 + 10.00 = 100.00, Grade A", () => {
  const blank = blankSupplierValues();
  assert.deepEqual([blank.productSafetyRating, blank.qualityRating, blank.deliveryRating], ["100", "100", "100"]);
  assert.equal(RATING_DEFAULT, "100");
  assert.deepEqual(supplierRating(blank), { productSafetyWeightage: "50.00", qualityWeightage: "40.00", deliveryWeightage: "10.00", overallRating: "100.00", grade: "A" });
  // A rating left blank counts as full: the default, not a fail.
  assert.equal(supplierRating({ productSafetyRating: "", qualityRating: "", deliveryRating: "" }).overallRating, "100.00");
});

test("the arithmetic is F/PUR/05's own: X × 50%, Y × 40%, Z × 10%, their sum, and the printed grade table", () => {
  // The 2025 register's Avery Dennison line: 100 / 97.00 / 90.00 -> 50.00 / 38.80 / 9.00 / 97.80, A.
  assert.deepEqual(supplierRating({ productSafetyRating: "100", qualityRating: "97", deliveryRating: "90" }), {
    productSafetyWeightage: "50.00",
    qualityWeightage: "38.80",
    deliveryWeightage: "9.00",
    overallRating: "97.80",
    grade: "A",
  });
  assert.equal(supplierRating({ productSafetyRating: "100", qualityRating: "97", deliveryRating: "0" }).grade, "B", "88.80 is B (80 to below 90)");
  assert.equal(supplierRating({ productSafetyRating: "0", qualityRating: "100", deliveryRating: "100" }).grade, "C", "an infestation's 0 leaves 50.00: C");
});

test("a changed rating is checked: Quality 97 to 100, Product Safety and Delivery 0 to 100, an emptied cell 100 again", () => {
  assert.deepEqual(RATING_BANDS.qualityRating, { min: 97, max: 100 });
  assert.deepEqual(checkRating("qualityRating", "97"), { value: "97" });
  assert.deepEqual(checkRating("qualityRating", "98.5"), { value: "98.5" });
  assert.deepEqual(checkRating("qualityRating", "100"), { value: "100" });
  assert.deepEqual(checkRating("qualityRating", "96"), { error: "Quality Rating (Y) is 97 to 100, so 96 was not saved." });
  assert.ok("error" in checkRating("qualityRating", "101"));
  assert.deepEqual(checkRating("deliveryRating", "75"), { value: "75" });
  assert.deepEqual(checkRating("productSafetyRating", "0"), { value: "0" });
  assert.ok("error" in checkRating("deliveryRating", "120"));
  assert.ok("error" in checkRating("productSafetyRating", "-5"));
  assert.ok("error" in checkRating("deliveryRating", "full"));
  assert.deepEqual(checkRating("deliveryRating", "  "), { value: "100" }, "an emptied cell is full marks again");
});

test("every cell is editable: a weightage, the Overall Rating and the Grade can be typed over, and emptied back (the owner, 5-Nov-2026)", () => {
  const base = blankSupplierValues();
  assert.deepEqual(typedWorked(base), [], "nothing typed over at first");
  // A typed weightage counts in the Overall Rating, and the Overall Rating gives the Grade.
  const qw = { ...base, qualityWeightage: "35.00" };
  assert.deepEqual(supplierRating(qw), { productSafetyWeightage: "50.00", qualityWeightage: "35.00", deliveryWeightage: "10.00", overallRating: "95.00", grade: "A" });
  assert.deepEqual(typedWorked(qw), ["qualityWeightage"]);
  // A typed Overall Rating gives its own Grade; a typed Grade stands as typed.
  assert.deepEqual(supplierRating({ ...base, overallRating: "85.00" }).grade, "B");
  assert.deepEqual(supplierRating({ ...base, overallRating: "85.00", grade: "A" }).grade, "A");
  assert.deepEqual(supplierRating({ ...base, grade: "C" }), { productSafetyWeightage: "50.00", qualityWeightage: "40.00", deliveryWeightage: "10.00", overallRating: "100.00", grade: "C" });
  // Emptied, it is worked out again from the ratings.
  assert.deepEqual(supplierRating({ ...qw, qualityWeightage: "", qualityRating: "97" }).qualityWeightage, "38.80");
  // What may be typed: a weightage up to its weight, the Overall Rating 0 to 100, the Grade A, B or C.
  assert.deepEqual(checkWorked("productSafetyWeightage", "45"), { value: "45.00" });
  assert.deepEqual(checkWorked("qualityWeightage", "41"), { error: "Quality Weightage 40% is 0 to 40, so 41 was not saved." });
  assert.deepEqual(checkWorked("deliveryWeightage", "10"), { value: "10.00" });
  assert.ok("error" in checkWorked("deliveryWeightage", "11"));
  assert.deepEqual(checkWorked("overallRating", "99.5"), { value: "99.50" });
  assert.ok("error" in checkWorked("overallRating", "101"));
  assert.deepEqual(checkWorked("grade", "b"), { value: "B" });
  assert.ok("error" in checkWorked("grade", "D"));
  assert.ok("error" in checkWorked("overallRating", "full"));
});

test("the seed: F/PUR/03's Sr. No. 32 to 72 cell by cell, then the 2025 register's 24 suppliers — every one at 100, Grade A", () => {
  const seed = purchaseMasterSeed();
  assert.equal(seed.length, 41 + 24);
  assert.equal(new Set(seed.map((s) => s.id)).size, seed.length, "every id once");
  assert.ok(seed.every((s) => s.updatedBy === PURCHASE_MASTER_SEEDED_BY));
  for (const s of seed) {
    assert.deepEqual([s.productSafetyRating, s.qualityRating, s.deliveryRating], ["100", "100", "100"], s.supplierName);
    assert.deepEqual(supplierRating(s), { productSafetyWeightage: "50.00", qualityWeightage: "40.00", deliveryWeightage: "10.00", overallRating: "100.00", grade: "A" });
  }
  assert.deepEqual(supplierProblems(seed[0], "2026-11-05"), [], "a complete line has nothing wrong");

  const ks = line("pur-sup-32");
  assert.deepEqual(
    [ks.vendorCode, ks.supplierName, ks.productService, ks.applicableProduct, ks.category, ks.manufacturerName, ks.contactPerson, ks.contactNumber, ks.location, ks.approvalDate, ks.reapprovalDueDate, ks.fileNo],
    ["S0137", "K S Inctech Pvt.Ltd.", "Printing Ink", "PRESSURE LABEL", "MANUFACTURER", "NA", "Rajnarayan", "8754013955", "Banglore", "2025-01-17", "2028-01-16", "1"]
  );
  assert.deepEqual(DOCUMENT_KEYS.map((k) => ks[k]), ["YES", "YES", "YES", "YES", "YES", "YES"]);
  assert.deepEqual(DOCUMENT_KEYS.map((k) => line("pur-sup-48")[k]), ["YES", "NA", "YES", "NA", "NA", "NA"], "Ambica Traders");
  assert.equal(line("pur-sup-34").traceability, "??", "as the list writes it, and noted");
  assert.equal(line("pur-sup-36").manufacturerName, "TOYO Ink", "a trader's manufacturer");

  // Shikha Trading Co.: one Vendor Code, two lines — its HMA and its Gum.
  const shikha = seed.filter((s) => s.vendorCode === "S0240");
  assert.deepEqual(shikha.map((s) => `${s.productService} / ${s.applicableProduct}`), ["HMA / PRESSURE LABEL", "Gum / Mono Carton"]);

  // The service providers: twelve, each with the one cell the list draws across its documents.
  const services = seed.filter(isServiceProvider);
  assert.equal(services.length, 12);
  assert.deepEqual(
    services.map((s) => s.serviceApproval),
    ["SERVICE AGREEMENT", "ISO 17025 ACCREDITATION", "ISO 17025 ACCREDITATION", "ISO 17025 ACCREDITATION", ...Array(8).fill("SERVICE AGREEMENT")]
  );
  assert.ok(services.every((s) => DOCUMENT_KEYS.every((k) => s[k] === "") && s.approvalDate === "2025-04-01" && s.reapprovalDueDate === "2026-03-31" && s.fileNo === "Service File"));
  assert.equal(line("pur-sup-55").supplierName, "Gurudev Pest Control");

  // The list's own words where it gives no date.
  assert.deepEqual([line("pur-sup-53").approvalDate, line("pur-sup-53").reapprovalDueDate], ["Approved Prior to 01.1.2021", ""]);
  assert.equal(shownDate(line("pur-sup-53").approvalDate), "Approved Prior to 01.1.2021");
  assert.equal(shownDate(ks.approvalDate), "17-01-2025");

  // What the photograph leaves unreadable is noted, not guessed.
  assert.equal(line("pur-sup-61").supplierName, "?? Traders");
  for (const id of ["pur-sup-34", "pur-sup-61", "pur-sup-72"]) assert.equal(line(id).notes?.length, 1, id);
  assert.deepEqual(line("pur-sup-61").sources, ["F/PUR/03 Sr. No. 61"]);

  // The 2025 register's suppliers: the name and material it gives, the rest Purchase's to write in.
  const register = seed.filter((s) => s.id.startsWith("pur-sup-r"));
  assert.equal(register.length, 24);
  assert.deepEqual([register[0].supplierName, register[0].productService], ["Avery Dennison (India)Pvt.Ltd.", "Label Stock"]);
  assert.deepEqual([register[23].supplierName, register[23].productService], ["PARIKH FLEXIBLES PRIVATE LIMITED", "Ldpe Poly"]);
  assert.ok(register.every((s) => s.notes?.length === 1 && !s.vendorCode && !s.category && s.sources?.[0] === "F/PUR/05 01.01.2025 ~ 31.12.2025"));
});

test("the re-approval due date the list writes: three years less a day, a year less a day for a service provider — every seeded line's", () => {
  assert.equal(reapprovalDue("2025-01-17", false), "2028-01-16");
  assert.equal(reapprovalDue("2025-04-01", true), "2026-03-31");
  assert.equal(reapprovalDue("2024-02-29", false), "2027-02-28");
  assert.equal(reapprovalDue("Approved Prior to 01.1.2021", false), "");
  const dated = purchaseMasterSeed().filter((s) => /^\d{4}-/.test(s.approvalDate));
  assert.equal(dated.length, 39);
  for (const s of dated) assert.equal(reapprovalDue(s.approvalDate, isServiceProvider(s)), s.reapprovalDueDate, s.supplierName);
});

test("a date cell: a date as written becomes a date, anything else stays as written; a passed re-approval date is flagged", () => {
  assert.equal(dateOrWords("17.01.2025"), "2025-01-17");
  assert.equal(dateOrWords("17-01-2025"), "2025-01-17");
  assert.equal(dateOrWords("2025-01-17"), "2025-01-17");
  assert.equal(dateOrWords(String(isoToSerial("2025-01-17"))), "2025-01-17", "an Excel date");
  assert.equal(dateOrWords("  Approved  Prior to 01.1.2021 "), "Approved Prior to 01.1.2021");
  assert.equal(dateOrWords(""), "");
  const gurudev = line("pur-sup-55");
  assert.deepEqual(supplierProblems(gurudev, "2026-11-05"), [{ field: "reapprovalDueDate", message: "Re-approval was due on 31-03-2026.", tone: "warning" }]);
  assert.deepEqual(supplierProblems(gurudev, "2026-03-31"), [], "due that day is not passed");
  const wrong = { ...blankSupplierValues(), qualityRating: "89" };
  assert.deepEqual(
    supplierProblems(wrong, "2026-11-05").map((p) => [p.field, p.tone]),
    [
      ["supplierName", "danger"],
      ["qualityRating", "danger"],
    ]
  );
});

test("the download: F/PUR/03's headings and the rating's, a service provider's documents one merged cell, figures as figures", async () => {
  const seed = purchaseMasterSeed();
  const { columns, rows, merges } = supplierSheet(seed);
  assert.deepEqual(
    columns.map((c) => c.header).slice(0, 4),
    ["SR. NO.", "Vendor Code", "SUPPLIER NAME", "PRODUCT / SERVICE"]
  );
  assert.deepEqual(columns.slice(-9).map((c) => c.header), [
    "Product Safety Rating (X)",
    "Quality Rating (Y)",
    "Delivery Rating (Z)",
    "Product safety Weightage 50%",
    "Quality Weightage 40%",
    "Delivery Weightage 10%",
    "Overall Rating",
    "Grade",
    "Notes to confirm",
  ]);
  assert.equal(columns.length, 1 + LIST_COLUMNS.length + 3 + 5 + 1);
  assert.equal(merges.length, 12, "one per service provider");
  const srf = 1 + LIST_COLUMNS.findIndex((c) => c.key === "srf");
  const gurudev = seed.findIndex((s) => s.id === "pur-sup-55");
  assert.deepEqual(merges.find((m) => m.row === gurudev), { row: gurudev, from: srf, to: srf + 5 });
  assert.equal(rows[gurudev][srf], "SERVICE AGREEMENT");
  assert.deepEqual(rows[0].slice(-9, -1), ["100", "100", "100", "50.00", "40.00", "10.00", "100.00", "A"]);

  const bytes = buildXlsx("List of Approved Suppliers", columns, rows, merges);
  const xml = new TextDecoder().decode(await (await unzip(bytes.slice().buffer)).get("xl/worksheets/sheet1.xml")!());
  assert.ok(xml.includes('<mergeCells count="12">'), "the service providers' merged cells");
  assert.ok(xml.includes(`<v>${isoToSerial("2025-01-17")}</v>`), "a date is a real Excel date");
  assert.ok(/<c r="[A-Z]+2" s="4"><v>50<\/v><\/c>/.test(xml), "a weightage is a figure shown with two decimals");
  assert.ok(xml.indexOf("<autoFilter") < xml.indexOf("<mergeCells") && xml.indexOf("<mergeCells") < xml.indexOf("<pageMargins"), "in the order Excel requires");
});

test("the download uploaded back changes nothing", () => {
  const seed = purchaseMasterSeed();
  const { columns, rows } = supplierSheet(seed);
  // As Excel hands the workbook back: a date column's dates as serial numbers.
  const grid = [columns.map((c) => c.header), ...rows.map((r) => r.map((v, i) => (columns[i].kind === "date" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? String(isoToSerial(v)) : v)))];
  const plan = planSupplierImport(grid, seed);
  assert.ok(!("error" in plan));
  assert.deepEqual([plan.additions.length, plan.updates.length, plan.unchanged, plan.skipped.length, plan.warnings.length], [0, 0, seed.length, 0, 0], JSON.stringify(plan.updates.slice(0, 2)));
});

test("an upload: matched by Vendor Code and PRODUCT / SERVICE, a new supplier added at 100, a rating outside its band left out", () => {
  const seed = purchaseMasterSeed();
  const grid = [
    ["SR. NO.", "Vendor Code", "SUPPLIER NAME", "PRODUCT / SERVICE", "CATEGORY (TRADER / MANUFACTURER / SERVICE PROVIDER)", "SRF", "CONTACT NUMBER", "Quality Rating (Y)", "Delivery Rating (Z)"],
    ["45", "S0240", "Shikha Trading Co.", "HMA", "TRADER", "YES", "9825095968", "98", ""],
    ["46", "S0240", "Shikha Trading Co.", "Gum", "TRADER", "YES", "9825000000", "", "90"],
    ["73", "S1900", "New Film Mills", "BOPP Film", "manufacturer", "YES", "9800000000", "", ""],
    ["74", "", "Kaveri Metallsing & Coating Ind.Pvt.Ltd", "BOPP & Poly Film", "", "", "", "89", ""],
    ["75", "S0901", "Intertek", "PRODUCT TESTING", "SERVICE PROVIDER", "ISO 17025 ACCREDITATION", "9837617259", "", ""],
    ["76", "S1900", "New Film Mills", "BOPP Film", "MANUFACTURER", "", "", "", ""],
    ["", "", "", "", "", "", "", "", ""],
  ];
  const plan = planSupplierImport(grid, seed);
  assert.ok(!("error" in plan));
  assert.equal(plan.headerLine, 1);
  const byLine = new Map(plan.updates.map((u) => [u.line, u]));
  assert.deepEqual(byLine.get(2)?.changes.map((c) => [c.key, c.after]), [["qualityRating", "98"]], "Shikha's HMA line");
  assert.equal(byLine.get(2)?.supplierId, "pur-sup-45");
  assert.deepEqual(byLine.get(3)?.changes.map((c) => [c.key, c.after]), [["contactNumber", "9825000000"], ["deliveryRating", "90"]], "Shikha's Gum line");
  assert.equal(byLine.get(3)?.supplierId, "pur-sup-46");
  assert.equal(plan.additions.length, 1);
  assert.deepEqual(
    [plan.additions[0].values.supplierName, plan.additions[0].values.category, plan.additions[0].values.qualityRating, supplierRating(plan.additions[0].values).overallRating],
    ["New Film Mills", "MANUFACTURER", "100", "100.00"]
  );
  assert.deepEqual(plan.warnings, [{ line: 5, message: "Quality Rating (Y) is 97 to 100, so 89 was not saved." }]);
  assert.equal(plan.unchanged, 2, "Kaveri (its 89 left out) and Intertek (its one cell as the sheet has it)");
  assert.deepEqual(plan.skipped.map((s) => s.line), [7], "the same new supplier twice in the file");
  assert.ok("error" in planSupplierImport([["Something", "Else"], ["a", "b"]], seed));
});

test("the store: seeded once and then Purchase's own — an edit kept, a removed seeded line stays removed, an upload applied", () => {
  storage.removeItem(KEY);
  ensureSeeded();
  assert.equal(purchaseMasterRepository.all().length, 65);
  const saved = purchaseMasterRepository.update("pur-sup-32", { qualityRating: "98" }, "Chirag Parmar");
  assert.equal(saved?.qualityRating, "98");
  assert.equal(supplierRating(purchaseMasterRepository.get("pur-sup-32")!).overallRating, "99.20");
  purchaseMasterRepository.remove("pur-sup-33");
  ensureSeeded();
  assert.equal(purchaseMasterRepository.all().length, 64, "the removed seeded line is not brought back");
  assert.ok(readJSON<{ removedSeedIds: string[] }>(KEY, { removedSeedIds: [] }).removedSeedIds.includes("pur-sup-33"));
  const added = purchaseMasterRepository.add({ supplierName: "  New   Supplier " }, "Chirag Parmar");
  assert.equal(added.supplierName, "New Supplier");
  assert.deepEqual([added.productSafetyRating, added.qualityRating, added.deliveryRating], ["100", "100", "100"]);
  const plan = planSupplierImport(
    [
      ["Vendor Code", "SUPPLIER NAME", "PRODUCT / SERVICE", "Delivery Rating (Z)"],
      ["S0137", "K S Inctech Pvt.Ltd.", "Printing Ink", "95"],
      ["S2000", "Another Supplier", "Ink", ""],
    ],
    purchaseMasterRepository.all()
  );
  assert.ok(!("error" in plan));
  assert.deepEqual(purchaseMasterRepository.applyImport(plan, "Chirag Parmar"), { added: 1, updated: 1 });
  const ks = purchaseMasterRepository.get("pur-sup-32")!;
  assert.deepEqual([ks.qualityRating, ks.deliveryRating, supplierRating(ks).overallRating], ["98", "95", "98.70"]);
  assert.equal(purchaseMasterRepository.all().length, 66);
  storage.removeItem(KEY);
});

test("a heading typed over: printed, downloaded and read back as typed; emptied, the list's own again (§189)", () => {
  assert.equal(headingOf("srNo"), "SR. NO.");
  assert.equal(headingOf("supplierName"), "SUPPLIER NAME");
  assert.match(headingOf("listGroup"), /^LIST OF APPROVED SUPPLIERS \(RM, PM, SERVICE PROVIDER\)/);
  const headings = { supplierName: "Party", srNo: "S.N.", vendorCode: "   " };
  assert.equal(headingOf("supplierName", headings), "Party");
  assert.equal(headingOf("vendorCode", headings), "Vendor Code", "a heading emptied is the list's own");

  const seed = purchaseMasterSeed();
  const { columns } = supplierSheet(seed, headings);
  assert.deepEqual(columns.slice(0, 3).map((c) => c.header), ["S.N.", "Vendor Code", "Party"], "the download carries the headings as typed");

  // An upload of that download is read by the headings as typed: "Party" is no heading of the list's own.
  assert.equal(supplierHeaderColumns(["Vendor Code", "Party"]).supplierName, undefined);
  assert.deepEqual(supplierHeaderColumns(["Vendor Code", "Party", "PRODUCT / SERVICE"], headings), { vendorCode: 0, supplierName: 1, productService: 2 });
  const plan = planSupplierImport(
    [
      ["S.N.", "Vendor Code", "Party", "PRODUCT / SERVICE", "Delivery Rating (Z)"],
      ["1", "S0137", "K S Inctech Pvt.Ltd.", "Printing Ink", "95"],
    ],
    seed,
    headings
  );
  assert.ok(!("error" in plan));
  assert.deepEqual([plan.additions.length, plan.updates.length], [0, 1]);
  assert.deepEqual(plan.updates[0].changes.map((c) => [c.key, c.after]), [["deliveryRating", "95"]]);
});

test("the store keeps the headings typed over: through an edit, a removal and the seed merged in; emptied, gone (§189)", () => {
  storage.removeItem(KEY);
  ensureSeeded();
  assert.deepEqual(purchaseMasterRepository.headings(), {});
  purchaseMasterRepository.setHeading("supplierName", "  Party   name ");
  purchaseMasterRepository.setHeading("listGroup", "APPROVED SUPPLIERS");
  assert.deepEqual(purchaseMasterRepository.headings(), { supplierName: "Party name", listGroup: "APPROVED SUPPLIERS" });
  purchaseMasterRepository.update("pur-sup-32", { qualityRating: "99" }, "Chirag Parmar");
  purchaseMasterRepository.remove("pur-sup-33");
  // A seeded line missing from the stored list (and never removed) is merged back in: the headings stay.
  const raw = readJSON<{ suppliers: ApprovedSupplier[] }>(KEY, { suppliers: [] });
  writeJSON(KEY, { ...raw, suppliers: raw.suppliers.filter((s) => s.id !== "pur-sup-40") });
  ensureSeeded();
  assert.ok(purchaseMasterRepository.get("pur-sup-40"), "merged back");
  assert.equal(purchaseMasterRepository.headings().supplierName, "Party name");
  purchaseMasterRepository.setHeading("supplierName", " ");
  assert.deepEqual(purchaseMasterRepository.headings(), { listGroup: "APPROVED SUPPLIERS" });
  storage.removeItem(KEY);
});

test("the Excel prints on A4 as the page does: landscape, one page wide, headings on every page, the notes left off (§189)", async () => {
  const seed = purchaseMasterSeed();
  const { columns, rows, merges } = supplierSheet(seed);
  const bytes = buildXlsx("List of Approved Suppliers", columns, rows, merges, {
    landscape: true,
    fitToWidth: true,
    repeatHeading: true,
    header: "GUJARAT PRINT PACK PUBLICATIONS PVT LTD & CO — LIST OF APPROVED SUPPLIERS",
    printColumns: columns.length - 1,
    wrap: true,
  });
  const files = await unzip(bytes.slice().buffer);
  const read = async (name: string) => new TextDecoder().decode(await files.get(name)!());
  const [sheet, book, styles] = await Promise.all([read("xl/worksheets/sheet1.xml"), read("xl/workbook.xml"), read("xl/styles.xml")]);
  const last = rows.length + 1;
  // (Excel's column letters: the 27th is AA)
  const letters = (n: number): string => (n > 26 ? letters(Math.floor((n - 1) / 26)) : "") + String.fromCharCode(65 + ((n - 1) % 26));
  const lastPrinted = letters(columns.length - 1);
  assert.equal(letters(27), "AA");
  assert.equal(columns[columns.length - 1].header, "Notes to confirm");
  assert.ok(sheet.startsWith('<?xml') || sheet.includes("<worksheet"), "a worksheet");
  assert.ok(sheet.includes('<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension'), "scaled to the page, sheetPr first as Excel requires");
  assert.ok(sheet.includes('<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>'), "A4, landscape, one page wide");
  assert.ok(sheet.includes('<oddHeader>&amp;C&amp;"-,Bold"GUJARAT PRINT PACK PUBLICATIONS PVT LTD &amp;&amp; CO — LIST OF APPROVED SUPPLIERS</oddHeader>'), "the company at the top, its & doubled");
  assert.ok(sheet.includes("<oddFooter>&amp;RPage &amp;P of &amp;N</oddFooter>"), "page numbers at the foot");
  assert.ok(sheet.indexOf("<pageMargins") < sheet.indexOf("<pageSetup") && sheet.indexOf("<pageSetup") < sheet.indexOf("<headerFooter"), "in the order Excel requires");
  assert.ok(book.includes(`<definedName name="_xlnm.Print_Area" localSheetId="0">'List of Approved Suppliers'!$A$1:$${lastPrinted}$${last}</definedName>`), "the notes left off the paper");
  assert.ok(book.includes(`<definedName name="_xlnm.Print_Titles" localSheetId="0">'List of Approved Suppliers'!$1:$1</definedName>`), "the heading row on every page");
  // Every cell's words wrap; each style closed once, as XML must be.
  assert.equal((styles.match(/<alignment wrapText="1" vertical="top"\/>/g) ?? []).length, 5);
  assert.equal((styles.match(/<xf /g) ?? []).length - 1, (styles.match(/<\/xf>/g) ?? []).length, "every cell style closed (the one cellStyleXfs style self-closed)");
  assert.ok(!styles.includes("</xf/>"));

  // Without a page setup, the workbook is as before.
  const plain = new TextDecoder().decode(await (await unzip(buildXlsx("S", columns, rows, merges).slice().buffer)).get("xl/worksheets/sheet1.xml")!());
  assert.ok(!plain.includes("<pageSetup") && !plain.includes("<sheetPr>") && plain.includes('<pageMargins left="0.7"'));
});
