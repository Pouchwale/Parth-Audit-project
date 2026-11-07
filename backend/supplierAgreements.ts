// THE SERVICE AGREEMENT / CERTIFICATE KEPT ON AN F/PUR/01 RECORD (REQUIREMENTS §192; the owner, 6-Nov-2026: "in pur-01
// in that there is a service report in which date of expiry is written so before two month of expiry and user should get
// the notification ... and upload the new service agreement"). The agreement a supplier holds with the plant is a file -
// a PDF, a Word file, a photograph of the signed paper - kept here in PostgreSQL against the record, uploaded by anyone
// who writes Purchase, read by anyone who holds Purchase Master Data (backend/accessLevels.ts writesPurchaseMaster,
// holdsPurchaseMaster); the old agreements stay on the record under the new one, so the file shows what was agreed when.
// The date it is valid upto is the record's own box (SERVICE AGREEMENT / CERTIFICATE VALID UPTO), which the notify job
// reads for the two months' warning (engine/notificationPlan.ts `expiry`).
//
//   GET    /api/purchase/agreements/:recordId            the files on the record, newest first (no bytes)
//   POST   /api/purchase/agreements/:recordId            the file as the raw body (X-File-Name, X-File-Note), 10 MB at most
//   GET    /api/purchase/agreements/:recordId/:fileId    the file itself (a PDF or a picture shown in the browser)
//   DELETE /api/purchase/agreements/:recordId/:fileId    the file taken off the record

import express, { type Express, type Request, type RequestHandler, type Response } from "express";
import { randomUUID } from "node:crypto";
import type { PublicUser } from "./auth.ts";
import { database, registerSchema } from "./db.ts";
import { sniffFileKind } from "./zip.ts";

export const AGREEMENT_MAX_BYTES = 10 * 1024 * 1024;

export const AGREEMENT_SCHEMA = `
  CREATE TABLE IF NOT EXISTS supplier_agreements (
    id TEXT PRIMARY KEY,
    record_id TEXT NOT NULL,
    name TEXT NOT NULL,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    bytes BYTEA NOT NULL,
    uploaded_by TEXT NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS supplier_agreements_record_idx ON supplier_agreements (record_id, uploaded_at DESC);
`;
registerSchema(AGREEMENT_SCHEMA);

export interface AgreementFile {
  id: string;
  recordId: string;
  name: string;
  mime: string;
  size: number;
  note: string;
  uploadedBy: string;
  uploadedAt: string;
}

export interface AgreementStore {
  list(recordId: string): Promise<AgreementFile[]>;
  add(file: Omit<AgreementFile, "id" | "uploadedAt"> & { bytes: Buffer }): Promise<AgreementFile>;
  get(recordId: string, id: string): Promise<(AgreementFile & { bytes: Buffer }) | null>;
  remove(recordId: string, id: string): Promise<boolean>;
}

interface Queryable {
  query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
}

const rowFile = (r: Record<string, unknown>): AgreementFile => ({
  id: String(r.id),
  recordId: String(r.record_id),
  name: String(r.name),
  mime: String(r.mime),
  size: Number(r.size),
  note: String(r.note ?? ""),
  uploadedBy: String(r.uploaded_by),
  uploadedAt: r.uploaded_at instanceof Date ? r.uploaded_at.toISOString() : String(r.uploaded_at),
});

export function createDatabaseAgreementStore(db: () => Queryable = () => database() as unknown as Queryable): AgreementStore {
  return {
    async list(recordId) {
      const { rows } = await db().query("SELECT id, record_id, name, mime, size, note, uploaded_by, uploaded_at FROM supplier_agreements WHERE record_id = $1 ORDER BY uploaded_at DESC, id DESC", [recordId]);
      return rows.map(rowFile);
    },
    async add(file) {
      const id = `agr-${randomUUID()}`;
      const { rows } = await db().query(
        "INSERT INTO supplier_agreements (id, record_id, name, mime, size, note, bytes, uploaded_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, record_id, name, mime, size, note, uploaded_by, uploaded_at",
        [id, file.recordId, file.name, file.mime, file.size, file.note, file.bytes, file.uploadedBy]
      );
      return rowFile(rows[0]);
    },
    async get(recordId, id) {
      const { rows } = await db().query("SELECT id, record_id, name, mime, size, note, bytes, uploaded_by, uploaded_at FROM supplier_agreements WHERE record_id = $1 AND id = $2", [recordId, id]);
      if (rows.length === 0) return null;
      const bytes = rows[0].bytes;
      return { ...rowFile(rows[0]), bytes: Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes as Uint8Array) };
    },
    async remove(recordId, id) {
      const { rowCount } = await db().query("DELETE FROM supplier_agreements WHERE record_id = $1 AND id = $2", [recordId, id]);
      return (rowCount ?? 0) > 0;
    },
  };
}

/** A stand-in for the unit tests: the same rules, in memory. */
export function createMemoryAgreementStore(clock: () => Date = () => new Date()): AgreementStore & { rows: (AgreementFile & { bytes: Buffer })[] } {
  const rows: (AgreementFile & { bytes: Buffer })[] = [];
  // Two files uploaded at the one moment the clock gives (a test's fixed clock; a real clock's tick): the later upload is
  // the newer, not whichever id sorts higher - so each row remembers its turn.
  const turn = new Map<string, number>();
  return {
    rows,
    async list(recordId) {
      return rows
        .filter((r) => r.recordId === recordId)
        .sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : a.uploadedAt > b.uploadedAt ? -1 : (turn.get(b.id) ?? 0) - (turn.get(a.id) ?? 0)))
        .map(({ bytes: _b, ...file }) => file);
    },
    async add(file) {
      const row = { ...file, id: `agr-${randomUUID()}`, uploadedAt: clock().toISOString() };
      turn.set(row.id, rows.length);
      rows.push(row);
      const { bytes: _b, ...out } = row;
      return out;
    },
    async get(recordId, id) {
      return rows.find((r) => r.recordId === recordId && r.id === id) ?? null;
    },
    async remove(recordId, id) {
      const at = rows.findIndex((r) => r.recordId === recordId && r.id === id);
      if (at < 0) return false;
      rows.splice(at, 1);
      return true;
    },
  };
}

