// API server. Owns the user accounts (hashed passwords, signed session
// cookies) and ALL of the app's data, kept in PostgreSQL (db.ts, REQUIREMENTS
// §55): the records, documents, master data, HR Master Data and the rest are
// loaded from here when a person signs in and written back as they work, over
// /api/storage below. See docs/DEPLOYMENT.md.
import "./env.ts";
import express, { type CookieOptions, type NextFunction, type Request, type Response } from "express";
import cookieParser from "cookie-parser";
import crypto from "node:crypto";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import {
  createStaffUser,
  database,
  getUserByEmail,
  getUserById,
  insertActivity,
  insertUser,
  isDatabaseUnavailable,
  listActivity,
  activitySummary,
  listAllUsers,
  listUsers,
  markSignedIn,
  openDatabase,
  seedUser,
  setUserActive,
  setUserDepartments,
  setUserPassword,
  type UserRow,
} from "./db.ts";
import { departmentOfDocument } from "../frontend/src/data/seed/documentDepartments.ts";
import { hashPassword, verifyPassword, newSessionId, sessionKeyOf, signSessionToken, verifySessionToken, COOKIE_NAME, type PublicUser } from "./auth.ts";
import { createDeviceSessions, deviceLine, type DeviceFacts, type DeviceRequest, type SessionEndedBody } from "./deviceSessions.ts";
import { deviceLanguageOf } from "../frontend/src/engine/deviceWords.ts";
import { BUILT_IN_FIRST_PASSWORD, NO_PASSWORD_YET, hasNoPasswordYet, mayChangeOwnPassword, settleFirstPasswords } from "./passwordPolicy.ts";
import { SIGN_IN_WINDOW_MS, createSignInThrottle, endsThisSession, signOutWords } from "./signInAndOut.ts";
import { createWorkingHoursGate } from "./workingHours.ts";
import type { OutsideHoursRefusal } from "../frontend/src/engine/workingHoursCore.ts";
import { distDir } from "./paths.ts";
import { ensureWebsiteBuilt } from "./websiteBuild.ts";
import { ALLOW_SIGNUP, FEATURES } from "./features.ts";
import { runAssistant, interpretChecklistAnswer, SUPPORTED_DOCUMENT_KINDS, assistantAllowanceUsedUp } from "./assistant.ts";
import { runAgentStep, validateAgentRequest, TRANSCRIBE_PROMPT } from "./mitraAgent.ts";
import { readAttachment, picturesReadByModel, MAX_ATTACHMENT_BYTES } from "./attachments.ts";
import { aiConfigured, aiProviderName, aiSpeak, aiTranscribe, aiUsage, ttsModel, ttsVoiceName } from "./ai.ts";
import { speakFailure, speakStatus, speechCache, speechCacheKey, TTS_MAX_TEXT_CHARS, VOICE_PROBE_TEXT, VoiceAvailability, VoiceUnavailableError } from "./tts.ts";
import { sendReminderDigestIfDue, type DigestReminder } from "./digest.ts";
import { readCv, CvReadError, CV_MAX_BYTES } from "./cvExtract.ts";
import { registerActivityArchiveRoutes } from "./archiveRoutes.ts";
import { activityFilterOf, registerActivityRoutes } from "./activityRoutes.ts";
import { registerEscalationRoutes } from "./escalationRoutes.ts";
import { registerApiV1 } from "./apiV1.ts";
import { registerOverviewRoutes } from "./overviewRoutes.ts";
import { prepareOverview } from "./overviewSetup.ts";
import { registerAccessRoutes } from "./accessRoutes.ts";
import { registerNotificationRoutes } from "./notificationRoutes.ts";
import { pushDevicesFollow } from "./notifications.ts";
import { printCompanyNetwork, registerPhoneAppRoutes } from "./phoneApp.ts";
import { setNotificationDeps, startJobs } from "./jobs.ts";
import { runPushes } from "./push.ts";
import { PHOTO_ROUTE } from "./apiV1Records.ts";
import { registerStorageRoutes, sendCompressedJson } from "./storageRoutes.ts";
// The archive of the blank sheets from before go-live (REQUIREMENTS §115): its table is registered as this is loaded.
import { archiveAtStartUp, archivedRecordIds, registerArchiveRoutes } from "./recordsArchive.ts";
import { registerAccessRulesRoutes } from "./accessRulesRoutes.ts";
import { accessAccountOf, sharedCatalogue } from "./accessStore.ts";
import { viewFor } from "./accessLevels.ts";
import { seedAccountsToAdd } from "./seedAccounts.ts";
import { managedAccount, registerAccountRoutes } from "./accountRoutes.ts";
import { signInAddress } from "../frontend/src/engine/accountNames.ts";
import { accountLanguageOf, accountWord } from "../frontend/src/engine/accountWords.ts";

const PORT = process.env.API_PORT ? Number(process.env.API_PORT) : 4000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// RFC 5321's limit on a whole address; anything longer is not a real email.
const MAX_EMAIL_LENGTH = 254;

const app = express();
app.disable("x-powered-by");
// JSON bodies for every route but the three of Mitra's that read their own:
// the agent route takes JSON of up to 200 KB (a Gujarati conversation of the
// permitted 40,000 characters is 120 KB of UTF-8, more than the 100 KB this
// parser allows), and the attachment and voice routes take the raw file — a
// .json attachment must reach them as bytes, not as a parsed object.
const jsonBody = express.json();
const OWN_BODY_PARSER_ROUTES = new Set(["/api/assistant/agent", "/api/assistant/extract", "/api/assistant/transcribe"]);
// The Mitra mobile app's photo route reads its own, larger JSON after the sign-in check (backend/apiV1Records.ts).
app.use((req: Request, res: Response, next: NextFunction) =>
  OWN_BODY_PARSER_ROUTES.has(req.path) || (req.method === "POST" && PHOTO_ROUTE.test(req.path)) ? next() : jsonBody(req, res, next)
);
app.use(cookieParser());
// No CORS middleware: the dev frontend proxies /api/* to this server on the
// same origin (see frontend/scripts/dev-server.ts) and the production build is
// served from this same process (below) — the browser never makes a
// cross-origin request to this API, so there's no third-party origin to
// allow. Adding permissive CORS here would only widen the attack surface
// for no functional benefit.

// `sessionKey`: the row of user_sessions the request's session is kept under (REQUIREMENTS §106, backend/auth.ts sessionKeyOf).
type AuthedRequest = Request & { user: PublicUser; sessionKey?: string };

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

// THE PLANT'S WORKING HOURS (REQUIREMENTS §84): every account but the super
// admin uses DCRS only on a working day of the plant's calendar, from START to
// END in the factory's time zone, and every session ends at the close of the day
// it was started (backend/workingHours.ts, on the rule the browser runs too —
// frontend/src/engine/workingHoursCore.ts). DCRS_WORKING_HOURS=off switches it off.
const hours = createWorkingHoursGate();

/** `maxAge`: the session's lifetime, so the cookie closes with the day it was made for (C3). Left out when a cookie is cleared. */
function cookieOptions(maxAgeMs?: number): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.FORCE_HTTPS === "1",
    path: "/",
    ...(maxAgeMs === undefined ? {} : { maxAge: Math.max(0, maxAgeMs) }),
  };
}

// WHO IS SIGNED IN WHERE (REQUIREMENTS §106): every session is a row of
// user_sessions in PostgreSQL, started at the sign-in on the device it came from
// (at most DCRS_MAX_DEVICES devices an account, the super admin never held to
// it), read on every request, ended by a sign-out or by the super admin's "Sign
// out this device" (backend/deviceSessions.ts; the super admin's view is
// backend/accessRoutes.ts). The Mitra server names the phone only beside
// X-Mitra-Key matching MITRA_SERVER_KEY. A phone's push registration goes
// with its session when that is ended on purpose (backend/notifications.ts
// pushDevicesFollow): a phone signed out is told nothing more.
const devices = createDeviceSessions({ onEnded: pushDevicesFollow() });

/** The request as backend/deviceSessions.ts reads it: its headers, its address, and the sign-in's body. */
function deviceRequest(req: Request): DeviceRequest {
  return { header: (name) => req.get(name) ?? undefined, ip: req.ip ?? "", body: req.body };
}

/**
 * The session this request still carries of the same account — its cookie, which a browser signing in again sends and
 * the Mitra server sends for the phone's earlier sign-in: replaced by the new one, never counted against the limit.
 */
function carriedSessions(req: Request, userId: string): string[] {
  const token = req.cookies?.[COOKIE_NAME];
  const held = typeof token === "string" && token ? verifySessionToken(token) : null;
  return held && held.sub === userId ? [sessionKeyOf(token, held.sessionId)] : [];
}

