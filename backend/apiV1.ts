import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { Express, NextFunction, Request, RequestHandler, Response } from "express";
import { COOKIE_NAME, verifySessionToken, type PublicUser } from "./auth.ts";
import { database, getUserById, plantTimeZone, readItem, writeItem, type StoredItem, type UserRow, type WriteResult } from "./db.ts";
import { distDir, repoRoot } from "./paths.ts";
import { createWorkingHoursGate } from "./workingHours.ts";
import { departmentOfDocument, PLANT_DEPARTMENTS } from "../frontend/src/data/seed/documentDepartments.ts";
import {
  activityDetail,
  CAPA_DOCUMENT_ID,
  clientName,
  closeFindingChange,
  closeRefusal,
  findFinding,
  findingStatus,
  identifyFindings,
  isLiveRecord,
  isOpenStatus,
  recordLabel,
  throughNote,
  type FindingStatus,
  type IdentifiedFinding,
  type StoredRecord,
} from "./findingsCore.ts";

// THE DCRS API FOR ANOTHER SERVER ACTING AS A SIGNED-IN PERSON (REQUIREMENTS §83).
//
// The Audit Assistant is a separate chat and voice app. A person signs in to it
// with their DCRS email and password; its server then calls these routes AS
// THAT PERSON, with the session DCRS gave them. So DCRS's own rules apply to
// everything it does: the person's departments decide what it may see, DCRS's
// own change rules decide what may be changed, and every change is written the
// way DCRS's own pages write it — through writeItem with the version it was
// made from, with a line in the record's history and a line in the activity
// log that names the person AND the server it came through ("Through Audit
// Assistant: ..."). The assistant never reads or writes DCRS's tables itself.
//
// Everything here is new: no existing route or table changes. The routes are
// documented for the assistant's developer in docs/chatbot-integration.md and
// described in docs/api/dcrs-api.openapi.json (served at /api/v1/openapi.json).
//
// SIGNING IN. With the existing POST /api/auth/login: its session token is the
// value of the dcrs_session cookie it sets, good until the close of the day it
// was started (6:20 pm by default for staff, midnight for the super admin —
// REQUIREMENTS §84; the answer's `session.endsAt` says when). Every
// route below but openapi.json takes that token as the cookie OR as
// "Authorization: Bearer <token>" (a server has no cookie jar), and reads the
// account again on every request, so an account switched off stops at once.

type LogActivity = (req: Request, who: PublicUser | null, action: string, target?: string, detail?: string, department?: string) => void;

/** Where the routes read and write DCRS's data. The server's own database by default; a unit test hands in its own. */
export interface ApiV1Store {
  userById(id: string): Promise<UserRow | undefined>;
  /** The stored item's seq (it changes on every write), or null when there is none — so an unchanged item is not read again. */
  itemSeq(scope: string, key: string): Promise<number | null>;
  readItem(scope: string, key: string): Promise<StoredItem | null>;
  writeItem(scope: string, key: string, value: string, baseVersion: number, by: string): Promise<WriteResult>;
}

/** Prints a record's page to PDF (backend/pdfReport.ts). */
export interface PdfPrinter {
  browserPath(): string | null;
  render(opts: { appUrl: string; sessionToken: string; recordId: string; timeoutMs?: number }): Promise<Buffer>;
}

export interface ApiV1Deps {
  requireAuth: RequestHandler;
  logActivity: LogActivity;
  store?: ApiV1Store;
  /** The time now; a test may fix it. */
  clock?: () => Date;
  pdf?: PdfPrinter;
  /** Whether the built app is there to print from; a test may say. */
  appBuilt?: () => boolean;
}

const databaseStore: ApiV1Store = {
  userById: getUserById,
  async itemSeq(scope, key) {
    const { rows } = await database().query<{ seq: string }>("SELECT seq::text AS seq FROM app_storage WHERE scope = $1 AND key = $2", [scope, key]);
    return rows[0] ? Number(rows[0].seq) : null;
  },
  readItem,
  writeItem: (scope, key, value, baseVersion, by) => writeItem(scope, key, value, baseVersion, by),
};

// The PDF printer is C's module (backend/pdfReport.ts), loaded when first asked
// for, so this API still starts — and answers "the report cannot be printed
// here" — where it is missing.
interface PdfModule {
  renderRecordPdf(opts: { appUrl: string; sessionToken: string; recordId: string; timeoutMs?: number }): Promise<Buffer>;
  pdfBrowserPath(): string | null;
}
const PDF_MODULE = "./pdfReport.ts";
let pdfModule: Promise<PdfModule | null> | null = null;
function loadPdfModule(): Promise<PdfModule | null> {
  pdfModule ??= (import(PDF_MODULE) as Promise<PdfModule>).catch((err: unknown) => {
    console.error("[api v1] the PDF printer could not be loaded:", err instanceof Error ? err.message : err);
    pdfModule = null;
    return null;
  });
  return pdfModule;
}

