// THE REMINDER EMAILS OVER HTTP: the super admin's alone (the owner, 25-Oct-2026). Registered by backend/index.ts with
// one call; the sending is backend/emailReminders.ts, the tables backend/emailContacts.ts.
//
//   GET    /api/email/contacts           -> { contacts: [{ userId, name, address, language, enabled, setBy, setAt,
//                                             lastFailure, lastFailureAt }] }
//   PUT    /api/email/contacts/:userId   { address, language?: "en" | "gu" | "hi", enabled?: boolean } -> { contact }:
//                                         one plain address of the person's own (engine/reminderEmail.ts reminderAddress:
//                                         never a sign-in, never a name that receives no mail), refused 400 `bad-address`
//                                         with the `problem` and the words why
//   DELETE /api/email/contacts/:userId   -> { removed }
//   GET    /api/email/settings           -> { enabled, setBy, setAt, setup: { mode, serverOn, dailyCap, link, times } }
//   PUT    /api/email/settings           { enabled: boolean } -> the same: the super admin's switch, off until switched on
//   POST   /api/email/test               -> { sent, captured?, reason?, code? }: to the caller's own reminder email, one in
//                                         20 seconds (429 `too-many`)
//   GET    /api/email/log?limit=20       -> { rows: [{ id, userId, name, day, slot, items, state, attempts, subject, body,
//                                             error, claimedAt, sentAt }] }, newest first: never an address
//   POST   /api/reminders/send-digest    -> 410 `retired`, for anybody: THE BROWSER'S DIGEST IS RETIRED. A browser used to
//                                         post its own list of reminders and up to 50 addresses of its choosing, and any
//                                         signed-in account could make the company mailbox send to them (audit M-26);
//                                         the server's own reminder emails, worked out from the ledger, replaced it.
//
// THE SUPER ADMIN'S ALONE, whatever the screen shows: every /api/email route answers 403 `super-admin-only` to anybody
// else, after the same sign-in check as every route (index.ts requireAuth: the session, the hours, the forced password
// change). An address is in no answer but these, never in /api/users/directory, and never in the activity log: its
// lines name the person, the language and on or off, and are the super admin's own (db.ts SUPER_ADMIN_ACTIONS). The
// words of the refusals in English, Gujarati or Hindi (X-Language), engine/accountWords.ts.
import type { Express, Request, RequestHandler, Response } from "express";
import type { PublicUser } from "./auth.ts";
import { EMAIL_ACTIONS, listAllUsers } from "./db.ts";
import { databaseEmailStore, type EmailContact, type EmailLogRow, type EmailStore } from "./emailContacts.ts";
import { emailSetup, sendTestEmail, type TestEmailResult } from "./emailReminders.ts";
import { accountLanguageOf, accountWord, type AccountKey, type AccountLanguage } from "../frontend/src/engine/accountWords.ts";
import { isReminderLanguage, reminderAddress, type ReminderLanguage } from "../frontend/src/engine/reminderEmail.ts";

type LogActivity = (req: Request, who: PublicUser | null, action: string, target?: string, detail?: string, department?: string) => void;
type AuthedRequest = Request & { user?: PublicUser };

/** One test email per person in this long. */
export const TEST_EMAIL_EVERY_MS = 20_000;
const MAX_LOG_ROWS = 200;
const ID_RE = /^[A-Za-z0-9._:-]{1,100}$/;
/** The languages as the activity log names them. */
const LANGUAGE_IN_ENGLISH: Record<ReminderLanguage, string> = { en: "English", gu: "Gujarati", hi: "Hindi" };

/** Who an account is, for the routes: its name, and whether the super admin removed it. */
export interface EmailAccount {
  id: string;
  name: string;
  removed: boolean;
}

export interface EmailRoutesDeps {
  requireAuth: RequestHandler;
  logActivity: LogActivity;
  store?: EmailStore;
  /** Every account, the removed ones too (the database's, by default). */
  accounts?: () => Promise<EmailAccount[]>;
  /** Sends the caller's test email (backend/emailReminders.ts sendTestEmail, by default). */
  testEmail?: (user: PublicUser) => Promise<TestEmailResult>;
  /** The clock the one-test-in-20-seconds rule reads (a test sets it). */
  now?: () => number;
  env?: Record<string, string | undefined>;
}

