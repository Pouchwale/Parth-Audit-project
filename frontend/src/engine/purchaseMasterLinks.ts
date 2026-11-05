import type { ApprovedSupplier, LogSheetData, LogSheetRow, SupplierKey } from "../types";
import type { FieldFill } from "./hrMaster";
import { isIsoDate } from "./hrMaster";
import { isBossSignedIn, isDocumentIdVisible } from "./departmentScope";
import { purchaseMasterRepository } from "../data/repositories/purchaseMasterRepository";
import { PURCHASE_DOCUMENT_IDS, RATING_KEYS, isServiceProvider, ratingOf, sameText, supplierRating } from "./purchaseMaster";
import { QC_INCOMING_DOC_IDS, SUPPLIER_LINK_DOC_IDS } from "./supplierLinkDocs";

// THE DOCUMENTS FETCH A SUPPLIER FROM PURCHASE MASTER DATA (REQUIREMENTS §186; the owner, 5-Nov-2026: "so it can be used in
// other document for fetching details from him"), the way the HR formats fetch a person (§53) and the Maintenance formats
// a machine (§74): a bar above the form — type the supplier's name or Vendor Code, and its boxes are filled from the list;
// blank boxes at once, a box that already holds something else only if the person says so. The supplier's box offers
// the list's names, and a name left in it fills that supplier's blank boxes. A register (F/PUR/03, 05, 06) can take the
// whole list at once — its every supplier, its material suppliers, its service providers — a line each, never twice.
//
//   F/PUR/01  Supplier Registration Form   SUPPLIER'S NAME, CONTACT PERSON, TELEPHONE NOS, COMPANY ACTIVITIES, the products
//   F/PUR/02  Supplier Audit Report        SUPPLIER, CONTACTS, PRODUCT SUPPLIED
//   F/PUR/03  List of Approved Suppliers   a line per supplier: name, product, category, manufacturer, contact, approval date
//   F/PUR/05  RM & PM performance          a line per material supplier: name, material, X, Y and Z
//   F/PUR/06  Service provider performance a line per service provider: the service and the name
//   QC incoming inspection (14 formats)   Supplier Name and Product Description
//
// A supplier is found by its Vendor Code or its name. Two lines of the list may share a name (Shikha Trading Co.'s HMA and
// its Gum): the format's product box tells them apart, and otherwise the person chooses.

export type SupplierSource = SupplierKey | "contacts" | "companyActivity";

export interface SupplierLink {
  docId: string;
  /** One supplier per record, in the boxes above the grid, or one supplier per line of a register. */
  where: "header" | "rows";
  /** The box that names the supplier. */
  idField: string;
  /** The box that names the product, when the format has one: it tells two lines of one supplier apart. */
  productField?: string;
  fields: { key: string; from: SupplierSource }[];
  /** A register the list can be put on at once: every line, the material suppliers, or the service providers. */
  all?: "every" | "materials" | "services";
}

const qcIncoming = (docId: string): SupplierLink => ({
  docId,
  where: "header",
  idField: "supplierName",
  productField: "productDescription",
  fields: [
    { key: "supplierName", from: "supplierName" },
    { key: "productDescription", from: "productService" },
  ],
});