/**
 * Starts a session on the request's device — its row first (§106), then the cookie — and answers the new session's own
 * id (backend/auth.ts), which the browser is told, with the device; or, for an account signed in on as many devices as
 * it may be, the 403 to answer with, in the request's language (X-Language).
 */
async function issueSession(req: Request, res: Response, user: PublicUser, endsAt: Date): Promise<{ ok: true; sessionId: string; device: DeviceFacts } | { ok: false; refusal: ReturnType<typeof devices.limitRefusal> }> {
  const sessionId = newSessionId();
  const device = devices.deviceOf(deviceRequest(req));
  const begun = await devices.signIn({ sessionId, user, device, endsAt, replace: carriedSessions(req, user.id) });
  if (!begun.ok) return { ok: false, refusal: devices.limitRefusal(begun.holding, deviceLanguageOf(req.get("x-language"))) };
  res.cookie(COOKIE_NAME, signSessionToken(user, endsAt, sessionId), cookieOptions(endsAt.getTime() - Date.now()));
  return { ok: true, sessionId, device };
}

type SessionRead = { user: PublicUser; endsAt: Date; sessionId: string | null; key: string };

/**
 * The session a request carries, with the moment it ends and its id; null for none, one whose day has closed, or an
 * account switched off; `ended` with the words to answer for a session that was ended — signed out, signed out by the
 * super admin, or replaced by a sign-in again on its device (§106).
 */
async function readSession(req: Request): Promise<SessionRead | { ended: SessionEndedBody } | null> {
  const token = req.cookies?.[COOKIE_NAME];
  const payload = typeof token === "string" && token ? verifySessionToken(token) : null;
  if (!payload) return null;
  const row = await getUserById(payload.sub);
  // Switched off, or removed by the super admin (REQUIREMENTS §110: a removed account is switched off too; asked of both).
  if (!row || !row.active || row.removed_at) return null;
  const key = sessionKeyOf(token, payload.sessionId);
  const held = await devices.check({ sessionId: key, userId: row.id, issuedAt: payload.issuedAt, endsAt: payload.endsAt, request: deviceRequest(req) });
  if (!held.ok) {
    const ended = devices.endedRefusal(held.session, deviceLanguageOf(req.get("x-language")));
    return ended ? { ended } : null;
  }
  return { user: toPublicUser(row), endsAt: payload.endsAt, sessionId: payload.sessionId, key };
}

/** The 401 of a request with no session it may use: with the words of how it ended, when it was ended (§106). */
function refuseSignedOut(res: Response, read: { ended: SessionEndedBody } | null, extra: Record<string, unknown> = {}): void {
  res.status(401).json(read ? { ...read.ended, ...extra } : { error: "Not authenticated.", ...extra });
}

// WHO IS MAKING THIS REQUEST — read from the users table every time, not from
// the token. That is what lets the administrator switch an account off and have
// it stop at its very next request (REQUIREMENTS §66): a session already issued
// is no use to somebody who has left. And the session itself, from its row
// (§106): one signed out, here or by the super admin, stops at once too.
async function getSessionUser(req: Request): Promise<PublicUser | null> {
  const read = await readSession(req);
  return read && !("ended" in read) ? read.user : null;
}

/**
 * OUTSIDE THE PLANT'S HOURS (REQUIREMENTS §84, C2): an account held to them is
 * refused with 403 `outside-working-hours`, the next opening and the reason in
 * plain words. Answered, and true, when it was refused.
 *
 * One exception, for the work itself: a WRITE to /api/storage is refused with
 * 401 and the same body. The browser's sync (frontend/src/data/serverSync.ts)
 * reads a 403 on a write as "this account may not hold that item" and forgets
 * that it still has to send it — a 401 is "signed out: send it at the next
 * sign-in", which keeps what was typed before the close for the next morning.
 */
async function refuseOutsideHours(req: Request, res: Response, user: PublicUser): Promise<boolean> {
  const refused: OutsideHoursRefusal | null = await hours.refusal(user);
  if (!refused) return false;
  const storageWrite = req.method !== "GET" && req.method !== "HEAD" && req.path.startsWith("/api/storage/");
  res.status(storageWrite ? 401 : 403).json(refused);
  return true;
}

/** Whether this session's account is still on the password the administrator gave it (REQUIREMENTS §66). */
async function mustChangePassword(id: string): Promise<boolean> {
  const row = await getUserById(id);
  return !!row?.must_change_password;
}

/**
 * Signed in, and nothing more asked of them: for the few things somebody on the
 * administrator's password must still be able to do — change it, and sign out.
 * Everything else goes through requireAuth, which holds the door (REQUIREMENTS §66).
 */
async function requireSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  const read = await readSession(req);
  if (!read || "ended" in read) {
    refuseSignedOut(res, read);
    return;
  }
  const user = read.user;
  if (await refuseOutsideHours(req, res, user)) return;
  (req as AuthedRequest).user = user;
  (req as AuthedRequest).sessionKey = read.key;
  next();
}

async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const read = await readSession(req);
  if (!read || "ended" in read) {
    refuseSignedOut(res, read);
    return;
  }
  const user = read.user;
  (req as AuthedRequest).sessionKey = read.key;
  // Outside the plant's hours nothing is used at all (§84), so that answer comes first.
  if (await refuseOutsideHours(req, res, user)) return;
  // STILL ON THE ADMINISTRATOR'S PASSWORD: nothing of the company's is handed
  // over or taken in until they have chosen their own (REQUIREMENTS §66). The
  // dialog on screen is not the lock — this is. /api/auth/* stays open, or they
  // could neither change it nor sign out.
  if (await mustChangePassword(user.id)) {
    res.status(403).json({ error: "Choose a password of your own before you carry on.", code: "password-change-required" });
    return;
  }
  (req as AuthedRequest).user = user;
  next();
}

// THE ACTIVITY LOG (REQUIREMENTS §62). Who and when come from the session and
// the server's clock; a line that cannot be written must never fail the thing
// it describes, so it is awaited nowhere on the way out and its error is only
// printed.
function logActivity(req: Request, who: PublicUser | null, action: string, target = "", detail = "", department = ""): void {
  void insertActivity([{ userId: who?.id ?? null, userName: who?.name ?? "", userEmail: who?.email ?? "", action, target, detail, department, ip: req.ip ?? "" }]).catch((err) =>
    console.error("[activity log]", err instanceof Error ? err.message : err)
  );
}

// The guard against guessing a password: eight wrong ones for an address from
// one computer hold back that computer, and only it, for ten minutes — so that
// nobody else's wrong guesses can keep the super admin out (backend/signInAndOut.ts;
// the review of 8-Oct-2026, audit M-22). In memory: it starts afresh with the
// server; good enough for the plant's own network, not a substitute for a firewall.
interface AttemptRecord {
  count: number;
  first: number;
}

const signInThrottle = createSignInThrottle();
/** The window the sign-up throttle below counts in: the sign-in's own. */
const THROTTLE_WINDOW_MS = SIGN_IN_WINDOW_MS;

// Signup itself was unthrottled — anyone could script unlimited account
// creation. On its own that's just noise, but combined with the
// per-account assistant-call cap below (maxAssistantCalls), free signups
// turned that cap into decoration: create N accounts, get N times the model
// calls of one. Keyed by IP (not email — an attacker rotates that
// trivially) with the same window as the assistant throttle, generous
// enough that nobody doing legitimate testing/onboarding would ever hit it.
const signupAttempts = new Map<string, AttemptRecord>();
// Raised from 10 to 20 on 13-Sep-2026: the Playwright suite now runs
// fourteen files against one server process, nine of which create a fresh
// account, and the two fixed accounts of the departments suite have to be
// creatable on a first run. Still a cap, and the per-account assistant cap
// below, with the day's allowance (backend/ai.ts), is the control that actually
// bounds the AI bill.
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

// BEFORE ANYBODY IS SIGNED IN: what this server has switched on, and nothing
// else — no account, no name, no count of accounts (REQUIREMENTS §66). The
// sign-in screen asks so that it knows whether to offer a way to create an
// account at all.
// With it, THE PLANT'S HOURS AND WHERE TODAY STANDS (REQUIREMENTS §84), which the
// sign-in page states — the plant's, not anybody's. A database that cannot be
// read leaves them out rather than failing the answer.
app.get("/api/auth/config", async (_req: Request, res: Response): Promise<void> => {
  const plant = await hours.publicAnswer().catch(() => null);
  res.json({ features: FEATURES, hours: plant });
});

