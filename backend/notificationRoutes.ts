// EACH PERSON'S NOTIFICATIONS, OVER HTTP (REQUIREMENTS §97; the contract is docs/api/dcrs-api.openapi.json and
// docs/chatbot-integration.md "Notifications and the phone").
//
//   the website, by its session cookie (registered by backend/index.ts):
//     GET  /api/notifications?state=open|all&limit=50&before=<id>&lang=en|hi|gu   -> { items, unread, open }
//     POST /api/notifications/read  { ids?: number[], all?: true }               -> { unread }
//   the phone, through the Mitra server as the person (registered by backend/apiV1.ts behind its signedIn):
//     GET  /api/v1/notifications ...  and  POST /api/v1/notifications/read        the same
//     POST /api/v1/devices  { token, platform, language, appVersion?, deviceName? } -> { ok: true }
//     DELETE /api/v1/devices { token }                                            -> { ok: true }
//     GET/PUT /api/v1/notification-preferences  { kinds, reminders? }             -> the same
//
// EVERY ANSWER IS THE CALLER'S OWN: the person comes from the session, never from the request, so nobody reads or marks
// another person's items. The titles and bodies are worded on every read, in the language asked
// (frontend/src/engine/notificationText.ts), from the facts the ledger keeps (backend/notifications.ts).
import type { Express, Request, RequestHandler, Response } from "express";
import type { PublicUser } from "./auth.ts";
import { clientName } from "./findingsCore.ts";
import { databaseLedger, type DeviceInput, type NotificationLedger, type PreferencesChange, type StoredNotification } from "./notifications.ts";
import { isNotificationLanguage, notificationWords, type NotificationLanguage } from "../frontend/src/engine/notificationText.ts";
import { NOTIFICATION_KINDS, type NotificationKind } from "../frontend/src/engine/notificationPlan.ts";

type LogActivity = (req: Request, who: PublicUser | null, action: string, target?: string, detail?: string, department?: string) => void;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const MAX_IDS = 500;
/** An Expo push token: ExponentPushToken[...] (or ExpoPushToken[...]). */
export const EXPO_TOKEN_RE = /^Expo(nent)?PushToken\[[^\]\s]{6,180}\]$/;

function fail(res: Response, status: number, code: string, error: string): void {
  res.status(status).json({ error, code });
}

const unavailable = (res: Response, err: unknown): void => {
  console.error("[notifications]", err instanceof Error ? err.message : err);
  fail(res, 503, "database-unavailable", "DCRS could not read the notifications just now. Try again in a moment.");
};

/** One item as the contract gives it: worded in the language asked, never from stored text. */
export function itemJson(n: StoredNotification, lang: NotificationLanguage) {
  const words = notificationWords(n.kind, n.data, lang);
  return { id: n.id, kind: n.kind, priority: n.priority, title: words.title, body: words.body, data: n.data, createdAt: n.createdAt, readAt: n.readAt, resolvedAt: n.resolvedAt };
}

/** The list's query, read and checked; a sentence when it is not one this route accepts. */
export function readListQuery(q: Record<string, unknown>): { state: "open" | "all"; limit: number; before?: number; lang: NotificationLanguage } | { error: string } {
  const state = q.state === undefined ? "open" : q.state;
  if (state !== "open" && state !== "all") return { error: 'state must be "open" or "all".' };
  const limitRaw = q.limit === undefined ? String(DEFAULT_LIMIT) : q.limit;
  if (typeof limitRaw !== "string" || !/^\d{1,4}$/.test(limitRaw) || Number(limitRaw) < 1) return { error: `limit must be a whole number from 1 to ${MAX_LIMIT}.` };
  const beforeRaw = q.before;
  if (beforeRaw !== undefined && (typeof beforeRaw !== "string" || !/^\d{1,15}$/.test(beforeRaw))) return { error: "before must be the id of an item, a whole number." };
  const lang = q.lang === undefined ? "en" : q.lang;
  if (!isNotificationLanguage(lang)) return { error: "lang must be en, hi or gu." };
  return { state, limit: Math.min(Number(limitRaw), MAX_LIMIT), ...(beforeRaw !== undefined ? { before: Number(beforeRaw) } : {}), lang };
}

