import type { LogSheetData, LogSheetRow, RecordInstance } from "../../types";
import { withPurchaseRatings } from "../../engine/purchaseRatings";
import { TYPED_CELLS } from "../../engine/typedCells";

// PURCHASE'S PAGE SUPPLIED FILLED IN (REQUIREMENTS §188) — page 1 of the owner's "LIST OF APPROVED SUPPLIERS.pdf", 5-Nov-2026:
// the plant's 2025 RM & PM supplier performance register (F/PUR/05, 00/01.12.2021), 01.01.2025 ~ 31.12.2025, its 24
// suppliers line by line, as printed. The owner, 6-Nov-2026: "i want same document in system which i have given to you".
//
//   * The lots received, rejected / returned / infested and delayed, and the three ratings are the register's; its
//     weightages, Overall Rating and Grade are worked out from them by the register's own arithmetic, and come to the
//     figures it prints (Avery Dennison 50.00 / 38.80 / 9.00 / 97.80).
//   * Mazda Agencies: the register prints Grade "A" beside its Overall Rating of 87.50, which its own Overall Rating table
//     grades "B" (80 to below 90). Kept as printed - typed over, so it is marked on the screen - for Purchase to confirm.
//   * Due on the register's yearly date (1 December, documentDefinitions.ts), 2025; on file, verified, as every supplied
//     page is.

const ON_FILE = "Purchase (register as supplied, 5-Nov-2026)";
const SEEDED_AT = "2026-11-05T00:00:00.000Z";
const PERIOD = "01.01.2025 ~ 31.12.2025";

// Supplier / Service provider Name | Material Description | lots received | rejected / returned / infested | delayed | X | Y | Z
const LINES: [string, string, number, number, number, number, number, number][] = [
  ["Avery Dennison (India)Pvt.Ltd.", "Label Stock", 312, 10, 30, 100, 97, 90],
  ["Jindal SMI Coated Products ltd", "Label Stock", 13, 0, 0, 100, 100, 100],
  ["UPM Kymmene India Pvt.Ltd.", "Label Stock", 29, 0, 0, 100, 100, 100],
  ["Kurz India Pvt.Ltd.", "Stamping Foil", 45, 0, 4, 100, 100, 91],
  ["Manish Packaging Pvt Ltd", "PVC cast Film", 29, 0, 2, 100, 100, 93],
  ["ADDON FILMTECH PRIVATE LIMITED", "PET-SHRINK FILM", 11, 0, 0, 100, 100, 100],
  ["Garware Hi-Tech Films Limited", "PET-SHRINK FILM", 1, 0, 0, 100, 100, 100],
  ["Centroiid Plastopack Industries", "PVC Blown Film", 6, 0, 0, 100, 100, 100],
  ["Akshar NX Digital Pvt.Ltd", "Nylo Plate", 30, 0, 0, 100, 100, 100],
  ["Creative Graphics Solutions (I) Ltd.", "Nylo Plate", 419, 0, 0, 100, 100, 100],
  ["Numex Blocks(India)Pvt.Ltd.", "Nylo Plate", 157, 0, 0, 100, 100, 100],
  ["Veepee Graphic Solutions ( P ) Ltd.", "Nylo Plate", 435, 0, 0, 100, 100, 100],
  ["Dimple Enterprise", "BOPP Lamination Film", 25, 0, 1, 100, 100, 96],
  ["Kaveri Metallsing & Coating Ind.Pvt.Ltd", "BOPP & Poly Film", 9, 1, 1, 100, 89, 89],
  ["JIL PACK MARKETING LLP", "Aluminium foil & bopa film", 3, 0, 0, 100, 100, 100],
  ["RAVIRAJ FOILS LIMITED", "Aluminium foil", 4, 0, 0, 100, 100, 100],
  ["Jagdamba Polymers", "PET/METPET", 11, 0, 0, 100, 100, 100],
  ["Mazda Agencies", "PET/METPET", 4, 1, 1, 100, 75, 75],
  ["OSCAR CHEMICALS PVT. LTD.", "PET/METPET", 4, 0, 0, 100, 100, 100],
  ["SHREE HARI POLY FILMS", "PET/METPET", 2, 0, 0, 100, 100, 100],
  ["SMART PACK SOLUTIONS", "PET/METPET", 3, 0, 0, 100, 100, 100],
  ["SHREE HARI TRADERS", "BOPP/BOPET", 26, 0, 0, 100, 100, 100],
  ["Marudhar Industries Ltd. (Unit-II)", "Ldpe Poly", 21, 1, 1, 100, 95, 95],
  ["PARIKH FLEXIBLES PRIVATE LIMITED", "Ldpe Poly", 11, 0, 0, 100, 100, 100],
];

const rows: LogSheetRow[] = LINES.map(([supplierName, material, lotsReceived, lotsRejected, delayed, productSafetyRating, qualityRating, deliveryRating], i) => ({
  id: `r${i + 1}`,
  supplierName,
  period: PERIOD,
  material,
  lotsReceived,
  lotsRejected,
  delayed,
  productSafetyRating,
  qualityRating,
  deliveryRating,
  // The register's printed "A" beside Mazda Agencies' 87.50, kept as printed.
  ...(supplierName === "Mazda Agencies" ? { grade: "A", [TYPED_CELLS]: "grade" } : {}),
}));

const data: LogSheetData = withPurchaseRatings("pur-supplier-performance", { header: {}, rows });

export const SEED_PUR_RECORDS: RecordInstance<LogSheetData>[] = [
  {
    id: "pur05-register-2025",
    documentId: "pur-supplier-performance",
    periodKey: "pur-supplier-performance:2025-12-01",
    dueDate: "2025-12-01",
    status: "Verified",
    isDemo: false,
    data,
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
    submittedBy: ON_FILE,
    submittedAt: SEEDED_AT,
    verifiedBy: ON_FILE,
    verifiedAt: SEEDED_AT,
  },
];