// ---------------------------------------------------------------------------
// small helpers

const CAPA_ROUTE_DOCUMENT = CAPA_DOCUMENT_ID;
const COMPLAINT_DOCUMENT_ID = "capa-customer-complaint";
const PEST_DAILY_DOCUMENT_ID = "daily-pest-monitoring";
/** What a document is called when the stored definitions do not say (frontend/src/data/seed/documentDefinitions.ts). */
const KNOWN_DOCUMENTS: Record<string, { name: string; formatNo: string }> = {
  [CAPA_DOCUMENT_ID]: { name: "CAPA — Internal: Pest Control Inspection Findings Report", formatNo: "TO BE CONFIRMED" },
  [COMPLAINT_DOCUMENT_ID]: { name: "CAPA — External: Customer Complaint Handling Checklist", formatNo: "F/MKT/05" },
  [PEST_DAILY_DOCUMENT_ID]: { name: "Daily Pest Control Monitoring Record", formatNo: "F/HR/17" },
};
const MAX_NOTE = 1000;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const MAX_SEARCH = 200;
const PDF_TIMEOUT_MS = 60_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const text = (value: unknown): string => (typeof value === "string" ? value : "");
const orNull = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);

function fail(res: Response, status: number, code: string, error: string): void {
  res.status(status).json({ error, code });
}

/** A real calendar date written YYYY-MM-DD, or null. */
export function calendarDate(value: unknown): string | null {
  if (typeof value !== "string" || !DATE_RE.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d ? value : null;
}

/** The factory's today, YYYY-MM-DD, in its own time zone (PLANT_TIMEZONE, Asia/Kolkata by default — db.ts). */
export function factoryToday(now: Date): string {
  let zone = plantTimeZone();
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: zone });
  } catch {
    zone = "Asia/Kolkata";
  }
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** The account as the rest of the server sees it (backend/index.ts toPublicUser). */
function publicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    departments: String(row.departments ?? "")
      .split(",")
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean),
  };
}

/** The session token a request carries: "Authorization: Bearer <token>" first, else the dcrs_session cookie. */
export function sessionTokenOf(req: Request): string | null {
  const header = req.get("authorization");
  if (header) {
    const m = /^Bearer\s+(\S+)\s*$/i.exec(header);
    return m ? m[1] : null;
  }
  const cookie = (req.cookies as Record<string, unknown> | undefined)?.[COOKIE_NAME];
  return typeof cookie === "string" && cookie ? cookie : null;
}

interface Caller {
  user: PublicUser;
  token: string;
}
const callerOf = (res: Response): Caller => res.locals.apiV1Caller as Caller;

/** The departments an account is kept to, or null for every department (backend/index.ts accountDepartments). */
function accountDepartments(user: PublicUser): string[] | null {
  return user.role !== "admin" && user.departments.length > 0 ? user.departments : null;
}

function departmentName(code: string | null): string | null {
  if (!code) return null;
  return PLANT_DEPARTMENTS.find((d) => d.code === code)?.name ?? code;
}

/** The address of the app as the caller reaches it: DCRS_APP_URL, else the request's own origin. */
function appAddress(req: Request): string {
  const set = process.env.DCRS_APP_URL?.trim().replace(/\/+$/, "");
  return set || `${req.protocol}://${req.get("host") ?? "localhost"}`;
}

// ---------------------------------------------------------------------------
// reading the stored items, once per change

interface DocumentInfo {
  name: string;
  formatNo: string;
}

interface RecordsView {
  findings: IdentifiedFinding<StoredRecord>[];
  complaints: StoredRecord[];
  pestByDate: Map<string, StoredRecord>;
}

interface Cached<T> {
  seq: number;
  value: T;
}

/**
 * Reads a company item and works out what the routes need from it — only when
 * it has changed since the last reading (its seq moves on every write). The
 * whole records list is several megabytes; what is kept is only the few
 * records these routes answer about.
 */
