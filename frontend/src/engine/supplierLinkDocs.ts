// THE DOCUMENTS THAT FETCH A SUPPLIER FROM PURCHASE MASTER DATA (REQUIREMENTS §186) — the ids alone, with nothing
// imported, so the server can read them too (backend/accessLevels.ts holdsPurchaseMaster: a person who may see one of
// these is handed the list to fetch from, though only Purchase changes it). What each one fetches is
// engine/purchaseMasterLinks.ts.

/** The fourteen QC incoming-material inspection records (data/seed/qcIncomingLayouts.ts): "Supplier Name" and "Product Description" in their header. */
export const QC_INCOMING_DOC_IDS = [
  "qc-bopp-film",
  "qc-corrugated-box",
  "qc-label-stock",
  "qc-paper-core",
  "qc-pvc-pet-film",
  "qc-offset-ink",
  "qc-duplex-board",
  "qc-kraft-paper",
  "qc-flexo-ink",
  "qc-lamination-adhesive-inspection",
  "qc-side-pasting-adhesive",
  "qc-starch-powder",
  "qc-sheet-pasting-powder",
  "qc-incoming-lamination-film",
] as const;

/** Purchase's own formats that name a supplier, then the QC incoming records. */
export const SUPPLIER_LINK_DOC_IDS: readonly string[] = [
  "pur-supplier-registration",
  "pur-supplier-audit-report",
  "pur-approved-suppliers",
  "pur-supplier-performance",
  "pur-service-provider-performance",
  ...QC_INCOMING_DOC_IDS,
];