// IS THE SITE UP? (REQUIREMENTS §78). The top bar's connection badge asks this
// every few seconds and times the answer; nothing about the server or anybody's
// account is said — only that it answered, and when. Never cached.
app.get("/api/health", (_req: Request, res: Response): void => {
  res.set("Cache-Control", "no-store");
  res.json({ ok: true, at: new Date().toISOString() });
});

app.post("/api/auth/signup", async (req: Request, res: Response): Promise<void> => {
  // ACCOUNTS ARE MADE BY THE ADMINISTRATOR (REQUIREMENTS §66). Refused here,
  // whatever is sent and whoever sends it — an empty users table included, so a
  // closed portal can never hand the first caller an administrator's account.
  if (!ALLOW_SIGNUP) {
    logActivity(req, null, "Sign-up refused", typeof (req.body ?? {}).email === "string" ? String((req.body ?? {}).email).slice(0, MAX_EMAIL_LENGTH) : "", "Accounts are created by the administrator (ALLOW_SIGNUP is not set)");
    res.status(403).json({ error: "Accounts are created by the administrator. Ask them for yours." });
    return;
  }
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
  // OUTSIDE THE PLANT'S HOURS (§84): an account made now would be staff (only
  // the first account on an empty database is the admin), and staff cannot
  // start a session — so nothing is made, and the reason is said.
  if (hours.enforced && (await listUsers()).length > 0) {
    const refused = await hours.refusal({ role: "staff" });
    if (refused) {
      logActivity(req, null, "Sign-up refused", normalizedEmail.slice(0, MAX_EMAIL_LENGTH), "Outside working hours");
      res.status(403).json(refused);
      return;
    }
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
  const endsAt = await hours.sessionEnd(user);
  // A new account has no device yet, so its first session always starts (§106).
  const issued = await issueSession(req, res, user, endsAt);
  logActivity(req, user, "Account created", user.email, user.role === "admin" ? "The first account — the system administrator" : user.departments.length ? `Departments: ${user.departments.join(", ")}` : "Every department");
  if (!issued.ok) {
    res.status(403).json(issued.refusal);
    return;
  }
  // With the account, what this server has switched on (features.ts, REQUIREMENTS §65) — here, at sign-in and in
  // /api/auth/me — and when this session ends, with its id (§84).
  res.status(201).json({ user, features: FEATURES, session: await hours.sessionAnswer(user, endsAt, issued.sessionId), hours: await hours.personAnswer(user) });
});

// WHO SEES WHICH DEPARTMENT'S DOCUMENTS — set by the admin, not by the person
// themselves, or the restriction would be a preference rather than a rule.
// The admin is the first account created (see signup above).
async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const read = await readSession(req);
  if (!read || "ended" in read) {
    refuseSignedOut(res, read);
    return;
  }
  const user = read.user;
  if (user.role !== "admin") {
    res.status(403).json({ error: "Only the system administrator can change department access." });
    return;
  }
  (req as AuthedRequest).user = user;
  (req as AuthedRequest).sessionKey = read.key;
  next();
}

// EVERY ACCOUNT, THE REMOVED ONES TOO (REQUIREMENTS §110): each with when it was removed and by whom (null while it is
// on the list), the sign-in it gave up to another account and the ones it had before a rename. Users & Access shows the
// removed ones only under "Show removed accounts".
app.get("/api/users", requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  const rows = await listAllUsers();
  const byId = new Map(rows.map((r) => [r.id, r.name] as const));
  // No hash and nothing of anybody's password, here or anywhere (REQUIREMENTS §66).
  res.json({ users: rows.map((r) => managedAccount(r, (id) => byId.get(id) ?? null)) });
});

// WHO ANSWERS FOR WHICH DEPARTMENT — for the Performance Scorecard (REQUIREMENTS
// §64), which scores each person on the documents of their own department and
// so has to know who the accounts are. The list above is the administrator's
// and carries the sign-in addresses; this one is for anybody signed in and
// carries only what the scorecard prints: a name, the role and the departments
// — never the email, never the hash. Who reads whom follows the access levels
// (REQUIREMENTS §96, backend/accessLevels.ts): the administrator, and anybody who
// sees every module, read every account; anybody else reads the accounts that
// share a module they see with them (itself among them), the same line the
// records and the activity log are kept to.
app.get("/api/users/directory", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const catalogue = await sharedCatalogue();
  const me = (req as AuthedRequest).user;
  const own = viewFor(catalogue, accessAccountOf(me)).modules();
  const people = (await listUsers())
    .map(toPublicUser)
    .filter((p) => {
      if (own === null || p.id === me.id) return true;
      const theirs = viewFor(catalogue, accessAccountOf(p)).modules();
      return theirs === null || theirs.some((code) => own.includes(code));
    })
    .map((p) => ({ id: p.id, name: p.name, role: p.role, departments: p.departments }));
  res.json({ people });
});

// THE ADMINISTRATOR MAKES AN ACCOUNT (REQUIREMENTS §66): a name, a sign-in
// address, a password of the administrator's choosing and the departments it may
// see. Never an administrator — there is one, the seeded super admin — whatever
// the body says, because the role is not read from it at all.
app.post("/api/users", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { name, email, password } = req.body ?? {};
  if (typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "The person's name is required." });
    return;
  }
  if (typeof email !== "string" || email.trim().length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(email.trim())) {
    res.status(400).json({ error: "A valid sign-in address is required." });
    return;
  }
  if (typeof password !== "string" || password.length < 8) {
    res.status(400).json({ error: "The first password must be at least 8 characters." });
    return;
  }
  const departments = readDepartments((req.body ?? {}).departments);
  if ("error" in departments) {
    res.status(400).json({ error: departments.error });
    return;
  }
  // Normalised exactly as signing in normalises it, so the same person cannot be
  // given two accounts by typing their address in different case.
  const normalizedEmail = email.trim().toLowerCase();
  const holder = await getUserByEmail(normalizedEmail);
  if (holder) {
    // A removed account keeps its sign-in (REQUIREMENTS §110): it is brought back rather than made twice.
    if (holder.removed_at) {
      res.status(409).json({ error: accountWord("en", "err.signInRemovedHolder", { email: normalizedEmail, holder: holder.name }), code: "removed-account" });
      return;
    }
    res.status(409).json({ error: "An account with that sign-in address already exists." });
    return;
  }
  const row = await createStaffUser({
    id: crypto.randomUUID(),
    name: name.trim(),
    email: normalizedEmail,
    password_hash: await hashPassword(password),
    created_at: new Date().toISOString(),
    departments: departments.codes.join(","),
  });
  if (!row) {
    res.status(409).json({ error: "An account with that sign-in address already exists." });
    return;
  }
  const made = toPublicUser(row);
  // The password is never written down — not here, not in the log.
  logActivity(req, (req as AuthedRequest).user, "Account created by the administrator", `${made.name} <${made.email}>`, made.departments.length ? `Departments: ${made.departments.join(", ")}` : "Every department");
  res.status(201).json({ user: { ...made, createdAt: row.created_at, mustChangePassword: false, active: true, lastSignIn: null } });
});

// A PASSWORD THE PERSON HAS FORGOTTEN. The administrator gives them another
// temporary one; they choose their own at their next sign-in, and every session
// they had is over — the next request of it is refused until they do.
app.post("/api/users/:id/password", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const target = await getUserById(String(req.params.id ?? ""));
  if (!target) {
    res.status(404).json({ error: "No such account." });
    return;
  }
  const { password } = req.body ?? {};
  if (typeof password !== "string" || password.length < 8) {
    res.status(400).json({ error: "The new password must be at least 8 characters." });
    return;
  }
  // They sign in with it: only the super admin changes passwords (REQUIREMENTS §105).
  await setUserPassword(target.id, await hashPassword(password), false);
  logActivity(req, (req as AuthedRequest).user, "Password reset by the administrator", `${target.name} <${target.email}>`, "They sign in with the password the super admin gave them");
  res.json({ ok: true });
});

