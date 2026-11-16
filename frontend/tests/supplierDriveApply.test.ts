// WHAT A FILE IN THE SUPPLIERS' DRIVE WRITES (REQUIREMENTS §230; engine/supplierDrive.ts): the master's document column
// YES and its re-approval date; F/PUR/01's blank boxes and its valid-upto date; F/PUR/02's header from an audit report;
// the supplier's line on the open F/PUR/03. A record signed off is left as it is.
// Run: npm run test:unit -- supplierDriveApply
import test from "node:test";
import assert from "node:assert/strict";
import type { LogSheetData } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { ensureSeeded as ensureRecordsSeeded, recordRepository } from "../src/data/repositories/recordRepository";
import { ensureSeeded as ensurePurchaseSeeded, purchaseMasterRepository } from "../src/data/repositories/purchaseMasterRepository";
import { applyDriveUpload, masterChanges } from "../src/engine/supplierDrive";
import { createRecordForDocument } from "../src/engine/recordCrud";

ensureDocumentsSeeded();
ensureMasterSeeded();
ensureRecordsSeeded();
ensurePurchaseSeeded();

const clear = (id: string) => recordRepository.removeIds(recordRepository.queryUnscoped({ documentId: id }).map((r) => r.id));
const header = (id: string, nameKey: string, name: string) =>
  (recordRepository.queryUnscoped({ documentId: id, isDemo: false }).find((r) => (r.data as LogSheetData).header?.[nameKey] === name)?.data as LogSheetData | undefined)?.header;

test("a file's kind answers its column in the master; a later validity date its re-approval due date; an SRF its blank boxes", () => {
  const s = { ...purchaseMasterRepository.all()[0], msds: "NO", reapprovalDueDate: "2026-12-31", contactPerson: "", contactNumber: "1234" };
  assert.deepEqual(masterChanges(s, "msds", {}), { msds: "YES" });
  assert.deepEqual(masterChanges(s, "isoCertificate", { validUpto: "2028-06-14" }).reapprovalDueDate, "2028-06-14");
  assert.equal(masterChanges(s, "isoCertificate", { validUpto: "2025-01-01" }).reapprovalDueDate, undefined, "an earlier date never lowers it");
  const srf = masterChanges(s, "srf", { form: { fields: { contactPerson: "Mr. Mehta", telephoneNos: "9999" } } as never });
  assert.equal(srf.contactPerson, "Mr. Mehta", "a blank box filled");
  assert.equal(srf.contactNumber, undefined, "a box written stays");
});

test("an SRF, a certificate and an audit report uploaded for a supplier: the master, F/PUR/01, F/PUR/02 and the open F/PUR/03", () => {
  for (const id of ["pur-supplier-registration", "pur-supplier-audit-report", "pur-approved-suppliers"]) clear(id);
  const s = purchaseMasterRepository.all().find((x) => x.supplierName.trim() && String(x.category).toUpperCase() !== "SERVICE PROVIDER")!;
  purchaseMasterRepository.update(s.id, { isoCertificate: "NO", reapprovalDueDate: "" }, "test");
  // The open list of the year, with the supplier's line on it (as it starts from the master).
  const list = createRecordForDocument(documentRepository.getByIdUnscoped("pur-approved-suppliers")!, { dateISO: "2026-11-16" }).record;
  assert.ok((list.data as LogSheetData).rows.some((r) => r.supplierName === s.supplierName), "the supplier's line on the list");

  const srfSaid = applyDriveUpload(s.id, "srf", { form: { fields: { supplierName: s.supplierName, contactDesignation: "Director", emailAddress: "sales@example.com" } } as never }, "Chirag Parmar", "SRF.pdf");
  assert.ok(srfSaid.some((l) => /F\/PUR\/01: started for/.test(l)), srfSaid.join(" | "));
  assert.equal(purchaseMasterRepository.get(s.id)!.srf, "YES");
  const reg = header("pur-supplier-registration", "supplierName", s.supplierName)!;
  assert.deepEqual([reg.contactDesignation, reg.emailAddress], ["Director", "sales@example.com"], "the SRF's boxes");

  applyDriveUpload(s.id, "isoCertificate", { validUpto: "2028-06-14" }, "Chirag Parmar", "ISO.pdf");
  assert.equal(purchaseMasterRepository.get(s.id)!.reapprovalDueDate, "2028-06-14");
  assert.equal(header("pur-supplier-registration", "supplierName", s.supplierName)!.agreementValidUpto, "2028-06-14", "F/PUR/01's valid upto, for the two months' warning");
  const line = (recordRepository.getById(list.id)!.data as LogSheetData).rows.find((r) => r.supplierName === s.supplierName)!;
  assert.equal(String(line.isoCertificate).toUpperCase(), "YES", "F/PUR/03's ISO CERTIFICATE");
  assert.ok(String(line.reapprovalDueDate).includes("2028") || String(line.reapprovalDueDate).includes("14"), `F/PUR/03's re-approval due date: ${line.reapprovalDueDate}`);

  applyDriveUpload(s.id, "auditReport", { audit: { dateOfVisit: "2026-10-12", visitNo: "2", auditors: "Chirag Parmar", overallStatus: "Approved" } }, "Chirag Parmar", "Audit.pdf");
  const audit = header("pur-supplier-audit-report", "supplier", s.supplierName)!;
  assert.deepEqual([audit.dateOfVisit, audit.visitNo, audit.overallStatus], ["2026-10-12", "2", "Approved"], "F/PUR/02 from the report");

  // A signed F/PUR/01 is never changed by a file.
  const reg1 = recordRepository.queryUnscoped({ documentId: "pur-supplier-registration", isDemo: false })[0];
  recordRepository.upsert({ ...reg1, status: "Verified" });
  const said = applyDriveUpload(s.id, "serviceAgreement", { validUpto: "2029-01-01" }, "Chirag Parmar", "Agreement.pdf");
  assert.ok(said.some((l) => /F\/PUR\/01 of .* is handed in or signed off: reopen it/.test(l)), said.join(" | "));
  assert.equal(recordRepository.queryUnscoped({ documentId: "pur-supplier-registration", isDemo: false }).length, 1, "one registration form a supplier: never a second");
  assert.equal((recordRepository.getById(reg1.id)!.data as LogSheetData).header.agreementValidUpto, "2028-06-14", "the signed one as signed");
  for (const id of ["pur-supplier-registration", "pur-supplier-audit-report", "pur-approved-suppliers"]) clear(id);
});
