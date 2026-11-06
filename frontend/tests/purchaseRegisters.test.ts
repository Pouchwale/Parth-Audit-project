// PURCHASE'S DOCUMENTS AS THE PLANT'S PAPERS ARE, AND EVERY PART OF THEM EDITABLE (REQUIREMENTS §188; the owner, 6-Nov-2026:
// "make sure each and every part of this purchase module and all the documents in it are completely editable" and, of
// "LIST OF APPROVED SUPPLIERS.pdf", "in that header is fix as it is do that also and i want same document in system"):
//   * F/PUR/03's columns are the plant's list's, heading by heading; a service provider's six document cells are one;
//   * F/PUR/05 has the register's "Delayed" column;
//   * the worked-out cells of F/PUR/05 and F/PUR/06 can be typed over: a typed weightage counts in the Overall Rating, a
//     typed Overall Rating gives the Grade, a typed Grade stands, and an emptied cell is worked out again;
//   * the 2025 F/PUR/05 register is on file as supplied, its figures the register's own.
// Run: npm run test:unit -- purchaseRegisters
import test from "node:test";
import assert from "node:assert/strict";
import type { LogSheetData, LogSheetRow } from "../src/types";
import { getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import { withPurchaseRatings } from "../src/engine/purchaseRatings";
import { TYPED_CELLS, isTyped, typedKeys, typedOver } from "../src/engine/typedCells";
import { SEED_PUR_RECORDS } from "../src/data/seed/purchaseRecords";
import { SEED_HISTORICAL_RECORDS } from "../src/data/seed/historicalRecords";

const rated = (documentId: string, row: Partial<LogSheetRow>): LogSheetRow => withPurchaseRatings(documentId, { header: {}, rows: [{ id: "r1", ...row } as LogSheetRow] } as LogSheetData).rows[0];

test("F/PUR/03's columns are the plant's list's, in its order and wording", () => {
  const layout = getLogSheetLayout("pur-approved-suppliers")!;
  assert.deepEqual(
    layout.columns.map((c) => c.label),
    [
      "Vendor Code",
      "SUPPLIER NAME",
      "PRODUCT / SERVICE",
      "APPLICABLE PRODUCT (MONO CARTON / CORRUGATED BOX / PRESSURE LABEL / SHRINK SLEEVE)",
      "CATEGORY (TRADER / MANUFACTURER / SERVICE PROVIDER)",
      "MANUFACTURER NAME (IF MATERIALS PROCURED FROM TRADERS)",
      "SRF",
      "TDS/SPECS",
      "MSDS",
      "FOOD GRADE DECLARATION",
      "TRACEABILITY",
      "ISO CERTIFICATE",
      "CONTACT PERSON",
      "CONTACT NUMBER",
      "LOCATION",
      "APPROVAL DATE",
      "Re-approval Due date",
      "File No",
    ]
  );
  assert.deepEqual(layout.instructions, ["LIST OF APPROVED SUPPLIERS (RM, PM, SERVICE PROVIDER)"]);
  assert.deepEqual(layout.lineMerges, [{ whenKey: "category", whenValue: "SERVICE PROVIDER", from: "srf", to: "isoCertificate" }]);
  assert.ok(!layout.columns.some((c) => c.group === "METHOD OF APPROVAL"), "the 2021 blank format's ticks are gone");
});

test("F/PUR/05 has the register's Delayed column, after the lots rejected", () => {
  const keys = getLogSheetLayout("pur-supplier-performance")!.columns.map((c) => c.key);
  assert.equal(keys.indexOf("delayed"), keys.indexOf("lotsRejected") + 1);
  assert.equal(keys.indexOf("productSafetyRating"), keys.indexOf("delayed") + 1);
});

test("the worked-out cells of F/PUR/05 and F/PUR/06 can be typed over, and are worked out again when emptied", () => {
  const f05 = getLogSheetLayout("pur-supplier-performance")!;
  assert.deepEqual(
    f05.columns.filter((c) => c.computed).map((c) => [c.key, !!c.typable]),
    [
      ["productSafetyWeightage", true],
      ["qualityWeightage", true],
      ["deliveryWeightage", true],
      ["overallRating", true],
      ["grade", true],
    ]
  );
  assert.ok(getLogSheetLayout("pur-service-provider-performance")!.columns.find((c) => c.key === "overallRating")?.typable);

  const base = { productSafetyRating: 100, qualityRating: 100, deliveryRating: 100 };
  assert.deepEqual([rated("pur-supplier-performance", base).overallRating, rated("pur-supplier-performance", base).grade], ["100.00", "A"]);
  // A typed weightage counts in the Overall Rating; the Grade follows it.
  const typed = typedOver({ id: "r1", ...base } as LogSheetRow, "qualityWeightage", "25");
  assert.deepEqual(typedKeys(typed), ["qualityWeightage"]);
  const r = rated("pur-supplier-performance", typed);
  assert.deepEqual([r.qualityWeightage, r.overallRating, r.grade], ["25", "85.00", "B"]);
  // A typed Overall Rating gives the Grade; a typed Grade stands.
  assert.equal(rated("pur-supplier-performance", typedOver({ id: "r1", ...base } as LogSheetRow, "overallRating", "70")).grade, "C");
  assert.equal(rated("pur-supplier-performance", typedOver({ id: "r1", ...base } as LogSheetRow, "grade", "B")).grade, "B");
  // Emptied: worked out again, and nothing is left marked.
  const back = typedOver(typed, "qualityWeightage", "");
  assert.equal(back[TYPED_CELLS], undefined);
  assert.equal(isTyped(back, "qualityWeightage"), false);
  assert.equal(rated("pur-supplier-performance", back).qualityWeightage, "40.00");
  // F/PUR/06: the typed Overall Rating stands.
  assert.equal(rated("pur-service-provider-performance", typedOver({ id: "r1", deliveryRating: 40, qualityRating: 45 } as LogSheetRow, "overallRating", "90")).overallRating, "90");
  assert.equal(rated("pur-service-provider-performance", { deliveryRating: 40, qualityRating: 45 }).overallRating, "85");
});

test("the plant's 2025 F/PUR/05 register is on file as supplied, its figures the register's own", () => {
  assert.equal(SEED_PUR_RECORDS.length, 1);
  const record = SEED_PUR_RECORDS[0];
  assert.ok(SEED_HISTORICAL_RECORDS.some((r) => r.id === record.id), "among the pages on file");
  assert.deepEqual([record.documentId, record.dueDate, record.status], ["pur-supplier-performance", "2025-12-01", "Verified"]);
  const rows = record.data.rows;
  assert.equal(rows.length, 24);
  const line = (name: string) => rows.find((r) => r.supplierName === name)!;
  const printed = (name: string) => {
    const l = line(name);
    return [l.lotsReceived, l.lotsRejected, l.delayed, l.productSafetyWeightage, l.qualityWeightage, l.deliveryWeightage, l.overallRating, l.grade];
  };
  assert.deepEqual(printed("Avery Dennison (India)Pvt.Ltd."), [312, 10, 30, "50.00", "38.80", "9.00", "97.80", "A"]);
  assert.deepEqual(printed("Kurz India Pvt.Ltd."), [45, 0, 4, "50.00", "40.00", "9.10", "99.10", "A"]);
  assert.deepEqual(printed("Kaveri Metallsing & Coating Ind.Pvt.Ltd"), [9, 1, 1, "50.00", "35.60", "8.90", "94.50", "A"]);
  assert.deepEqual(printed("Marudhar Industries Ltd. (Unit-II)"), [21, 1, 1, "50.00", "38.00", "9.50", "97.50", "A"]);
  // The register prints A beside Mazda Agencies' 87.50: kept as printed, marked as typed over.
  assert.deepEqual(printed("Mazda Agencies"), [4, 1, 1, "50.00", "30.00", "7.50", "87.50", "A"]);
  assert.ok(isTyped(line("Mazda Agencies"), "grade"));
  assert.ok(rows.every((r) => r.period === "01.01.2025 ~ 31.12.2025"));
  assert.equal(rows.filter((r) => r.overallRating === "100.00").length, 17, "the seven below 100: Avery Dennison, Kurz, Manish, Dimple, Kaveri, Mazda, Marudhar");
});