// SOMEBODY WHO HAS LEFT. Their account is switched off, not deleted: their name
// stays on every record they signed, and their sessions stop at the next request
// (getSessionUser). The administrator cannot switch their own account off — there
// would be nobody left to switch it back on.
app.post("/api/users/:id/active", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const target = await getUserById(String(req.params.id ?? ""));
  if (!target) {
    res.status(404).json({ error: "No such account." });
    return;
  }
  const active = (req.body ?? {}).active;
  if (typeof active !== "boolean") {
    res.status(400).json({ error: "Say whether the account is to be on or off." });
    return;
  }
  const me = (req as AuthedRequest).user;
  if (!active && target.id === me.id) {
    res.status(400).json({ error: "You cannot switch off the account you are signed in with." });
    return;
  }
  // A removed account is brought back, not switched on (REQUIREMENTS §110): it would sign in while still off every list.
  if (target.removed_at) {
    res.status(409).json({ error: "This account has been removed. Bring it back first (Users & Access, Show removed accounts).", code: "removed-account" });
    return;
  }
  const row = await setUserActive(target.id, active);
  if (!row) {
    res.status(404).json({ error: "No such account." });
    return;
  }
  // Switched off, the devices it was signed in on are signed out with it: off the super admin's "Signed in on" (§106).
  if (!active) await devices.endAll(target.id, "account-off", me.id);
  logActivity(req, me, active ? "Account switched on" : "Account switched off", `${target.name} <${target.email}>`, active ? "They can sign in again" : "They can no longer sign in; nothing of theirs is deleted");
  res.json({ user: { ...toPublicUser(row), createdAt: row.created_at, mustChangePassword: row.must_change_password, noPasswordYet: hasNoPasswordYet(row), active: row.active, lastSignIn: row.last_sign_in } });
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
  logActivity(req, (req as AuthedRequest).user, "Department access changed", `${target.name} <${target.email}>`, `${target.departments || "every department"} → ${departments.codes.join(", ") || "every department"}`);
  res.json({ user: toPublicUser(updated) });
});

app.post("/api/auth/login", async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body ?? {};
  if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
    res.status(400).json({ error: "Email and password are required." });
    return;
  }

  // THE SHORT NAME (REQUIREMENTS §110): "kapila.barad", "kapila barad" or "KAPILA BARAD" signs in to
  // kapila.barad@gpp.local, the plant's own sign-in, and to nothing else; an address is taken as it always was
  // (frontend/src/engine/accountNames.ts signInAddress). Only an exact match of that: nothing is guessed.
  const normalizedEmail = signInAddress(email);
  // No account can have an address like this (signup refuses it), so answer
  // exactly as for a wrong password — but without adding it to the throttle
  // map, which would otherwise keep one entry per made-up "email" forever.
  if (normalizedEmail.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(normalizedEmail)) {
    res.status(401).json({ error: "Invalid email or password." });
    return;
  }
  // Held back: too many wrong passwords for this address from THIS computer lately. The same address signs in at once
  // from any other — the super admin's above all, who may sign in at any time (backend/signInAndOut.ts).
  if (signInThrottle.held(normalizedEmail, req.ip)) {
    res.status(429).json({ error: "Too many failed attempts. Try again in a few minutes." });
    return;
  }

  const row = await getUserByEmail(normalizedEmail);
  const ok = row ? await verifyPassword(password, row.password_hash) : false;
  if (!row || !ok) {
    signInThrottle.failed(normalizedEmail, req.ip);
    logActivity(req, row ? toPublicUser(row) : null, "Sign-in failed", normalizedEmail, row ? "Wrong password" : "No such account");
    res.status(401).json({ error: "Invalid email or password." });
    return;
  }

  // REMOVED BY THE SUPER ADMIN (REQUIREMENTS §110), like switched off below: said plainly, and only after the password
  // was right; in the language asked (X-Language), the phone's.
  if (row.removed_at) {
    logActivity(req, toPublicUser(row), "Sign-in refused", normalizedEmail, "The account has been removed by the super admin");
    res.status(403).json({ error: accountWord(accountLanguageOf(req.get("x-language")), "err.accountRemoved"), code: "account-removed" });
    return;
  }
  // SWITCHED OFF (REQUIREMENTS §66): said plainly rather than as a wrong
  // password — the person is not mistaken, and the administrator is who to ask.
  // Only ever after the password was right, so it tells a stranger nothing.
  if (!row.active) {
    logActivity(req, toPublicUser(row), "Sign-in refused", normalizedEmail, "The account is switched off");
    res.status(403).json({ error: "This account has been switched off. Ask the administrator." });
    return;
  }

  signInThrottle.succeeded(normalizedEmail, req.ip);
  const user = toPublicUser(row);
  // OUTSIDE THE PLANT'S HOURS (REQUIREMENTS §84): only after the password was
  // right, like the switched-off answer above, and said in plain words with the
  // next opening. The super admin is never refused.
  const refused = await hours.refusal(user);
  if (refused) {
    logActivity(req, user, "Sign-in refused", normalizedEmail, "Outside working hours");
    res.status(403).json(refused);
    return;
  }
  // A DAY'S SESSION (§84, C3): it ends at the close of today — END for staff, midnight for the super admin (the
  // midnight after, for his sign-in in the day's last ten minutes). The hours in the answer are worded for this
  // person: the staff's hours, and for the super admin a line saying he can keep working (§84 addendum, 6-Oct-2026).
  const endsAt = await hours.sessionEnd(user);
  // ON THIS DEVICE, IF THE ACCOUNT HAS ROOM (§106): a device that already has a session replaces it; one device more
  // than DCRS_MAX_DEVICES is refused in plain words naming the devices and since when (the super admin never is).
  const issued = await issueSession(req, res, user, endsAt);
  if (!issued.ok) {
    logActivity(req, user, "Sign-in refused", normalizedEmail, `Already signed in on ${issued.refusal.devices.length} devices: ${issued.refusal.devices.map((d) => `${d.name} (since ${d.sinceText})`).join(", ")}`);
    res.status(403).json(issued.refusal);
    return;
  }
  void markSignedIn(row.id, new Date().toISOString()).catch(() => undefined);
  // The line names the device (§106): "Windows computer - Chrome (Website) from 10.0.0.5".
  logActivity(req, user, "Signed in", user.email, deviceLine(issued.device));
  res.json({ user, features: FEATURES, mustChangePassword: row.must_change_password, session: await hours.sessionAnswer(user, endsAt, issued.sessionId), hours: await hours.personAnswer(user) });
});

// A session the browser ends a moment after its close — its clock, a laptop
// woken from sleep — still has its "Signed out" line written, for this long.
const SIGN_OUT_LINE_GRACE_MS = 30 * 60 * 1000;

// SIGNING OUT. `reason` only when the browser signs a person out by itself (§84, C4), and then written only where it
// fits the account (backend/signInAndOut.ts signOutWords): "At the close of working hours" or "Outside working hours"
// for staff, "At the end of the day (midnight)" for the super admin. `sessionId` only from a tab ending its own session
// by itself: when the browser's cookie holds another session by then — he signed in again in another tab while this
// one's clock ran late — that newer session is left as it is, with no line and its cookie kept (review of 8-Oct-2026).
//
// THE SESSION ENDS HERE (REQUIREMENTS §106): its row says when, and that the person signed out, so the token is of no
// use from now on, wherever a copy of it is (the Mitra server's, for the phone). One the super admin had signed out
// already, or replaced by a sign-in again on its device, writes no second line.
app.post("/api/auth/logout", async (req: Request, res: Response): Promise<void> => {
  const token = req.cookies?.[COOKIE_NAME];
  const held = typeof token === "string" && token ? verifySessionToken(token, { ignoreExpiration: true }) : null;
  if (!endsThisSession((req.body ?? {}).sessionId, held?.sessionId)) {
    res.status(204).end();
    return;
  }
  let user: PublicUser | null = null;
  if (held && typeof token === "string") {
    const row = await getUserById(held.sub).catch(() => undefined);
    if (row) {
      const claim = { sessionId: sessionKeyOf(token, held.sessionId), userId: row.id, issuedAt: held.issuedAt, endsAt: held.endsAt, request: deviceRequest(req) };
      const was = await devices.signOut(claim).catch((err: unknown) => {
        console.error("[devices] the sign-out could not be written:", err instanceof Error ? err.message : err);
        return "ended" as const;
      });
      // An open session, or one the browser ends a moment after its close: its "Signed out" line, as before.
      if (was === "ended" && row.active && Date.now() - held.endsAt.getTime() <= SIGN_OUT_LINE_GRACE_MS) user = toPublicUser(row);
    }
  }
  if (user) logActivity(req, user, "Signed out", user.email, signOutWords((req.body ?? {}).reason, user.role));
  res.clearCookie(COOKIE_NAME, cookieOptions());
  res.status(204).end();
});

