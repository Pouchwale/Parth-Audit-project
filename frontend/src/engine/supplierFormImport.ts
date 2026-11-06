import type { FieldFill } from "./hrMaster";

// F/PUR/01 FILLED FROM THE SUPPLIER'S OWN COPY OF THE FORM (REQUIREMENTS §191; the owner, 6-Nov-2026: "when user upload
// the pdf then system will fetch data from it and fill the pur-01 from it"). The file is read on the server
// (backend/supplierFormExtract.ts) into the form's boxes by key; here, what it gives is laid against the record: a blank
// box is filled at once, a box that already holds something else is replaced only when the person says so - as a
// supplier fetched from Purchase Master Data is (engine/purchaseMasterLinks.ts supplierFill, §187).

/** The boxes of F/PUR/01 the file can fill: the supplier's own, never the office's block. */
export const SUPPLIER_FORM_KEYS = [
  "supplierName",
  "typeOfConcern",
  "addressOffice",
  "addressWorks",
  "contactPerson",
  "contactDesignation",
  "telephoneNos",
  "emailAddress",
  "weeklyOffWorkingHours",
  "companyActivities",
  "employeesTechnical",
  "employeesNonTechnical",
  "yearOfCommencement",
  "rangeOfProducts",
  "majorCustomers",
  "plantMachinery",
  "qualityControlDept",
  "holdsCertification",
  "furnishedName",
  "furnishedDesignation",
  "furnishedDate",
  "furnishedPlace",
] as const;

// (case, spacing and punctuation aside: "Pvt. Ltd." is "Pvt Ltd", as Purchase Master Data compares names)
const same = (a: string, b: string): boolean => {
  const k = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return k(a) === k(b);
};

/** What writing the file's boxes onto the form would change: the blank boxes (filled at once) and the written ones (asked first). */
export function supplierFormFills(fields: Record<string, string | undefined>, current: Record<string, unknown>, keys: readonly string[] = SUPPLIER_FORM_KEYS): { fills: FieldFill[]; conflicts: FieldFill[] } {
  const fills: FieldFill[] = [];
  const conflicts: FieldFill[] = [];
  for (const key of keys) {
    if (!(SUPPLIER_FORM_KEYS as readonly string[]).includes(key)) continue;
    const after = String(fields[key] ?? "").trim();
    if (!after) continue;
    const before = String(current[key] ?? "").trim();
    if (before && same(before, after)) continue;
    (before ? conflicts : fills).push({ key, before, after });
  }
  return { fills, conflicts };
}
