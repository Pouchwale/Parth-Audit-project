import type { ApprovedSupplier, SupplierKey, SupplierValues } from "../types";
import { gradeForOverall, supplierRatingCells } from "./purchaseRatings";
import { isIsoDate, parseWrittenDate } from "./hrMaster";
import { formatDisplayDate, todayISO } from "../utils/date";
import type { SheetColumn, SheetMerge } from "../utils/xlsx";

// PURCHASE MASTER DATA — THE LIST OF APPROVED SUPPLIERS WITH THEIR RATING (REQUIREMENTS §186).
//
// The owner, 5-Nov-2026: "create a master data in Purchase module in which also called list of approved suppliers in
// which all type of rating product safety, quality rating, delivery rating, product safety weightage, quality
// weightage ... we have to keep good rating always ... all the rating will be full which is 100 and quality rating will
// be 97 to 100 so every time by default it is 100 and it should be editable ... who has given access ... delivery
// rating ... 100 by user can edit also ... product safety weightage ... 50% ... quality weightage 40% ... delivery
// weightage ... 10 ... overall rating ... 100 % by default", with the plant's own List of Approved Suppliers (F/PUR/03)
// and its 2025 RM & PM supplier performance register (F/PUR/05).
//
//   * The sheet's columns are F/PUR/03's own, in its order and wording (Vendor Code to File No), then F/PUR/05's three
//     ratings — Product Safety (X), Quality (Y), Delivery (Z) — and what they are worth: X at 50%, Y at 40%, Z at 10%,
//     the Overall Rating (the three added) and the Grade. The weighted figures are worked out by the same functions as
//     the F/PUR/05 register (engine/purchaseRatings.ts), so the two can never disagree.
//   * Every rating is 100 unless a person changes it (a line added, a line uploaded without one, a cell emptied), so a
//     supplier reads 50 + 40 + 10 = 100, Grade A. The Quality Rating is kept 97 to 100; the other two 0 to 100.
//   * F/PUR/03 draws a service provider's six document columns (SRF to ISO CERTIFICATE) as one cell — "SERVICE
//     AGREEMENT", "ISO 17025 ACCREDITATION" — and so does the sheet: a line whose CATEGORY is SERVICE PROVIDER has the one
//     cell (serviceApproval), any other line the six.
//   * A date cell holds a date (stored YYYY-MM-DD, shown 17-01-2025, REQUIREMENTS §171) or, when what is written is not a
//     date, the words as written — F/PUR/03's "Approved Prior to 01.1.2021".

export const PURCHASE_MASTER_SHEET_NAME = "List of Approved Suppliers";

/** The documents Purchase keeps (data/seed/documentDepartments.ts PUR): a person who sees one holds the sheet, one who may fill one changes it. */
export const PURCHASE_DOCUMENT_IDS = [
  "pur-supplier-registration",
  "pur-supplier-audit-report",
  "pur-approved-suppliers",
  "pur-supplier-performance",
  "pur-service-provider-performance",
  "service-agreement",
] as const;

export const SERVICE_PROVIDER = "SERVICE PROVIDER";
/** F/PUR/03's CATEGORY heading: (TRADER / MANUFACTURER / SERVICE PROVIDER). */
export const SUPPLIER_CATEGORIES = ["TRADER", "MANUFACTURER", SERVICE_PROVIDER] as const;
/** What the list writes under APPLICABLE PRODUCT: the four its heading names, and the others its lines use. */
export const APPLICABLE_PRODUCTS = ["MONO CARTON", "CORRUGATED BOX", "PRESSURE LABEL", "SHRINK SLEEVE", "PRESSURE LABEL + SHRINK SLEEVE", "Laminated", "TRAYS", "GENERAL", "NA"] as const;
/** What the list writes under SRF, TDS/SPECS, MSDS, FOOD GRADE DECLARATION, TRACEABILITY and ISO CERTIFICATE. */
export const DOCUMENT_ANSWERS = ["YES", "NO", "NA"] as const;
/** What the list writes across a service provider's document cells. */
export const SERVICE_APPROVALS = ["SERVICE AGREEMENT", "ISO 17025 ACCREDITATION"] as const;