function cachedItem<T>(key: string, build: (parsed: unknown) => T, empty: T): (store: ApiV1Store) => Promise<T> {
  // One reading per store: the server has one database; a test may have several.
  const caches = new WeakMap<ApiV1Store, Cached<T>>();
  return async (store) => {
    const seq = await store.itemSeq("company", key);
    if (seq === null) return empty;
    const cache = caches.get(store);
    if (cache && cache.seq === seq) return cache.value;
    const item = await store.readItem("company", key);
    if (!item) return empty;
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(item.value);
    } catch {
      parsed = null;
    }
    const value = build(parsed);
    caches.set(store, { seq: item.seq, value });
    return value;
  };
}

const asRecords = (parsed: unknown): StoredRecord[] =>
  Array.isArray(parsed) ? (parsed.filter((r) => r && typeof r === "object" && typeof r.id === "string" && typeof r.documentId === "string") as StoredRecord[]) : [];

/** Which of two records of one day is the day's report: the one changed last (then the higher id). */
function laterRecord(a: StoredRecord, b: StoredRecord): StoredRecord {
  const ua = text(a.updatedAt);
  const ub = text(b.updatedAt);
  if (ua !== ub) return ua > ub ? a : b;
  return a.id > b.id ? a : b;
}

export function buildRecordsView(parsed: unknown): RecordsView {
  const records = asRecords(parsed);
  const complaints: StoredRecord[] = [];
  const pestByDate = new Map<string, StoredRecord>();
  for (const r of records) {
    if (!isLiveRecord(r)) continue;
    if (r.documentId === COMPLAINT_DOCUMENT_ID) complaints.push(r);
    else if (r.documentId === PEST_DAILY_DOCUMENT_ID) {
      const date = text(r.dueDate);
      const other = pestByDate.get(date);
      pestByDate.set(date, other ? laterRecord(other, r) : r);
    }
  }
  return { findings: identifyFindings(records), complaints, pestByDate };
}

const recordsView = cachedItem<RecordsView>("records", buildRecordsView, { findings: [], complaints: [], pestByDate: new Map() });

const documentsView = cachedItem<Map<string, DocumentInfo>>(
  "documents",
  (parsed) => {
    const byId = new Map<string, DocumentInfo>();
    if (Array.isArray(parsed)) {
      for (const d of parsed as { id?: unknown; name?: unknown; formatNo?: unknown }[]) {
        if (d && typeof d.id === "string") byId.set(d.id, { name: text(d.name) || d.id, formatNo: text(d.formatNo) });
      }
    }
    return byId;
  },
  new Map()
);

const checkpointsView = cachedItem<Map<number, string>>(
  "master",
  (parsed) => {
    const byNumber = new Map<number, string>();
    const list = (parsed as { checkpoints?: unknown } | null)?.checkpoints;
    if (Array.isArray(list)) {
      for (const c of list as { no?: unknown; text?: unknown }[]) {
        if (c && typeof c.no === "number" && typeof c.text === "string") byNumber.set(c.no, c.text);
      }
    }
    return byNumber;
  },
  new Map()
);

async function documentInfo(store: ApiV1Store, documentId: string): Promise<DocumentInfo> {
  const stored = (await documentsView(store)).get(documentId);
  return stored ?? KNOWN_DOCUMENTS[documentId] ?? { name: documentId, formatNo: "" };
}

/** The department code of a document, by DCRS's own rule (frontend/src/data/seed/documentDepartments.ts). */
async function departmentOf(store: ApiV1Store, documentId: string): Promise<string | null> {
  return departmentOfDocument(documentId, (await documentInfo(store, documentId)).formatNo);
}

/** Whether the person may see this document's records: the same rule the server applies to what it hands a browser. */
async function maySee(store: ApiV1Store, user: PublicUser, documentId: string): Promise<boolean> {
  const departments = accountDepartments(user);
  if (!departments) return true;
  const code = await departmentOf(store, documentId);
  return code === null || departments.includes(code);
}

async function refuseOtherDepartment(store: ApiV1Store, res: Response, documentId: string, what: string): Promise<boolean> {
  if (await maySee(store, callerOf(res).user, documentId)) return false;
  const name = departmentName(await departmentOf(store, documentId));
  fail(res, 403, "not-your-department", `${what} belong to ${name ?? "another department"}, and this account is not kept to it.`);
  return true;
}

// ---------------------------------------------------------------------------
// what the routes answer with

export interface FindingJson {
  id: string;
  ref: string | null;
  recordId: string;
  number: number;
  reportDate: string | null;
  inspectionDate: string | null;
  finding: string;
  comments: string;
  correctiveActionByContractor: string;
  correctiveActionByPlant: string;
  targetDate: string | null;
  actionDate: string | null;
  verifiedByServiceProvider: string;
  status: FindingStatus;
  source: string | null;
  reportStatus: string;
  department: string | null;
  link: string;
}