// The named accounts start on a password somebody else chose (the seeding at
// the foot of this file), so a person has to be able to make it their own.
// requireSession, not requireAuth: somebody who MUST change their password has
// to be able to change it (REQUIREMENTS §66).
app.post("/api/auth/change-password", requireSession, async (req: Request, res: Response): Promise<void> => {
  const user = (req as AuthedRequest).user;
  // PASSWORDS ARE THE SUPER ADMIN'S (REQUIREMENTS §105): everybody else signs in with the one the super admin gave them.
  if (!mayChangeOwnPassword(user)) {
    res.status(403).json({ error: "Your password is set by the super admin. Ask the super admin for a new one.", code: "password-set-by-super-admin" });
    return;
  }
  const { currentPassword, newPassword } = req.body ?? {};
  if (typeof currentPassword !== "string" || typeof newPassword !== "string" || newPassword.length < 8) {
    res.status(400).json({ error: "The new password must be at least 8 characters." });
    return;
  }
  const row = await getUserById(user.id);
  if (!row || !(await verifyPassword(currentPassword, row.password_hash))) {
    logActivity(req, user, "Password change refused", user.email, "The current password was wrong");
    res.status(401).json({ error: "The current password is not right." });
    return;
  }
  // A password of their OWN: the one the administrator gave them will not do again.
  if (currentPassword === newPassword) {
    res.status(400).json({ error: "Choose a password different from the one you have now." });
    return;
  }
  // Chosen by them, so nothing is asked of them again.
  await setUserPassword(user.id, await hashPassword(newPassword), false);
  logActivity(req, user, "Password changed", user.email, row.must_change_password ? "The first password, set by the administrator, was replaced" : "");
  res.status(204).end();
});

// ---- the activity log: written by the app as things happen, read by whoever may see them
const MAX_ACTIVITY_BATCH = 50;
const clip = (v: unknown, n: number): string => (typeof v === "string" ? v.slice(0, n) : "");
// THE BROWSER'S OWN ID FOR A LINE (REQUIREMENTS §62, §75; db.ts insertActivity):
// a UUID and nothing else, kept in small letters so one id is one id however
// it was written. Anything else — too long, the wrong shape, not a string —
// is simply not kept: the line is still written, only without the means of
// knowing it again if it is resent. A line is evidence; it is never refused
// over the label a browser gave it.
const CLIENT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clientLineId = (v: unknown): string | null => (typeof v === "string" && CLIENT_ID_RE.test(v) ? v.toLowerCase() : null);

app.post("/api/activity", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = (req as AuthedRequest).user;
  const events: unknown = (req.body ?? {}).events;
  if (!Array.isArray(events) || events.length === 0 || events.length > MAX_ACTIVITY_BATCH) {
    res.status(400).json({ error: "Between 1 and 50 events." });
    return;
  }
  // EVERY LINE FILED UNDER ITS DEPARTMENT (REQUIREMENTS §40, §75). A line that
  // names its document is given the department HERE, by the same rule the
  // records are scoped by (departmentOfDocument, with the stored definitions'
  // format numbers — lineVisibility below), so it cannot disagree with who may
  // see the record itself. The browser's own guess came only from its fixed
  // map, and every Purchase, Store and Dispatch line was filed under no
  // department — invisible to that department's own accounts. The browser's
  // `department` is still read, for a line with no document or a document no
  // rule places.
  const formatNos = (events as Record<string, unknown>[]).some((e) => typeof e?.documentId === "string") ? await documentFormatNos() : null;
  const lines = [];
  for (const e of events as Record<string, unknown>[]) {
    const action = clip(e?.action, 80).trim();
    if (!action) continue;
    const documentId = clip(e?.documentId, 120).trim();
    const stated = clip(e?.department, 8).toUpperCase();
    // Checked for shape as well: the id comes from the browser, and a name such
    // as "constructor" finds something on any plain object's prototype.
    const derived: unknown = documentId && formatNos ? departmentOfDocument(documentId, formatNos.get(documentId)) : null;
    const department = typeof derived === "string" && DEPARTMENT_CODE_RE.test(derived) ? derived : DEPARTMENT_CODE_RE.test(stated) ? stated : "";
    lines.push({
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      action,
      target: clip(e?.target, 240),
      detail: clip(e?.detail, 600),
      department,
      ip: req.ip ?? "",
      clientId: clientLineId(e?.clientId),
    });
  }
  await insertActivity(lines);
  res.status(204).end();
});

// The administrator reads every line. An account kept to departments reads its
// own lines and its departments'; an account with no departments set works
// across the plant (management, the MR, QA) and reads every line too — all but
// the escalations' two, which are the super admin's alone (§75, db.ts). The
// reading of the request into that filter — person, span, search, and the
// super admin's module, document and action chips — is activityRoutes.ts
// readActivityFilter, shared with the archive's routes.

/**
 * Signed in, with the modules the person sees (REQUIREMENTS §96): the activity log is read by the same line as the
 * records — a person reads their own lines and those of the modules they see; somebody who sees every module (and an
 * account nobody has described with no departments) reads every line.
 */
const requireAuthWithModules = (req: Request, res: Response, next: NextFunction): void => {
  void requireAuth(req, res, () => {
    const user = (req as AuthedRequest).user;
    sharedCatalogue()
      .then((catalogue) => {
        (req as Request & { accessModules?: string[] | null }).accessModules = viewFor(catalogue, accessAccountOf(user)).modules();
        next();
      })
      .catch(next);
  });
};

registerActivityRoutes(app, { requireAuth: requireAuthWithModules, lines: listActivity, summary: activitySummary, sendJson: sendCompressedJson });

// THE LOG'S ARCHIVE (REQUIREMENTS §62, §75): the super admin's count of what is
// old enough to archive, the move itself, and the log read with its archive —
// the same filter as the two routes above (archiveRoutes.ts).
registerActivityArchiveRoutes(app, { requireAuth: requireAuthWithModules, activityFilter: activityFilterOf, sendJson: sendCompressedJson });

app.get("/api/auth/me", async (req: Request, res: Response): Promise<void> => {
  const session = await readSession(req);
  if (!session || "ended" in session) {
    // With the features, so the sign-in screen knows what to offer without a
    // second request (REQUIREMENTS §66) — and nothing else whatever, but the
    // words of how this device's session ended, when it was ended (§106).
    refuseSignedOut(res, session, { features: FEATURES });
    return;
  }
  const { user } = session;
  // A session still open outside the plant's hours (the calendar was changed
  // during the day, say): refused like every other route, so the browser shows
  // the sign-in page with the reason instead of an app that cannot load (§84).
  const refused = await hours.refusal(user);
  if (refused) {
    res.status(403).json({ ...refused, features: FEATURES });
    return;
  }
  res.json({ user, features: FEATURES, mustChangePassword: await mustChangePassword(user.id), session: await hours.sessionAnswer(user, session.endsAt, session.sessionId), hours: await hours.personAnswer(user) });
});

// Same in-memory-per-key throttle shape as the sign-in throttle above, just keyed
// by user id — caps how many model calls one account can
// trigger so a stray loop or accidental spam can't run up the API bill. Twenty
// in ten minutes was sized for Groq's free key (8,000 tokens a minute for the
// whole plant); on the ChatGPT key (REQUIREMENTS §109) a person working with
// Mitra's tools, several rounds a question, would meet it after a few
// questions, so it is sixty there — the day's cost is held by the allowance in
// backend/ai.ts.
const assistantCalls = new Map<string, AttemptRecord>();
const maxAssistantCalls = (): number => (aiProviderName() === "groq" ? 20 : 60);
const ASSISTANT_THROTTLE_WINDOW_MS = 10 * 60 * 1000;

function isAssistantThrottled(userId: string): boolean {
  const rec = assistantCalls.get(userId);
  if (!rec) return false;
  if (Date.now() - rec.first > ASSISTANT_THROTTLE_WINDOW_MS) {
    assistantCalls.delete(userId);
    return false;
  }
  return rec.count >= maxAssistantCalls();
}

/** The words and code a route answers when the day's AI allowance is spent (backend/ai.ts AiAllowanceError); the browser reads the code. */
const DAILY_ALLOWANCE_ANSWER = { error: "The assistant's allowance for today is used up — answers come from this system's own records until tomorrow.", code: "daily-allowance" };
const allowanceSpent = (err: unknown): boolean => (err as { code?: unknown } | null)?.code === "daily-allowance";
// With no AI key a question is answered at once, in plain words with a code, and nothing goes to the log: the
// browser asks anyway (engine/assistantReach.ts) and labels its own answer "not configured" (§72), and a server
// without a key would otherwise write a stack trace for every question asked.
const NOT_CONFIGURED_ANSWER = { error: "The assistant isn't configured on this server (no AI key).", code: "not-configured" };
function recordAssistantCall(userId: string): void {
  const rec = assistantCalls.get(userId) ?? { count: 0, first: Date.now() };
  rec.count += 1;
  assistantCalls.set(userId, rec);
}