export type SupplierColumnKind = "text" | "category" | "document" | "date" | "rating";

export interface SupplierColumn {
  key: SupplierKey;
  /** The heading as F/PUR/03 or F/PUR/05 prints it. */
  label: string;
  kind: SupplierColumnKind;
  /** Width on the screen, in pixels. */
  width: number;
}

/** F/PUR/03's columns after its SR. NO. (which the sheet numbers itself), in its order and wording. */
export const LIST_COLUMNS: SupplierColumn[] = [
  { key: "vendorCode", label: "Vendor Code", kind: "text", width: 90 },
  { key: "supplierName", label: "SUPPLIER NAME", kind: "text", width: 230 },
  { key: "productService", label: "PRODUCT / SERVICE", kind: "text", width: 170 },
  { key: "applicableProduct", label: "APPLICABLE PRODUCT (MONO CARTON / CORRUGATED BOX / PRESSURE LABEL / SHRINK SLEEVE)", kind: "text", width: 170 },
  { key: "category", label: "CATEGORY (TRADER / MANUFACTURER / SERVICE PROVIDER)", kind: "category", width: 160 },
  { key: "manufacturerName", label: "MANUFACTURER NAME (IF MATERIALS PROCURED FROM TRADERS)", kind: "text", width: 180 },
  { key: "srf", label: "SRF", kind: "document", width: 66 },
  { key: "tdsSpecs", label: "TDS/SPECS", kind: "document", width: 74 },
  { key: "msds", label: "MSDS", kind: "document", width: 66 },
  { key: "foodGradeDeclaration", label: "FOOD GRADE DECLARATION", kind: "document", width: 90 },
  { key: "traceability", label: "TRACEABILITY", kind: "document", width: 90 },
  { key: "isoCertificate", label: "ISO CERTIFICATE", kind: "document", width: 80 },
  { key: "contactPerson", label: "CONTACT PERSON", kind: "text", width: 150 },
  { key: "contactNumber", label: "CONTACT NUMBER", kind: "text", width: 130 },
  { key: "location", label: "LOCATION", kind: "text", width: 120 },
  { key: "approvalDate", label: "APPROVAL DATE", kind: "date", width: 130 },
  { key: "reapprovalDueDate", label: "Re-approval Due date", kind: "date", width: 120 },
  { key: "fileNo", label: "File No", kind: "text", width: 90 },
];

/** F/PUR/03's six document columns, which a service provider's line draws as one cell. */
export const DOCUMENT_KEYS = LIST_COLUMNS.filter((c) => c.kind === "document").map((c) => c.key);

/** F/PUR/05's three ratings, as its headings print them. */
export const RATING_COLUMNS: SupplierColumn[] = [
  { key: "productSafetyRating", label: "Product Safety Rating (X)", kind: "rating", width: 92 },
  { key: "qualityRating", label: "Quality Rating (Y)", kind: "rating", width: 92 },
  { key: "deliveryRating", label: "Delivery Rating (Z)", kind: "rating", width: 92 },
];

/** Every column a person writes in, in the sheet's order; the one service-provider cell is not a column of its own. */
export const SUPPLIER_COLUMNS: SupplierColumn[] = [...LIST_COLUMNS, ...RATING_COLUMNS];

export type RatingKey = "productSafetyRating" | "qualityRating" | "deliveryRating";
export const RATING_KEYS: RatingKey[] = ["productSafetyRating", "qualityRating", "deliveryRating"];

/** A rating nobody has changed is full marks (the owner, 5-Nov-2026: "every time by default it is 100"). */
export const RATING_DEFAULT = "100";

/** The figures each rating may be: the Quality Rating 97 to 100 (the owner's word), the other two 0 to 100. */
export const RATING_BANDS: Record<RatingKey, { min: number; max: number }> = {
  productSafetyRating: { min: 0, max: 100 },
  qualityRating: { min: 97, max: 100 },
  deliveryRating: { min: 0, max: 100 },
};

