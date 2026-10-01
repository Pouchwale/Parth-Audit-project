import express, { type Express, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import type { PublicUser } from "./auth.ts";
import { clientName } from "./findingsCore.ts";
import { EngineUnavailable, type ActivityLine, type EngineAnswer, type EngineCaller, type EngineHost } from "./engineHost.ts";

// WHAT MITRA DOES IN THE BROWSER, THROUGH THE DCRS API (REQUIREMENTS §85).
//
// The Mitra mobile app (the Audit Assistant's app, renamed by its owner on
// 30-Sep-2026) signs a person in with their DCRS account and then does, on
// their phone, what Mitra does for them in DCRS: finds a document, says what is
// due today, opens today's record, fills it, submits it, verifies it, prints
// it. These routes are how. Each is one of Mitra's tools (engine/mitraTools.ts)
// — the table in docs/chatbot-integration.md maps them — and each is answered
// by DCRS's own engine, run on this server (backend/engineHost.ts): the same
// patch checker, the same validation, the same lifecycle, history and activity
// log as the browser. So a change made from the phone is exactly the change the
// page would have made, in the person's name, and says in the record's history
// and in the activity log which app it came through ("Through Mitra mobile app:
// …", from its X-Client-Name).
//
// The same checks as every /api/v1 route (backend/apiV1.ts signedIn): the
// session, the account read again, the plant's working hours, the forced
// password change — and the person's departments, exactly as the server keeps
// a browser to them. Every route is described in docs/api/dcrs-api.openapi.json.

type LogActivity = (req: Request, who: PublicUser | null, action: string, target?: string, detail?: string, department?: string) => void;

/** What backend/apiV1.ts hands over: its signed-in check and what it knows. */
export interface RecordsRouteDeps {
  /** backend/apiV1.ts signedIn: the session, the account, the hours, the password. */
  signedIn: RequestHandler;
  /** The signed-in person and their token (res.locals, set by signedIn). */
  callerOf: (res: Response) => { user: PublicUser; token: string };
  engine: EngineHost;
  logActivity: LogActivity;
  /** The department code of a document, by the server's own rule (for the activity log's lines). */
  departmentOf: (documentId: string) => Promise<string | null>;
  /** The PDF printer (backend/pdfReport.ts), or null where it cannot print. */
  printer: () => Promise<{ browserPath(): string | null; render(opts: { appUrl: string; sessionToken: string; recordId: string; timeoutMs?: number }): Promise<Buffer> } | null>;
  appBuilt: () => boolean;
  /** The plant's hours and where today stands (backend/workingHours.ts publicAnswer). */
  hoursAnswer: () => Promise<unknown>;
  /** The app's address as the caller reaches it (DCRS_APP_URL, else the request's own origin): each answer's `route` gets a `link` beside it. */
  appAddress: (req: Request) => string;
}

const MAX_TEXT = 200;
const MAX_NOTE = 1000;
const MAX_REASON = 500;
const MAX_FILE_NAME = 120;
/**
 * The largest picture kept from the API. The browser keeps a photo as a 1024 px JPEG at 70% (utils/image.ts, about
 * 60-150 KB), and the records item it goes into must fit in every browser's ~5M-character storage
 * (storageAdapter.ts BROWSER_ROOM_CHARS): a 2 MB picture stored whole would push it over for every account holding
 * that department's records. The server cannot scale a picture (no canvas in Node), so the app sends it scaled.
 */
export const MAX_PHOTO_BYTES = 512 * 1024;
const PHOTO_TOO_LARGE = "The picture is larger than 512 KB. Scale it to at most 1024 pixels on its longer side, as JPEG at 70%, as DCRS does before it keeps a photo.";
/** The photo route: the server's general 100 KB JSON parser must pass it by (it reads its own, after sign-in). */
export const PHOTO_ROUTE = /^\/api\/v1\/records\/[^/]+\/photos\/?$/;
const PDF_TIMEOUT_MS = 60_000;
/** Kinds whose record opens on a page of its own (a CAPA report, a training record, a complaint checklist), which the PDF printer does not open. */
const PRINTED_ELSEWHERE = new Set(["gap-inspection", "training-record", "complaint-checklist"]);

function fail(res: Response, status: number, code: string, error: string): void {
  res.status(status).json({ error, code });
}

/** An optional query text, at most `max` characters; undefined when absent, null when not text. */
function queryText(value: unknown, max = MAX_TEXT): string | undefined | null {
  if (value === undefined) return undefined;
  return typeof value === "string" && value.length <= max ? value : null;
}

function limitOf(value: unknown, fallback: number, max: number): number | null {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !/^\d{1,4}$/.test(value) || Number(value) < 1) return null;
  return Math.min(Number(value), max);
}

