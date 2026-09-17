// API server. Owns the user accounts (hashed passwords, signed session
// cookies) and ALL of the app's data, kept in PostgreSQL (db.ts, REQUIREMENTS
// §55): the records, documents, master data, HR Master Data and the rest are
// loaded from here when a person signs in and written back as they work, over
// /api/storage below. See DEPLOYMENT.md.
import "./env.ts";
import express, { type CookieOptions, type NextFunction, type Request, type Response } from "express";
import cookieParser from "cookie-parser";
import crypto from "node:crypto";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import {
  database,
  deleteItem,
  getUserByEmail,
  getUserById,
  insertUser,
  isDatabaseUnavailable,
  listUsers,
  openDatabase,
  readItem,
  setUserDepartments,
  storedItems,
  writeItem,
  type UserRow,
} from "./db.ts";
import { departmentOfDocument } from "../frontend/src/data/seed/documentDepartments.ts";
import { hashPassword, verifyPassword, signSessionToken, verifySessionToken, COOKIE_NAME, SESSION_TTL_MS, type PublicUser } from "./auth.ts";
import { distDir } from "./paths.ts";
import { runAssistant, interpretChecklistAnswer, SUPPORTED_DOCUMENT_KINDS } from "./assistant.ts";
import { sendReminderDigestIfDue, type DigestReminder } from "./digest.ts";
import { readCv, CvReadError, CV_MAX_BYTES } from "./cvExtract.ts";

const PORT = process.env.API_PORT ? Number(process.env.API_PORT) : 4000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// RFC 5321's limit on a whole address; anything longer is not a real email.
const MAX_EMAIL_LENGTH = 254;

const app = express();
app.disable("x-powered-by");
app.use(express.json());
app.use(cookieParser());
// No CORS middleware: the dev frontend proxies /api/* to this server on the
// same origin (see frontend/scripts/dev-server.ts) and the production build is
// served from this same process (below) — the browser never makes a
// cross-origin request to this API, so there's no third-party origin to
// allow. Adding permissive CORS here would only widen the attack surface
// for no functional benefit.

type AuthedRequest = Request & { user: PublicUser };

// The department codes of the company's master list of formats (F/SYS/02) —
// two to four capitals inside the format number (QC, PRD, HR, MKT, DISP, ...).
// The list of real codes lives with the documents it groups, in the frontend
// seed (src/data/seed/departments.ts); here only the shape is checked, so the
// two never have to be kept in step.
const DEPARTMENT_CODE_RE = /^[A-Z]{2,4}$/;
const MAX_DEPARTMENTS = 10;

/** Reads a departments field off a request body: an array of codes, or absent. */
function readDepartments(value: unknown): { codes: string[] } | { error: string } {
  if (value === undefined || value === null) return { codes: [] };
  const list = Array.isArray(value) ? value : [value];
  if (list.length > MAX_DEPARTMENTS) return { error: "Too many departments." };
  const codes: string[] = [];
  for (const raw of list) {
    if (typeof raw !== "string") return { error: "A department must be a code like QC." };
    const code = raw.trim().toUpperCase();
    if (!code) continue;
    if (!DEPARTMENT_CODE_RE.test(code)) return { error: `"${raw}" is not a department code.` };
    if (!codes.includes(code)) codes.push(code);
  }
  return { codes };
}

function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    // "" -> [], which the app reads as every department.
    departments: String(row.departments ?? "")
      .split(",")
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean),
  };
}

function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.FORCE_HTTPS === "1",
    path: "/",
    maxAge: SESSION_TTL_MS,
  };
}

function issueSession(res: Response, user: PublicUser): void {
  res.cookie(COOKIE_NAME, signSessionToken(user), cookieOptions());
}

async function getSessionUser(req: Request): Promise<PublicUser | null> {
  const token = req.cookies?.[COOKIE_NAME];
  const payload = token ? verifySessionToken(token) : null;
  if (!payload) return null;
  const row = await getUserById(payload.sub);
  return row ? toPublicUser(row) : null;
}

async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = await getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: "Not authenticated." });
    return;
  }
  (req as AuthedRequest).user = user;
  next();
}

// Simple in-memory brute-force throttle per email. Resets on server restart;
// good enough for an internal LAN pilot, not a substitute for a real WAF.
interface AttemptRecord {
  count: number;
  first: number;
}