export const SUPPLIER_LINKS: SupplierLink[] = [
  {
    docId: "pur-supplier-registration",
    where: "header",
    idField: "supplierName",
    fields: [
      { key: "supplierName", from: "supplierName" },
      { key: "contactPerson", from: "contactPerson" },
      { key: "telephoneNos", from: "contactNumber" },
      { key: "companyActivities", from: "companyActivity" },
      { key: "rangeOfProducts", from: "productService" },
      { key: "approvedProductsServices", from: "productService" },
    ],
  },
  {
    docId: "pur-supplier-audit-report",
    where: "header",
    idField: "supplier",
    productField: "productSupplied",
    fields: [
      { key: "supplier", from: "supplierName" },
      { key: "contacts", from: "contacts" },
      { key: "productSupplied", from: "productService" },
    ],
  },
  {
    docId: "pur-approved-suppliers",
    where: "rows",
    idField: "supplierName",
    productField: "productService",
    all: "every",
    fields: [
      { key: "supplierName", from: "supplierName" },
      { key: "productService", from: "productService" },
      { key: "category", from: "category" },
      { key: "manufacturerName", from: "manufacturerName" },
      { key: "contactPerson", from: "contactPerson" },
      { key: "contactNumber", from: "contactNumber" },
      { key: "location", from: "location" },
      { key: "approvalDate", from: "approvalDate" },
    ],
  },
  {
    docId: "pur-supplier-performance",
    where: "rows",
    idField: "supplierName",
    productField: "material",
    all: "materials",
    fields: [
      { key: "supplierName", from: "supplierName" },
      { key: "material", from: "productService" },
      { key: "productSafetyRating", from: "productSafetyRating" },
      { key: "qualityRating", from: "qualityRating" },
      { key: "deliveryRating", from: "deliveryRating" },
    ],
  },
  {
    docId: "pur-service-provider-performance",
    where: "rows",
    idField: "supplierName",
    productField: "serviceDescription",
    all: "services",
    fields: [
      { key: "serviceDescription", from: "productService" },
      { key: "supplierName", from: "supplierName" },
    ],
  },
  ...QC_INCOMING_DOC_IDS.map(qcIncoming),
];

export const supplierLinkFor = (docId: string | undefined): SupplierLink | undefined => (docId ? SUPPLIER_LINKS.find((l) => l.docId === docId) : undefined);

/** Does this person hold the list to fetch from? Whoever sees Purchase, or a document that fetches from it (backend/accessLevels.ts holdsPurchaseMaster). */
export const purchaseMasterHeld = (): boolean => isBossSignedIn() || [...PURCHASE_DOCUMENT_IDS, ...SUPPLIER_LINK_DOC_IDS].some((id) => isDocumentIdVisible(id));

/** May this person open the list itself (they see Purchase)? Anyone else who holds it only fetches from it. */
export const purchaseMasterOpenable = (): boolean => isBossSignedIn() || PURCHASE_DOCUMENT_IDS.some((id) => isDocumentIdVisible(id));

/** The list's lines that name a supplier. */
export const allSuppliers = (): ApprovedSupplier[] => purchaseMasterRepository.all().filter((s) => s.supplierName.trim());

const PLACEHOLDER = /^(?:-+|–|—|\?+)$/;
const usable = (value: unknown): string => {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return PLACEHOLDER.test(text) ? "" : text;
};

const ACTIVITY: Record<string, string> = { TRADER: "Trading", MANUFACTURER: "Manufacturing", "SERVICE PROVIDER": "Services" };

/** What a box of the format gets from this line of the list: "" when the list has nothing for it. */
export function supplierValue(s: ApprovedSupplier, from: SupplierSource): string {
  if (from === "contacts") return [usable(s.contactPerson), usable(s.contactNumber)].filter(Boolean).join(", ");
  if (from === "companyActivity") return ACTIVITY[s.category.trim().toUpperCase()] ?? "";
  // A date box takes a date; the list's own words ("Approved Prior to 01.1.2021") stay on the list.
  if (from === "approvalDate" || from === "reapprovalDueDate") return isIsoDate(s[from]) ? s[from] : "";
  if ((RATING_KEYS as string[]).includes(from)) return ratingOf(s[from]);
  if (from === "productSafetyWeightage" || from === "qualityWeightage" || from === "deliveryWeightage" || from === "overallRating" || from === "grade") return supplierRating(s)[from];
  return usable(s[from]);
}

/** "S0137 · K S Inctech Pvt.Ltd. · Printing Ink · Grade A": what the list says the supplier is. */
export function describeSupplier(s: ApprovedSupplier): string {
  const grade = supplierRating(s).grade;
  return [usable(s.vendorCode), usable(s.supplierName), usable(s.productService), grade ? `Grade ${grade}` : ""].filter(Boolean).join(" · ");
}

