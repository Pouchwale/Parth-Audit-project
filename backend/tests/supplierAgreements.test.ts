// THE SERVICE AGREEMENT / CERTIFICATE KEPT ON AN F/PUR/01 RECORD (REQUIREMENTS §192; backend/supplierAgreements.ts):
//   * uploaded as the raw body with its name and a note, kept against the record, listed newest first without its bytes,
//     sent back as it was (a PDF shown in the browser), taken off the record;
//   * only a PDF, a Word file or a picture is kept; 10 MB at most; a stranger's record id is refused;
//   * whoever holds Purchase Master Data reads, whoever writes Purchase uploads and removes; anyone else is refused.
// Run: npm run test:unit -- supplierAgreements
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import express, { type NextFunction, type Request, type Response } from "express";
import type { PublicUser } from "../auth.ts";
import { AGREEMENT_MAX_BYTES, agreementMime, createMemoryAgreementStore, registerAgreementRoutes } from "../supplierAgreements.ts";

const PEOPLE: Record<string, PublicUser & { rights: { read: boolean; write: boolean } }> = {
  chirag: { id: "u-chirag", email: "chirag@gpp.local", name: "Chirag Parmar", role: "staff", departments: ["PUR"], rights: { read: true, write: true } } as never,
  kapila: { id: "u-kapila", email: "kapila@gpp.local", name: "Kapila Barad", role: "staff", departments: ["QC"], rights: { read: true, write: false } } as never,
  anil: { id: "u-anil", email: "anil@gpp.local", name: "Anil Ravad", role: "staff", departments: ["PRD"], rights: { read: false, write: false } } as never,
};

let base = "";
let close: () => Promise<void> = async () => undefined;
const lines: string[] = [];
const store = createMemoryAgreementStore(() => new Date("2026-11-06T07:00:00.000Z"));

before(async () => {
  const app = express();
  const requireAuth = (req: Request, res: Response, next: NextFunction) => {
    const user = PEOPLE[String(req.get("x-test-person") ?? "")];
    if (!user) return void res.status(401).json({ error: "Not authenticated." });
    (req as Request & { user: PublicUser }).user = user;
    next();
  };
  registerAgreementRoutes(app, {
    requireAuth,
    store,
    may: async (user) => PEOPLE[user.id.replace("u-", "")].rights,
    logActivity: (_req, who, action, target = "", detail = "") => lines.push(`${who?.name}: ${action} ${target} ${detail}`),
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => new Promise<void>((resolve) => server.close(() => resolve()));
});
after(async () => close());

const PDF = Buffer.from("%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n", "latin1");
const as = (person: string, extra: Record<string, string> = {}) => ({ "x-test-person": person, ...extra });
const upload = (person: string, recordId: string, bytes: Buffer, name: string, note = "") =>
  fetch(`${base}/api/purchase/agreements/${recordId}`, { method: "POST", headers: as(person, { "Content-Type": "application/octet-stream", "X-File-Name": encodeURIComponent(name), "X-File-Note": encodeURIComponent(note) }), body: bytes });

test("a file's kind by its bytes: a PDF, a picture, a Word file; anything else is not kept", () => {
  assert.equal(agreementMime(PDF, "x.pdf"), "application/pdf");
  assert.equal(agreementMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]), "scan.jpg"), "image/jpeg");
  assert.equal(agreementMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "scan.png"), "image/png");
  assert.equal(agreementMime(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0]), "agreement.docx"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  assert.equal(agreementMime(Buffer.from("just words", "utf8"), "notes.txt"), null);
  assert.equal(AGREEMENT_MAX_BYTES, 10 * 1024 * 1024);
});