const loginAttempts = new Map<string, AttemptRecord>();
const MAX_ATTEMPTS = 8;
const THROTTLE_WINDOW_MS = 10 * 60 * 1000;

function isThrottled(key: string): boolean {
  const rec = loginAttempts.get(key);
  if (!rec) return false;
  if (Date.now() - rec.first > THROTTLE_WINDOW_MS) {
    loginAttempts.delete(key);
    return false;
  }
  return rec.count >= MAX_ATTEMPTS;
}
function recordFailedAttempt(key: string): void {
  const rec = loginAttempts.get(key) ?? { count: 0, first: Date.now() };
  rec.count += 1;
  loginAttempts.set(key, rec);
}
function clearAttempts(key: string): void {
  loginAttempts.delete(key);
}

// Signup itself was unthrottled — anyone could script unlimited account
// creation. On its own that's just noise, but combined with the
// per-account assistant-call cap below (MAX_ASSISTANT_CALLS), free signups
// turned that cap into decoration: create N accounts, get N*20 Groq calls
// instead of 20. Keyed by IP (not email — an attacker rotates that
// trivially) with the same window as the assistant throttle, generous
// enough that nobody doing legitimate testing/onboarding would ever hit it.
const signupAttempts = new Map<string, AttemptRecord>();
// Raised from 10 to 20 on 13-Sep-2026: the Playwright suite now runs
// fourteen files against one server process, nine of which create a fresh
// account, and the two fixed accounts of the departments suite have to be
// creatable on a first run. Still a cap, and the per-account assistant cap
// below is the control that actually bounds the Groq bill.
const MAX_SIGNUPS_PER_IP = 20;

function isSignupThrottled(key: string): boolean {
  const rec = signupAttempts.get(key);
  if (!rec) return false;
  if (Date.now() - rec.first > THROTTLE_WINDOW_MS) {
    signupAttempts.delete(key);
    return false;
  }
  return rec.count >= MAX_SIGNUPS_PER_IP;
}
function recordSignup(key: string): void {
  const rec = signupAttempts.get(key) ?? { count: 0, first: Date.now() };
  rec.count += 1;
  signupAttempts.set(key, rec);
}

app.post("/api/auth/signup", async (req: Request, res: Response): Promise<void> => {
  if (isSignupThrottled(req.ip ?? "unknown")) {
    res.status(429).json({ error: "Too many accounts created from this network recently. Try again later." });
    return;
  }

  const { name, email, password } = req.body ?? {};

  if (typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "Name is required." });
    return;
  }
  // Which department the person works in, chosen on the signup form. Left out
  // (or "all") it stays empty, which means every department — an account
  // nobody has assigned must not be locked out of the system.
  const departments = readDepartments((req.body ?? {}).departments);
  if ("error" in departments) {
    res.status(400).json({ error: departments.error });
    return;
  }
  if (typeof email !== "string" || email.trim().length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(email.trim())) {
    res.status(400).json({ error: "A valid email address is required." });
    return;
  }
  if (typeof password !== "string" || password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters." });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (await getUserByEmail(normalizedEmail)) {
    res.status(409).json({ error: "An account with that email already exists." });
    return;
  }

  const passwordHash = await hashPassword(password);
  // The first account runs the plant's system, so it is the admin and is not
  // restricted to one department whatever the form said — decided inside the
  // insert, under a lock, so two signups racing on an empty database cannot
  // both become admin (db.ts insertUser). Two concurrent signups for the same
  // email both pass the check above; the UNIQUE email catches the second.
  const row = await insertUser({
    id: crypto.randomUUID(),
    name: name.trim(),
    email: normalizedEmail,
    password_hash: passwordHash,
    created_at: new Date().toISOString(),
    departments: departments.codes.join(","),
  });
  if (!row) {
    res.status(409).json({ error: "An account with that email already exists." });
    return;
  }

  recordSignup(req.ip ?? "unknown");
  const user = toPublicUser(row);
  issueSession(res, user);
  res.status(201).json({ user });
});