/** The departments a person is kept to, or null for every department (backend/index.ts accountDepartments). */
function departmentsOf(user: PublicUser): string[] | null {
  return user.role !== "admin" && user.departments.length > 0 ? user.departments : null;
}

/** A picture's kind, by its first bytes — what it says it is must be what it is. */
function pictureKind(bytes: Buffer): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  return null;
}

/** A file name that can stand in a Content-Disposition header: printable ASCII, no quotes or slashes. */
function fileNameOf(text: string): string {
  const clean = text
    .normalize("NFKD")
    .replace(/[—–]/g, "-")
    .replace(/[\\/]/g, "-")
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/["*:<>?|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return (clean || "DCRS record").slice(0, 150);
}

export function registerApiV1Records(app: Express, deps: RecordsRouteDeps): void {
  const { signedIn, callerOf, engine } = deps;

  // A PHOTO IS LARGER THAN THE SERVER'S JSON LIMIT. Every route's JSON is read by
  // one parser of 100 KB (backend/index.ts), which passes this route by
  // (PHOTO_ROUTE there). Its own reader runs only AFTER the sign-in check, and
  // reads at most 1 MB - a 512 KB picture in base64 is about 700 KB. A body
  // larger than that (an unscaled phone photo) gets this route's own 413
  // "too-large" answer too, with the advice to scale it, not the server's bare one.
  const photoJson = express.json({ limit: "1mb" });
  const photoBody: RequestHandler = (req, res, next) =>
    photoJson(req, res, (err?: unknown) =>
      (err as { type?: string } | undefined)?.type === "entity.too.large" ? fail(res, 413, "too-large", PHOTO_TOO_LARGE) : next(err as Error | undefined)
    );

  /** Who the engine works for: the person, their departments, the app they came through. */
  const callerFor = (req: Request, res: Response): EngineCaller => {
    const { user } = callerOf(res);
    return { userId: user.id, userName: user.name, email: user.email, departments: departmentsOf(user), client: clientName(req.get("x-client-name")) };
  };

  // Beside every `route` (a page of the app, "/record/rec-…"), the `link` that opens it in DCRS, as the other /api/v1 answers give.
  const withLinks = (value: unknown, app: string, depth = 0): unknown => {
    if (depth > 8 || value === null || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map((v) => withLinks(v, app, depth + 1));
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      // A record's data is answered exactly as stored.
      out[k] = k === "data" ? v : withLinks(v, app, depth + 1);
      if (k === "route" && typeof v === "string" && v.startsWith("/")) out.link = `${app}/index.html#${v}`;
    }
    return out;
  };

  const send = (req: Request, res: Response, answer: EngineAnswer): void => {
    res.status(answer.status).json(withLinks(answer.body, deps.appAddress(req)));
  };

  const engineFailed = (res: Response, err: unknown): void => {
    if (err instanceof EngineUnavailable) {
      console.error("[api v1] DCRS's engine is not available:", err.message);
      fail(res, 503, "engine-unavailable", "DCRS cannot work this out just now: its engine is not running on the server. Try again in a minute.");
      return;
    }
    console.error("[api v1] DCRS's engine failed:", err instanceof Error ? err.stack ?? err.message : err);
    fail(res, 500, "engine-failed", "DCRS could not work this out. Try again in a moment.");
  };

  const read = async (req: Request, res: Response, op: string, args: Record<string, unknown>): Promise<EngineAnswer | null> => {
    try {
      return await engine.read(callerFor(req, res), op, args);
    } catch (err) {
      engineFailed(res, err);
      return null;
    }
  };

  /** A change: its activity lines are written in the person's name, filed under the document's department. */
  const change = async (req: Request, res: Response, op: string, args: Record<string, unknown>): Promise<void> => {
    const { user } = callerOf(res);
    const lines: ActivityLine[] = [];
    let answer: EngineAnswer;
    try {
      answer = await engine.change(callerFor(req, res), op, args, (line) => lines.push(line));
    } catch (err) {
      engineFailed(res, err);
      return;
    }
    for (const line of lines) {
      const department = line.documentId ? ((await deps.departmentOf(line.documentId).catch(() => null)) ?? "") : "";
      deps.logActivity(req, user, line.action.slice(0, 80), line.target.slice(0, 240), line.detail.slice(0, 600), department);
    }
    send(req, res, answer);
  };

  const idOf = (req: Request): string => String(req.params.id ?? "").slice(0, 200);

  // ---- READ

  // find_documents: the person's own documents that match, other departments' (kept), and the master list's not in DCRS yet.
  app.get("/api/v1/documents", signedIn, async (req: Request, res: Response): Promise<void> => {
    const q = queryText(req.query.q);
    const limit = limitOf(req.query.limit, 50, 200);
    if (q === null) return fail(res, 400, "bad-request", `q must be text of at most ${MAX_TEXT} characters.`);
    if (limit === null) return fail(res, 400, "bad-request", "limit must be a whole number from 1 to 200.");
    const answer = await read(req, res, "documents", { q: q ?? "", limit });
    if (answer) send(req, res, answer);
  });

  // One document: what it is, who fills it, when, how (its fields), its format.
  app.get("/api/v1/documents/:id", signedIn, async (req: Request, res: Response): Promise<void> => {
    const answer = await read(req, res, "document", { id: idOf(req) });
    if (answer) send(req, res, answer);
  });

  // todays_facts: a working day or not, the next holidays, what is due, overdue and waiting.
  app.get("/api/v1/today", signedIn, async (req: Request, res: Response): Promise<void> => {
    const answer = await read(req, res, "today", {});
    if (!answer) return;
    if (answer.status === 200 && answer.body && typeof answer.body === "object") {
      const hours = await deps.hoursAnswer().catch(() => null);
      send(req, res, { status: 200, body: { ...(answer.body as Record<string, unknown>), ...(hours ? { workingHours: hours } : {}) } });
      return;
    }
    send(req, res, answer);
  });

  // list_records: one document's records (or every document's) between two dates.
  app.get("/api/v1/records", signedIn, async (req: Request, res: Response): Promise<void> => {
    const documentId = queryText(req.query.documentId);
    const from = queryText(req.query.from, 20);
    const to = queryText(req.query.to, 20);
    const status = queryText(req.query.status, 40);
    const limit = limitOf(req.query.limit, 50, 200);
    if (documentId === null || from === null || to === null || status === null) return fail(res, 400, "bad-request", "documentId, from, to and status must be short text.");
    if (limit === null) return fail(res, 400, "bad-request", "limit must be a whole number from 1 to 200.");
    const answer = await read(req, res, "records", { documentId, from, to, status, limit });
    if (answer) send(req, res, answer);
  });

  // search_records: the words written on records, newest first, with a snippet. (Before /records/:id.)
  app.get("/api/v1/records/search", signedIn, async (req: Request, res: Response): Promise<void> => {
    const q = queryText(req.query.q);
    const documentId = queryText(req.query.documentId);
    const from = queryText(req.query.from, 20);
    const to = queryText(req.query.to, 20);
    const limit = limitOf(req.query.limit, 20, 100);
    if (!q) return fail(res, 400, "bad-request", `q is needed: the words to look for, at most ${MAX_TEXT} characters.`);
    if (documentId === null || from === null || to === null) return fail(res, 400, "bad-request", "documentId, from and to must be short text.");
    if (limit === null) return fail(res, 400, "bad-request", "limit must be a whole number from 1 to 100.");
    const answer = await read(req, res, "search", { q, documentId, from, to, limit });
    if (answer) send(req, res, answer);
  });

  // get_record / get_open_record: the record, its layout, its data in words and as stored, its history.
  app.get("/api/v1/records/:id", signedIn, async (req: Request, res: Response): Promise<void> => {
    const answer = await read(req, res, "record", { id: idOf(req) });
    if (answer) send(req, res, answer);
  });

  // Mitra's "print": the record's own page as a PDF, printed by backend/pdfReport.ts
  // as the page's Print button prints it, signed in as the same person, the page
  // allowed to write nothing. Logged as a download, like the page's own.
  app.get("/api/v1/records/:id/pdf", signedIn, async (req: Request, res: Response): Promise<void> => {
    const answer = await read(req, res, "recordBrief", { id: idOf(req) });
    if (!answer) return;
    if (answer.status !== 200) return send(req, res, answer);
    const brief = answer.body as { recordId: string; documentId: string; formatNo: string; name: string; dueDate: string; kind: string };
    if (PRINTED_ELSEWHERE.has(brief.kind)) {
      return fail(res, 409, "pdf-not-offered", `${brief.name} prints from its own page in DCRS (Print there); this route prints the records that open on DCRS's record page.`);
    }
    const pdf = await deps.printer();
    if (!pdf || !pdf.browserPath() || !deps.appBuilt()) {
      return fail(res, 503, "pdf-unavailable", "This DCRS server cannot print a PDF: it needs Google Chrome or Microsoft Edge installed, and the app built (npm run build).");
    }
    const { user, token } = callerOf(res);
    let bytes: Buffer;
    try {
      const port = req.socket.localPort ?? Number(process.env.API_PORT || 4000);
      bytes = await pdf.render({ appUrl: `http://127.0.0.1:${port}`, sessionToken: token, recordId: brief.recordId, timeoutMs: PDF_TIMEOUT_MS });
    } catch (err) {
      const e = err as { code?: unknown; name?: unknown; message?: unknown } | null;
      console.error("[api v1] a record could not be printed:", e?.message ?? err);
      if (e?.code === "pdf-timeout" || e?.name === "TimeoutError") return fail(res, 504, "pdf-timeout", "Printing the record took too long. Try again in a moment.");
      if (e?.code === "pdf-not-your-department") return fail(res, 403, "not-your-department", "The record belongs to a department this account is not kept to.");
      if (e?.code === "pdf-record-not-found") return fail(res, 404, "not-found", "DCRS has no such record for this account.");
      return fail(res, 503, "pdf-unavailable", "The record could not be printed just now. Try again in a moment.");
    }
    const number = brief.formatNo && !brief.formatNo.startsWith("TO BE") ? `${brief.formatNo} ` : "";
    const department = (await deps.departmentOf(brief.documentId).catch(() => null)) ?? "";
    deps.logActivity(req, user, "Document downloaded as PDF", `${number}${brief.name}`.slice(0, 240), `Through ${clientName(req.get("x-client-name"))}: ${brief.dueDate}`, department);
    const file = fileNameOf(`${number.replace(/\//g, "-")}${brief.name} ${brief.dueDate}`);
    res
      .status(200)
      .set({ "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${file}.pdf"`, "Content-Length": String(bytes.length), "Cache-Control": "no-store" })
      .end(bytes);
  });

  // history_figures: the evidence lines for a question about what the records say over time.
  app.get("/api/v1/figures", signedIn, async (req: Request, res: Response): Promise<void> => {
    const question = queryText(req.query.question, 600);
    const documentId = queryText(req.query.documentId);
    const from = queryText(req.query.from, 20);
    const to = queryText(req.query.to, 20);
    if (!question) return fail(res, 400, "bad-request", "question is needed: what is asked about the records' history, at most 600 characters.");
    if (documentId === null || from === null || to === null) return fail(res, 400, "bad-request", "documentId, from and to must be short text.");
    const answer = await read(req, res, "figures", { question, documentId, from, to });
    if (answer) send(req, res, answer);
  });

  // hr_master_lookup: a person on HR Master Data — Human Resources only, as the
  // server hands the sheet to nobody else (backend/index.ts HR_ONLY_KEYS).
  app.get("/api/v1/people", signedIn, async (req: Request, res: Response): Promise<void> => {
    const { user } = callerOf(res);
    const departments = departmentsOf(user);
    if (departments && !departments.includes("HR")) return fail(res, 403, "not-your-department", "HR Master Data is kept by Human Resources, and this account is not kept to it.");
    const q = queryText(req.query.q, 100);
    if (!q || !q.trim()) return fail(res, 400, "bad-request", "q is needed: a name or a GP3 No.");
    const answer = await read(req, res, "people", { q });
    if (answer) send(req, res, answer);
  });

  // ---- CHANGE (the app asks the person to confirm each first)

  // open_document with create: the record of that date, started if there is none.
  app.post("/api/v1/records", signedIn, async (req: Request, res: Response): Promise<void> => {
    const body = (req.body ?? {}) as { documentId?: unknown; date?: unknown };
    if (typeof body.documentId !== "string" || !body.documentId.trim() || body.documentId.length > MAX_TEXT) return fail(res, 400, "bad-request", "documentId is needed: the document's id or its format number.");
    if (body.date !== undefined && body.date !== null && (typeof body.date !== "string" || body.date.length > 20)) return fail(res, 400, "bad-date", "date must be a date written YYYY-MM-DD.");
    await change(req, res, "open", { documentId: body.documentId, date: typeof body.date === "string" ? body.date : undefined });
  });

  // edit_open_record: Mitra's patch, applied by DCRS's own engine exactly as Mitra applies it.
  app.post("/api/v1/records/:id/changes", signedIn, async (req: Request, res: Response): Promise<void> => {
    const body = (req.body ?? {}) as { patch?: unknown; note?: unknown };
    let patch = body.patch;
    if (typeof patch === "string") {
      try {
        patch = JSON.parse(patch);
      } catch {
        patch = null;
      }
    }
    if (!patch || typeof patch !== "object" || Array.isArray(patch) || Object.keys(patch).length === 0) {
      return fail(res, 400, "bad-patch", "patch is needed: an object of the fields to change (GET /api/v1/records/{id} gives the field keys and the patch's shape).");
    }
    if (body.note !== undefined && (typeof body.note !== "string" || body.note.length > MAX_NOTE)) return fail(res, 400, "bad-note", `note must be text of at most ${MAX_NOTE} characters.`);
    await change(req, res, "change", { id: idOf(req), patch, note: typeof body.note === "string" ? body.note : "" });
  });

  // record_action: submit, verify (approve), send_back, resume, reopen, cancel_correction, delete.
  app.post("/api/v1/records/:id/actions", signedIn, async (req: Request, res: Response): Promise<void> => {
    const body = (req.body ?? {}) as { action?: unknown; reason?: unknown };
    if (typeof body.action !== "string" || !body.action.trim() || body.action.length > 40) return fail(res, 400, "bad-action", "action is needed: submit, verify, send_back, resume, reopen, cancel_correction or delete.");
    if (body.reason !== undefined && body.reason !== null && (typeof body.reason !== "string" || body.reason.length > MAX_REASON)) return fail(res, 400, "bad-request", `reason must be text of at most ${MAX_REASON} characters.`);
    await change(req, res, "action", { id: idOf(req), action: body.action, reason: typeof body.reason === "string" ? body.reason : "" });
  });

  // add_photo_to_open_record: a picture onto the record's photo or scan list.
  app.post("/api/v1/records/:id/photos", signedIn, photoBody, async (req: Request, res: Response): Promise<void> => {
    const body = (req.body ?? {}) as { fileName?: unknown; mimeType?: unknown; dataBase64?: unknown; note?: unknown };
    const fileName = typeof body.fileName === "string" ? body.fileName.trim().replace(/[\\/]/g, "-") : "";
    if (!fileName || fileName.length > MAX_FILE_NAME) return fail(res, 400, "bad-request", `fileName is needed, at most ${MAX_FILE_NAME} characters.`);
    const said = typeof body.mimeType === "string" ? body.mimeType.trim().toLowerCase() : "";
    if (!["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(said)) return fail(res, 415, "bad-picture", "mimeType must be image/jpeg, image/png or image/webp.");
    const raw = typeof body.dataBase64 === "string" ? body.dataBase64.replace(/^data:[^;,]*;base64,/, "").replace(/\s+/g, "") : "";
    if (!raw || !/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) return fail(res, 400, "bad-picture", "dataBase64 is needed: the picture's bytes in base64.");
    const bytes = Buffer.from(raw, "base64");
    if (bytes.length > MAX_PHOTO_BYTES) {
      return fail(res, 413, "too-large", PHOTO_TOO_LARGE);
    }
    const kind = pictureKind(bytes);
    if (!kind || kind !== (said === "image/jpg" ? "image/jpeg" : said)) return fail(res, 415, "bad-picture", "The bytes are not the picture mimeType says they are.");
    if (body.note !== undefined && (typeof body.note !== "string" || body.note.length > MAX_NOTE)) return fail(res, 400, "bad-note", `note must be text of at most ${MAX_NOTE} characters.`);
    await change(req, res, "photo", {
      id: idOf(req),
      fileName,
      dataUrl: `data:${kind};base64,${bytes.toString("base64")}`,
      size: bytes.length,
      note: typeof body.note === "string" ? body.note : "",
    });
  });

  // fill_open_record_with_sample_data: realistic sample values, marked as made up, never submitted.
  app.post("/api/v1/records/:id/sample-fill", signedIn, async (req: Request, res: Response): Promise<void> => {
    await change(req, res, "sampleFill", { id: idOf(req) });
  });
}