const codeKey = (value: unknown): string => String(value ?? "").replace(/\s+/g, "").toUpperCase();
const words = (value: unknown): string[] =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter(Boolean);
const QUIET = new Set(["the", "a", "of", "and", "&", "pvt", "ltd", "private", "limited", "co"]);

export interface SupplierSearch {
  /** The one line the words name without doubt: its Vendor Code, or a name only it has. */
  exact: ApprovedSupplier | null;
  /** Every line they could mean (the exact one included). */
  candidates: ApprovedSupplier[];
}

/**
 * Lines of the list for what someone typed: a Vendor Code (S0137) or a supplier's name names its line; a code or a name two
 * lines share gives both to choose from; anything else is words, matched against name, code and product.
 */
export function searchSuppliers(query: unknown, suppliers: ApprovedSupplier[] = allSuppliers(), limit = 8): SupplierSearch {
  const q = String(query ?? "").trim();
  if (!q) return { exact: null, candidates: [] };
  const byCode = suppliers.filter((s) => codeKey(s.vendorCode) && codeKey(s.vendorCode) === codeKey(q));
  if (byCode.length > 0) return { exact: byCode.length === 1 ? byCode[0] : null, candidates: byCode.slice(0, limit) };
  const byName = suppliers.filter((s) => sameText(s.supplierName, q));
  if (byName.length > 0) return { exact: byName.length === 1 ? byName[0] : null, candidates: byName.slice(0, limit) };
  const all = words(q);
  const tokens = all.filter((w) => !QUIET.has(w)).length > 0 ? all.filter((w) => !QUIET.has(w)) : all;
  if (tokens.length === 0) return { exact: null, candidates: [] };
  const found = suppliers.filter((s) => {
    const own = words(`${s.supplierName} ${s.vendorCode} ${s.productService} ${s.serviceApproval}`);
    return tokens.every((t) => own.some((w) => w.startsWith(t)));
  });
  return { exact: null, candidates: found.slice(0, limit) };
}

/** The line of the list a form's boxes name: by Vendor Code or name, told apart by the form's product box when two share it. Null when none, or not one. */
export function supplierNamedIn(link: SupplierLink, current: Record<string, unknown>, suppliers: ApprovedSupplier[] = allSuppliers()): ApprovedSupplier | null {
  const name = usable(current[link.idField]);
  if (!name) return null;
  let found = suppliers.filter((s) => sameText(s.supplierName, name) || (codeKey(s.vendorCode) !== "" && codeKey(s.vendorCode) === codeKey(name)));
  if (found.length > 1 && link.productField) {
    const product = usable(current[link.productField]);
    if (product) found = found.filter((s) => sameText(s.productService, product));
  }
  return found.length === 1 ? found[0] : null;
}

const sameValue = (a: string, b: string): boolean => sameText(a, b) || (a !== "" && b !== "" && Number.isFinite(Number(a)) && Number(a) === Number(b));

export interface SupplierFill {
  /** Boxes that are blank: filled without asking. */
  fills: FieldFill[];
  /** Boxes that already hold something else: replaced only when the person says so. */
  conflicts: FieldFill[];
}

/** What fetching this line of the list onto a form's boxes, or onto one line of a register, would write. */
export function supplierFill(link: SupplierLink, s: ApprovedSupplier, current: Record<string, unknown>): SupplierFill {
  const fills: FieldFill[] = [];
  const conflicts: FieldFill[] = [];
  for (const f of link.fields) {
    const after = supplierValue(s, f.from);
    if (!after) continue;
    const before = String(current[f.key] ?? "").trim();
    if (before === after || (before && sameValue(before, after))) continue;
    (before ? conflicts : fills).push({ key: f.key, before, after });
  }
  return { fills, conflicts };
}

/** A register's line for this supplier, written on the line given (a blank one). */
export function lineForSupplier(link: SupplierLink, s: ApprovedSupplier, blank: LogSheetRow): LogSheetRow {
  const line: LogSheetRow = { ...blank };
  for (const f of link.fields) {
    const value = supplierValue(s, f.from);
    if (value) line[f.key] = value;
  }
  return line;
}