// WHO SEES WHICH DEPARTMENT'S DOCUMENTS — set by the admin, not by the person
// themselves, or the restriction would be a preference rather than a rule.
// The admin is the first account created (see signup above).
async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = await getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: "Not authenticated." });
    return;
  }
  if (user.role !== "admin") {
    res.status(403).json({ error: "Only the system administrator can change department access." });
    return;
  }
  (req as AuthedRequest).user = user;
  next();
}

app.get("/api/users", requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  const rows = await listUsers();
  res.json({ users: rows.map((r) => ({ ...toPublicUser(r), createdAt: r.created_at })) });
});

app.post("/api/users/:id/departments", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const target = await getUserById(String(req.params.id ?? ""));
  if (!target) {
    res.status(404).json({ error: "No such user." });
    return;
  }
  const departments = readDepartments((req.body ?? {}).departments);
  if ("error" in departments) {
    res.status(400).json({ error: departments.error });
    return;
  }
  // An admin must stay unrestricted: they are the one who assigns everyone
  // else, and an admin who had locked themselves into one department could no
  // longer see the documents they were asked about.
  if (target.role === "admin" && departments.codes.length > 0) {
    res.status(400).json({ error: "The administrator account covers every department." });
    return;
  }
  const updated: UserRow = (await setUserDepartments(target.id, departments.codes.join(","))) ?? { ...target, departments: departments.codes.join(",") };
  res.json({ user: toPublicUser(updated) });
});

app.post("/api/auth/login", async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body ?? {};
  if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
    res.status(400).json({ error: "Email and password are required." });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  // No account can have an address like this (signup refuses it), so answer
  // exactly as for a wrong password — but without adding it to the throttle
  // map, which would otherwise keep one entry per made-up "email" forever.
  if (normalizedEmail.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(normalizedEmail)) {
    res.status(401).json({ error: "Invalid email or password." });
    return;
  }
  if (isThrottled(normalizedEmail)) {
    res.status(429).json({ error: "Too many failed attempts. Try again in a few minutes." });
    return;
  }

  const row = await getUserByEmail(normalizedEmail);
  const ok = row ? await verifyPassword(password, row.password_hash) : false;
  if (!row || !ok) {
    recordFailedAttempt(normalizedEmail);
    res.status(401).json({ error: "Invalid email or password." });
    return;
  }

  clearAttempts(normalizedEmail);
  const user = toPublicUser(row);
  issueSession(res, user);
  res.json({ user });
});

app.post("/api/auth/logout", (_req: Request, res: Response): void => {
  res.clearCookie(COOKIE_NAME, cookieOptions());
  res.status(204).end();
});

app.get("/api/auth/me", async (req: Request, res: Response): Promise<void> => {
  const user = await getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: "Not authenticated." });
    return;
  }
  res.json({ user });
});

// Same in-memory-per-key throttle shape as loginAttempts above, just keyed
// by user id instead of email — caps how many Groq calls one account can
// trigger so a stray loop or accidental spam can't run up the API bill.
const assistantCalls = new Map<string, AttemptRecord>();
const MAX_ASSISTANT_CALLS = 20;
const ASSISTANT_THROTTLE_WINDOW_MS = 10 * 60 * 1000;

function isAssistantThrottled(userId: string): boolean {
  const rec = assistantCalls.get(userId);
  if (!rec) return false;
  if (Date.now() - rec.first > ASSISTANT_THROTTLE_WINDOW_MS) {
    assistantCalls.delete(userId);
    return false;
  }
  return rec.count >= MAX_ASSISTANT_CALLS;
}
function recordAssistantCall(userId: string): void {
  const rec = assistantCalls.get(userId) ?? { count: 0, first: Date.now() };
  rec.count += 1;
  assistantCalls.set(userId, rec);
}

// Each throttle only forgets a key when that same key comes back after its
// window, so keys that never return (one-off IPs, users who stopped) would
// otherwise sit in memory until restart. Sweep them once a minute.
function sweepExpired(map: Map<string, AttemptRecord>, windowMs: number): void {
  const now = Date.now();
  for (const [key, rec] of map) if (now - rec.first > windowMs) map.delete(key);
}
setInterval(() => {
  sweepExpired(loginAttempts, THROTTLE_WINDOW_MS);
  sweepExpired(signupAttempts, THROTTLE_WINDOW_MS);
  sweepExpired(assistantCalls, ASSISTANT_THROTTLE_WINDOW_MS);
}, 60 * 1000).unref();