/** The read request: ids (at most 500 whole numbers) or all: true. */
export function readMarkBody(body: unknown): readonly number[] | "all" | null {
  const b = (body ?? {}) as { ids?: unknown; all?: unknown };
  if (b.all === true) return "all";
  if (!Array.isArray(b.ids) || b.ids.length === 0 || b.ids.length > MAX_IDS) return null;
  if (!b.ids.every((x) => typeof x === "number" && Number.isSafeInteger(x) && x > 0)) return null;
  return b.ids as number[];
}

/** The device's registration, checked; a sentence when it is not one this route accepts. */
export function readDevice(body: unknown): DeviceInput | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.token !== "string" || !EXPO_TOKEN_RE.test(b.token.trim())) return { error: "token must be an Expo push token, ExponentPushToken[...]." };
  if (b.platform !== "android" && b.platform !== "ios") return { error: 'platform must be "android" or "ios".' };
  if (!isNotificationLanguage(b.language)) return { error: "language must be en, hi or gu." };
  if (b.appVersion !== undefined && (typeof b.appVersion !== "string" || b.appVersion.length > 40)) return { error: "appVersion must be text of at most 40 characters." };
  if (b.deviceName !== undefined && (typeof b.deviceName !== "string" || b.deviceName.length > 120)) return { error: "deviceName must be text of at most 120 characters." };
  return {
    token: b.token.trim(),
    platform: b.platform,
    language: b.language,
    ...(typeof b.appVersion === "string" ? { appVersion: b.appVersion.trim() } : {}),
    ...(typeof b.deviceName === "string" ? { deviceName: b.deviceName.replace(/[\x00-\x1f]/g, " ").trim() } : {}),
  };
}

/** The preferences' change, checked: kinds of notifications, each true or false, and the phone's reminders. */
export function readPreferences(body: unknown): PreferencesChange | { error: string } {
  const b = (body ?? {}) as { kinds?: unknown; reminders?: unknown };
  if (b.kinds !== undefined && (typeof b.kinds !== "object" || b.kinds === null || Array.isArray(b.kinds))) return { error: "kinds must name notification kinds, each true or false." };
  const kinds: Partial<Record<NotificationKind, boolean>> = {};
  for (const [k, v] of Object.entries((b.kinds ?? {}) as Record<string, unknown>)) {
    if (!(NOTIFICATION_KINDS as readonly string[]).includes(k) || typeof v !== "boolean") return { error: `kinds must name notification kinds (${NOTIFICATION_KINDS.join(", ")}), each true or false.` };
    kinds[k as NotificationKind] = v;
  }
  if (b.reminders !== undefined && typeof b.reminders !== "boolean") return { error: "reminders must be true or false." };
  return { kinds, ...(typeof b.reminders === "boolean" ? { reminders: b.reminders } : {}) };
}

type Who = (req: Request, res: Response) => PublicUser;

/** The list the website and the phone share, for whoever `who` says is calling. */
function listHandler(who: Who, ledger: () => NotificationLedger): RequestHandler {
  return async (req: Request, res: Response): Promise<void> => {
    res.set("Cache-Control", "no-store");
    const q = readListQuery(req.query as Record<string, unknown>);
    if ("error" in q) return fail(res, 400, "bad-request", q.error);
    try {
      const found = await ledger().list(who(req, res).id, { state: q.state, limit: q.limit, ...(q.before !== undefined ? { before: q.before } : {}) });
      res.json({ items: found.items.map((n) => itemJson(n, q.lang)), unread: found.unread, open: found.open });
    } catch (err) {
      unavailable(res, err);
    }
  };
}

