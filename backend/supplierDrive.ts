// THE SUPPLIERS' DRIVE IN PURCHASE MASTER DATA (REQUIREMENTS §230; the owner, 16-Nov-2026: "purchase module in which master
// data you need to create drive in which user will upload his document ... then system will fetch the data from there in
// pdf and master data"; asked: one folder per supplier; an SRF fills the master and F/PUR/01, the files tick F/PUR/03's
// document columns, a certificate's or agreement's valid-upto date fills F/PUR/01, F/PUR/03's re-approval due date and the
// two months' warning, an audit report fills F/PUR/02).
//
// Each supplier of Purchase Master Data has a folder; a file is kept in PostgreSQL with the kind of document it is (the
// six F/PUR/03 documents, the service agreement, the audit report, or another), and READ as it is uploaded: a Supplier
// Registration Form by the F/PUR/01 reader (backend/supplierFormExtract.ts), an ISO certificate or a service agreement for
// the date it is valid upto, an audit report for F/PUR/02's header. What is read goes back with the file; the browser writes
// it into Purchase Master Data and the records (frontend/src/engine/supplierDrive.ts). Read by whoever holds Purchase Master
// Data, uploaded and removed by whoever writes Purchase (as the agreements, backend/supplierAgreements.ts).
//
//   GET    /api/purchase/drive?supplier=ID     the files, newest first (no bytes); one supplier's with ?supplier
//   POST   /api/purchase/drive/:supplierId     the file as the raw body (X-File-Name, X-Doc-Type, X-Supplier-Name), 10 MB
//   GET    /api/purchase/drive/file/:fileId    the file itself
//   DELETE /api/purchase/drive/file/:fileId    the file taken out of the folder

import express, { type Express, type Request, type RequestHandler, type Response } from "express";
import { randomUUID } from "node:crypto";
import type { PublicUser } from "./auth.ts";
import { database, registerSchema } from "./db.ts";
import { agreementMime } from "./supplierAgreements.ts";
import { CvReadError, cvText } from "./cvExtract.ts";
import type { SupplierFormReadResult } from "./supplierFormExtract.ts";

export const DRIVE_MAX_BYTES = 10 * 1024 * 1024;

/** The kinds of document a supplier's folder keeps. */
export const DRIVE_TYPES = ["srf", "tdsSpecs", "msds", "foodGradeDeclaration", "traceability", "isoCertificate", "serviceAgreement", "auditReport", "other"] as const;
export type DriveType = (typeof DRIVE_TYPES)[number];