/** F/PUR/05's worked-out columns, as its headings print them: the three ratings at their weights, their sum and its letter. */
export const WORKED_COLUMNS = [
  { key: "productSafetyWeightage", label: "Product safety Weightage 50%", width: 108 },
  { key: "qualityWeightage", label: "Quality Weightage 40%", width: 104 },
  { key: "deliveryWeightage", label: "Delivery Weightage 10%", width: 104 },
  { key: "overallRating", label: "Overall Rating", width: 112 },
  { key: "grade", label: "Grade", width: 132 },
] as const;

export type WorkedKey = (typeof WORKED_COLUMNS)[number]["key"];
export type SupplierRating = Record<WorkedKey, string>;
export const WORKED_KEYS: WorkedKey[] = WORKED_COLUMNS.map((c) => c.key);

/** What a figure typed over a worked-out one may be: a weightage up to its weight's worth, the Overall Rating 0 to 100. */
export const WORKED_BANDS: Record<Exclude<WorkedKey, "grade">, { min: number; max: number }> = {
  productSafetyWeightage: { min: 0, max: 50 },
  qualityWeightage: { min: 0, max: 40 },
  deliveryWeightage: { min: 0, max: 10 },
  overallRating: { min: 0, max: 100 },
};
/** The letters F/PUR/05's Overall Rating table gives. */
export const GRADES = ["A", "B", "C"] as const;

/** The cells an upload reads (the worked-out figures are not read: the download carries them as worked out). */
const IMPORT_KEYS: SupplierKey[] = [...SUPPLIER_COLUMNS.map((c) => c.key), "serviceApproval"];

const LABELS: Record<SupplierKey, string> = {
  ...(Object.fromEntries([...SUPPLIER_COLUMNS, ...WORKED_COLUMNS].map((c) => [c.key, c.label])) as Record<SupplierKey, string>),
  serviceApproval: "SERVICE PROVIDER'S DOCUMENT (SERVICE AGREEMENT / ISO 17025 ACCREDITATION)",
};

/** A column's heading — "Quality Rating (Y)". */
export const supplierColumnLabel = (key: SupplierKey): string => LABELS[key] ?? key;

/** A blank line: every cell empty but the three ratings, which start full; the worked-out figures blank, so worked out. */
export function blankSupplierValues(): SupplierValues {
  const out = Object.fromEntries([...IMPORT_KEYS, ...WORKED_KEYS].map((k) => [k, ""])) as SupplierValues;
  for (const k of RATING_KEYS) out[k] = RATING_DEFAULT;
  return out;
}

/** Is the line a service provider's (its CATEGORY says so)? Its six document cells are then one. */
export const isServiceProvider = (s: Pick<SupplierValues, "category">): boolean => String(s.category ?? "").trim().toUpperCase() === SERVICE_PROVIDER;

/** A rating as the sheet counts it: what is written, or full marks when nothing is. */
export const ratingOf = (value: unknown): string => String(value ?? "").trim() || RATING_DEFAULT;

const twoPlaces = (n: number): string => (Math.round(n * 100) / 100).toFixed(2);
const typedIn = (s: Partial<SupplierValues>, key: WorkedKey): string | null => String(s[key] ?? "").trim() || null;

/**
 * The line's figures as the sheet shows them. Worked out as F/PUR/05 works them out — 100 / 100 / 100 gives 50.00 / 40.00 /
 * 10.00, 100.00, A — unless a person typed a figure over one: a typed weightage counts in the Overall Rating, a typed
 * Overall Rating gives the Grade, and a typed Grade stands as typed.
 */