test("uploaded, listed newest first, sent back as it was, removed; the activity log says so", async () => {
  const first = await upload("chirag", "rec-pur01-1", PDF, "Gurudev agreement 2025-26.pdf", "Signed 1 April 2025");
  assert.equal(first.status, 200);
  const { file } = (await first.json()) as { file: { id: string; name: string; mime: string; size: number; note: string; uploadedBy: string } };
  assert.deepEqual([file.name, file.mime, file.size, file.note, file.uploadedBy], ["Gurudev agreement 2025-26.pdf", "application/pdf", PDF.length, "Signed 1 April 2025", "Chirag Parmar"]);
  const second = await upload("chirag", "rec-pur01-1", PDF, "Gurudev agreement 2026-27.pdf");
  assert.equal(second.status, 200);
  const list = (await (await fetch(`${base}/api/purchase/agreements/rec-pur01-1`, { headers: as("kapila") })).json()) as { files: { name: string; bytes?: unknown }[] };
  assert.deepEqual(list.files.map((f) => f.name), ["Gurudev agreement 2026-27.pdf", "Gurudev agreement 2025-26.pdf"], "newest first, the old one kept");
  assert.ok(list.files.every((f) => !("bytes" in f)), "no bytes in the list");
  const got = await fetch(`${base}/api/purchase/agreements/rec-pur01-1/${file.id}`, { headers: as("kapila") });
  assert.equal(got.status, 200);
  assert.equal(got.headers.get("content-type"), "application/pdf");
  assert.match(got.headers.get("content-disposition") ?? "", /^inline; filename="Gurudev agreement 2025-26.pdf"/);
  assert.equal(Buffer.compare(Buffer.from(await got.arrayBuffer()), PDF), 0, "byte for byte");
  assert.equal((await fetch(`${base}/api/purchase/agreements/rec-pur01-2`, { headers: as("chirag") })).status, 200);
  assert.deepEqual(((await (await fetch(`${base}/api/purchase/agreements/rec-pur01-2`, { headers: as("chirag") })).json()) as { files: unknown[] }).files, [], "another record: nothing");
  const gone = await fetch(`${base}/api/purchase/agreements/rec-pur01-1/${file.id}`, { method: "DELETE", headers: as("chirag") });
  assert.equal(gone.status, 200);
  assert.equal((await fetch(`${base}/api/purchase/agreements/rec-pur01-1/${file.id}`, { headers: as("chirag") })).status, 404);
  assert.deepEqual(lines, ["Chirag Parmar: Supplier agreement uploaded rec-pur01-1 Gurudev agreement 2025-26.pdf (0 KB) — Signed 1 April 2025", "Chirag Parmar: Supplier agreement uploaded rec-pur01-1 Gurudev agreement 2026-27.pdf (0 KB)", "Chirag Parmar: Supplier agreement removed rec-pur01-1 Gurudev agreement 2025-26.pdf"]);
});

test("who may: a reader lists and opens but cannot upload or remove; a stranger to Purchase sees nothing; a text file and an empty body are refused", async () => {
  assert.equal((await upload("kapila", "rec-pur01-1", PDF, "x.pdf")).status, 403);
  assert.equal((await fetch(`${base}/api/purchase/agreements/rec-pur01-1`, { headers: as("anil") })).status, 403);
  assert.equal((await fetch(`${base}/api/purchase/agreements/rec-pur01-1`)).status, 401);
  const text = await upload("chirag", "rec-pur01-1", Buffer.from("hello", "utf8"), "notes.txt");
  assert.equal(text.status, 422);
  assert.match(((await text.json()) as { error: string }).error, /PDF, a Word file or a picture/);
  assert.equal((await upload("chirag", "rec-pur01-1", Buffer.alloc(0), "x.pdf")).status, 400);
  assert.equal((await fetch(`${base}/api/purchase/agreements/not%20a%20record%20id!`, { headers: as("chirag") })).status, 400);
  const remaining = (await (await fetch(`${base}/api/purchase/agreements/rec-pur01-1`, { headers: as("chirag") })).json()) as { files: { id: string }[] };
  assert.equal((await fetch(`${base}/api/purchase/agreements/rec-pur01-1/${remaining.files[0].id}`, { method: "DELETE", headers: as("kapila") })).status, 403);
});