export const DRIVE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS supplier_drive_files (
    id TEXT PRIMARY KEY,
    supplier_id TEXT NOT NULL,
    supplier_name TEXT NOT NULL DEFAULT '',
    doc_type TEXT NOT NULL,
    name TEXT NOT NULL,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL,
    valid_upto TEXT NOT NULL DEFAULT '',
    bytes BYTEA NOT NULL,
    uploaded_by TEXT NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS supplier_drive_supplier_idx ON supplier_drive_files (supplier_id, uploaded_at DESC);
`;
registerSchema(DRIVE_SCHEMA);

export interface DriveFile {
  id: string;
  supplierId: string;
  supplierName: string;
  docType: DriveType;
  name: string;
  mime: string;
  size: number;
  validUpto: string;
  uploadedBy: string;
  uploadedAt: string;
}

export interface DriveStore {
  list(supplierId?: string): Promise<DriveFile[]>;
  add(file: Omit<DriveFile, "id" | "uploadedAt"> & { bytes: Buffer }): Promise<DriveFile>;
  get(id: string): Promise<(DriveFile & { bytes: Buffer }) | null>;
  remove(id: string): Promise<boolean>;
}

interface Queryable {
  query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
}

const COLUMNS = "id, supplier_id, supplier_name, doc_type, name, mime, size, valid_upto, uploaded_by, uploaded_at";
const rowFile = (r: Record<string, unknown>): DriveFile => ({
  id: String(r.id),
  supplierId: String(r.supplier_id),
  supplierName: String(r.supplier_name ?? ""),
  docType: (DRIVE_TYPES as readonly string[]).includes(String(r.doc_type)) ? (String(r.doc_type) as DriveType) : "other",
  name: String(r.name),
  mime: String(r.mime),
  size: Number(r.size),
  validUpto: String(r.valid_upto ?? ""),
  uploadedBy: String(r.uploaded_by),
  uploadedAt: r.uploaded_at instanceof Date ? r.uploaded_at.toISOString() : String(r.uploaded_at),
});

export function createDatabaseDriveStore(db: () => Queryable = () => database() as unknown as Queryable): DriveStore {
  return {
    async list(supplierId) {
      const { rows } = supplierId
        ? await db().query(`SELECT ${COLUMNS} FROM supplier_drive_files WHERE supplier_id = $1 ORDER BY uploaded_at DESC, id DESC`, [supplierId])
        : await db().query(`SELECT ${COLUMNS} FROM supplier_drive_files ORDER BY uploaded_at DESC, id DESC`);
      return rows.map(rowFile);
    },
    async add(file) {
      const id = `drv-${randomUUID()}`;
      const { rows } = await db().query(
        `INSERT INTO supplier_drive_files (id, supplier_id, supplier_name, doc_type, name, mime, size, valid_upto, bytes, uploaded_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING ${COLUMNS}`,
        [id, file.supplierId, file.supplierName, file.docType, file.name, file.mime, file.size, file.validUpto, file.bytes, file.uploadedBy]
      );
      return rowFile(rows[0]);
    },
    async get(id) {
      const { rows } = await db().query(`SELECT ${COLUMNS}, bytes FROM supplier_drive_files WHERE id = $1`, [id]);
      if (rows.length === 0) return null;
      const bytes = rows[0].bytes;
      return { ...rowFile(rows[0]), bytes: Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes as Uint8Array) };
    },
    async remove(id) {
      const { rowCount } = await db().query("DELETE FROM supplier_drive_files WHERE id = $1", [id]);
      return (rowCount ?? 0) > 0;
    },
  };
}

/** A stand-in for the unit tests: the same rules, in memory. */
export function createMemoryDriveStore(clock: () => Date = () => new Date()): DriveStore & { rows: (DriveFile & { bytes: Buffer })[] } {
  const rows: (DriveFile & { bytes: Buffer })[] = [];
  return {
    rows,
    async list(supplierId) {
      return rows
        .filter((r) => !supplierId || r.supplierId === supplierId)
        .slice()
        .reverse()
        .map(({ bytes: _b, ...file }) => file);
    },
    async add(file) {
      const row = { ...file, id: `drv-${randomUUID()}`, uploadedAt: clock().toISOString() };
      rows.push(row);
      const { bytes: _b, ...out } = row;
      return out;
    },
    async get(id) {
      return rows.find((r) => r.id === id) ?? null;
    },
    async remove(id) {
      const at = rows.findIndex((r) => r.id === id);
      if (at < 0) return false;
      rows.splice(at, 1);
      return true;
    },
  };
}

// ---------------------------------------------------------------------------
// reading a file

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const pad = (n: number): string => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number): string | null => {
  if (y < 100) y += 2000;
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCMonth() === m - 1 ? `${y}-${pad(m)}-${pad(d)}` : null;
};

/** Every date written in the words, with where it stands: 31.12.2027, 31/12/27, 2027-12-31, 31 Dec 2027, December 31, 2027. */
export function datesIn(text: string): { iso: string; at: number }[] {
  const out: { iso: string; at: number }[] = [];
  const add = (at: number, v: string | null) => {
    if (v) out.push({ iso: v, at });
  };
  for (const m of text.matchAll(/\b(\d{4})[-./](\d{1,2})[-./](\d{1,2})\b/g)) add(m.index ?? 0, iso(+m[1], +m[2], +m[3]));
  for (const m of text.matchAll(/\b(\d{1,2})[-./](\d{1,2})[-./](\d{2,4})\b/g)) add(m.index ?? 0, iso(+m[3], +m[2], +m[1]));
  for (const m of text.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?[\s-]+([A-Za-z]{3,9})[,\s-]+(\d{4})\b/g)) {
    const mo = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    if (mo >= 0) add(m.index ?? 0, iso(+m[3], mo + 1, +m[1]));
  }
  for (const m of text.matchAll(/\b([A-Za-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/g)) {
    const mo = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
    if (mo >= 0) add(m.index ?? 0, iso(+m[3], mo + 1, +m[2]));
  }
  return out.sort((a, b) => a.at - b.at);
}

const VALIDITY_WORDS = /valid\s*(?:up\s*to|upto|till|until|thru|through)|validity|expir(?:y|es|ation|ing)|expiry\s*date|date\s*of\s*expiry|due\s*date|renewal\s*date|valid\s*to/gi;

/** The date a certificate or an agreement is valid upto: the first date written after words that say so; else null. */
export function validityIn(text: string): string | null {
  const dates = datesIn(text);
  let best: string | null = null;
  for (const m of text.matchAll(VALIDITY_WORDS)) {
    const at = m.index ?? 0;
    const next = dates.find((d) => d.at >= at && d.at - at <= 120);
    if (next && (!best || next.iso > best)) best = next.iso;
  }
  return best;
}

/** What an F/PUR/02 report says in its header and its overall status. */
export interface AuditReportFields {
  supplier?: string;
  contacts?: string;
  dateOfVisit?: string;
  visitNo?: string;
  auditors?: string;
  scopeOfAudit?: string;
  productSupplied?: string;
  overallStatus?: string;
}

const LABELS: [keyof AuditReportFields, RegExp][] = [
  ["supplier", /^\s*supplier\s*(?:name)?\s*[:\-–]\s*(.*)$/i],
  ["contacts", /^\s*contacts?\s*(?:person)?\s*[:\-–]\s*(.*)$/i],
  ["dateOfVisit", /^\s*date\s*of\s*(?:visit|audit)\s*[:\-–]\s*(.*)$/i],
  ["visitNo", /^\s*visit\s*no\.?\s*[:\-–]\s*(.*)$/i],
  ["auditors", /^\s*auditor\s*\(?s?\)?\s*[:\-–]\s*(.*)$/i],
  ["scopeOfAudit", /^\s*scope\s*of\s*audit\s*[:\-–]?\s*(.*)$/i],
  ["productSupplied", /^\s*product\s*supplied\s*[:\-–]?\s*(.*)$/i],
];

/** F/PUR/02's header read off a filled report by its printed labels (the value on the label's line, else the next line). */
export function readAuditReport(text: string): AuditReportFields {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim());
  const out: AuditReportFields = {};
  lines.forEach((line, i) => {
    for (const [key, re] of LABELS) {
      if (out[key]) continue;
      const m = re.exec(line);
      if (!m) continue;
      let v = (m[1] ?? "").trim();
      if (!v && lines[i + 1] && !LABELS.some(([, r]) => r.test(lines[i + 1]))) v = lines[i + 1];
      if (!v) continue;
      if (key === "dateOfVisit") {
        const d = datesIn(v)[0]?.iso;
        if (d) out.dateOfVisit = d;
      } else out[key] = v.slice(0, 400);
    }
  });
  // The status line, its printed choice "Approved / Rejected" left out: what is written after it (or on the next line).
  const at = lines.findIndex((l) => /overall\s*status/i.test(l));
  if (at >= 0) {
    const said = `${lines[at]} ${lines[at + 1] ?? ""}`.replace(/approved\s*\/\s*rejected/gi, " ");
    const status = /\b(approved|rejected)\b/i.exec(said);
    if (status) out.overallStatus = status[1][0].toUpperCase() + status[1].slice(1).toLowerCase();
  }
  return out;
}

// ---------------------------------------------------------------------------
// the routes

const ID_RE = /^[A-Za-z0-9._:-]{1,120}$/;
const cleanName = (raw: string): string =>
  raw
    .replace(/[\u0000-\u001f\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160) || "document";
const headerText = (req: Request, name: string): string => {
  try {
    return decodeURIComponent(String(req.get(name) ?? ""));
  } catch {
    return "";
  }
};

type AuthedRequest = Request & { user: PublicUser };

/** What was read from an uploaded file, sent back with it. */
export interface DriveRead {
  /** A Supplier Registration Form: its boxes, as F/PUR/01's reader reads them. */
  form?: SupplierFormReadResult;
  /** A certificate or an agreement: the date it is valid upto. */
  validUpto?: string;
  /** An audit report: F/PUR/02's header. */
  audit?: AuditReportFields;
  /** Why nothing could be read (a picture, a scanned page without words). */
  note?: string;
}

export interface DriveRoutesDeps {
  requireAuth: RequestHandler;
  store: DriveStore;
  may: (user: PublicUser) => Promise<{ read: boolean; write: boolean }>;
  /** F/PUR/01's reader, the assistant allowed or not for this person (backend/index.ts). */
  readForm: (bytes: Buffer, name: string, user: PublicUser) => Promise<SupplierFormReadResult>;
  logActivity: (req: Request, who: PublicUser | null, action: string, target?: string, detail?: string, department?: string) => void;
}

export function registerDriveRoutes(app: Express, deps: DriveRoutesDeps): void {
  const { requireAuth, store, may, readForm, logActivity } = deps;
  const allowed = async (req: Request, res: Response, write: boolean): Promise<boolean> => {
    const rights = await may((req as AuthedRequest).user);
    if (write ? rights.write : rights.read) return true;
    res.status(403).json({ error: write ? "Only someone who writes Purchase can change a supplier's documents." : "Only someone who holds Purchase Master Data can see a supplier's documents." });
    return false;
  };

  app.get("/api/purchase/drive", requireAuth, async (req: Request, res: Response): Promise<void> => {
    if (!(await allowed(req, res, false))) return;
    const supplier = String(req.query.supplier ?? "");
    if (supplier && !ID_RE.test(supplier)) {
      res.status(400).json({ error: "Which supplier?" });
      return;
    }
    res.json({ files: await store.list(supplier || undefined) });
  });

  app.post("/api/purchase/drive/:supplierId", requireAuth, express.raw({ type: "application/octet-stream", limit: DRIVE_MAX_BYTES }), async (req: Request, res: Response): Promise<void> => {
    const supplierId = String(req.params.supplierId ?? "");
    if (!ID_RE.test(supplierId)) {
      res.status(400).json({ error: "Which supplier?" });
      return;
    }
    if (!(await allowed(req, res, true))) return;
    const body = req.body;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      res.status(400).json({ error: "Choose the file to upload." });
      return;
    }
    const name = cleanName(headerText(req, "x-file-name"));
    const mime = agreementMime(body, name);
    if (!mime) {
      res.status(422).json({ error: "This file isn't a PDF, a Word or Excel file or a picture (JPEG / PNG), so it can't be kept." });
      return;
    }
    const typed = headerText(req, "x-doc-type");
    const docType: DriveType = (DRIVE_TYPES as readonly string[]).includes(typed) ? (typed as DriveType) : "other";
    const supplierName = headerText(req, "x-supplier-name").replace(/\s+/g, " ").trim().slice(0, 200);
    const user = (req as AuthedRequest).user;

    // Read what the file says, by its kind; a file that cannot be read is kept all the same.
    const read: DriveRead = {};
    const readable = mime === "application/pdf" || mime.includes("word");
    if (!readable) read.note = "A picture is kept as it is: its words are not read.";
    else if (docType === "srf") {
      try {
        read.form = await readForm(body, name, user);
      } catch (err) {
        read.note = err instanceof CvReadError ? err.message : "The form could not be read; it is kept as it is.";
      }
    } else if (docType === "isoCertificate" || docType === "serviceAgreement" || docType === "auditReport") {
      try {
        const { text } = await cvText(body, name);
        if (docType === "auditReport") {
          read.audit = readAuditReport(text);
          if (Object.keys(read.audit).length === 0) read.note = "No F/PUR/02 header was found in the file's words.";
        } else {
          const date = validityIn(text);
          if (date) read.validUpto = date;
          else read.note = "No valid-upto or expiry date was found in the file's words.";
        }
      } catch (err) {
        read.note = err instanceof CvReadError ? err.message : "The file's words could not be read; it is kept as it is.";
      }
    }

    const file = await store.add({ supplierId, supplierName, docType, name, mime, size: body.length, validUpto: read.validUpto ?? "", bytes: body, uploadedBy: user.name });
    logActivity(req, user, "Supplier document uploaded", supplierName || supplierId, `${docType}: ${name} (${Math.round(body.length / 1024)} KB)${read.validUpto ? `, valid upto ${read.validUpto}` : ""}`, "PUR");
    res.json({ file, read });
  });

  app.get("/api/purchase/drive/file/:fileId", requireAuth, async (req: Request, res: Response): Promise<void> => {
    if (!(await allowed(req, res, false))) return;
    const fileId = String(req.params.fileId ?? "");
    const file = ID_RE.test(fileId) ? await store.get(fileId) : null;
    if (!file) {
      res.status(404).json({ error: "No such file in the drive." });
      return;
    }
    const inline = file.mime === "application/pdf" || file.mime.startsWith("image/");
    const ascii = file.name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
    res.setHeader("Content-Type", file.mime);
    res.setHeader("Content-Length", String(file.bytes.length));
    res.setHeader("Content-Disposition", `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.name)}`);
    res.setHeader("Cache-Control", "private, max-age=0");
    res.send(file.bytes);
  });

  app.delete("/api/purchase/drive/file/:fileId", requireAuth, async (req: Request, res: Response): Promise<void> => {
    if (!(await allowed(req, res, true))) return;
    const fileId = String(req.params.fileId ?? "");
    const file = ID_RE.test(fileId) ? await store.get(fileId) : null;
    if (!file || !(await store.remove(fileId))) {
      res.status(404).json({ error: "No such file in the drive." });
      return;
    }
    logActivity(req, (req as AuthedRequest).user, "Supplier document removed", file.supplierName || file.supplierId, `${file.docType}: ${file.name}`, "PUR");
    res.json({ ok: true });
  });
}