export function findingJson(f: IdentifiedFinding<StoredRecord>, today: string, app: string, department: string | null): FindingJson {
  const x = f.finding;
  const data = (f.record.data ?? {}) as { inspectionDate?: unknown };
  return {
    id: f.id,
    ref: f.ref,
    recordId: f.record.id,
    number: f.number,
    reportDate: orNull(f.record.dueDate),
    inspectionDate: orNull(data.inspectionDate),
    finding: text(x.findingOfInspection),
    comments: text(x.commentsOnFindings),
    correctiveActionByContractor: text(x.correctiveActionContractor),
    correctiveActionByPlant: text(x.correctiveActionClient),
    targetDate: orNull(x.targetDate),
    actionDate: orNull(x.actualDateOfAction),
    verifiedByServiceProvider: text(x.verifiedByServiceProvider),
    status: findingStatus(x, today),
    source: orNull(x.source),
    reportStatus: text(f.record.status),
    department,
    link: `${app}/index.html#/gap/${encodeURIComponent(f.record.id)}`,
  };
}

interface ChecklistItemLike {
  done?: unknown;
  notRequired?: unknown;
  comment?: unknown;
}
interface ComplaintDataLike {
  customerName?: unknown;
  complaintNo?: unknown;
  jobName?: unknown;
  jobCode?: unknown;
  complaintReceivedDate?: unknown;
  sections?: unknown;
  approvedBy?: { name?: unknown; date?: unknown } | null;
}

/** A complaint's status as people see it: approved (verified) is Closed; handed in and waiting is Awaiting approval; anything else is Open. */
export function complaintStatus(recordStatus: string): "Open" | "Awaiting approval" | "Closed" {
  if (recordStatus === "Verified") return "Closed";
  if (recordStatus === "Submitted" || recordStatus === "Pending Verification") return "Awaiting approval";
  return "Open";
}

export function complaintJson(r: StoredRecord, app: string) {
  const data = (r.data ?? {}) as ComplaintDataLike;
  const items: ChecklistItemLike[] = [];
  if (Array.isArray(data.sections)) {
    for (const s of data.sections as { items?: unknown }[]) if (s && Array.isArray(s.items)) items.push(...(s.items as ChecklistItemLike[]));
  }
  // Answered as DCRS counts it (engine/guidedChecklist.ts isItemAnswered): done, not required, or a comment written.
  const answered = items.filter((i) => i && (i.done === true || i.notRequired === true || text(i.comment).trim() !== "")).length;
  const recordStatus = text(r.status);
  return {
    recordId: r.id,
    complaintNumber: text(data.complaintNo),
    customerName: text(data.customerName),
    jobName: text(data.jobName),
    jobCode: text(data.jobCode),
    receivedDate: orNull(data.complaintReceivedDate),
    activitiesAnswered: answered,
    activitiesTotal: items.length,
    status: complaintStatus(recordStatus),
    recordStatus,
    approvedBy: orNull(data.approvedBy?.name),
    approvedDate: orNull(data.approvedBy?.date),
    // The complaint checklist opens on its own page, not the general record page.
    link: `${app}/index.html#/gap/complaint/${encodeURIComponent(r.id)}`,
  };
}

interface PestDataLike {
  isHoliday?: unknown;
  checkpoints?: Record<string, { value?: unknown; note?: unknown } | null> | null;
  timeOfChecking?: unknown;
  checker?: unknown;
  summaryActions?: unknown;
  rodentCatches?: unknown;
}