const ROUTE_RE = /^\/[a-z0-9/_-]*$/i;

app.post("/api/assistant/chat", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = (req as AuthedRequest).user.id;
  const { message, today, currentRoute, documentKind, currentData, context, language, recordStatus } = req.body ?? {};

  if (typeof message !== "string" || !message.trim()) {
    res.status(400).json({ error: "Message is required." });
    return;
  }
  if (message.length > 2000) {
    res.status(400).json({ error: "Message is too long." });
    return;
  }
  if (typeof today !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(today)) {
    res.status(400).json({ error: "today must be an ISO date string." });
    return;
  }
  if (typeof currentRoute !== "string" || !ROUTE_RE.test(currentRoute)) {
    res.status(400).json({ error: "currentRoute must be an app-relative path." });
    return;
  }
  if (documentKind !== undefined && !SUPPORTED_DOCUMENT_KINDS.includes(documentKind)) {
    res.status(400).json({ error: "Unsupported documentKind." });
    return;
  }
  // currentData is a whole open record's form state — real ones are a few KB
  // at most (even the 24-row lamination log sheets). No legitimate use of
  // this endpoint needs more than a generous margin over that; capping it
  // stops a request from padding out an oversized prompt against the Groq
  // bill (Express's default 100KB body limit alone is not a meaningful cap
  // for that purpose).
  if (currentData !== undefined && JSON.stringify(currentData).length > 30000) {
    res.status(400).json({ error: "currentData is too large." });
    return;
  }
  // The live-facts digest is a few short lines (see
  // frontend/src/engine/assistantLocal.ts); same reasoning as currentData —
  // cap it so it can't be used to pad the prompt.
  if (context !== undefined && (typeof context !== "string" || context.length > 4000)) {
    res.status(400).json({ error: "context must be a short string." });
    return;
  }
  if (language !== undefined && language !== "en" && language !== "gu") {
    res.status(400).json({ error: "Unsupported language." });
    return;
  }
  if (isAssistantThrottled(userId)) {
    res.status(429).json({ error: "Too many assistant requests. Try again in a few minutes." });
    return;
  }

  recordAssistantCall(userId);
  try {
    const result = await runAssistant({
      message: message.trim(),
      today,
      currentRoute,
      documentKind,
      currentData,
      context,
      language,
      // Informational only (it tells the model the app will ask before
      // reopening a signed-off record) — anything odd is simply dropped.
      recordStatus: typeof recordStatus === "string" && /^[A-Za-z ]{1,30}$/.test(recordStatus) ? recordStatus : undefined,
    });
    res.json(result);
  } catch (err) {
    // Log the real detail server-side (may include a vendor error body from
    // Groq) but never forward it to the client — this is the one place in
    // the app that talks to a third-party API, so its raw error text is the
    // one response body worth keeping generic on principle, not just when
    // it happens to contain something sensitive.
    console.error(err);
    res.status(502).json({ error: "The assistant is having trouble right now — try again in a moment." });
  }
});

// A CANDIDATE'S CV, READ INTO THE NEW-JOINER FORM (REQUIREMENTS §49, backend/cvExtract.ts).
// The file comes as the raw request body (application/octet-stream), so the
// JSON parser's 100KB limit doesn't apply and nothing is base64-inflated on the
// way; its own cap is 5 MB. The text rules always run; the assistant adds what
// they miss when Groq is configured, the per-user throttle allows it, and
// CV_READ_WITH_ASSISTANT isn't "0" (the network-independent test run sets it).
// Nothing is stored — the answer goes back to the form HR checks.
app.post(
  "/api/hr/cv/read",
  requireAuth,
  express.raw({ type: "application/octet-stream", limit: CV_MAX_BYTES }),
  async (req: Request, res: Response): Promise<void> => {
    const userId = (req as AuthedRequest).user.id;
    const body = req.body;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      res.status(400).json({ error: "Choose a CV file to read." });
      return;
    }
    let fileName = "cv";
    try {
      fileName = decodeURIComponent(String(req.get("x-file-name") ?? "cv")).slice(0, 200);
    } catch {
      /* a malformed name only loses the extension hint */
    }
    const useAssistant = process.env.CV_READ_WITH_ASSISTANT !== "0" && !!process.env.GROQ_API_KEY && !isAssistantThrottled(userId);
    if (useAssistant) recordAssistantCall(userId);
    try {
      res.json(await readCv(body, fileName, { useAssistant }));
    } catch (err) {
      if (err instanceof CvReadError) {
        res.status(422).json({ error: err.message });
        return;
      }
      console.error(err);
      res.status(500).json({ error: "The CV couldn't be read — enter the details by hand." });
    }
  }
);