export function supplierRating(s: Partial<SupplierValues>): SupplierRating {
  const cells = supplierRatingCells({ productSafetyRating: ratingOf(s.productSafetyRating), qualityRating: ratingOf(s.qualityRating), deliveryRating: ratingOf(s.deliveryRating) });
  const productSafetyWeightage = typedIn(s, "productSafetyWeightage") ?? String(cells.productSafetyWeightage ?? "");
  const qualityWeightage = typedIn(s, "qualityWeightage") ?? String(cells.qualityWeightage ?? "");
  const deliveryWeightage = typedIn(s, "deliveryWeightage") ?? String(cells.deliveryWeightage ?? "");
  const partTyped = (["productSafetyWeightage", "qualityWeightage", "deliveryWeightage"] as const).some((k) => typedIn(s, k) !== null);
  const typedOverall = typedIn(s, "overallRating");
  const overallRating = typedOverall ?? (partTyped ? twoPlaces(Number(productSafetyWeightage) + Number(qualityWeightage) + Number(deliveryWeightage)) : String(cells.overallRating ?? ""));
  const grade = typedIn(s, "grade") ?? (partTyped || typedOverall !== null ? gradeForOverall(Number(overallRating)) : String(cells.grade ?? ""));
  return { productSafetyWeightage, qualityWeightage, deliveryWeightage, overallRating, grade };
}

/** The worked-out figures a person has typed over on this line. */
export const typedWorked = (s: Partial<SupplierValues>): WorkedKey[] => WORKED_KEYS.filter((k) => typedIn(s, k) !== null);

/** A figure typed over a worked-out one, checked: the figure to keep (two decimals; a grade's letter), or why it is not kept. */
export function checkWorked(key: WorkedKey, raw: unknown): { value: string } | { error: string } {
  const text = String(raw ?? "").trim();
  const label = supplierColumnLabel(key);
  if (key === "grade") {
    const letter = text.toUpperCase();
    return (GRADES as readonly string[]).includes(letter) ? { value: letter } : { error: `${label} is A, B or C, so "${text}" was not saved.` };
  }
  const n = Number(text);
  if (!text || !Number.isFinite(n)) return { error: `${label}: "${text}" is not a figure, so it was not saved.` };
  const band = WORKED_BANDS[key];
  if (n < band.min || n > band.max) return { error: `${label} is ${band.min} to ${band.max}, so ${text} was not saved.` };
  return { value: twoPlaces(n) };
}

/** A rating as a person wrote it, checked: the figure to save, or why it is not saved. An empty cell is full marks again. */
export function checkRating(key: RatingKey, raw: unknown): { value: string } | { error: string } {
  const text = String(raw ?? "").trim();
  if (!text) return { value: RATING_DEFAULT };
  const n = Number(text);
  const label = supplierColumnLabel(key);
  if (!Number.isFinite(n)) return { error: `${label}: "${text}" is not a figure, so it was not saved.` };
  const band = RATING_BANDS[key];
  if (n < band.min || n > band.max) return { error: `${label} is ${band.min} to ${band.max}, so ${text} was not saved.` };
  return { value: String(Math.round(n * 100) / 100) };
}

/** A date cell as written: YYYY-MM-DD when it reads as a date (17.01.2025, 17-01-2025, 2025-01-17), else the words. */
export function dateOrWords(raw: unknown): string {
  const text = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (isIsoDate(text)) return text;
  return parseWrittenDate(text, "dmy") ?? text;
}

/** A date cell as the sheet shows it: 17-01-2025, or the words as written. */
export const shownDate = (value: string): string => (isIsoDate(value) ? formatDisplayDate(value) : value);

/**
 * THE RE-APPROVAL DUE DATE THE LIST WRITES BESIDE AN APPROVAL DATE: three years less a day for a material supplier
 * (17.01.2025 → 16.01.2028), a year less a day for a service provider (01.04.2025 → 31.03.2026) — every line of F/PUR/03
 * as shared on 5-Nov-2026. "" when the approval date is not a date.
 */
export function reapprovalDue(approvalDate: string, serviceProvider: boolean): string {
  if (!isIsoDate(approvalDate)) return "";
  const [y, m, d] = approvalDate.split("-").map(Number);
  const due = new Date(Date.UTC(y + (serviceProvider ? 1 : 3), m - 1, d));
  due.setUTCDate(due.getUTCDate() - 1);
  return due.toISOString().slice(0, 10);
}

export interface SupplierProblem {
  field: SupplierKey | null;
  message: string;
  /** "danger": the line is wrong; "warning": something is due. */
  tone: "danger" | "warning";
}

