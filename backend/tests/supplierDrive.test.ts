// THE SUPPLIERS' DRIVE IN PURCHASE MASTER DATA (REQUIREMENTS §230; backend/supplierDrive.ts):
//   * a file uploaded into a supplier's folder with its kind, listed newest first without its bytes, sent back, removed;
//   * read as it is uploaded: an SRF by F/PUR/01's reader, a certificate or an agreement for its valid-upto date, an audit
//     report for F/PUR/02's header; a picture kept unread;
//   * whoever holds Purchase Master Data reads, whoever writes Purchase uploads and removes; anyone else is refused.
// Run: npm run test:unit -- supplierDrive
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import express, { type NextFunction, type Request, type Response } from "express";
import type { PublicUser } from "../auth.ts";
import { createMemoryDriveStore, datesIn, readAuditReport, registerDriveRoutes, validityIn } from "../supplierDrive.ts";

const PEOPLE: Record<string, PublicUser & { rights: { read: boolean; write: boolean } }> = {
  chirag: { id: "u-chirag", email: "chirag@gpp.local", name: "Chirag Parmar", role: "staff", departments: ["PUR"], rights: { read: true, write: true } } as never,
  kapila: { id: "u-kapila", email: "kapila@gpp.local", name: "Kapila Barad", role: "staff", departments: ["QC"], rights: { read: true, write: false } } as never,
  anil: { id: "u-anil", email: "anil@gpp.local", name: "Anil Ravad", role: "staff", departments: ["PRD"], rights: { read: false, write: false } } as never,
};

let base = "";
let close: () => Promise<void> = async () => undefined;
const lines: string[] = [];
const formsRead: string[] = [];