// Mitra's spoken lines (POST /api/assistant/speak, REQUIREMENTS §81) have a
// budget of their own: a reminder or a briefing is not a question to the model,
// and counted with the chat they would use up a person's twenty questions.
const speakCalls = new Map<string, AttemptRecord>();
const MAX_SPEAK_CALLS = 40;
const SPEAK_THROTTLE_WINDOW_MS = 10 * 60 * 1000;

// Each throttle only forgets a key when that same key comes back after its
// window, so keys that never return (one-off IPs, users who stopped) would
// otherwise sit in memory until restart. Sweep them once a minute.
function sweepExpired(map: Map<string, AttemptRecord>, windowMs: number): void {
  const now = Date.now();
  for (const [key, rec] of map) if (now - rec.first > windowMs) map.delete(key);
}
setInterval(() => {
  signInThrottle.sweep();
  sweepExpired(signupAttempts, THROTTLE_WINDOW_MS);
  sweepExpired(assistantCalls, ASSISTANT_THROTTLE_WINDOW_MS);
  sweepExpired(speakCalls, SPEAK_THROTTLE_WINDOW_MS);
}, 60 * 1000).unref();

const ROUTE_RE = /^\/[a-z0-9/_-]*$/i;

app.post("/api/assistant/chat", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = (req as AuthedRequest).user.id;
  const { message, today, currentRoute, documentKind, currentData, context, language, recordStatus, evidence, history } = req.body ?? {};

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
  // stops a request from padding out an oversized prompt against the AI
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
  // THE EVIDENCE PACK for a question about history (REQUIREMENTS §75): the
  // figures the browser worked out from the records this person may see
  // (frontend/src/engine/historyDigest.ts) — 6,000 characters at most there,
  // 8,000 here. Same reasoning as the context: it must not pad the prompt.
  if (evidence !== undefined && (typeof evidence !== "string" || evidence.length > 8000)) {
    res.status(400).json({ error: "evidence must be a string of at most 8000 characters." });
    return;
  }
  // THE CONVERSATION SO FAR, for a follow-up ("and the month before?"): at
  // most six turns, each at most 800 characters and 3,000 in all — what the
  // browser sends (historyDigest.ts historyForModel), and no more.
  let turns: { role: "user" | "assistant"; text: string }[] | undefined;
  if (history !== undefined) {
    const list: unknown[] = Array.isArray(history) ? history : [];
    const shaped = list.every((h) => {
      const turn = h as { role?: unknown; text?: unknown } | null;
      return !!turn && typeof turn === "object" && (turn.role === "user" || turn.role === "assistant") && typeof turn.text === "string" && turn.text.length <= 800;
    });
    const total = shaped ? list.reduce<number>((n, h) => n + (h as { text: string }).text.length, 0) : Infinity;
    if (!Array.isArray(history) || list.length > 6 || !shaped || total > 3000) {
      res.status(400).json({ error: "history must be at most 6 short turns." });
      return;
    }
    turns = (list as { role: "user" | "assistant"; text: string }[]).filter((h) => h.text.trim()).map((h) => ({ role: h.role, text: h.text }));
  }
  if (language !== undefined && language !== "en" && language !== "gu") {
    res.status(400).json({ error: "Unsupported language." });
    return;
  }
  if (!aiConfigured()) {
    res.status(503).json(NOT_CONFIGURED_ANSWER);
    return;
  }
  // THE PLANT'S DAILY ALLOWANCE (REQUIREMENTS §75, §109, backend/ai.ts): with
  // 90% of the day's tokens used, the model is not asked at all. The browser
  // shows its own answer with the reason (engine/assistantReach.ts
  // "allowance"), which it reads from `code` — the words are for a person.
  if (assistantAllowanceUsedUp()) {
    res.status(429).json(DAILY_ALLOWANCE_ANSWER);
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
      evidence: typeof evidence === "string" && evidence.trim() ? evidence : undefined,
      history: turns,
    });
    res.json(result);
  } catch (err) {
    if (allowanceSpent(err)) {
      res.status(429).json(DAILY_ALLOWANCE_ANSWER);
      return;
    }
    // Log the real detail server-side (may include a vendor error body from
    // the AI service, with any key taken out: backend/ai.ts redactSecrets) but
    // never forward it to the client — this is the one place in the app that
    // talks to a third-party API, so its raw error text is the one response
    // body worth keeping generic on principle, not just when it happens to
    // contain something sensitive.
    console.error(err);
    res.status(502).json({ error: "The assistant is having trouble right now — try again in a moment." });
  }
});

// ASK MITRA AS AN AGENT (REQUIREMENTS §80, backend/mitraAgent.ts). The browser
// sends the conversation and the schemas of the tools it can run; the model
// answers in words or asks for tool calls, which the BROWSER runs — they act
// on the working copy, the open record and the router, none of which this
// server can reach — before it calls again with the results. One request is
// one round of that loop. The same gate as /chat: the shapes and limits
// (mitraAgent.ts says why each), the plant's daily allowance, then the
// per-user throttle; and the same generic words for a failure.
app.post("/api/assistant/agent", requireAuth, express.json({ limit: "200kb" }), async (req: Request, res: Response): Promise<void> => {
  const userId = (req as AuthedRequest).user.id;
  const checked = validateAgentRequest(req.body);
  if (!checked.ok) {
    res.status(400).json({ error: checked.error });
    return;
  }
  if (!aiConfigured()) {
    res.status(503).json(NOT_CONFIGURED_ANSWER);
    return;
  }
  if (assistantAllowanceUsedUp()) {
    res.status(429).json(DAILY_ALLOWANCE_ANSWER);
    return;
  }
  if (isAssistantThrottled(userId)) {
    res.status(429).json({ error: "Too many assistant requests. Try again in a few minutes." });
    return;
  }
  recordAssistantCall(userId);
  try {
    res.json(await runAgentStep(checked.request));
  } catch (err) {
    if (allowanceSpent(err)) {
      res.status(429).json(DAILY_ALLOWANCE_ANSWER);
      return;
    }
    console.error(err);
    res.status(502).json({ error: "The assistant is having trouble right now — try again in a moment." });
  }
});

// A FILE ATTACHED TO MITRA (REQUIREMENTS §80, backend/attachments.ts): the raw
// bytes, whatever their content type (a file the browser cannot name arrives
// with none), read into text — PDF, Word, Excel, CSV/text, or a picture — and
// forgotten. Only a picture may go to the model (ChatGPT's vision, §109), and
// then it is counted like a chat call against the person's throttle (a person
// over it has the picture read by OCR) and the day's allowance; an unreadable
// file is a 200 with an empty text and a note in plain words, which the
// browser shows on the attachment.
app.post("/api/assistant/extract", requireAuth, express.raw({ type: () => true, limit: MAX_ATTACHMENT_BYTES }), async (req: Request, res: Response): Promise<void> => {
  const userId = (req as AuthedRequest).user.id;
  const body = req.body;
  if (!Buffer.isBuffer(body) || body.length === 0) {
    res.status(400).json({ error: "Choose a file to read." });
    return;
  }
  let fileName = "file";
  try {
    fileName = decodeURIComponent(String(req.get("x-file-name") ?? "file")).slice(0, 200);
  } catch {
    /* a malformed name only loses the extension hint */
  }
  const mime = String(req.get("x-file-type") ?? "").slice(0, 100);
  try {
    const read = await readAttachment(body, fileName, mime || undefined, { pictureByModel: picturesReadByModel() && !isAssistantThrottled(userId) });
    if (read.readBy === "model") recordAssistantCall(userId);
    res.json(read);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "The file couldn't be read." });
  }
});

// WHAT A PERSON SAID TO MITRA (REQUIREMENTS §80, backend/ai.ts aiTranscribe):
// a recording of up to 90 seconds, written down by the AI service (ChatGPT's
// gpt-4o-mini-transcribe since §109; Whisper on Groq). Without a key there is
// nothing to transcribe with, and the browser falls back to its own speech
// recognition on the `code`. Throttled and counted like a chat call; counted
// against the day's allowance by the tokens the service reports (OpenAI's do,
// Whisper's on Groq do not).
const MAX_RECORDING_BYTES = 10 * 1024 * 1024;
const AUDIO_MIME_RE = /^(?:audio|video)\/[a-z0-9.+-]+(?:;[\w\s=.,-]*)?$/i;