/** What is wrong with a line, or due on it: no supplier name, a rating outside its band, a re-approval date passed. */
export function supplierProblems(s: SupplierValues, today = todayISO()): SupplierProblem[] {
  const out: SupplierProblem[] = [];
  if (!s.supplierName.trim()) out.push({ field: "supplierName", message: "The line has no SUPPLIER NAME.", tone: "danger" });
  for (const key of RATING_KEYS) {
    const value = ratingOf(s[key]);
    const n = Number(value);
    const band = RATING_BANDS[key];
    if (!Number.isFinite(n) || n < band.min || n > band.max) out.push({ field: key, message: `${supplierColumnLabel(key)} is ${band.min} to ${band.max}; this line has ${value}.`, tone: "danger" });
  }
  if (isIsoDate(s.reapprovalDueDate) && s.reapprovalDueDate < today) {
    out.push({ field: "reapprovalDueDate", message: `Re-approval was due on ${formatDisplayDate(s.reapprovalDueDate)}.`, tone: "warning" });
  }
  return out;
}

// ---------------------------------------------------------------------------
// the list as an Excel workbook (the sheet's download), and back

/**
 * The list as a workbook's one sheet: SR. NO., F/PUR/03's columns, the three ratings, the worked-out figures (as figures,
 * the weightages with their two decimals), and the notes to confirm. A service provider's six document cells are one
 * merged cell holding its words, as the list draws them. Uploaded back, it changes nothing (planSupplierImport).
 */
export function supplierSheet(suppliers: ApprovedSupplier[]): { columns: SheetColumn[]; rows: string[][]; merges: SheetMerge[] } {
  const columns: SheetColumn[] = [
    { header: "SR. NO.", kind: "number", width: 7 },
    ...LIST_COLUMNS.map((c): SheetColumn => ({ header: c.label, kind: c.kind === "date" ? "date" : "text", width: Math.max(8, Math.round(c.width / 7)) })),
    ...RATING_COLUMNS.map((c): SheetColumn => ({ header: c.label, kind: "number", width: 12 })),
    ...WORKED_COLUMNS.map((c): SheetColumn => ({ header: c.label, kind: c.key === "grade" ? "text" : "decimal", width: c.key === "grade" ? 7 : 13 })),
    { header: "Notes to confirm", kind: "text", width: 60 },
  ];
  const firstDocument = 1 + LIST_COLUMNS.findIndex((c) => c.key === DOCUMENT_KEYS[0]);
  const merges: SheetMerge[] = [];
  const rows = suppliers.map((s, i) => {
    const service = isServiceProvider(s);
    if (service) merges.push({ row: i, from: firstDocument, to: firstDocument + DOCUMENT_KEYS.length - 1 });
    const worked = supplierRating(s);
    return [
      String(i + 1),
      ...LIST_COLUMNS.map((c) => (c.kind === "document" && service ? (c.key === DOCUMENT_KEYS[0] ? s.serviceApproval : "") : s[c.key])),
      ...RATING_COLUMNS.map((c) => ratingOf(s[c.key])),
      ...WORKED_COLUMNS.map((c) => worked[c.key]),
      (s.notes ?? []).join(" "),
    ];
  });
  return { columns, rows, merges };
}

// ---------------------------------------------------------------------------
// reading an uploaded sheet (the list as Purchase keeps it in Excel, or the sheet's own download)