before(async () => {
  const app = express();
  const requireAuth = (req: Request, res: Response, next: NextFunction) => {
    const user = PEOPLE[String(req.get("x-test-person") ?? "")];
    if (!user) return void res.status(401).json({ error: "Not authenticated." });
    (req as Request & { user: PublicUser }).user = user;
    next();
  };
  registerDriveRoutes(app, {
    requireAuth,
    store: createMemoryDriveStore(),
    may: async (user) => PEOPLE[user.id.replace("u-", "")].rights,
    readForm: async (_bytes, name) => {
      formsRead.push(name);
      return { fields: { supplierName: "Shree Labels Pvt Ltd" }, fileKind: "pdf", readBy: "rules", missing: [], characters: 120 } as never;
    },
    logActivity: (_req, who, action, target = "", detail = "") => lines.push(`${who?.name}: ${action} ${target} ${detail}`),
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => new Promise<void>((resolve) => server.close(() => resolve()));
});
after(async () => close());

const PDF = Buffer.from("%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n", "latin1");
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const as = (person: string, extra: Record<string, string> = {}) => ({ "x-test-person": person, ...extra });
const upload = (person: string, supplierId: string, bytes: Buffer, name: string, docType: string) =>
  fetch(`${base}/api/purchase/drive/${supplierId}`, {
    method: "POST",
    headers: as(person, { "Content-Type": "application/octet-stream", "X-File-Name": encodeURIComponent(name), "X-Doc-Type": docType, "X-Supplier-Name": encodeURIComponent("Shree Labels Pvt Ltd") }),
    body: bytes,
  });

test("the dates a file writes, and the one it is valid upto", () => {
  assert.deepEqual(datesIn("Issued 01.04.2026, valid upto 31/03/2027").map((d) => d.iso), ["2026-04-01", "2027-03-31"]);
  assert.deepEqual(datesIn("Expiry: 12 March 2028; renewed March 1, 2025").map((d) => d.iso), ["2028-03-12", "2025-03-01"]);
  assert.equal(validityIn("Certificate No. 123 issued on 15.06.2025\nThis certificate is valid until 14.06.2028"), "2028-06-14");
  assert.equal(validityIn("Agreement dated 1 April 2026. Validity: 31 March 2027."), "2027-03-31");
  assert.equal(validityIn("Date of expiry - 2027-09-20"), "2027-09-20");
  assert.equal(validityIn("Dated 01.04.2026 only"), null, "no words that say valid upto: no date guessed");
});

test("F/PUR/02's header read off a filled report", () => {
  const read = readAuditReport(
    ["SUPPLIER AUDIT REPORT", "SUPPLIER: Shree Labels Pvt Ltd", "CONTACTS: Mr. Mehta", "DATE OF VISIT: 12.10.2026", "VISIT NO: 2", "AUDITOR (S): Chirag Parmar", "SCOPE OF AUDIT", "Manufacture of label stock", "PRODUCT SUPPLIED", "Chromo label stock", "Overall Status - Approved / Rejected: Approved"].join("\n")
  );
  assert.deepEqual(read, {
    supplier: "Shree Labels Pvt Ltd",
    contacts: "Mr. Mehta",
    dateOfVisit: "2026-10-12",
    visitNo: "2",
    auditors: "Chirag Parmar",
    scopeOfAudit: "Manufacture of label stock",
    productSupplied: "Chromo label stock",
    overallStatus: "Approved",
  });
  assert.equal(readAuditReport("Overall Status - Approved / Rejected").overallStatus, undefined, "the printed choice is no answer");
});

test("uploaded into the supplier's folder with its kind, an SRF read by F/PUR/01's reader, a picture kept unread; listed, sent back, removed", async () => {
  const srf = await upload("chirag", "pms-1", PDF, "Shree SRF.pdf", "srf");
  assert.equal(srf.status, 200);
  const one = (await srf.json()) as { file: { id: string; docType: string; supplierName: string; uploadedBy: string }; read: { form?: { fields: Record<string, string> } } };
  assert.deepEqual([one.file.docType, one.file.supplierName, one.file.uploadedBy], ["srf", "Shree Labels Pvt Ltd", "Chirag Parmar"]);
  assert.equal(one.read.form?.fields.supplierName, "Shree Labels Pvt Ltd");
  assert.deepEqual(formsRead, ["Shree SRF.pdf"]);
  const pic = await upload("chirag", "pms-1", PNG, "ISO photo.png", "isoCertificate");
  const two = (await pic.json()) as { file: { docType: string }; read: { note?: string } };
  assert.equal(two.file.docType, "isoCertificate");
  assert.match(String(two.read.note), /picture/);
  await upload("chirag", "pms-2", PDF, "Other supplier.pdf", "msds");
  const mine = (await (await fetch(`${base}/api/purchase/drive?supplier=pms-1`, { headers: as("kapila") })).json()) as { files: { name: string }[] };
  assert.deepEqual(mine.files.map((f) => f.name), ["ISO photo.png", "Shree SRF.pdf"], "the supplier's own folder, newest first");
  assert.ok(mine.files.every((f) => !("bytes" in f)));
  const got = await fetch(`${base}/api/purchase/drive/file/${one.file.id}`, { headers: as("kapila") });
  assert.equal(got.status, 200);
  assert.equal(got.headers.get("content-type"), "application/pdf");
  assert.deepEqual(Buffer.from(await got.arrayBuffer()), PDF);
  assert.equal((await fetch(`${base}/api/purchase/drive/file/${one.file.id}`, { method: "DELETE", headers: as("chirag") })).status, 200);
  assert.equal((await fetch(`${base}/api/purchase/drive/file/${one.file.id}`, { headers: as("kapila") })).status, 404);
  assert.ok(lines.some((l) => /Chirag Parmar: Purchase Drive file uploaded Shree Labels Pvt Ltd srf: Shree SRF\.pdf/.test(l)));
});

test("only who holds Purchase Master Data reads, only who writes Purchase uploads and removes; a text file is not kept", async () => {
  assert.equal((await upload("kapila", "pms-1", PDF, "x.pdf", "srf")).status, 403);
  assert.equal((await fetch(`${base}/api/purchase/drive`, { headers: as("anil") })).status, 403);
  assert.equal((await upload("chirag", "pms-1", Buffer.from("just words"), "notes.txt", "other")).status, 422);
  assert.equal((await upload("chirag", "bad id!", PDF, "x.pdf", "srf")).status, 400);
});

const call = (person: string, method: string, path: string, body?: unknown) =>
  fetch(`${base}${path}`, { method, headers: as(person, { "Content-Type": "application/json" }), body: body === undefined ? undefined : JSON.stringify(body) });

test("Google Drive's way (§231): folders made anywhere - the root, a supplier's, inside another - renamed, moved, deleted when empty; files uploaded into them, renamed, moved, found", async () => {
  const made = (await (await call("chirag", "POST", "/api/purchase/drive/folders", { name: "Certificates 2026", parentId: "" })).json()) as { folder: { id: string; parentId: string; createdBy: string } };
  assert.deepEqual([made.folder.parentId, made.folder.createdBy], ["", "Chirag Parmar"]);
  assert.equal((await call("chirag", "POST", "/api/purchase/drive/folders", { name: "certificates 2026", parentId: "" })).status, 409, "no two folders of one name in one place");
  const inSupplier = (await (await call("chirag", "POST", "/api/purchase/drive/folders", { name: "Audits", parentId: "supplier:pms-1" })).json()) as { folder: { id: string } };
  const inner = (await (await call("chirag", "POST", "/api/purchase/drive/folders", { name: "ISO", parentId: made.folder.id })).json()) as { folder: { id: string } };
  assert.equal((await call("chirag", "POST", "/api/purchase/drive/folders", { name: "Lost", parentId: "fld-nowhere" })).status, 400);
  assert.equal((await call("kapila", "POST", "/api/purchase/drive/folders", { name: "Mine", parentId: "" })).status, 403, "reading Purchase is not changing it");

  // A file into a folder people made: kept, not read (no supplier); into a supplier's folder made inside theirs: read.
  const up = (folderId: string, supplierId: string, name: string, docType: string) =>
    fetch(`${base}/api/purchase/drive/upload`, {
      method: "POST",
      headers: as("chirag", { "Content-Type": "application/octet-stream", "X-File-Name": encodeURIComponent(name), "X-Folder-Id": folderId, "X-Doc-Type": docType, "X-Supplier-Id": supplierId, "X-Supplier-Name": supplierId ? "Shree Labels Pvt Ltd" : "" }),
      body: PDF,
    });
  const loose = (await (await up(inner.folder.id, "", "Plant licence.pdf", "other")).json()) as { file: { id: string; folderId: string; supplierId: string }; read: Record<string, unknown> };
  assert.deepEqual([loose.file.folderId, loose.file.supplierId], [inner.folder.id, ""]);
  assert.deepEqual(loose.read, {}, "nothing read for a file that is nobody's supplier document");
  const audit = (await (await up(inSupplier.folder.id, "pms-1", "Audit Oct.pdf", "srf")).json()) as { file: { supplierId: string } };
  assert.equal(audit.file.supplierId, "pms-1", "a supplier's, however deep its folder");
  assert.equal((await up("fld-nowhere", "", "x.pdf", "other")).status, 400);

  const inInner = (await (await fetch(`${base}/api/purchase/drive?folder=${inner.folder.id}`, { headers: as("kapila") })).json()) as { files: { name: string }[] };
  assert.deepEqual(inInner.files.map((f) => f.name), ["Plant licence.pdf"]);
  const found = (await (await fetch(`${base}/api/purchase/drive?q=licence`, { headers: as("kapila") })).json()) as { files: { name: string }[] };
  assert.deepEqual(found.files.map((f) => f.name), ["Plant licence.pdf"], "found by its name, wherever it is");

  // Renamed and moved.
  const renamed = (await (await call("chirag", "PATCH", `/api/purchase/drive/file/${loose.file.id}`, { name: "Factory licence 2026.pdf", folderId: made.folder.id })).json()) as { file: { name: string; folderId: string } };
  assert.deepEqual([renamed.file.name, renamed.file.folderId], ["Factory licence 2026.pdf", made.folder.id]);
  assert.equal((await call("chirag", "PATCH", `/api/purchase/drive/folders/${made.folder.id}`, { parentId: inner.folder.id })).status, 400, "never into a folder inside itself");
  const folderRenamed = (await (await call("chirag", "PATCH", `/api/purchase/drive/folders/${inner.folder.id}`, { name: "ISO certificates" })).json()) as { folder: { name: string } };
  assert.equal(folderRenamed.folder.name, "ISO certificates");

  // Deleted when empty, refused while not.
  assert.equal((await call("chirag", "DELETE", `/api/purchase/drive/folders/${made.folder.id}`)).status, 409, "a folder with something in it stays");
  assert.equal((await call("chirag", "DELETE", `/api/purchase/drive/folders/${inner.folder.id}`)).status, 200, "an empty one goes");
  const folders = (await (await fetch(`${base}/api/purchase/drive/folders`, { headers: as("kapila") })).json()) as { folders: { name: string }[] };
  assert.deepEqual(folders.folders.map((f) => f.name).sort(), ["Audits", "Certificates 2026"]);
});