/** A line of a register with nothing written in the boxes the list fills: the next supplier goes there before a line is added. */
export const isBlankLine = (link: SupplierLink, row: LogSheetRow): boolean => link.fields.every((f) => !String(row[f.key] ?? "").trim());

/** The boxes a supplier's name, left in its box, fills: the blank ones only. */
export function supplierBlankFills(link: SupplierLink, current: Record<string, unknown>, value: unknown, suppliers: ApprovedSupplier[] = allSuppliers()): FieldFill[] {
  const withName = { ...current, [link.idField]: value };
  const s = supplierNamedIn(link, withName, suppliers);
  return s ? supplierFill(link, s, withName).fills : [];
}

export interface SupplierBlankFill {
  data: LogSheetData;
  /** Each supplier something was filled for: the line (null for the boxes above the grid), its name, the boxes. */
  filled: { index: number | null; name: string; fills: FieldFill[] }[];
  /** Names written on the form that are not on the list, or that name two of its lines. */
  notOnList: string[];
}

/** Every blank box the list can fill, for every supplier the form names. Nothing already written is changed. */
export function fillBlanksFromSuppliers(link: SupplierLink, data: LogSheetData, suppliers: ApprovedSupplier[] = allSuppliers()): SupplierBlankFill {
  const filled: SupplierBlankFill["filled"] = [];
  const notOnList: string[] = [];
  const apply = (current: Record<string, unknown>, index: number | null): Record<string, unknown> | null => {
    const name = usable(current[link.idField]);
    if (!name) return null;
    const s = supplierNamedIn(link, current, suppliers);
    if (!s) {
      if (!notOnList.includes(name)) notOnList.push(name);
      return null;
    }
    const { fills } = supplierFill(link, s, current);
    if (fills.length === 0) return null;
    filled.push({ index, name: s.supplierName, fills });
    return { ...current, ...Object.fromEntries(fills.map((f) => [f.key, f.after])) };
  };
  if (link.where === "header") {
    const header = apply(data.header ?? {}, null);
    return { data: header ? { ...data, header: header as LogSheetData["header"] } : data, filled, notOnList };
  }
  const rows = data.rows.map((r, i) => (apply(r, i) as LogSheetRow | null) ?? r);
  return { data: filled.length > 0 ? { ...data, rows } : data, filled, notOnList };
}

/** The list's lines a register takes all at once: F/PUR/03 every one, F/PUR/05 the material suppliers, F/PUR/06 the service providers. */
export function suppliersForRegister(link: SupplierLink, suppliers: ApprovedSupplier[] = allSuppliers()): ApprovedSupplier[] {
  if (!link.all) return [];
  return suppliers.filter((s) => s.supplierName.trim() && (link.all === "every" || (link.all === "services") === isServiceProvider(s)));
}

/**
 * The whole list on a register: a line for each of its suppliers that is not on the sheet yet (by name, and product where
 * the format has a product box), written on the sheet's blank lines first and then on new ones.
 */
export function addAllSuppliers(link: SupplierLink, data: LogSheetData, newLine: () => LogSheetRow, suppliers: ApprovedSupplier[] = allSuppliers()): { data: LogSheetData; added: number; already: number } {
  const rows = [...data.rows];
  const onSheet = (s: ApprovedSupplier) =>
    data.rows.some(
      (r) => sameText(r[link.idField], s.supplierName) && (!link.productField || !usable(r[link.productField]) || !usable(s.productService) || sameText(r[link.productField], s.productService))
    );
  let added = 0;
  let already = 0;
  for (const s of suppliersForRegister(link, suppliers)) {
    if (onSheet(s)) {
      already++;
      continue;
    }
    const blank = rows.findIndex((r) => isBlankLine(link, r));
    if (blank >= 0) rows[blank] = lineForSupplier(link, s, rows[blank]);
    else rows.push(lineForSupplier(link, s, newLine()));
    added++;
  }
  return { data: added > 0 ? { ...data, rows } : data, added, already };
}