const databaseAccounts = async (): Promise<EmailAccount[]> => (await listAllUsers()).map((u) => ({ id: u.id, name: u.name, removed: !!u.removed_at }));

/** The words the retired digest route answers with. */
export const DIGEST_RETIRED =
  "The browser's reminder digest is retired: DCRS's server now emails each person's reminders itself, to the reminder email the super admin sets on Users & Access.";

export function registerEmailRoutes(app: Express, deps: EmailRoutesDeps): void {
  const { requireAuth, logActivity } = deps;
  const store = (): EmailStore => deps.store ?? databaseEmailStore();
  const accounts = deps.accounts ?? databaseAccounts;
  const env = () => deps.env ?? process.env;

  const languageOf = (req: Request): AccountLanguage => accountLanguageOf(req.get("x-language"));
  const refuse = (res: Response, status: number, code: string, req: Request, key: AccountKey, vars: Record<string, string | number> = {}, more: Record<string, unknown> = {}): void => {
    res.status(status).json({ error: accountWord(languageOf(req), key, vars), code, ...more });
  };

  /** The super admin, or null having answered 403. */
  const superAdmin = (req: Request, res: Response): PublicUser | null => {
    const user = (req as AuthedRequest).user;
    if (!user || user.role !== "admin") {
      refuse(res, 403, "super-admin-only", req, "err.email.superAdminOnly");
      return null;
    }
    res.set("Cache-Control", "no-store");
    return user;
  };

  const unavailable = (res: Response, err: unknown): void => {
    console.error("[email]", err instanceof Error ? err.message : err);
    res.status(503).json({ error: "DCRS could not read the reminder emails just now. Try again in a moment.", code: "database-unavailable" });
  };

  const contactJson = (c: EmailContact, nameOf: (id: string) => string | null) => ({ ...c, name: nameOf(c.userId) });
  const logJson = (r: EmailLogRow, nameOf: (id: string) => string | null) => ({
    id: r.id,
    userId: r.userId,
    name: nameOf(r.userId),
    day: r.day,
    slot: r.slot,
    items: r.items,
    state: r.state,
    attempts: r.attempts,
    subject: r.subject,
    body: r.body,
    error: r.error,
    claimedAt: r.claimedAt,
    sentAt: r.sentAt,
  });
  const namesNow = async (): Promise<(id: string) => string | null> => {
    const byId = new Map((await accounts()).map((a) => [a.id, a.name] as const));
    return (id) => byId.get(id) ?? null;
  };

  // THE BROWSER'S DIGEST, RETIRED (see the top of this file): said plainly, to anybody, and nothing is sent.
  app.post("/api/reminders/send-digest", (_req: Request, res: Response): void => {
    res.status(410).json({ error: DIGEST_RETIRED, code: "retired" });
  });

  app.get("/api/email/contacts", requireAuth, async (req: Request, res: Response): Promise<void> => {
    if (!superAdmin(req, res)) return;
    try {
      const nameOf = await namesNow();
      res.json({ contacts: (await store().contacts()).map((c) => contactJson(c, nameOf)) });
    } catch (err) {
      unavailable(res, err);
    }
  });

  app.put("/api/email/contacts/:userId", requireAuth, async (req: Request, res: Response): Promise<void> => {
    const me = superAdmin(req, res);
    if (!me) return;
    const userId = String(req.params.userId ?? "");
    const body = (req.body ?? {}) as { address?: unknown; language?: unknown; enabled?: unknown };
    const checked = reminderAddress(body.address);
    if (!checked.ok) {
      refuse(res, 400, "bad-address", req, `err.email.${checked.problem}` as AccountKey, {}, { problem: checked.problem });
      return;
    }
    if (body.language !== undefined && !isReminderLanguage(body.language)) {
      refuse(res, 400, "bad-language", req, "err.email.badLanguage");
      return;
    }
    if (body.enabled !== undefined && typeof body.enabled !== "boolean") {
      refuse(res, 400, "bad-enabled", req, "err.email.badEnabled");
      return;
    }
    try {
      const person = ID_RE.test(userId) ? (await accounts()).find((a) => a.id === userId) : undefined;
      if (!person) {
        refuse(res, 404, "no-such-account", req, "err.noSuchAccount");
        return;
      }
      if (person.removed) {
        refuse(res, 409, "removed-account", req, "err.email.removedAccount", { name: person.name });
        return;
      }
      const language = isReminderLanguage(body.language) ? body.language : "en";
      const enabled = body.enabled !== false;
      const contact = await store().setContact({ userId, address: checked.address, language, enabled, setBy: me.name });
      // Who and how, never the address (REQUIREMENTS §62: the log names the person; the mailbox is the super admin's to know).
      logActivity(req, me, EMAIL_ACTIONS.set, person.name, `Emails in ${LANGUAGE_IN_ENGLISH[language]}; ${enabled ? "on" : "off"}`, "");
      res.json({ contact: { ...contact, name: person.name } });
    } catch (err) {
      unavailable(res, err);
    }
  });

  app.delete("/api/email/contacts/:userId", requireAuth, async (req: Request, res: Response): Promise<void> => {
    const me = superAdmin(req, res);
    if (!me) return;
    const userId = String(req.params.userId ?? "");
    try {
      const removed = ID_RE.test(userId) ? await store().removeContact(userId) : false;
      if (removed) {
        const nameOf = await namesNow();
        logActivity(req, me, EMAIL_ACTIONS.removed, nameOf(userId) ?? userId, "No reminder emails go to this person now", "");
      }
      res.json({ removed });
    } catch (err) {
      unavailable(res, err);
    }
  });

  const settingsAnswer = async () => ({ ...(await store().settings()), setup: emailSetup(env()) });

  app.get("/api/email/settings", requireAuth, async (req: Request, res: Response): Promise<void> => {
    if (!superAdmin(req, res)) return;
    try {
      res.json(await settingsAnswer());
    } catch (err) {
      unavailable(res, err);
    }
  });

  app.put("/api/email/settings", requireAuth, async (req: Request, res: Response): Promise<void> => {
    const me = superAdmin(req, res);
    if (!me) return;
    const enabled = (req.body ?? {}).enabled;
    if (typeof enabled !== "boolean") {
      refuse(res, 400, "bad-enabled", req, "err.email.badEnabled");
      return;
    }
    try {
      const before = await store().settings();
      await store().setSettings(enabled, me.name);
      if (before.enabled !== enabled) {
        logActivity(req, me, enabled ? EMAIL_ACTIONS.on : EMAIL_ACTIONS.off, "Reminder emails", enabled ? "Each person with a reminder email is emailed what is still open for them" : "No reminder email is sent until they are switched on again", "");
      }
      res.json(await settingsAnswer());
    } catch (err) {
      unavailable(res, err);
    }
  });

  // "Send me a test email": to the caller's own reminder email, at most once in 20 seconds.
  const lastTest = new Map<string, number>();
  const clock = deps.now ?? (() => Date.now());
  app.post("/api/email/test", requireAuth, async (req: Request, res: Response): Promise<void> => {
    const me = superAdmin(req, res);
    if (!me) return;
    const at = clock();
    if (at - (lastTest.get(me.id) ?? -Infinity) < TEST_EMAIL_EVERY_MS) {
      res.status(429).json({ error: "A test email was sent a moment ago. Wait 20 seconds and try again.", code: "too-many" });
      return;
    }
    lastTest.set(me.id, at);
    let result: TestEmailResult;
    try {
      result = await (deps.testEmail ?? ((user: PublicUser) => sendTestEmail(user, { store: store(), env: env() })))(me);
    } catch (err) {
      unavailable(res, err);
      return;
    }
    logActivity(req, me, EMAIL_ACTIONS.test, me.name, result.sent ? (result.captured ? "Captured on this server (EMAIL_TRANSPORT=capture): nothing left the PC" : "Sent to the super admin's reminder email") : `Not sent: ${result.reason ?? "no reason given"}`.slice(0, 600), "");
    res.json(result);
  });

  app.get("/api/email/log", requireAuth, async (req: Request, res: Response): Promise<void> => {
    if (!superAdmin(req, res)) return;
    const raw = typeof req.query.limit === "string" ? req.query.limit : "20";
    const limit = /^\d{1,4}$/.test(raw) ? Math.min(Math.max(Number(raw), 1), MAX_LOG_ROWS) : 20;
    try {
      const nameOf = await namesNow();
      res.json({ rows: (await store().latest(limit)).map((r) => logJson(r, nameOf)) });
    } catch (err) {
      unavailable(res, err);
    }
  });
}