// ---------------------------------------------------------------------------
// what a file is

const ID_RE = /^[A-Za-z0-9._:-]{1,120}$/;
const WORD_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** The file's kind by its bytes (backend/zip.ts), its name deciding among the zip-based Office files; null for a file not kept. */
export function agreementMime(bytes: Buffer, fileName: string): string | null {
  const magic = sniffFileKind(bytes);
  if (magic === "pdf") return "application/pdf";
  if (magic === "jpeg") return "image/jpeg";
  if (magic === "png") return "image/png";
  if (magic === "zip") return /\.xlsx$/i.test(fileName) ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : WORD_MIME;
  if (magic === "doc") return "application/msword";
  return null;
}

/** A name safe to send back in a header and to show: its own characters, cut to 160. */
const cleanName = (raw: string): string =>
  raw
    .replace(/[\u0000-\u001f\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160) || "agreement";

const headerText = (req: Request, name: string): string => {
  try {
    return decodeURIComponent(String(req.get(name) ?? ""));
  } catch {
    return "";
  }
};

type AuthedRequest = Request & { user: PublicUser };

export interface AgreementRoutesDeps {
  requireAuth: RequestHandler;
  store: AgreementStore;
  /** What this person may do with the agreements: read them (holds Purchase Master Data), write them (writes it). */
  may: (user: PublicUser) => Promise<{ read: boolean; write: boolean }>;
  logActivity: (req: Request, who: PublicUser | null, action: string, target?: string, detail?: string, department?: string) => void;
}

export function registerAgreementRoutes(app: Express, deps: AgreementRoutesDeps): void {
  const { requireAuth, store, may, logActivity } = deps;
  const recordIdOf = (req: Request, res: Response): string | null => {
    const id = String(req.params.recordId ?? "");
    if (ID_RE.test(id)) return id;
    res.status(400).json({ error: "Which record?" });
    return null;
  };
  const allowed = async (req: Request, res: Response, write: boolean): Promise<boolean> => {
    const user = (req as AuthedRequest).user;
    const rights = await may(user);
    if (write ? rights.write : rights.read) return true;
    res.status(403).json({ error: write ? "Only someone who writes Purchase can change a supplier's agreement." : "Only someone who holds Purchase Master Data can see a supplier's agreement." });
    return false;
  };

  app.get("/api/purchase/agreements/:recordId", requireAuth, async (req: Request, res: Response): Promise<void> => {
    const recordId = recordIdOf(req, res);
    if (!recordId || !(await allowed(req, res, false))) return;
    res.json({ files: await store.list(recordId) });
  });

  app.post("/api/purchase/agreements/:recordId", requireAuth, express.raw({ type: "application/octet-stream", limit: AGREEMENT_MAX_BYTES }), async (req: Request, res: Response): Promise<void> => {
    const recordId = recordIdOf(req, res);
    if (!recordId || !(await allowed(req, res, true))) return;
    const body = req.body;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      res.status(400).json({ error: "Choose the agreement file to upload." });
      return;
    }
    const name = cleanName(headerText(req, "x-file-name"));
    const mime = agreementMime(body, name);
    if (!mime) {
      res.status(422).json({ error: "This file isn't a PDF, a Word file or a picture (JPEG / PNG), so it can't be kept as the agreement." });
      return;
    }
    const user = (req as AuthedRequest).user;
    const note = headerText(req, "x-file-note").replace(/\s+/g, " ").trim().slice(0, 300);
    const file = await store.add({ recordId, name, mime, size: body.length, note, bytes: body, uploadedBy: user.name });
    logActivity(req, user, "Supplier agreement uploaded", recordId, `${name} (${Math.round(body.length / 1024)} KB)${note ? ` — ${note}` : ""}`, "PUR");
    res.json({ file });
  });

  app.get("/api/purchase/agreements/:recordId/:fileId", requireAuth, async (req: Request, res: Response): Promise<void> => {
    const recordId = recordIdOf(req, res);
    if (!recordId || !(await allowed(req, res, false))) return;
    const fileId = String(req.params.fileId ?? "");
    const file = ID_RE.test(fileId) ? await store.get(recordId, fileId) : null;
    if (!file) {
      res.status(404).json({ error: "No such file on this record." });
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

  app.delete("/api/purchase/agreements/:recordId/:fileId", requireAuth, async (req: Request, res: Response): Promise<void> => {
    const recordId = recordIdOf(req, res);
    if (!recordId || !(await allowed(req, res, true))) return;
    const fileId = String(req.params.fileId ?? "");
    const file = ID_RE.test(fileId) ? await store.get(recordId, fileId) : null;
    if (!file || !(await store.remove(recordId, fileId))) {
      res.status(404).json({ error: "No such file on this record." });
      return;
    }
    logActivity(req, (req as AuthedRequest).user, "Supplier agreement removed", recordId, file.name, "PUR");
    res.json({ ok: true });
  });
}