// The guided checklist walk-through's free-text path (see
// frontend/src/engine/guidedChecklist.ts). Same per-user throttle as chat —
// it's one Groq call per answer.
app.post("/api/assistant/checklist-answer", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = (req as AuthedRequest).user.id;
  const { activity, answer, today } = req.body ?? {};
  if (typeof activity !== "string" || !activity.trim() || activity.length > 300) {
    res.status(400).json({ error: "activity is required." });
    return;
  }
  if (typeof answer !== "string" || !answer.trim() || answer.length > 1000) {
    res.status(400).json({ error: "answer is required." });
    return;
  }
  if (typeof today !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(today)) {
    res.status(400).json({ error: "today must be an ISO date string." });
    return;
  }
  if (isAssistantThrottled(userId)) {
    res.status(429).json({ error: "Too many assistant requests. Try again in a few minutes." });
    return;
  }
  recordAssistantCall(userId);
  try {
    res.json(await interpretChecklistAnswer({ activity: activity.trim(), answer: answer.trim(), today }));
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: "The assistant is having trouble right now — try again in a moment." });
  }
});

// The digest goes out from the company mailbox to whatever addresses the
// browser sends, so it is held to what the app itself would send: the
// briefing posts at most 200 reminders, each naming the employees Master
// Data assigns to it. A recipient must be one plain address — a comma,
// semicolon or angle bracket would let one "email" fan out to anyone.
const MAX_DIGEST_REMINDERS = 500;
const MAX_DIGEST_RECIPIENTS = 50;
const MAX_ASSIGNED_PER_REMINDER = 25;
const PLAIN_EMAIL_RE = /^[^\s@,;<>"'()]+@[^\s@,;<>"'()]+\.[^\s@,;<>"'()]+$/;

function shortString(value: unknown, max: number): string | null {
  return typeof value === "string" && value.length <= max ? value : null;
}

// Keeps only well-formed reminders and well-formed recipient addresses. A
// badly typed email in Master Data drops that one recipient, not the whole
// day's digest for everyone else.
function sanitizeDigestReminders(input: unknown[]): DigestReminder[] {
  const clean: DigestReminder[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const documentName = shortString(r.documentName, 200);
    const dueDate = shortString(r.dueDate, 10);
    const urgency = shortString(r.urgency, 20);
    if (!documentName || !dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || !urgency) continue;
    const assignedEmployees: { name: string; email?: string }[] = [];
    if (Array.isArray(r.assignedEmployees)) {
      for (const emp of r.assignedEmployees.slice(0, MAX_ASSIGNED_PER_REMINDER)) {
        if (!emp || typeof emp !== "object") continue;
        const e = emp as Record<string, unknown>;
        const email = shortString(e.email, MAX_EMAIL_LENGTH)?.trim();
        if (!email || !PLAIN_EMAIL_RE.test(email)) continue;
        assignedEmployees.push({ name: shortString(e.name, 100) ?? "", email: email.toLowerCase() });
      }
    }
    clean.push({ documentName, dueDate, urgency, assignedEmployees });
  }
  return clean;
}

app.post("/api/reminders/send-digest", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { reminders } = req.body ?? {};
  if (!Array.isArray(reminders)) {
    res.status(400).json({ error: "reminders must be an array." });
    return;
  }
  if (reminders.length > MAX_DIGEST_REMINDERS) {
    res.status(400).json({ error: "Too many reminders in one digest." });
    return;
  }
  const clean = sanitizeDigestReminders(reminders);
  const recipients = new Set(clean.flatMap((r) => (r.assignedEmployees ?? []).map((e) => e.email)));
  if (recipients.size > MAX_DIGEST_RECIPIENTS) {
    res.status(400).json({ error: "Too many recipients in one digest." });
    return;
  }
  try {
    const result = await sendReminderDigestIfDue(clean);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: "Failed to send reminder digest." });
  }
});