app.post("/api/assistant/transcribe", requireAuth, express.raw({ type: () => true, limit: MAX_RECORDING_BYTES }), async (req: Request, res: Response): Promise<void> => {
  const userId = (req as AuthedRequest).user.id;
  if (!aiConfigured()) {
    res.status(503).json({ error: "Voice transcription isn't configured on this server.", code: "not-configured" });
    return;
  }
  const body = req.body;
  if (!Buffer.isBuffer(body) || body.length === 0) {
    res.status(400).json({ error: "No recording was received." });
    return;
  }
  const mimeHeader = String(req.get("x-mime") ?? "").slice(0, 100);
  const mime = AUDIO_MIME_RE.test(mimeHeader) ? mimeHeader : "audio/webm";
  // A language only when the person chose one; "auto" (what the browser sends) lets the model hear which (REQUIREMENTS §89).
  const languageHeader = req.get("x-language");
  const language = languageHeader === "en" || languageHeader === "hi" || languageHeader === "gu" ? languageHeader : undefined;
  if (isAssistantThrottled(userId)) {
    res.status(429).json({ error: "Too many assistant requests. Try again in a few minutes." });
    return;
  }
  recordAssistantCall(userId);
  try {
    res.json(await aiTranscribe({ audio: body, mime, language, prompt: TRANSCRIBE_PROMPT }));
  } catch (err) {
    if (allowanceSpent(err)) {
      res.status(429).json(DAILY_ALLOWANCE_ANSWER);
      return;
    }
    console.error(err);
    res.status(502).json({ error: "The recording couldn't be transcribed — try again, or type the message." });
  }
});

// MITRA'S NATURAL VOICE (REQUIREMENTS §81, §85 and §109, backend/ai.ts aiSpeak, backend/tts.ts).
//
// GET: whether the server can speak — ALWAYS a 200, so a browser finds out
// without an error in its console (§85: "ask once, remember"). Without a key:
// not-configured. Otherwise what the server has learnt of the AI service's voice
// (VoiceAvailability): when nothing is known yet it asks the service ONCE — one
// short line, shared by every browser asking meanwhile, and kept as a clip — and
// remembers the answer (the voice not available to the account: ten minutes; a
// failure: two; a working voice: an hour). The browser keeps the answer for
// recheckAfterMs and asks for lines only when the voice is available
// (frontend/src/utils/voice.ts).
//
// POST: text of up to 600 characters in, one WAV out. Without a key, or while the
// account cannot use the speech model (on Groq, its terms not accepted), the
// answer is a 503 with a code, and the browser says the line with its own best
// voice. Clips are kept in memory (the last 60) — a reminder said again is not
// made again. Its own throttle, never the chat's; never the service's words in
// an answer.
const voiceAvailability = new VoiceAvailability();
let voiceProbe: Promise<void> | null = null;

/** Learns once whether the service will speak, by asking it for VOICE_PROBE_TEXT; every caller meanwhile waits on the same ask. */
function probeVoice(): Promise<void> {
  if (voiceProbe) return voiceProbe;
  const model = ttsModel();
  voiceProbe = aiSpeak({ text: VOICE_PROBE_TEXT, voice: "female" })
    .then((clip) => {
      speechCache.set(speechCacheKey("female", VOICE_PROBE_TEXT), clip);
      voiceAvailability.markAvailable(model);
    })
    .catch((err: unknown) => {
      if (err instanceof VoiceUnavailableError) {
        if (voiceAvailability.markUnavailable(err.model)) console.warn(`Mitra's natural voice is unavailable: ${err.message}`);
      } else {
        voiceAvailability.markFailed(model);
        // The day's allowance spent was said once already, by backend/ai.ts.
        if (!allowanceSpent(err)) console.warn(`Mitra's natural voice could not be reached: ${err instanceof Error ? err.message.slice(0, 200) : String(err)}`);
      }
    })
    .finally(() => {
      voiceProbe = null;
    });
  return voiceProbe;
}

app.get("/api/assistant/speak", requireAuth, async (_req: Request, res: Response): Promise<void> => {
  const voices = { female: ttsVoiceName("female"), male: ttsVoiceName("male") };
  const service = aiProviderName();
  if (!service) {
    res.json(speakStatus("not-configured", ttsModel(), voices));
    return;
  }
  if (!voiceAvailability.current()) await probeVoice();
  const known = voiceAvailability.current();
  const now = Date.now();
  res.json(known ? speakStatus(known.code, known.model, voices, now, known.until, service) : speakStatus("failed", ttsModel(), voices, now, undefined, service));
});

app.post("/api/assistant/speak", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = (req as AuthedRequest).user.id;
  const service = aiProviderName();
  if (!service) {
    res.status(503).json({ error: "Mitra's natural voice isn't configured on this server.", code: "not-configured" });
    return;
  }
  const { text, voice } = (req.body ?? {}) as { text?: unknown; voice?: unknown };
  const said = typeof text === "string" ? text.replace(/\s+/g, " ").trim() : "";
  if (!said) {
    res.status(400).json({ error: "There is nothing to say." });
    return;
  }
  if (said.length > TTS_MAX_TEXT_CHARS) {
    res.status(400).json({ error: `A spoken line is at most ${TTS_MAX_TEXT_CHARS} characters.` });
    return;
  }
  if (voice !== undefined && voice !== "female" && voice !== "male") {
    res.status(400).json({ error: "The voice is female or male." });
    return;
  }
  const kind = voice === "male" ? "male" : "female";
  const key = speechCacheKey(kind, said);
  const cached = speechCache.get(key);
  if (cached) {
    res.type("audio/wav").send(cached);
    return;
  }
  const refusing = voiceAvailability.current();
  if (refusing?.code === "voice-unavailable") {
    const { status, body } = speakFailure(new VoiceUnavailableError(refusing.model, service));
    res.status(status).json(body);
    return;
  }
  const rec = speakCalls.get(userId);
  if (rec && Date.now() - rec.first > SPEAK_THROTTLE_WINDOW_MS) speakCalls.delete(userId);
  const current = speakCalls.get(userId) ?? { count: 0, first: Date.now() };
  if (current.count >= MAX_SPEAK_CALLS) {
    res.status(429).json({ error: "Too many spoken lines. Try again in a few minutes.", code: "throttled" });
    return;
  }
  current.count += 1;
  speakCalls.set(userId, current);
  try {
    const clip = await aiSpeak({ text: said, voice: kind });
    speechCache.set(key, clip);
    if (voiceAvailability.current()?.code !== "available") voiceAvailability.markAvailable(ttsModel());
    res.type("audio/wav").send(clip);
  } catch (err) {
    if (err instanceof VoiceUnavailableError) {
      if (voiceAvailability.markUnavailable(err.model)) console.warn(`Mitra's natural voice is unavailable: ${err.message}`);
    } else if (!allowanceSpent(err)) {
      console.error(err);
    }
    const { status, body } = speakFailure(err);
    res.status(status).json(body);
  }
});

// A CANDIDATE'S CV, READ INTO THE NEW-JOINER FORM (REQUIREMENTS §49, backend/cvExtract.ts).
// The file comes as the raw request body (application/octet-stream), so the
// JSON parser's 100KB limit doesn't apply and nothing is base64-inflated on the
// way; its own cap is 5 MB. The text rules always run; the assistant adds what
// they miss when an AI key is set (backend/ai.ts: ChatGPT since §109), the
// per-user throttle allows it, and CV_READ_WITH_ASSISTANT isn't "0" (the
// network-independent test run sets it). Nothing is stored — the answer goes
// back to the form HR checks.
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
    const useAssistant = process.env.CV_READ_WITH_ASSISTANT !== "0" && aiConfigured() && !isAssistantThrottled(userId);
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
// it's one model call per answer (the short-jobs model, backend/ai.ts).
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
  if (!aiConfigured()) {
    res.status(503).json(NOT_CONFIGURED_ANSWER);
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
    if (allowanceSpent(err)) {
      res.status(429).json(DAILY_ALLOWANCE_ANSWER);
      return;
    }
    console.error(err);
    res.status(502).json({ error: "The assistant is having trouble right now — try again in a moment." });
  }
});

