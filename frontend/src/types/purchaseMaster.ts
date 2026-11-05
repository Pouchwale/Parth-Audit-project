// PURCHASE MASTER DATA (REQUIREMENTS §186) — the List of Approved Suppliers (F/PUR/03) kept as Purchase's master sheet,
// one line per supplier and product, with the supplier's rating (F/PUR/05's Product Safety, Quality and Delivery
// Ratings, and what they are worth at their weights). engine/purchaseMaster.ts works the sheet out.

/** The cells of a line a person writes. Every one is text: a rating is the figure as written ("100", "97.5"). */
export type SupplierKey =
  | "vendorCode"
  | "supplierName"
  | "productService"
  | "applicableProduct"
  | "category"
  | "manufacturerName"
  | "srf"
  | "tdsSpecs"
  | "msds"
  | "foodGradeDeclaration"
  | "traceability"
  | "isoCertificate"
  | "serviceApproval"
  | "contactPerson"
  | "contactNumber"
  | "location"
  | "approvalDate"
  | "reapprovalDueDate"
  | "fileNo"
  | "productSafetyRating"
  | "qualityRating"
  | "deliveryRating"
  // The worked-out figures a person may type over (the owner, 5-Nov-2026: "make sure it should completely editable"):
  // blank, the figure is worked out from the ratings; typed, the typed figure stands until the cell is emptied.
  | "productSafetyWeightage"
  | "qualityWeightage"
  | "deliveryWeightage"
  | "overallRating"
  | "grade";

export type SupplierValues = Record<SupplierKey, string>;

export interface ApprovedSupplier extends SupplierValues {
  id: string;
  /** What Purchase is asked to confirm about the line (a cell the shared list leaves unreadable). Not a column of the sheet. */
  notes?: string[];
  /** Where a seeded line came from — "F/PUR/03 Sr. No. 32". Not a column of the sheet. */
  sources?: string[];
  updatedAt?: string;
  updatedBy?: string;
}