// THE APP'S DATA, IN POSTGRESQL (REQUIREMENTS §55). The browser keeps a
// working copy of each stored item (frontend/src/data/serverSync.ts): it
// loads them all here when a person signs in, asks every few seconds what
// has changed since, and writes each item back as it changes. A write says
// which version it was made from; one made from an out-of-date copy is
// refused with the current item, which the browser merges and writes again.
// What the whole plant shares is stored once for the company; a person's
// settings, assistant conversations and screen layout are stored for them.
//
// ONLY THESE ITEMS, AS JSON. The keys are the app's own (mirrored in
// serverSync.ts); anything else is refused, so nothing stored can make the
// load fail for everybody.
//
// A DEPARTMENT'S ACCOUNT GETS ITS DEPARTMENT'S RECORDS (REQUIREMENTS §40). An
// account kept to departments (not the administrator, and with departments
// assigned) is handed only the records and deletions-log lines of documents
// its departments own (or no department owns), and the HR Master Data sheet
// only with Human Resources. What such an account writes to the records or
// the log replaces only its own departments' lines; everyone else's stay as
// they are stored. The department of a document comes from the same list the
// app uses (frontend/src/data/seed/documentDepartments.ts).
const COMPANY_KEYS = new Set(["records", "documents", "master", "hrMasterData", "referenceEdits", "deletions", "live-start"]);
const USER_SCOPED_KEYS = new Set(["settings", "assistant-conversations", "sidebar-open-modules", "sidebar-visible"]);
const STORAGE_MAX_BYTES = "25mb";
const MAX_VERSION = 2147483647;
/** Items whose lines each belong to a document, and so to a department. */
const DEPARTMENT_LINE_KEYS = new Set(["records", "deletions"]);
/** Items only Human Resources may hold. */
const HR_ONLY_KEYS = ["hrMasterData"];

const storageScope = (key: string, userId: string) => (USER_SCOPED_KEYS.has(key) ? userId : "company");

/** The departments an account is kept to, or null for every department — as the app applies it (store/AuthContext.tsx). */
function accountDepartments(user: PublicUser): string[] | null {
  return user.role !== "admin" && user.departments.length > 0 ? user.departments : null;
}

const deniedKeys = (departments: string[] | null): string[] => (departments && !departments.includes("HR") ? HR_ONLY_KEYS : []);

// WHICH DEPARTMENTS A BROWSER'S COPY WAS MADE FOR. The records a browser holds
// were filtered for the account's departments when it received them; if the
// administrator has since changed those departments, a write from that copy
// would replace lines it never had (a department just added) — so the browser
// says which departments its copy is for (X-Scope), and a copy made for other
// departments than the account has now is refused and comes back to be merged
// with what the account sees now.
const scopeKey = (departments: string[] | null): string => (departments ? [...departments].sort().join(",") : "*");

/** A tab still working for one account while the browser has signed in as another: refused. */
function otherAccount(req: Request, user: PublicUser): boolean {
  const claimed = req.get("x-account");
  return claimed !== undefined && claimed !== user.id;
}

// The format number of each stored document definition, for a document the
// fixed list doesn't name (its department follows from the number).
let formatNoCache: { version: number; byId: Map<string, string> } | null = null;
async function documentFormatNos(): Promise<Map<string, string>> {
  const found = await database().query<{ version: number }>("SELECT version FROM app_storage WHERE scope = 'company' AND key = 'documents'");
  const version = found.rows[0]?.version ?? 0;
  if (formatNoCache && formatNoCache.version === version) return formatNoCache.byId;
  const byId = new Map<string, string>();
  if (version > 0) {
    const { rows } = await database().query<{ value: string }>("SELECT value FROM app_storage WHERE scope = 'company' AND key = 'documents'");
    try {
      for (const d of JSON.parse(rows[0]?.value ?? "[]") as { id?: unknown; formatNo?: unknown }[]) {
        if (typeof d?.id === "string" && typeof d.formatNo === "string") byId.set(d.id, d.formatNo);
      }
    } catch {
      /* unreadable definitions: the fixed list alone decides */
    }
  }
  formatNoCache = { version, byId };
  return byId;
}