// THE DAY'S AI ALLOWANCE, FOR THE SUPER ADMIN (REQUIREMENTS §109, backend/ai.ts): which service answers ("openai",
// "groq" or null), the day's allowance in tokens (AI_DAILY_TOKEN_BUDGET), what the plant's calls have used today on
// the plant's clock, and where the chat stops (90%). Counted in this server's memory since it started; never a key.
app.get("/api/assistant/usage", requireAdmin, (_req: Request, res: Response): void => {
  res.json(aiUsage());
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

// ESCALATION TO THE SUPER ADMIN AND THE WEEKLY DIGEST (REQUIREMENTS §75):
// /api/escalations, /api/digests/latest and /api/jobs/run, the super admin's
// alone (backend/escalationRoutes.ts).
registerEscalationRoutes(app, { requireAuth, logActivity });

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

// WHO MAY DO WHAT (REQUIREMENTS §96): the super admin's rules, read by everybody, written by the super admin alone
// (backend/accessRulesRoutes.ts) — and THE APP'S DATA, IN POSTGRESQL (REQUIREMENTS §55), handed over and taken in at
// each person's levels (backend/storageRoutes.ts, backend/accessLevels.ts).
const accessRules = registerAccessRulesRoutes(app, { requireAuth, logActivity });
registerStorageRoutes(app, { requireAuth, logActivity, accessRules, archivedRecordIds });
// The super admin's count of the archived blank sheets, "Bring them back", and the move run by hand (REQUIREMENTS §115).
registerArchiveRoutes(app, { requireAdmin, logActivity });

// THE AUDIT ASSISTANT'S API AND THE DATABASE OVERVIEW (REQUIREMENTS §83). New
// routes only, each in a file of its own: /api/v1/* lets another server act as
// the signed-in person through DCRS's own rules (backend/apiV1.ts), and
// /api/overview/* is the super admin's read-only view of the shared database
// (backend/overviewRoutes.ts). Nothing above them changes.
// The same sessions as the website's (§106): a phone signed out in DCRS is refused here at its next request.
registerApiV1(app, { requireAuth, logActivity, sessions: devices });
registerOverviewRoutes(app, { requireAuth, logActivity });
// USER ACCESS (REQUIREMENTS §84): the super admin's view of who may use which module, and every sign-in and sign-out;
// and where each person is signed in now, with "Sign out this device" (§106).
registerAccessRoutes(app, { requireAuth, logActivity, sessions: devices });
// THE ACCOUNTS THE PLANT KEEPS (REQUIREMENTS §110): rename, remove, bring back and "Keep only these", the super admin's
// alone, each one transaction with the access rules (backend/accountRoutes.ts); their sessions ended through the same
// sessions as every sign-in (§106).
registerAccountRoutes(app, { requireAuth, logActivity, sessions: devices });
// EACH PERSON'S NOTIFICATIONS (REQUIREMENTS §97): the bell and the Notifications page (backend/notificationRoutes.ts).
registerNotificationRoutes(app, { requireAuth });
// ...and the notify job ends by pushing them to the phones (backend/push.ts; PUSH_ENABLED=0 sends nothing).
setNotificationDeps(() => ({ push: (now) => runPushes(now) }));
// MITRA ON THE PHONES: where Expo Go finds it on this PC, for the QR card on the Ask Mitra page (backend/phoneApp.ts).
registerPhoneAppRoutes(app, { requireAuth });

// THE WEBSITE AS THE CODE IS NOW (REQUIREMENTS §102): a built website older than its
// code is built again here, before the server answers (backend/websiteBuild.ts). Not
// under `npm run dev`, whose own dev server serves the website on port 5173.
ensureWebsiteBuilt(path.dirname(distDir));

// Single-process production deployment: serve the built frontend (dist/)
// from the same server as the API, so there's one process and one origin to
// run/expose for a pilot (see docs/DEPLOYMENT.md). In dev, the frontend is served
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

// THE SUPER ADMIN'S DATABASE OVERVIEW WITH NO MANUAL STEP (REQUIREMENTS §107, backend/overviewSetup.ts). With
// OVERVIEW_DATABASE_URL unset, DCRS looks whether the overview's schema, roles and views are there and whether its own
// role may read them as overview_viewer; what is missing it adds itself, in one transaction, when its role may (a
// superuser, or CREATEROLE and CREATE on the database), touching nothing of its own tables; otherwise the page says
// the one step. Never stops the start: anything unexpected is said on the page and in one line here.
await prepareOverview({ pool: database });

// THE PLANT'S NAMED ACCOUNTS (REQUIREMENTS §62, §96), added once if they are not
// there: the super admin, who covers every module and assigns everybody else,
// and the twelve people the owner named on 7-Oct-2026 at name.surname@gpp.local
// (backend/seedAccounts.ts) — what each may do is the access rules' to say. Each
// is an ordinary account from then on — its password is changed from the top
// bar, its levels by the super admin — and an account that already exists is
// never touched. NOR IS ONE THE SUPER ADMIN REMOVED OR RENAMED (REQUIREMENTS §110):
// a sign-in a removed account keeps, gave up to another, or an account had before
// a rename is never made again (db.ts seedUser). SEED_ACCOUNTS=0 leaves them out (the test runner does, because
// its first signup has to be the admin). On a plant already running, the super
// admin adds the missing ones from Users & Access ("Create the missing accounts",
// POST /api/access/accounts/create-missing) on a first password of their own.
// THE ACCOUNTS WAITING TO CHOOSE THEIR OWN PASSWORD (REQUIREMENTS §105): passwords are
// the super admin's now, so the wait is lifted once, and an account still on the built-in
// first password, which anybody can read, is locked until the super admin gives it one.
await settleFirstPasswords({ accounts: listAllUsers, verify: verifyPassword, setPassword: setUserPassword, log: (line) => console.log(line) });

if (process.env.SEED_ACCOUNTS !== "0") {
  const chosen = process.env.SEED_ACCOUNT_PASSWORD;
  // A PASSWORD ANYBODY CAN READ IS NOT A PASSWORD (REQUIREMENTS §66, §105). The
  // built-in one is written in the documentation. The super admin's account may
  // start on it and is asked to choose their own; anybody else's starts with no
  // password at all (NO_PASSWORD_YET), until the super admin gives it one in Users & Access.
  // One the administrator chose themselves (SEED_ACCOUNT_PASSWORD) is everybody's
  // first password, and nobody is asked to change it.
  // Only those no account has, ever had or gave up (REQUIREMENTS §110): nothing the super admin removed or renamed.
  for (const a of seedAccountsToAdd(await listAllUsers())) {
    const superAdmin = a.role === "admin";
    const mustChange = superAdmin && !chosen;
    const password = chosen || (superAdmin ? BUILT_IN_FIRST_PASSWORD : null);
    // Accounts that already exist are not touched.
    const added = await seedUser({
      id: crypto.randomUUID(),
      name: a.name,
      email: a.email,
      password_hash: password ? await hashPassword(password) : NO_PASSWORD_YET,
      role: a.role,
      created_at: new Date().toISOString(),
      departments: a.departments,
      must_change_password: mustChange,
      active: true,
      last_sign_in: null,
    });
    if (added) {
      console.log(
        `Added the account ${a.name} <${a.email}> (${a.role === "admin" ? "every module" : a.departments})` +
          (chosen
            ? " — on the password you set in SEED_ACCOUNT_PASSWORD."
            : mustChange
              ? " — on the built-in first password, which it must change at its first sign-in."
              : " — nobody can sign in to it until the super admin gives it a password (Users & Access).")
      );
      void insertActivity([{ userId: null, userName: "System", userEmail: "", action: "Account created", target: a.email, detail: a.role === "admin" ? "Super admin — every module" : `Departments: ${a.departments}` }]).catch(() => undefined);
    }
  }
}

// THE BLANK SHEETS FROM BEFORE GO-LIVE, MOVED TO THE ARCHIVE BY THE SERVER ITSELF (REQUIREMENTS §115): copied into
// records_archive first, then taken out of the records item with the version check, so every browser drops them; a
// crash between the two loses nothing, and the next start finishes. Nothing is deleted; the super admin brings them
// back from Master Data. Never stops the start. ARCHIVE_BLANKS=0 leaves the step out (a test server that plants them).
if (process.env.ARCHIVE_BLANKS !== "0") await archiveAtStartUp();

// NOBODY COULD EVER SIGN IN (REQUIREMENTS §66). With no account on file, no
// seeded accounts and no self-registration, the portal has no way in at all —
// which is worth saying at the top of the terminal rather than leaving somebody
// at a sign-in screen that refuses everything.
if (!ALLOW_SIGNUP) {
  const accounts = await listUsers();
  if (accounts.length === 0) {
    console.warn(
      "\n*** THERE IS NO ACCOUNT TO SIGN IN WITH. ***\n" +
        "Accounts are created by the administrator, and this database has none.\n" +
        "Start once without SEED_ACCOUNTS=0 to add the plant's named accounts,\n" +
        "or once with ALLOW_SIGNUP=1 to create the first administrator yourself.\n"
    );
  }
}

app.listen(PORT, () => {
  console.log(`API server listening on http://localhost:${PORT}`);
  // "On the company network: http://<this PC's address>:<port>", the address laptops and desktops open.
  printCompanyNetwork(PORT);
  // The daily escalation and the weekly digest, on the plant's clock (backend/jobs.ts); JOBS=0 leaves them off.
  startJobs();
});
