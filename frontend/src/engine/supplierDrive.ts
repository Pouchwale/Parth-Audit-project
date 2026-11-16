import type { LogSheetData, LogSheetRow, RecordInstance } from "../types";
import type { ApprovedSupplier, SupplierValues } from "../types/purchaseMaster";
import type { SupplierDriveRead, SupplierDriveType } from "../api/client";
import { documentRepository } from "../data/repositories/documentRepository";
import { recordRepository } from "../data/repositories/recordRepository";
import { purchaseMasterRepository } from "../data/repositories/purchaseMasterRepository";
import { DOCUMENT_KEYS } from "./purchaseMaster";
import { fillBlanksFromSuppliers, lineForSupplier, supplierLinkFor } from "./purchaseMasterLinks";
import { supplierFormFills } from "./supplierFormImport";
import { createRecordForDocument } from "./recordCrud";
import { blankLogRow } from "./recordDefaults";
import { getLogSheetLayout } from "../data/seed/logSheetLayouts";
import { withComputedCells } from "./computedCells";
import { appendHistory, diffRecordData, makeEntry } from "./recordHistory";
import { todayISO } from "../utils/date";

// WHAT A FILE IN THE SUPPLIERS' DRIVE WRITES (REQUIREMENTS §230; the owner, 16-Nov-2026; backend/supplierDrive.ts reads the
// file). Into PURCHASE MASTER DATA first - the supplier's document column the file is (SRF, TDS/SPECS, MSDS, FOOD GRADE
// DECLARATION, TRACEABILITY, ISO CERTIFICATE) YES; a certificate's or agreement's valid-upto date its Re-approval Due date
// (a later date only); an SRF's contact, telephone, products and works address into the boxes left blank - then into the
// records, from the master and from the file:
//   F/PUR/01 the supplier's open Supplier Registration Form (one started for them when none is open): its blank boxes from
//            the SRF and the master, its SERVICE AGREEMENT / CERTIFICATE VALID UPTO the date read (a later date only),
//            which the notify job warns of two months ahead (§192);
//   F/PUR/02 an audit report: the supplier's open Supplier Audit Report (one started when none is open), its blank header
//            boxes from the report and the master;
//   F/PUR/03 the open List of Approved Suppliers: the supplier's line, its document cell and Re-approval Due date as the
//            master now has them (a cell a person wrote YES or a date in is never lowered).
// A record handed in or signed off is never changed: it is said, to be reopened if it should take the file. Each change is
// a line of the record's history naming the file.

const OPEN: ReadonlySet<string> = new Set(["Scheduled", "Due", "In Progress", "Rejected"]);
const REGISTRATION = "pur-supplier-registration";
const AUDIT = "pur-supplier-audit-report";
const LIST = "pur-approved-suppliers";

