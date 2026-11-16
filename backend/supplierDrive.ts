// THE PURCHASE DRIVE (REQUIREMENTS §230, §231; the owner, 16-Nov-2026: "purchase module in which master data you need to
// create drive in which user will upload his document ... then system will fetch the data from there in pdf and master
// data"; then "create Seperate page for it in master data only and also user can create any folder Customly instead of
// predefined suppliers like it should be like google drive replica type").
//
// FOLDERS. The drive's root holds "Suppliers" - a folder for each supplier of Purchase Master Data, "supplier:<id>", made
// from the master as it stands (never stored) - and the folders people make (stored here: a name, the folder it is in),
// as deep as they like, inside a supplier's folder too. A folder people made is renamed, moved and deleted (when empty).
//
// FILES. A file is kept in PostgreSQL in its folder, with the kind of document it is (the six F/PUR/03 documents, the
// service agreement, the audit report, or another) and the supplier it belongs to - the supplier whose folder it is in,
// however deep - and READ as it is uploaded: a Supplier Registration Form by the F/PUR/01 reader
// (backend/supplierFormExtract.ts), an ISO certificate or a service agreement for the date it is valid upto, an audit report
// for F/PUR/02's header. What is read goes back with the file; the browser writes it into Purchase Master Data and the
// records (frontend/src/engine/supplierDrive.ts). A file is renamed and moved to another folder.
//
// Read by whoever holds Purchase Master Data, changed by whoever writes Purchase (as the agreements,
// backend/supplierAgreements.ts).
//
//   GET    /api/purchase/drive?folder=ID|supplier=ID|q=WORDS   the files (no bytes): a folder's, a supplier's, or found
//   POST   /api/purchase/drive/upload                          the file as the raw body (X-File-Name, X-Folder-Id,
//                                                              X-Doc-Type, X-Supplier-Id, X-Supplier-Name), 10 MB
//   POST   /api/purchase/drive/:supplierId                     the same, into the supplier's own folder (§230)
//   GET    /api/purchase/drive/file/:fileId                    the file itself
//   PATCH  /api/purchase/drive/file/:fileId                    renamed or moved ({ name, folderId, supplierId, supplierName })
//   DELETE /api/purchase/drive/file/:fileId                    the file taken out of the drive
//   GET    /api/purchase/drive/folders                         the folders people made
//   POST   /api/purchase/drive/folders                         a folder made ({ name, parentId })
//   PATCH  /api/purchase/drive/folders/:folderId               renamed or moved ({ name, parentId })
//   DELETE /api/purchase/drive/folders/:folderId               deleted, when nothing is in it

import express, { type Express, type Request, type RequestHandler, type Response } from "express";
import { randomUUID } from "node:crypto";
import type { PublicUser } from "./auth.ts";
import { database, registerSchema } from "./db.ts";
import { agreementMime } from "./supplierAgreements.ts";
import { CvReadError, cvText } from "./cvExtract.ts";
import type { SupplierFormReadResult } from "./supplierFormExtract.ts";

export const DRIVE_MAX_BYTES = 10 * 1024 * 1024;

/** The kinds of document the drive keeps. */
export const DRIVE_TYPES = ["srf", "tdsSpecs", "msds", "foodGradeDeclaration", "traceability", "isoCertificate", "serviceAgreement", "auditReport", "other"] as const;
export type DriveType = (typeof DRIVE_TYPES)[number];