async function lineVisibility(departments: string[]): Promise<(line: unknown) => boolean> {
  const formatNos = await documentFormatNos();
  return (line) => {
    const id = (line as { documentId?: unknown } | null)?.documentId;
    if (typeof id !== "string" || !id) return true;
    const code = departmentOfDocument(id, formatNos.get(id));
    return code === null || departments.includes(code);
  };
}

function visibleLines(value: string, visible: (line: unknown) => boolean): string {
  try {
    const lines = JSON.parse(value);
    return Array.isArray(lines) ? JSON.stringify(lines.filter(visible)) : value;
  } catch {
    return value;
  }
}

// The stored data runs to megabytes; sent compressed it is a fraction of that
// over the office network, and the browser unpacks it natively.
function sendCompressedJson(req: Request, res: Response, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.status(status).set("Vary", "Accept-Encoding");
  if (text.length < 4096 || !/\bgzip\b/.test(req.get("accept-encoding") ?? "")) {
    res.type("application/json").send(text);
    return;
  }
  zlib.gzip(text, { level: 3 }, (err, packed) => {
    if (err) {
      res.type("application/json").send(text);
      return;
    }
    res.set("Content-Encoding", "gzip").type("application/json").send(packed);
  });
}

app.get("/api/storage", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = (req as AuthedRequest).user;
  if (otherAccount(req, user)) {
    res.status(401).json({ error: "This browser is signed in as another account now." });
    return;
  }
  const since = Number(req.query.since ?? 0);
  const result = await storedItems(user.id, Number.isSafeInteger(since) && since > 0 ? since : 0);
  const departments = accountDepartments(user);
  const denied = deniedKeys(departments);
  if (departments) {
    const visible = await lineVisibility(departments);
    result.items = result.items
      .filter((item) => !denied.includes(item.key))
      .map((item) => (DEPARTMENT_LINE_KEYS.has(item.key) && item.scope === "company" ? { ...item, value: visibleLines(item.value, visible) } : item));
    for (const key of denied) delete result.versions[key];
  }
  sendCompressedJson(req, res, 200, { ...result, denied, scope: scopeKey(departments) });
});

app.put(
  "/api/storage/:key",
  requireAuth,
  express.text({ type: () => true, limit: STORAGE_MAX_BYTES }),
  async (req: Request, res: Response): Promise<void> => {
    const key = String(req.params.key ?? "");
    if (!(COMPANY_KEYS.has(key) || USER_SCOPED_KEYS.has(key)) || typeof req.body !== "string") {
      res.status(400).json({ error: "Bad storage key or value." });
      return;
    }
    try {
      JSON.parse(req.body);
    } catch {
      res.status(400).json({ error: "A stored value must be JSON." });
      return;
    }
    const base = req.get("x-base-version");
    const baseVersion = base === undefined || base === "*" ? null : Number(base);
    if (baseVersion !== null && (!Number.isSafeInteger(baseVersion) || baseVersion < 0 || baseVersion > MAX_VERSION)) {
      res.status(400).json({ error: "Bad base version." });
      return;
    }
    const user = (req as AuthedRequest).user;
    if (otherAccount(req, user)) {
      res.status(401).json({ error: "This browser is signed in as another account now." });
      return;
    }
    const departments = accountDepartments(user);
    if (deniedKeys(departments).includes(key)) {
      res.status(403).json({ error: "This account's departments do not hold that." });
      return;
    }
    const scoped = !!departments && DEPARTMENT_LINE_KEYS.has(key);
    const visible = scoped ? await lineVisibility(departments!) : null;
    const scopeNow = scopeKey(departments);
    const claimedScope = req.get("x-scope");
    if (DEPARTMENT_LINE_KEYS.has(key) && claimedScope !== undefined && claimedScope !== scopeNow) {
      const stored = await readItem(storageScope(key, user.id), key);
      const current = stored && visible ? { ...stored, value: visibleLines(stored.value, visible) } : stored;
      sendCompressedJson(req, res, 409, { current, scope: scopeNow });
      return;
    }
    const posted: string = req.body;
    // A department's account writes its own departments' lines; everyone else's stay as stored.
    const compose = visible
      ? (stored: string | null): string => {
          const mine = (JSON.parse(posted) as unknown[]).filter(visible);
          let others: unknown[] = [];
          try {
            const all = stored ? JSON.parse(stored) : [];
            if (Array.isArray(all)) others = all.filter((line) => !visible(line));
          } catch {
            /* nothing readable stored */
          }
          return JSON.stringify([...mine, ...others]);
        }
      : undefined;
    if (compose && !Array.isArray(JSON.parse(posted))) {
      res.status(400).json({ error: "A stored value must be JSON." });
      return;
    }
    const result = await writeItem(storageScope(key, user.id), key, posted, baseVersion, user.email, compose);
    if (result.ok) {
      res.json({ version: result.version, seq: result.seq });
      return;
    }
    const current = result.current && visible ? { ...result.current, value: visibleLines(result.current.value, visible) } : result.current;
    sendCompressedJson(req, res, 409, { current, scope: scopeNow });
  }
);