const HEADER_ALIASES: Partial<Record<SupplierKey, RegExp>> = {
  vendorCode: /^(?:vendor\s*code|vendor\s*no|supplier\s*code|code)$/,
  supplierName: /^(?:supplier\s*name|supplier|vendor\s*name|name\s*of\s*(?:the\s*)?supplier|supplier\s*\/\s*service\s*provider\s*name)$/,
  productService: /^(?:product\s*\/\s*service|products?|material(?:\s*description)?|products?\s*\/\s*services?)$/,
  applicableProduct: /^applicable\s*product/,
  category: /^category/,
  manufacturerName: /^manufacturer(?:'?s)?\s*name/,
  srf: /^(?:srf|supplier\s*registration\s*form)$/,
  tdsSpecs: /^(?:tds\s*\/?\s*specs?|tds|specs?|specifications?)$/,
  msds: /^(?:msds|sds)$/,
  foodGradeDeclaration: /^food\s*grade/,
  traceability: /^traceability$/,
  isoCertificate: /^iso(?:\s*certificate)?$/,
  serviceApproval: /^service\s*provider'?s?\s*document/,
  contactPerson: /^contact\s*person$/,
  contactNumber: /^(?:contact\s*(?:no|number)|phone(?:\s*no)?|mobile(?:\s*no)?)$/,
  location: /^(?:location|city|place)$/,
  approvalDate: /^approval\s*date$/,
  reapprovalDueDate: /^re\s*-?\s*approval(?:\s*due)?(?:\s*date)?$/,
  fileNo: /^file\s*(?:no|number)$/,
  productSafetyRating: /^product\s*safety\s*rating/,
  qualityRating: /^quality\s*rating/,
  deliveryRating: /^delivery\s*rating/,
};

const headerText = (cell: unknown) =>
  String(cell ?? "")
    .toLowerCase()
    .replace(/[.:*]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Which column of a heading row holds which cell of the sheet. */
export function supplierHeaderColumns(cells: string[]): Partial<Record<SupplierKey, number>> {
  const out: Partial<Record<SupplierKey, number>> = {};
  cells.forEach((cell, i) => {
    const text = headerText(cell);
    if (!text) return;
    for (const key of IMPORT_KEYS) {
      if (out[key] === undefined && HEADER_ALIASES[key]?.test(text)) {
        out[key] = i;
        break;
      }
    }
  });
  return out;
}

/** Text compared the way a person means it: case, spacing and punctuation aside ("Pvt.Ltd." is "Pvt Ltd"). */
export const sameText = (a: unknown, b: unknown): boolean => {
  const k = (x: unknown) =>
    String(x ?? "")
      .toLowerCase()
      .replace(/[.,()'"]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  return k(a) === k(b);
};

const sameCode = (a: unknown, b: unknown): boolean => {
  const k = (x: unknown) => String(x ?? "").replace(/\s+/g, "").toUpperCase();
  return !!k(a) && k(a) === k(b);
};

export interface SupplierImportChange {
  key: SupplierKey;
  before: string;
  after: string;
}

export interface SupplierImportPlan {
  /** 1-based line of the file that holds the column headings. */
  headerLine: number;
  columns: SupplierKey[];
  additions: { line: number; values: SupplierValues }[];
  updates: { line: number; supplierId: string; supplierName: string; changes: SupplierImportChange[] }[];
  unchanged: number;
  skipped: { line: number; reason: string }[];
  /** Lines taken in with something left out (a rating outside its band). */
  warnings: { line: number; message: string }[];
}

const isAnswer = (v: string) => /^(?:yes|no|na|n\/a|-)$/i.test(v.trim());

/**
 * What uploading a list would do. A line is the sheet's line with the same Vendor Code — or, without one, the same
 * SUPPLIER NAME — and the same PRODUCT / SERVICE (Shikha Trading Co. is two lines, its HMA and its Gum); a matched
 * line's filled cells update it and a blank cell leaves what the sheet has; anything else with a SUPPLIER NAME is added,
 * its ratings full unless the file gives them. A rating outside its band is left out and said so.
 */
export function planSupplierImport(grid: string[][], suppliers: ApprovedSupplier[]): SupplierImportPlan | { error: string } {
  let headerIndex = -1;
  let map: Partial<Record<SupplierKey, number>> = {};
  for (let i = 0; i < Math.min(grid.length, 30); i++) {
    const found = supplierHeaderColumns(grid[i] ?? []);
    if (found.supplierName !== undefined && Object.keys(found).length >= 2) {
      headerIndex = i;
      map = found;
      break;
    }
  }
  if (headerIndex < 0) return { error: "No heading row was found. It should name at least SUPPLIER NAME and one more column of the list (Vendor Code, PRODUCT / SERVICE, CATEGORY …)." };
  const columns = IMPORT_KEYS.filter((k) => map[k] !== undefined);
  const plan: SupplierImportPlan = { headerLine: headerIndex + 1, columns, additions: [], updates: [], unchanged: 0, skipped: [], warnings: [] };
  const touched = new Set<string>();
  const seen: { line: number; code: string; name: string; product: string }[] = [];

  for (let r = headerIndex + 1; r < grid.length; r++) {
    const line = r + 1;
    const row = grid[r] ?? [];
    const cell = (key: SupplierKey) => (map[key] === undefined ? "" : String(row[map[key] as number] ?? "").replace(/\s+/g, " ").trim());
    if (columns.every((k) => !cell(k))) continue;
    const given: Partial<SupplierValues> = {};
    for (const key of columns) {
      const raw = cell(key);
      if (!raw) continue;
      if (key === "approvalDate" || key === "reapprovalDueDate") given[key] = dateOrWords(raw);
      else if (key === "productSafetyRating" || key === "qualityRating" || key === "deliveryRating") {
        const checked = checkRating(key, raw);
        if ("error" in checked) plan.warnings.push({ line, message: checked.error });
        else given[key] = checked.value;
      } else if (key === "category") {
        const known = SUPPLIER_CATEGORIES.find((c) => sameText(c, raw));
        given.category = known ?? raw;
      } else if (key === "vendorCode") given.vendorCode = raw.replace(/\.0+$/, "");
      else given[key] = raw;
    }
    // A service provider's one document cell, as the list draws it across the six (or the download writes it under SRF).
    if (isServiceProvider({ category: given.category ?? "" }) && !given.serviceApproval) {
      const words = DOCUMENT_KEYS.map((k) => given[k] ?? "").find((v) => v && !isAnswer(v));
      if (words) {
        given.serviceApproval = words;
        for (const k of DOCUMENT_KEYS) if (given[k] === words) delete given[k];
      }
    }
    const name = given.supplierName ?? "";
    const code = given.vendorCode ?? "";
    const product = given.productService ?? "";
    if (!name && !code) {
      plan.skipped.push({ line, reason: "It has no SUPPLIER NAME and no Vendor Code." });
      continue;
    }
    const twin = seen.find((s) => (code ? sameCode(s.code, code) : !s.code && sameText(s.name, name)) && sameText(s.product, product));
    if (twin) {
      plan.skipped.push({ line, reason: `${name || code}${product ? ` (${product})` : ""} is already on line ${twin.line} of the file.` });
      continue;
    }
    seen.push({ line, code, name, product });

    // The sheet's line: by Vendor Code, else by name on a line without one; then by PRODUCT / SERVICE.
    let candidates = code ? suppliers.filter((s) => sameCode(s.vendorCode, code)) : [];
    if (candidates.length === 0 && name) candidates = suppliers.filter((s) => sameText(s.supplierName, name) && (!code || !s.vendorCode.trim()));
    if (product) candidates = candidates.filter((s) => !s.productService.trim() || sameText(s.productService, product));
    else if (candidates.length > 1) {
      plan.skipped.push({ line, reason: `${candidates.length} lines on the sheet are ${name || code} — give the line its PRODUCT / SERVICE.` });
      continue;
    }
    if (candidates.length > 1) candidates = candidates.filter((s) => sameText(s.productService, product));
    const match = candidates.length === 1 ? candidates[0] : undefined;

    if (!match) {
      if (!name) {
        plan.skipped.push({ line, reason: `Vendor Code ${code} is not on the sheet, and the line has no SUPPLIER NAME to add.` });
        continue;
      }
      plan.additions.push({ line, values: { ...blankSupplierValues(), ...given } });
      continue;
    }
    if (touched.has(match.id)) {
      plan.skipped.push({ line, reason: `${match.supplierName} is already updated by an earlier line of the file.` });
      continue;
    }
    touched.add(match.id);
    const changes: SupplierImportChange[] = IMPORT_KEYS.filter((key) => {
      const after = given[key];
      return !!after && after !== String(match[key] ?? "").trim() && !(key === "vendorCode" && sameCode(after, match.vendorCode));
    }).map((key) => ({ key, before: String(match[key] ?? ""), after: given[key] as string }));
    if (changes.length === 0) plan.unchanged++;
    else plan.updates.push({ line, supplierId: match.id, supplierName: match.supplierName || name, changes });
  }
  return plan;
}