/** "Mark read", the website's and the phone's, for whoever `who` says is calling. */
function readHandler(who: Who, ledger: () => NotificationLedger): RequestHandler {
  return async (req: Request, res: Response): Promise<void> => {
    res.set("Cache-Control", "no-store");
    const which = readMarkBody(req.body);
    if (which === null) return fail(res, 400, "bad-request", `Send ids (a list of at most ${MAX_IDS} whole numbers) or all: true.`);
    try {
      res.json({ unread: await ledger().markRead(who(req, res).id, which) });
    } catch (err) {
      unavailable(res, err);
    }
  };
}

/** The website's routes, behind backend/index.ts's requireAuth (the session cookie, the hours, the forced password change). */
export function registerNotificationRoutes(app: Express, deps: { requireAuth: RequestHandler; ledger?: NotificationLedger }): void {
  const ledger = () => deps.ledger ?? databaseLedger();
  const who: Who = (req) => (req as Request & { user: PublicUser }).user;
  app.get("/api/notifications", deps.requireAuth, listHandler(who, ledger));
  app.post("/api/notifications/read", deps.requireAuth, readHandler(who, ledger));
}

export interface NotificationRoutesV1Deps {
  /** backend/apiV1.ts signedIn: the session, the account, the hours, the password. */
  signedIn: RequestHandler;
  callerOf: (res: Response) => { user: PublicUser };
  logActivity: LogActivity;
  ledger?: NotificationLedger;
}

/** The phone's routes, behind backend/apiV1.ts's signedIn. */
export function registerNotificationRoutesV1(app: Express, deps: NotificationRoutesV1Deps): void {
  const { signedIn, callerOf } = deps;
  const ledger = () => deps.ledger ?? databaseLedger();
  const who: Who = (_req, res) => callerOf(res).user;
  app.get("/api/v1/notifications", signedIn, listHandler(who, ledger));
  app.post("/api/v1/notifications/read", signedIn, readHandler(who, ledger));

  app.post("/api/v1/devices", signedIn, async (req: Request, res: Response): Promise<void> => {
    const device = readDevice(req.body);
    if ("error" in device) return fail(res, 400, "bad-request", device.error);
    const { user } = callerOf(res);
    try {
      await ledger().registerDevice(user.id, device);
    } catch (err) {
      return unavailable(res, err);
    }
    // Who and which phone, never the token (it is the key to the person's notifications).
    deps.logActivity(req, user, "Phone registered for notifications", device.deviceName || device.platform, `Through ${clientName(req.get("x-client-name"))}: ${device.platform}, ${device.language}${device.appVersion ? `, app ${device.appVersion}` : ""}`);
    res.json({ ok: true });
  });

  app.delete("/api/v1/devices", signedIn, async (req: Request, res: Response): Promise<void> => {
    const token = (req.body as { token?: unknown } | undefined)?.token;
    if (typeof token !== "string" || !token.trim() || token.length > 200) return fail(res, 400, "bad-request", "token is needed.");
    const { user } = callerOf(res);
    try {
      await ledger().removeDevice(user.id, token.trim());
    } catch (err) {
      return unavailable(res, err);
    }
    res.json({ ok: true });
  });

  app.get("/api/v1/notification-preferences", signedIn, async (_req: Request, res: Response): Promise<void> => {
    try {
      res.json(await ledger().getPreferences(callerOf(res).user.id));
    } catch (err) {
      unavailable(res, err);
    }
  });

  app.put("/api/v1/notification-preferences", signedIn, async (req: Request, res: Response): Promise<void> => {
    const change = readPreferences(req.body);
    if ("error" in change) return fail(res, 400, "bad-request", change.error);
    const { user } = callerOf(res);
    let now;
    try {
      now = await ledger().setPreferences(user.id, change);
    } catch (err) {
      return unavailable(res, err);
    }
    const off = NOTIFICATION_KINDS.filter((k) => !now.kinds[k]);
    deps.logActivity(req, user, "Notification choices changed", user.email, `Through ${clientName(req.get("x-client-name"))}: ${off.length ? `not pushed: ${off.join(", ")}` : "every kind pushed"}${typeof now.reminders === "boolean" ? `; the phone's own reminders ${now.reminders ? "on" : "off"}` : ""}`);
    res.json(now);
  });
}