export function pestSummaryJson(date: string, r: StoredRecord & { submittedBy?: unknown; verifiedBy?: unknown }, questions: Map<number, string>, app: string) {
  const data = (r.data ?? {}) as PestDataLike;
  const answers = data.checkpoints && typeof data.checkpoints === "object" ? data.checkpoints : {};
  const numbers = new Set<number>(questions.size ? [...questions.keys()] : Array.from({ length: 10 }, (_, i) => i + 1));
  for (const k of Object.keys(answers)) if (/^\d+$/.test(k)) numbers.add(Number(k));
  const checkpoints = [...numbers]
    .sort((a, b) => a - b)
    .map((n) => {
      const a = answers[String(n)];
      const value = a && typeof a === "object" ? a.value : null;
      return {
        number: n,
        question: questions.get(n) ?? `Check point ${n}`,
        answer: typeof value === "string" || typeof value === "number" ? value : null,
        note: a && typeof a === "object" ? orNull(a.note) : null,
      };
    });
  const catches = Array.isArray(data.rodentCatches) ? (data.rodentCatches as { count?: unknown }[]) : [];
  const actions = Array.isArray(data.summaryActions)
    ? (data.summaryActions as { dateOfObservation?: unknown; descriptionOfObservation?: unknown; actionTaken?: unknown; remarks?: unknown }[])
    : [];
  return {
    date,
    recordId: r.id,
    status: text(r.status),
    holiday: data.isHoliday === true,
    checkedBy: orNull(data.checker),
    timeOfChecking: orNull(data.timeOfChecking),
    checkpoints,
    rodentsCaught: catches.reduce((sum, c) => sum + (c && typeof c.count === "number" && Number.isFinite(c.count) ? c.count : 0), 0),
    observations: actions
      .filter((a) => a && typeof a === "object")
      .map((a) => ({
        date: orNull(a.dateOfObservation),
        description: text(a.descriptionOfObservation),
        actionTaken: text(a.actionTaken),
        remarks: text(a.remarks),
      })),
    submittedBy: orNull(r.submittedBy),
    verifiedBy: orNull(r.verifiedBy),
    link: `${app}/index.html#/record/${encodeURIComponent(r.id)}`,
  };
}

// ---------------------------------------------------------------------------
// the routes

function newHistoryId(now: Date): string {
  // The same shape as DCRS's own ids (frontend/src/utils/id.ts generateId("hist")).
  return `hist-${now.getTime().toString(36)}-api-${Math.random().toString(36).slice(2, 8)}`;
}

const isTimeout = (err: unknown): boolean => {
  const e = err as { name?: unknown; code?: unknown; message?: unknown } | null;
  return !!e && (e.code === "pdf-timeout" || e.code === "ETIMEDOUT" || e.name === "TimeoutError" || /time(d)?[ -]?out/i.test(String(e.message ?? "")));
};

let openApiCache: { mtimeMs: number; text: string } | null = null;
const OPENAPI_FILE = path.join(repoRoot, "docs", "api", "dcrs-api.openapi.json");