app.delete("/api/storage/:key", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const key = String(req.params.key ?? "");
  const user = (req as AuthedRequest).user;
  if (otherAccount(req, user)) {
    res.status(401).json({ error: "This browser is signed in as another account now." });
    return;
  }
  if (!(COMPANY_KEYS.has(key) || USER_SCOPED_KEYS.has(key))) {
    res.status(400).json({ error: "Bad storage key." });
    return;
  }
  // The company's items are removed only by the administrator; a person's own, by them.
  if (COMPANY_KEYS.has(key) && user.role !== "admin") {
    res.status(403).json({ error: "Only the administrator may remove the company's data." });
    return;
  }
  await deleteItem(storageScope(key, user.id), key);
  res.status(204).end();
});

// Single-process production deployment: serve the built frontend (dist/)
// from the same server as the API, so there's one process and one origin to
// run/expose for a pilot (see DEPLOYMENT.md). In dev, the frontend is served
// separately by frontend/scripts/dev-server.ts, which proxies /api/* here instead.
if (existsSync(distDir)) {
  // The app's script and styles are compressed when it is built
  // (frontend/scripts/build.ts): a browser that accepts it gets the brotli or
  // gzip copy — a quarter of the size — as long as it is not older than the file.
  const precompressed: Record<string, string> = { ".js": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };
  app.use((req: Request, res: Response, next: NextFunction) => {
    const type = precompressed[path.extname(req.path)];
    if ((req.method !== "GET" && req.method !== "HEAD") || !type || !req.path.startsWith("/assets/")) return next();
    const file = path.join(distDir, path.normalize(req.path));
    if (!file.startsWith(distDir)) return next();
    const accepts = req.get("accept-encoding") ?? "";
    for (const [encoding, ext] of [["br", ".br"], ["gzip", ".gz"]] as const) {
      if (!new RegExp(`\\b${encoding}\\b`).test(accepts)) continue;
      try {
        if (statSync(file + ext).mtimeMs < statSync(file).mtimeMs) continue;
      } catch {
        continue;
      }
      res.sendFile(file + ext, { headers: { "Content-Type": type, "Content-Encoding": encoding, Vary: "Accept-Encoding" } });
      return;
    }
    next();
  });
  app.use(express.static(distDir));
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "GET" || req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(distDir, "index.html"));
  });
}

// Express's default error handler echoes the stack trace in the response
// unless NODE_ENV is explicitly "production" — this app never sets that (see
// the CORS comment above for why), so without this, an unexpected error
// would leak internals to the client. Log server-side, respond generically.
// A client error (malformed JSON is 400, an oversized body 413) keeps its
// status — it is the request that was wrong, not the server.
app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) return next(err);
  const status = typeof (err as { status?: unknown })?.status === "number" ? (err as { status: number }).status : 500;
  if (status >= 400 && status < 500) {
    res.status(status).json({ error: status === 413 ? "Request is too large." : "Bad request." });
    return;
  }
  // The database itself is down: said as that, so the app shows "could not be
  // reached, try again" instead of treating a signed-in person as signed out.
  if (isDatabaseUnavailable(err)) {
    console.error("[postgres]", err instanceof Error ? err.message : err);
    res.status(503).json({ error: "The database could not be reached." });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Something went wrong." });
});

try {
  await openDatabase();
} catch (err) {
  console.error("Could not open the PostgreSQL database:", err instanceof Error ? err.message : err);
  process.exit(1);
}

app.listen(PORT, () => {
  console.log(`API server listening on http://localhost:${PORT}`);
});