const plain = (s: unknown): string => String(s ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const sameSupplier = (a: unknown, b: unknown): boolean => plain(a) !== "" && plain(a) === plain(b);
const isIso = (s: unknown): s is string => /^\d{4}-\d{2}-\d{2}$/.test(String(s ?? ""));
const later = (have: unknown, want: string): boolean => !isIso(have) || want > String(have);

/** The drive's kinds, as the folder's list names them. */
export const DRIVE_TYPE_LABELS: Record<SupplierDriveType, string> = {
  srf: "SRF (Supplier Registration Form)",
  tdsSpecs: "TDS / Specs",
  msds: "MSDS",
  foodGradeDeclaration: "Food grade declaration",
  traceability: "Traceability",
  isoCertificate: "ISO certificate",
  serviceAgreement: "Service agreement",
  auditReport: "Supplier audit report",
  other: "Other",
};

/** What the master takes from the file: the columns it answers, the dates it gives, the SRF's blank boxes. */
export function masterChanges(s: ApprovedSupplier, docType: SupplierDriveType, read: SupplierDriveRead): Partial<SupplierValues> {
  const changes: Partial<SupplierValues> = {};
  if ((DOCUMENT_KEYS as string[]).includes(docType) && String(s[docType as keyof SupplierValues] ?? "").trim().toUpperCase() !== "YES") {
    (changes as Record<string, string>)[docType] = "YES";
  }
  if (read.validUpto && (docType === "isoCertificate" || docType === "serviceAgreement") && later(s.reapprovalDueDate, read.validUpto)) changes.reapprovalDueDate = read.validUpto;
  const f = read.form?.fields ?? {};
  const blank = (k: keyof SupplierValues) => !String(s[k] ?? "").trim();
  if (f.contactPerson && blank("contactPerson")) changes.contactPerson = f.contactPerson;
  if (f.telephoneNos && blank("contactNumber")) changes.contactNumber = f.telephoneNos;
  if (f.rangeOfProducts && blank("productService")) changes.productService = f.rangeOfProducts;
  if ((f.addressWorks || f.addressOffice) && blank("location")) changes.location = String(f.addressWorks || f.addressOffice);
  return changes;
}

function saved(r: RecordInstance, data: LogSheetData, actor: string, fileName: string): RecordInstance | null {
  const next = withComputedCells(r.documentId, data);
  const changes = diffRecordData(r.data, next);
  if (changes.length === 0) return null;
  const status = r.status === "Due" || r.status === "Scheduled" ? "In Progress" : r.status;
  return recordRepository.upsert(appendHistory({ ...r, data: next, status }, makeEntry("edited", actor, { changes, note: `From the supplier's drive: ${fileName}` })));
}

/**
 * The supplier's open record of an as-required document (the newest), named in `nameKey`; else one started for them - for
 * F/PUR/01 only when the supplier has none at all (one registration form a supplier: a signed one is reopened, not
 * repeated), for F/PUR/02 whenever none is open (a report a visit).
 */
function openRecordFor(docId: string, nameKey: string, s: ApprovedSupplier, start: "when-none" | "when-none-open"): { record: RecordInstance; started: boolean } | { signed: RecordInstance } | null {
  const mine = recordRepository
    .queryUnscoped({ documentId: docId, isDemo: false })
    .filter((r) => sameSupplier((r.data as LogSheetData | undefined)?.header?.[nameKey], s.supplierName))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  const open = mine.find((r) => OPEN.has(r.status) && !r.correction);
  if (open) return { record: open, started: false };
  if (mine[0] && start === "when-none") return { signed: mine[0] };
  const doc = documentRepository.getByIdUnscoped(docId);
  if (!doc) return null;
  const { record } = createRecordForDocument(doc, { dateISO: todayISO() });
  const d = record.data as LogSheetData;
  return { record: recordRepository.upsert({ ...record, data: { ...d, header: { ...d.header, [nameKey]: s.supplierName } } }), started: true };
}

/** Everything a file uploaded into the supplier's folder writes; the words to show for it. */
export function applyDriveUpload(supplierId: string, docType: SupplierDriveType, read: SupplierDriveRead, actor: string, fileName: string): string[] {
  const said: string[] = [];
  let s = purchaseMasterRepository.get(supplierId);
  if (!s) return ["The supplier is no longer in Purchase Master Data: the file is kept, nothing else is written."];

  // 1. Purchase Master Data.
  const changes = masterChanges(s, docType, read);
  if (Object.keys(changes).length > 0) {
    s = purchaseMasterRepository.update(s.id, changes, actor) ?? s;
    said.push(`Purchase Master Data: ${Object.keys(changes).join(", ")} written for ${s.supplierName}.`);
  }

  // 2. F/PUR/01 - an SRF, or a certificate's or agreement's date.
  const regLink = supplierLinkFor(REGISTRATION);
  if (regLink && (docType === "srf" || (read.validUpto && (docType === "isoCertificate" || docType === "serviceAgreement")))) {
    const at = openRecordFor(REGISTRATION, "supplierName", s, "when-none");
    if (at && "record" in at) {
      let data = at.record.data as LogSheetData;
      if (read.form?.fields) {
        const { fills } = supplierFormFills(read.form.fields, data.header ?? {});
        if (fills.length) data = { ...data, header: { ...data.header, ...Object.fromEntries(fills.map((f) => [f.key, f.after])) } };
      }
      data = fillBlanksFromSuppliers(regLink, data, [s]).data;
      if (read.validUpto && later(data.header?.agreementValidUpto, read.validUpto)) data = { ...data, header: { ...data.header, agreementValidUpto: read.validUpto } };
      if (saved(at.record, data, actor, fileName) || at.started) said.push(`F/PUR/01: ${at.started ? "started for" : "written for"} ${s.supplierName}.`);
    } else if (at && "signed" in at) said.push(`F/PUR/01 of ${s.supplierName} is handed in or signed off: reopen it for correction to take this file.`);
  }

  // 3. F/PUR/02 - an audit report.
  const auditLink = supplierLinkFor(AUDIT);
  if (auditLink && docType === "auditReport") {
    const at = openRecordFor(AUDIT, "supplier", s, "when-none-open");
    if (at && "record" in at) {
      let data = at.record.data as LogSheetData;
      const a = read.audit ?? {};
      const header: Record<string, string> = { ...(data.header ?? {}) } as Record<string, string>;
      for (const [k, v] of Object.entries(a)) if (v && !String(header[k] ?? "").trim()) header[k] = v;
      data = fillBlanksFromSuppliers(auditLink, { ...data, header }, [s]).data;
      if (saved(at.record, data, actor, fileName) || at.started) said.push(`F/PUR/02: ${at.started ? "started for" : "written for"} ${s.supplierName}.`);
    }
  }

  // 4. F/PUR/03 - the supplier's line on the open list: its document cell and its re-approval date as the master has them.
  const listLink = supplierLinkFor(LIST);
  const layout = getLogSheetLayout(LIST);
  if (listLink && layout && Object.keys(changes).some((k) => (DOCUMENT_KEYS as string[]).includes(k) || k === "reapprovalDueDate")) {
    for (const r of recordRepository.queryUnscoped({ documentId: LIST, isDemo: false }).filter((x) => OPEN.has(x.status) && !x.correction)) {
      const data = r.data as LogSheetData;
      const want = lineForSupplier(listLink, s, blankLogRow(layout));
      let touched = false;
      const rows = data.rows.map((row: LogSheetRow) => {
        if (!sameSupplier(row.supplierName, s!.supplierName)) return row;
        const next = { ...row };
        for (const k of Object.keys(changes)) {
          const key = k === "srf" ? "srf" : k;
          if (!(key in want)) continue;
          const have = String(row[key] ?? "").trim();
          const v = String(want[key] ?? "").trim();
          if (!v || have === v) continue;
          if (key === "reapprovalDueDate" ? isIso(have) && have >= v : have.toUpperCase() === "YES") continue;
          next[key] = v;
          touched = true;
        }
        return next;
      });
      if (touched && saved(r, { ...data, rows }, actor, fileName)) said.push(`F/PUR/03 (${r.dueDate}): ${s.supplierName}'s line updated.`);
    }
  }
  if (read.note) said.push(read.note);
  return said;
}