/** The drive's own folders: its root (""), "Suppliers", and each supplier's ("supplier:<id>"). */
export const ROOT = "";
export const SUPPLIERS = "suppliers";
export const supplierFolder = (supplierId: string): string => `supplier:${supplierId}`;
const SUPPLIER_FOLDER_RE = /^supplier:([A-Za-z0-9._-]{1,100})$/;

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
  ALTER TABLE supplier_drive_files ADD COLUMN IF NOT EXISTS folder_id TEXT NOT NULL DEFAULT '';
  UPDATE supplier_drive_files SET folder_id = 'supplier:' || supplier_id WHERE folder_id = '' AND supplier_id <> '';
  CREATE INDEX IF NOT EXISTS supplier_drive_folder_idx ON supplier_drive_files (folder_id, uploaded_at DESC);
  CREATE TABLE IF NOT EXISTS supplier_drive_folders (
    id TEXT PRIMARY KEY,
    parent_id TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`;
registerSchema(DRIVE_SCHEMA);

export interface DriveFile {
  id: string;
  folderId: string;
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

export interface DriveFolder {
  id: string;
  parentId: string;
  name: string;
  createdBy: string;
  createdAt: string;
}

export interface DriveStore {
  list(where: { folderId?: string; supplierId?: string; q?: string }): Promise<DriveFile[]>;
  add(file: Omit<DriveFile, "id" | "uploadedAt"> & { bytes: Buffer }): Promise<DriveFile>;
  get(id: string): Promise<(DriveFile & { bytes: Buffer }) | null>;
  update(id: string, changes: Partial<Pick<DriveFile, "name" | "folderId" | "supplierId" | "supplierName">>): Promise<DriveFile | null>;
  remove(id: string): Promise<boolean>;
  folders(): Promise<DriveFolder[]>;
  addFolder(folder: Omit<DriveFolder, "id" | "createdAt">): Promise<DriveFolder>;
  updateFolder(id: string, changes: Partial<Pick<DriveFolder, "name" | "parentId">>): Promise<DriveFolder | null>;
  removeFolder(id: string): Promise<boolean>;
  /** Files directly in the folder (any folder: one people made or a supplier's). */
  countIn(folderId: string): Promise<number>;
}

interface Queryable {
  query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
}

const COLUMNS = "id, folder_id, supplier_id, supplier_name, doc_type, name, mime, size, valid_upto, uploaded_by, uploaded_at";
const at = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v));
const rowFile = (r: Record<string, unknown>): DriveFile => ({
  id: String(r.id),
  folderId: String(r.folder_id ?? ""),
  supplierId: String(r.supplier_id ?? ""),
  supplierName: String(r.supplier_name ?? ""),
  docType: (DRIVE_TYPES as readonly string[]).includes(String(r.doc_type)) ? (String(r.doc_type) as DriveType) : "other",
  name: String(r.name),
  mime: String(r.mime),
  size: Number(r.size),
  validUpto: String(r.valid_upto ?? ""),
  uploadedBy: String(r.uploaded_by),
  uploadedAt: at(r.uploaded_at),
});
const rowFolder = (r: Record<string, unknown>): DriveFolder => ({ id: String(r.id), parentId: String(r.parent_id ?? ""), name: String(r.name), createdBy: String(r.created_by), createdAt: at(r.created_at) });

export function createDatabaseDriveStore(db: () => Queryable = () => database() as unknown as Queryable): DriveStore {
  return {
    async list(where) {
      if (where.q) {
        const { rows } = await db().query(`SELECT ${COLUMNS} FROM supplier_drive_files WHERE name ILIKE $1 OR supplier_name ILIKE $1 ORDER BY uploaded_at DESC LIMIT 200`, [`%${where.q.replace(/[%_\\]/g, "\\$&")}%`]);
        return rows.map(rowFile);
      }
      if (where.supplierId) {
        const { rows } = await db().query(`SELECT ${COLUMNS} FROM supplier_drive_files WHERE supplier_id = $1 ORDER BY uploaded_at DESC, id DESC`, [where.supplierId]);
        return rows.map(rowFile);
      }
      const { rows } = await db().query(`SELECT ${COLUMNS} FROM supplier_drive_files WHERE folder_id = $1 ORDER BY uploaded_at DESC, id DESC`, [where.folderId ?? ROOT]);
      return rows.map(rowFile);
    },
    async add(file) {
      const id = `drv-${randomUUID()}`;
      const { rows } = await db().query(
        `INSERT INTO supplier_drive_files (id, folder_id, supplier_id, supplier_name, doc_type, name, mime, size, valid_upto, bytes, uploaded_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING ${COLUMNS}`,
        [id, file.folderId, file.supplierId, file.supplierName, file.docType, file.name, file.mime, file.size, file.validUpto, file.bytes, file.uploadedBy]
      );
      return rowFile(rows[0]);
    },
    async get(id) {
      const { rows } = await db().query(`SELECT ${COLUMNS}, bytes FROM supplier_drive_files WHERE id = $1`, [id]);
      if (rows.length === 0) return null;
      const bytes = rows[0].bytes;
      return { ...rowFile(rows[0]), bytes: Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes as Uint8Array) };
    },
    async update(id, changes) {
      const sets: string[] = [];
      const params: unknown[] = [];
      const put = (col: string, v: unknown) => {
        params.push(v);
        sets.push(`${col} = $${params.length}`);
      };
      if (changes.name !== undefined) put("name", changes.name);
      if (changes.folderId !== undefined) put("folder_id", changes.folderId);
      if (changes.supplierId !== undefined) put("supplier_id", changes.supplierId);
      if (changes.supplierName !== undefined) put("supplier_name", changes.supplierName);
      if (sets.length === 0) return (await this.get(id)) as DriveFile | null;
      params.push(id);
      const { rows } = await db().query(`UPDATE supplier_drive_files SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING ${COLUMNS}`, params);
      return rows[0] ? rowFile(rows[0]) : null;
    },
    async remove(id) {
      const { rowCount } = await db().query("DELETE FROM supplier_drive_files WHERE id = $1", [id]);
      return (rowCount ?? 0) > 0;
    },
    async folders() {
      const { rows } = await db().query("SELECT id, parent_id, name, created_by, created_at FROM supplier_drive_folders ORDER BY lower(name), id");
      return rows.map(rowFolder);
    },
    async addFolder(folder) {
      const id = `fld-${randomUUID()}`;
      const { rows } = await db().query("INSERT INTO supplier_drive_folders (id, parent_id, name, created_by) VALUES ($1, $2, $3, $4) RETURNING id, parent_id, name, created_by, created_at", [id, folder.parentId, folder.name, folder.createdBy]);
      return rowFolder(rows[0]);
    },
    async updateFolder(id, changes) {
      const { rows } = await db().query(
        "UPDATE supplier_drive_folders SET name = COALESCE($2, name), parent_id = COALESCE($3, parent_id) WHERE id = $1 RETURNING id, parent_id, name, created_by, created_at",
        [id, changes.name ?? null, changes.parentId ?? null]
      );
      return rows[0] ? rowFolder(rows[0]) : null;
    },
    async removeFolder(id) {
      const { rowCount } = await db().query("DELETE FROM supplier_drive_folders WHERE id = $1", [id]);
      return (rowCount ?? 0) > 0;
    },
    async countIn(folderId) {
      const { rows } = await db().query("SELECT count(*)::int AS n FROM supplier_drive_files WHERE folder_id = $1", [folderId]);
      return Number(rows[0]?.n ?? 0);
    },
  };
}

/** A stand-in for the unit tests: the same rules, in memory. */
export function createMemoryDriveStore(clock: () => Date = () => new Date()): DriveStore & { rows: (DriveFile & { bytes: Buffer })[]; folderRows: DriveFolder[] } {
  const rows: (DriveFile & { bytes: Buffer })[] = [];
  const folderRows: DriveFolder[] = [];
  const strip = ({ bytes: _b, ...file }: DriveFile & { bytes: Buffer }): DriveFile => file;
  return {
    rows,
    folderRows,
    async list(where) {
      const q = where.q?.toLowerCase();
      return rows
        .filter((r) => (q ? r.name.toLowerCase().includes(q) || r.supplierName.toLowerCase().includes(q) : where.supplierId ? r.supplierId === where.supplierId : r.folderId === (where.folderId ?? ROOT)))
        .slice()
        .reverse()
        .map(strip);
    },
    async add(file) {
      const row = { ...file, id: `drv-${randomUUID()}`, uploadedAt: clock().toISOString() };
      rows.push(row);
      return strip(row);
    },
    async get(id) {
      return rows.find((r) => r.id === id) ?? null;
    },
    async update(id, changes) {
      const row = rows.find((r) => r.id === id);
      if (!row) return null;
      Object.assign(row, Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined)));
      return strip(row);
    },
    async remove(id) {
      const i = rows.findIndex((r) => r.id === id);
      if (i < 0) return false;
      rows.splice(i, 1);
      return true;
    },
    async folders() {
      return folderRows.slice().sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    },
    async addFolder(folder) {
      const row = { ...folder, id: `fld-${randomUUID()}`, createdAt: clock().toISOString() };
      folderRows.push(row);
      return row;
    },
    async updateFolder(id, changes) {
      const row = folderRows.find((f) => f.id === id);
      if (!row) return null;
      if (changes.name !== undefined) row.name = changes.name;
      if (changes.parentId !== undefined) row.parentId = changes.parentId;
      return row;
    },
    async removeFolder(id) {
      const i = folderRows.findIndex((f) => f.id === id);
      if (i < 0) return false;
      folderRows.splice(i, 1);
      return true;
    },
    async countIn(folderId) {
      return rows.filter((r) => r.folderId === folderId).length;
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
  const add = (where: number, v: string | null) => {
    if (v) out.push({ iso: v, at: where });
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
    const where = m.index ?? 0;
    const next = dates.find((d) => d.at >= where && d.at - where <= 120);
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
  const statusAt = lines.findIndex((l) => /overall\s*status/i.test(l));
  if (statusAt >= 0) {
    const said = `${lines[statusAt]} ${lines[statusAt + 1] ?? ""}`.replace(/approved\s*\/\s*rejected/gi, " ");
    const status = /\b(approved|rejected)\b/i.exec(said);
    if (status) out.overallStatus = status[1][0].toUpperCase() + status[1].slice(1).toLowerCase();
  }
  return out;
}

// ---------------------------------------------------------------------------
// the routes

const ID_RE = /^[A-Za-z0-9._:-]{1,120}$/;
const cleanName = (raw: string, fallback = "document"): string =>
  raw
    .replace(/[\u0000-\u001f\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160) || fallback;
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
    res.status(403).json({ error: write ? "Only someone who writes Purchase can change the Purchase Drive." : "Only someone who holds Purchase Master Data can see the Purchase Drive." });
    return false;
  };
  /** A folder a file or a folder may be put in: the root, Suppliers, a supplier's, or one people made. */
  const folderExists = async (id: string): Promise<boolean> =>
    id === ROOT || id === SUPPLIERS || SUPPLIER_FOLDER_RE.test(id) || (ID_RE.test(id) && (await store.folders()).some((f) => f.id === id));
  const json = express.json({ limit: "32kb" });

  // ---- files ----

  app.get("/api/purchase/drive", requireAuth, async (req: Request, res: Response): Promise<void> => {
    if (!(await allowed(req, res, false))) return;
    const supplier = String(req.query.supplier ?? "");
    const folder = String(req.query.folder ?? "");
    const q = String(req.query.q ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
    if ((supplier && !ID_RE.test(supplier)) || (folder && !ID_RE.test(folder))) {
      res.status(400).json({ error: "Which folder?" });
      return;
    }
    res.json({ files: await store.list(q ? { q } : supplier ? { supplierId: supplier } : { folderId: folder }) });
  });

  const upload = async (req: Request, res: Response, place: { folderId: string; supplierId: string; supplierName: string }): Promise<void> => {
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
    const user = (req as AuthedRequest).user;

    // Read what the file says, by its kind, when it is a supplier's; a file that cannot be read is kept all the same.
    const read: DriveRead = {};
    const readable = mime === "application/pdf" || mime.includes("word");
    if (!place.supplierId || docType === "other") {
      /* kept as it is */
    } else if (!readable) read.note = "A picture is kept as it is: its words are not read.";
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

    const file = await store.add({ ...place, docType, name, mime, size: body.length, validUpto: read.validUpto ?? "", bytes: body, uploadedBy: user.name });
    logActivity(req, user, "Purchase Drive file uploaded", place.supplierName || place.folderId || "Purchase Drive", `${docType}: ${name} (${Math.round(body.length / 1024)} KB)${read.validUpto ? `, valid upto ${read.validUpto}` : ""}`, "PUR");
    res.json({ file, read });
  };

  // (the named routes before /:supplierId, which would take "upload" and "folders" for a supplier's id)
  app.post("/api/purchase/drive/upload", requireAuth, express.raw({ type: "application/octet-stream", limit: DRIVE_MAX_BYTES }), async (req: Request, res: Response): Promise<void> => {
    if (!(await allowed(req, res, true))) return;
    const folderId = headerText(req, "x-folder-id");
    const supplierId = headerText(req, "x-supplier-id");
    if ((folderId && !ID_RE.test(folderId)) || (supplierId && !ID_RE.test(supplierId)) || !(await folderExists(folderId))) {
      res.status(400).json({ error: "Which folder?" });
      return;
    }
    await upload(req, res, { folderId, supplierId, supplierName: headerText(req, "x-supplier-name").replace(/\s+/g, " ").trim().slice(0, 200) });
  });

  // ---- folders ----

  app.get("/api/purchase/drive/folders", requireAuth, async (req: Request, res: Response): Promise<void> => {
    if (!(await allowed(req, res, false))) return;
    res.json({ folders: await store.folders() });
  });

  app.post("/api/purchase/drive/folders", requireAuth, json, async (req: Request, res: Response): Promise<void> => {
    if (!(await allowed(req, res, true))) return;
    const name = cleanName(String(req.body?.name ?? ""), "");
    const parentId = String(req.body?.parentId ?? "");
    if (!name) {
      res.status(400).json({ error: "Give the folder a name." });
      return;
    }
    if (!(await folderExists(parentId))) {
      res.status(400).json({ error: "Which folder should it go in?" });
      return;
    }
    const folders = await store.folders();
    if (folders.some((f) => f.parentId === parentId && f.name.toLowerCase() === name.toLowerCase())) {
      res.status(409).json({ error: `There is already a folder named "${name}" here.` });
      return;
    }
    const user = (req as AuthedRequest).user;
    const folder = await store.addFolder({ parentId, name, createdBy: user.name });
    logActivity(req, user, "Purchase Drive folder made", name, parentId ? `in ${parentId}` : "in the drive's root", "PUR");
    res.json({ folder });
  });

  app.patch("/api/purchase/drive/folders/:folderId", requireAuth, json, async (req: Request, res: Response): Promise<void> => {
    if (!(await allowed(req, res, true))) return;
    const id = String(req.params.folderId ?? "");
    const folders = await store.folders();
    const folder = folders.find((f) => f.id === id);
    if (!folder) {
      res.status(404).json({ error: "No such folder." });
      return;
    }
    const name = req.body?.name === undefined ? undefined : cleanName(String(req.body.name), "");
    const parentId = req.body?.parentId === undefined ? undefined : String(req.body.parentId);
    if (name === "") {
      res.status(400).json({ error: "Give the folder a name." });
      return;
    }
    if (parentId !== undefined) {
      // Never into itself or a folder inside it.
      let up: string | undefined = parentId;
      while (up && !SUPPLIER_FOLDER_RE.test(up) && up !== SUPPLIERS) {
        if (up === id) {
          res.status(400).json({ error: "A folder can't go inside itself." });
          return;
        }
        up = folders.find((f) => f.id === up)?.parentId;
      }
      if (!(await folderExists(parentId))) {
        res.status(400).json({ error: "Which folder should it go in?" });
        return;
      }
    }
    const saved = await store.updateFolder(id, { ...(name !== undefined ? { name } : {}), ...(parentId !== undefined ? { parentId } : {}) });
    logActivity(req, (req as AuthedRequest).user, "Purchase Drive folder changed", saved?.name ?? id, `${name !== undefined ? `named "${name}"` : ""}${parentId !== undefined ? ` moved to ${parentId || "the root"}` : ""}`, "PUR");
    res.json({ folder: saved });
  });

  app.delete("/api/purchase/drive/folders/:folderId", requireAuth, async (req: Request, res: Response): Promise<void> => {
    if (!(await allowed(req, res, true))) return;
    const id = String(req.params.folderId ?? "");
    const folders = await store.folders();
    const folder = folders.find((f) => f.id === id);
    if (!folder) {
      res.status(404).json({ error: "No such folder." });
      return;
    }
    if (folders.some((f) => f.parentId === id) || (await store.countIn(id)) > 0) {
      res.status(409).json({ error: `"${folder.name}" is not empty: move or delete what is in it first.` });
      return;
    }
    await store.removeFolder(id);
    logActivity(req, (req as AuthedRequest).user, "Purchase Drive folder deleted", folder.name, "", "PUR");
    res.json({ ok: true });
  });

  // ---- one file ----

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

  app.patch("/api/purchase/drive/file/:fileId", requireAuth, json, async (req: Request, res: Response): Promise<void> => {
    if (!(await allowed(req, res, true))) return;
    const fileId = String(req.params.fileId ?? "");
    const file = ID_RE.test(fileId) ? await store.get(fileId) : null;
    if (!file) {
      res.status(404).json({ error: "No such file in the drive." });
      return;
    }
    const b = req.body ?? {};
    const name = b.name === undefined ? undefined : cleanName(String(b.name), "");
    if (name === "") {
      res.status(400).json({ error: "Give the file a name." });
      return;
    }
    const folderId = b.folderId === undefined ? undefined : String(b.folderId);
    if (folderId !== undefined && !(await folderExists(folderId))) {
      res.status(400).json({ error: "Which folder should it go in?" });
      return;
    }
    const supplierId = b.supplierId === undefined ? undefined : String(b.supplierId);
    if (supplierId && !ID_RE.test(supplierId)) {
      res.status(400).json({ error: "Which supplier?" });
      return;
    }
    const saved = await store.update(fileId, {
      ...(name !== undefined ? { name } : {}),
      ...(folderId !== undefined ? { folderId } : {}),
      ...(supplierId !== undefined ? { supplierId, supplierName: String(b.supplierName ?? "").slice(0, 200) } : {}),
    });
    logActivity(req, (req as AuthedRequest).user, "Purchase Drive file changed", file.name, `${name !== undefined ? `named "${name}"` : ""}${folderId !== undefined ? ` moved to ${folderId || "the root"}` : ""}`, "PUR");
    res.json({ file: saved });
  });

  app.delete("/api/purchase/drive/file/:fileId", requireAuth, async (req: Request, res: Response): Promise<void> => {
    if (!(await allowed(req, res, true))) return;
    const fileId = String(req.params.fileId ?? "");
    const file = ID_RE.test(fileId) ? await store.get(fileId) : null;
    if (!file || !(await store.remove(fileId))) {
      res.status(404).json({ error: "No such file in the drive." });
      return;
    }
    logActivity(req, (req as AuthedRequest).user, "Purchase Drive file removed", file.supplierName || file.folderId || "Purchase Drive", `${file.docType}: ${file.name}`, "PUR");
    res.json({ ok: true });
  });

  // ---- a supplier's own folder (§230) ----

  app.post("/api/purchase/drive/:supplierId", requireAuth, express.raw({ type: "application/octet-stream", limit: DRIVE_MAX_BYTES }), async (req: Request, res: Response): Promise<void> => {
    const supplierId = String(req.params.supplierId ?? "");
    if (!ID_RE.test(supplierId) || supplierId.includes(":")) {
      res.status(400).json({ error: "Which supplier?" });
      return;
    }
    if (!(await allowed(req, res, true))) return;
    await upload(req, res, { folderId: supplierFolder(supplierId), supplierId, supplierName: headerText(req, "x-supplier-name").replace(/\s+/g, " ").trim().slice(0, 200) });
  });
}