export function registerApiV1(app: Express, deps: ApiV1Deps): void {
  const store = deps.store ?? databaseStore;
  const clock = deps.clock ?? (() => new Date());
  const appBuilt = deps.appBuilt ?? (() => existsSync(path.join(distDir, "index.html")));
  const logActivity = deps.logActivity;
  const printer = async (): Promise<PdfPrinter | null> => {
    if (deps.pdf) return deps.pdf;
    const m = await loadPdfModule();
    return m ? { browserPath: () => m.pdfBrowserPath(), render: (o) => m.renderRecordPdf(o) } : null;
  };

  // THE DESCRIPTION OF THIS API, for the assistant's developer and any tool: no sign-in.
  app.get("/api/v1/openapi.json", (_req: Request, res: Response): void => {
    try {
      const mtimeMs = statSync(OPENAPI_FILE).mtimeMs;
      if (!openApiCache || openApiCache.mtimeMs !== mtimeMs) openApiCache = { mtimeMs, text: readFileSync(OPENAPI_FILE, "utf-8") };
      res.type("application/json").send(openApiCache.text);
    } catch {
      fail(res, 404, "not-found", "The API description is not on this server.");
    }
  });

  // THE PLANT'S WORKING HOURS (REQUIREMENTS §84): the same gate as DCRS's own
  // routes (backend/workingHours.ts), on the master data this API reads and on
  // its clock — so a person the plant's hours shut out of DCRS is shut out of it
  // through the assistant too. The super admin is never refused.
  const hours = createWorkingHoursGate({
    source: { seq: () => store.itemSeq("company", "master"), read: async () => (await store.readItem("company", "master"))?.value ?? null },
    clock,
  });

  // WHO IS CALLING: the person the session belongs to, read from the database
  // on every request (switched off: refused at once), and not while they are
  // still on the password the administrator gave them (REQUIREMENTS §66). A
  // session ends at the close of the day it was started (§84) — its token's own
  // end — and outside the plant's hours a person held to them is refused with
  // 403 outside-working-hours, the next opening and the reason in words.
  const signedIn = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    res.set("Cache-Control", "no-store");
    const token = sessionTokenOf(req);
    const payload = token ? verifySessionToken(token) : null;
    const row = payload ? await store.userById(payload.sub) : undefined;
    if (!token || !row || !row.active) {
      fail(res, 401, "not-signed-in", "Not signed in, or the session has ended. Sign in again with POST /api/auth/login.");
      return;
    }
    const refused = await hours.refusal(row);
    if (refused) {
      res.status(403).json(refused);
      return;
    }
    if (row.must_change_password) {
      fail(res, 403, "password-change-required", "This account is still on the password the administrator gave it. Sign in to DCRS in a browser and choose your own first.");
      return;
    }
    res.locals.apiV1Caller = { user: publicUser(row), token } satisfies Caller;
    next();
  };

  app.get("/api/v1/me", signedIn, (_req: Request, res: Response): void => {
    const { user } = callerOf(res);
    res.json({ id: user.id, name: user.name, email: user.email, role: user.role, departments: user.departments });
  });

  // ---- the internal CAPA findings (Quality Assurance's)

  app.get("/api/v1/findings", signedIn, async (req: Request, res: Response): Promise<void> => {
    const status = req.query.status === undefined ? "open" : req.query.status;
    if (status !== "open" && status !== "closed" && status !== "all") return fail(res, 400, "bad-request", 'status must be "open", "closed" or "all".');
    const q = req.query.q === undefined ? "" : req.query.q;
    if (typeof q !== "string" || q.length > MAX_SEARCH) return fail(res, 400, "bad-request", `q must be text of at most ${MAX_SEARCH} characters.`);
    const from = req.query.from === undefined ? null : calendarDate(req.query.from);
    const to = req.query.to === undefined ? null : calendarDate(req.query.to);
    if ((req.query.from !== undefined && !from) || (req.query.to !== undefined && !to)) return fail(res, 400, "bad-request", "from and to must be dates written YYYY-MM-DD.");
    const limitRaw = req.query.limit === undefined ? String(DEFAULT_LIMIT) : req.query.limit;
    const offsetRaw = req.query.offset === undefined ? "0" : req.query.offset;
    if (typeof limitRaw !== "string" || !/^\d{1,6}$/.test(limitRaw) || Number(limitRaw) < 1) return fail(res, 400, "bad-request", `limit must be a whole number from 1 to ${MAX_LIMIT}.`);
    if (typeof offsetRaw !== "string" || !/^\d{1,9}$/.test(offsetRaw)) return fail(res, 400, "bad-request", "offset must be a whole number, 0 or more.");
    const limit = Math.min(Number(limitRaw), MAX_LIMIT);
    const offset = Number(offsetRaw);

    if (await refuseOtherDepartment(store, res, CAPA_ROUTE_DOCUMENT, "The CAPA findings")) return;
    const today = factoryToday(clock());
    const app = appAddress(req);
    const department = departmentName(await departmentOf(store, CAPA_ROUTE_DOCUMENT));
    const needle = q.trim().toLowerCase();
    const matching = (await recordsView(store)).findings
      .map((f) => findingJson(f, today, app, department))
      .filter((f) => {
        const open = isOpenStatus(f.status);
        if (status === "open" && !open) return false;
        if (status === "closed" && open) return false;
        if (from && (f.reportDate ?? "") < from) return false;
        if (to && (f.reportDate ?? "") > to) return false;
        if (!needle) return true;
        return [f.id, f.ref ?? "", f.finding, f.comments, f.correctiveActionByContractor, f.correctiveActionByPlant, f.verifiedByServiceProvider, f.status, f.source ?? "", f.reportDate ?? ""]
          .join("\n")
          .toLowerCase()
          .includes(needle);
      })
      // The newest reports first; within a report, in its own order.
      .sort((a, b) => ((b.reportDate ?? "") < (a.reportDate ?? "") ? -1 : (b.reportDate ?? "") > (a.reportDate ?? "") ? 1 : 0));
    res.json({ findings: matching.slice(offset, offset + limit), total: matching.length });
  });

  app.get("/api/v1/findings/:id", signedIn, async (req: Request, res: Response): Promise<void> => {
    if (await refuseOtherDepartment(store, res, CAPA_ROUTE_DOCUMENT, "The CAPA findings")) return;
    const found = findFinding((await recordsView(store)).findings, String(req.params.id ?? ""));
    if (!found) return fail(res, 404, "not-found", `There is no CAPA finding "${String(req.params.id ?? "").slice(0, 80)}".`);
    res.json(findingJson(found, factoryToday(clock()), appAddress(req), departmentName(await departmentOf(store, CAPA_ROUTE_DOCUMENT))));
  });

  // CLOSE A FINDING — exactly what DCRS's own Close button does (pages/GapPage.tsx):
  // the finding becomes Closed with today's date of action, the report is saved
  // the way the page saves it (engine/recordLifecycle.ts saveDraft), with a
  // history entry in the person's name whose note says which server it came
  // through, and the activity log says the same. Written with the version it
  // was read at, and read again and retried when somebody else wrote in between.
  app.post("/api/v1/findings/:id/close", signedIn, async (req: Request, res: Response): Promise<void> => {
    const noteRaw = (req.body as { note?: unknown } | undefined)?.note;
    const note = typeof noteRaw === "string" ? noteRaw.trim() : "";
    if (!note || note.length > MAX_NOTE) return fail(res, 400, "bad-note", `A note of 1 to ${MAX_NOTE} characters is required: say how the finding was resolved.`);
    if (await refuseOtherDepartment(store, res, CAPA_ROUTE_DOCUMENT, "The CAPA findings")) return;
    const { user } = callerOf(res);
    const client = clientName(req.get("x-client-name"));
    let wanted = String(req.params.id ?? "");

    for (let attempt = 1; attempt <= 3; attempt++) {
      const item = await store.readItem("company", "records");
      let records: unknown = null;
      try {
        records = item ? JSON.parse(item.value) : null;
      } catch {
        records = null;
      }
      const all: unknown[] = Array.isArray(records) ? records : [];
      const found = findFinding(identifyFindings(asRecords(all)), wanted);
      if (!found || !item) return fail(res, 404, "not-found", `There is no CAPA finding "${wanted.slice(0, 80)}".`);
      // Held to this very finding from here on, even if a report added meanwhile renumbers the readable ids.
      if (found.ref) wanted = found.ref;

      const refusal = closeRefusal(found.record, found.finding);
      if (refusal === "already-closed") return fail(res, 409, refusal, `Finding ${found.id} is already ${text(found.finding.status).toLowerCase() || "closed"}.`);
      if (refusal === "report-verified")
        return fail(res, 409, refusal, `The report of finding ${found.id} is verified. In DCRS, open it and use "Edit" to reopen it for correction first.`);
      if (refusal === "report-sent-back") return fail(res, 409, refusal, `The report of finding ${found.id} was sent back. In DCRS, open it and use "Resume" first.`);
      if (refusal) return fail(res, 409, refusal, `The report of finding ${found.id} cannot be changed as it stands ("${text(found.record.status)}").`);

      const now = clock();
      const today = factoryToday(now);
      const at = now.toISOString();
      const { record: changed, entry } = closeFindingChange(found.record, found.position, {
        today,
        at,
        by: user.name,
        note: throughNote(client, note),
        historyId: newHistoryId(now),
      });
      const next = all.map((r) => (r === found.record ? changed : r));
      const written = await store.writeItem("company", "records", JSON.stringify(next), item.version, user.email);
      if (!written.ok) continue;

      const documentInfoNow = await documentInfo(store, CAPA_ROUTE_DOCUMENT);
      const code = departmentOfDocument(CAPA_ROUTE_DOCUMENT, documentInfoNow.formatNo);
      logActivity(req, user, "Record edited", recordLabel(documentInfoNow, CAPA_ROUTE_DOCUMENT, text(changed.dueDate)), activityDetail(entry).slice(0, 600), code ?? "");
      const closed = identifyFindings([changed]).find((f) => f.position === found.position);
      const finding = findingJson(
        { ...found, record: changed, finding: closed?.finding ?? found.finding },
        today,
        appAddress(req),
        departmentName(code)
      );
      res.json({ finding, record: { id: changed.id, status: text(changed.status) }, history: { at: entry.at, by: entry.by, note: entry.note } });
      return;
    }
    fail(res, 409, "busy", "The records kept changing while this was being saved. Try again in a moment.");
  });

  // ---- the customer complaints (CAPA — External, F/MKT/05; Marketing's)

  app.get("/api/v1/complaints", signedIn, async (req: Request, res: Response): Promise<void> => {
    const status = req.query.status === undefined ? "open" : req.query.status;
    if (status !== "open" && status !== "closed" && status !== "all") return fail(res, 400, "bad-request", 'status must be "open", "closed" or "all".');
    const q = req.query.q === undefined ? "" : req.query.q;
    if (typeof q !== "string" || q.length > MAX_SEARCH) return fail(res, 400, "bad-request", `q must be text of at most ${MAX_SEARCH} characters.`);
    if (await refuseOtherDepartment(store, res, COMPLAINT_DOCUMENT_ID, "The customer complaints")) return;
    const app = appAddress(req);
    const needle = q.trim().toLowerCase();
    const complaints = (await recordsView(store)).complaints
      .map((r) => ({ json: complaintJson(r, app), due: text(r.dueDate) }))
      .filter(({ json }) => {
        if (status === "open" && json.status === "Closed") return false;
        if (status === "closed" && json.status !== "Closed") return false;
        if (!needle) return true;
        return [json.complaintNumber, json.customerName, json.jobName, json.jobCode, json.status].join("\n").toLowerCase().includes(needle);
      })
      .sort((a, b) => {
        const da = a.json.receivedDate ?? a.due;
        const db = b.json.receivedDate ?? b.due;
        return db < da ? -1 : db > da ? 1 : 0;
      })
      .map(({ json }) => json);
    res.json({ complaints });
  });

  // ---- the daily pest control report (F/HR/17; Human Resources')

  /** The day's live F/HR/17 record, or a refusal already sent. */
  const pestRecordFor = async (req: Request, res: Response): Promise<{ date: string; record: StoredRecord } | null> => {
    const date = calendarDate(req.query.date);
    if (!date) {
      fail(res, 400, "bad-date", "date must be a date written YYYY-MM-DD.");
      return null;
    }
    if (await refuseOtherDepartment(store, res, PEST_DAILY_DOCUMENT_ID, "The daily pest control reports")) return null;
    const record = (await recordsView(store)).pestByDate.get(date);
    if (!record) {
      fail(res, 404, "no-report", `There is no daily pest control report (F/HR/17) in DCRS for ${date}.`);
      return null;
    }
    return { date, record };
  };

  app.get("/api/v1/pest-control/daily-report/summary", signedIn, async (req: Request, res: Response): Promise<void> => {
    const found = await pestRecordFor(req, res);
    if (!found) return;
    res.json(pestSummaryJson(found.date, found.record, await checkpointsView(store), appAddress(req)));
  });

  // THE REPORT AS A PDF: DCRS's own F/HR/17 page for that date, printed by a
  // headless Chrome or Edge exactly as the page's Print button prints it,
  // signed in as the same person (backend/pdfReport.ts, which lets the page
  // write nothing). Logged as a download, like the page's own downloads.
  app.get("/api/v1/pest-control/daily-report", signedIn, async (req: Request, res: Response): Promise<void> => {
    const found = await pestRecordFor(req, res);
    if (!found) return;
    const pdf = await printer();
    if (!pdf || !pdf.browserPath() || !appBuilt()) {
      return fail(res, 503, "pdf-unavailable", "This DCRS server cannot print a PDF: it needs Google Chrome or Microsoft Edge installed, and the app built (npm run build).");
    }
    const { user, token } = callerOf(res);
    let bytes: Buffer;
    try {
      // The headless browser reaches this very server on this machine, whatever address the caller used.
      const port = req.socket.localPort ?? Number(process.env.API_PORT || 4000);
      bytes = await pdf.render({ appUrl: `http://127.0.0.1:${port}`, sessionToken: token, recordId: found.record.id, timeoutMs: PDF_TIMEOUT_MS });
    } catch (err) {
      console.error("[api v1] the pest control report could not be printed:", err instanceof Error ? err.message : err);
      if (isTimeout(err)) return fail(res, 504, "pdf-timeout", "Printing the report took too long. Try again in a moment.");
      // Loading the person's records into the printing browser failed (backend/pdfReport.ts): trying again will not help.
      if ((err as { code?: unknown } | null)?.code === "pdf-database-unavailable") {
        return fail(res, 503, "pdf-unavailable", "DCRS could not load this person's records in a browser to print the report. Open DCRS in a browser to see why.");
      }
      return fail(res, 503, "pdf-unavailable", "The report could not be printed just now. Try again in a moment.");
    }
    const info = await documentInfo(store, PEST_DAILY_DOCUMENT_ID);
    const client = clientName(req.get("x-client-name"));
    const code = departmentOfDocument(PEST_DAILY_DOCUMENT_ID, info.formatNo);
    const number = info.formatNo && !info.formatNo.startsWith("TO BE") ? `${info.formatNo} ` : "";
    logActivity(req, user, "Document downloaded as PDF", `${number}${info.name}`, `Through ${client}: ${found.date}`, code ?? "");
    res
      .status(200)
      .set({
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="F-HR-17 Daily Pest Control Monitoring Record ${found.date}.pdf"`,
        "Content-Length": String(bytes.length),
      })
      .end(bytes);
  });

  // Anything else under /api/v1: said as JSON, never the app's page.
  app.use("/api/v1", (_req: Request, res: Response): void => {
    fail(res, 404, "no-such-route", "There is no such route in the DCRS API. See /api/v1/openapi.json.");
  });
}
