// WHO IS SIGNED IN WHERE, AND ON HOW MANY DEVICES (REQUIREMENTS §106).
//
// The owner, 9-Oct-2026: "Superadmin can also see that where devices has logged in like one can login up to 2
// devices and that Superadmin can see easily like where the ids are logged in like with device name and category like
// it is a laptop/computer or mobile."
//
// EVERY SESSION IS A ROW OF user_sessions (backend/db.ts), keyed by the id its token carries (backend/auth.ts
// sessionKeyOf): the account, the device (an id the website keeps in the browser, or the phone's, sent by the Mitra
// server), the device's name in words and its category, the website or the phone app, the browser or the app, the
// system, the address, when it was signed in, last used and ends, and when, why and by whom it was ended. Until
// 9-Oct-2026 a token was only signed, so a sign-out could not end one. Now the server reads the session on every request:
//   * a sign-out ends it, and so does the super admin's "Sign out this device": the device's next request is answered
//     401 `session-ended` with the reason in words (engine/deviceWords.ts), and the website and the phone go back to
//     the sign-in screen saying it;
//   * the day's end still ends it (§84): its row ends when its token does;
//   * a token made before this change has no row: it is taken in once, its device "signed in before devices were
//     recorded", so the release signs nobody out;
//   * "last used" is written at most once a minute per session.
//
// AT MOST DCRS_MAX_DEVICES DEVICES PER ACCOUNT (2 unless set; "off" or 0: no limit). A sign-in from a device that already
// has a session replaces that session, and so does a sign-in carrying the account's own session (its cookie): no double
// count. One device more is refused with 403 `device-limit`, naming the devices and since when, and what to do. The
// super admin is never held to it (§84: the owner must never be locked out), but his devices are listed too.
//
// THE PHONE. The Mitra server signs in to DCRS on a person's behalf (POST /api/auth/login) and says which phone in
// X-Mitra-Device-* headers, which DCRS trusts only beside X-Mitra-Key matching MITRA_SERVER_KEY, set on both servers:
// compared in constant time, never logged, never in an answer. Without it the session is still a mobile phone on the
// Mitra phone app (the Mitra server says it is the app, X-Client-Name, as plainly as a browser says what it is), but
// not named, said so in words (MITRA_UNNAMED_NAME), at the Mitra server's address, a device of its own at each sign-in.
//
// The rules are here, over a store: PostgreSQL's (the server's) or one in memory (the unit tests', and the API's
// default in a test); backend/tests/deviceSessions.test.ts holds both to them. The routes are backend/index.ts (sign-in,
// sign-out, every request), backend/apiV1.ts (the same check for a server calling as a person) and
// backend/accessRoutes.ts (the super admin's "Signed in on" and "Sign out this device").
import crypto from "node:crypto";
import { database, plantTimeZone, transaction, withClient } from "./db.ts";
import {
  BEFORE_DEVICES_NAME,
  DEVICE_LIMIT_CODE,
  MITRA_UNNAMED_NAME,
  PLACE_WORDS,
  SESSION_ENDED_CODE,
  deviceLimitRefusal,
  sessionEndedWords,
  type DeviceCategory,
  type DeviceLanguage,
  type SessionEndReason,
  type SessionPlace,
} from "../frontend/src/engine/deviceWords.ts";

/** How many devices an account may be signed in on at once, unless DCRS_MAX_DEVICES says otherwise. */
export const DEFAULT_MAX_DEVICES = 2;
/** "Last used" is written at most this often per session. */
export const TOUCH_EVERY_MS = 60_000;
/** A MITRA_SERVER_KEY shorter than this is not used: anybody could guess it. */
export const MIN_KEY_LENGTH = 16;
/** The first part of the two-part lock one account's sign-in holds (db.ts keeps the list of locks). */
const SIGN_IN_LOCK = 4714;

/**
 * The most devices an account may be signed in on (DCRS_MAX_DEVICES): 2 unless set, a whole number from 1 to 50, or
 * null for no limit ("off", "0", "no" or "false" — the e2e runner's test servers, whose suites open many sessions per
 * account). Anything else unreadable keeps the 2.
 */
export function maxDevicesOf(env: Record<string, string | undefined> = process.env): number | null {
  const v = (env.DCRS_MAX_DEVICES ?? "").trim().toLowerCase();
  if (v === "") return DEFAULT_MAX_DEVICES;
  if (v === "off" || v === "0" || v === "no" || v === "false") return null;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? Math.min(n, 50) : DEFAULT_MAX_DEVICES;
}

let shortKeyWarned = false;

/**
 * MITRA_SERVER_KEY, the secret the Mitra server proves itself with: "" when it is not set, or too short to be used
 * (said once in the server's log, never with the key).
 */
export function mitraServerKey(env: Record<string, string | undefined> = process.env): string {
  const key = (env.MITRA_SERVER_KEY ?? "").trim();
  if (key && key.length < MIN_KEY_LENGTH) {
    if (!shortKeyWarned) {
      shortKeyWarned = true;
      console.warn(`[devices] MITRA_SERVER_KEY is shorter than ${MIN_KEY_LENGTH} characters, so it is not used and phones are not named. Set a longer one on both servers.`);
    }
    return "";
  }
  return key;
}

/**
 * Whether the key a request sent is the Mitra server's: compared in constant time (both are hashed to the same length
 * first, so neither a wrong character's place nor the length shows in the time taken). Never true while no key is set.
 */
export function mitraKeyMatches(sent: unknown, configured: string): boolean {
  if (typeof sent !== "string" || sent === "" || !configured) return false;
  const a = crypto.createHash("sha256").update(sent, "utf8").digest();
  const b = crypto.createHash("sha256").update(configured, "utf8").digest();
  return crypto.timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// the device

/** What a session was signed in on. */
export interface DeviceFacts {
  /** The device's own id: the browser's (frontend/src/utils/deviceId.ts) or the phone's; "" when none was sent. */
  id: string;
  /** The device in words: "Windows computer - Chrome", "iPhone - Safari", "Parth's phone (Pixel 8)". */
  name: string;
  category: DeviceCategory;
  place: SessionPlace;
  /** The browser or the app: "Chrome 141", "Mitra app 1.1.0". */
  client: string;
  /** The system: "Windows", "Android 14", "iOS 18.1". */
  system: string;
  /** The address it came from. */
  address: string;
}

/** A request as this module reads it: a header by its name, the caller's address, and the sign-in's body. */
export interface DeviceRequest {
  header(name: string): string | undefined;
  ip: string;
  body?: unknown;
}

const clip = (v: unknown, n: number): string => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, n) : "");
const DEVICE_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const ADDRESS_RE = /^[0-9A-Fa-f:.]{2,45}$/;

/** An address as people read it: an IPv4 address the server saw through IPv6 loses its "::ffff:". */
export function plainAddress(ip: unknown): string {
  return clip(ip, 64).replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/, "");
}

const BROWSERS: [RegExp, string][] = [
  [/\bEdg(?:e|A|iOS)?\/(\d+)/, "Edge"],
  [/\bOPR\/(\d+)/, "Opera"],
  [/\bSamsungBrowser\/(\d+)/, "Samsung Internet"],
  [/\b(?:Firefox|FxiOS)\/(\d+)/, "Firefox"],
  [/\b(?:HeadlessChrome|Chrome|CriOS)\/(\d+)/, "Chrome"],
  [/\bVersion\/(\d+)[^ ]* (?:Mobile\/\S+ )?Safari\//, "Safari"],
];

/** What a browser's user agent says of it: its name in words, its category, the browser and the system. `browser` is false for a program. */
export function describeUserAgent(
  userAgent: string,
  hints: { mobile?: string; platform?: string } = {},
  touchPoints = 0
): { name: string; category: DeviceCategory; client: string; system: string; browser: boolean } {
  const ua = userAgent || "";
  let browserName = "";
  let browserVersion = "";
  for (const [re, name] of BROWSERS) {
    const m = re.exec(ua);
    if (m) {
      browserName = name;
      browserVersion = m[1] ?? "";
      break;
    }
  }
  const platformHint = (hints.platform ?? "").replace(/"/g, "").trim().toLowerCase();
  const ios = /\bOS (\d+)(?:_(\d+))?[_\d]* like Mac OS X/.exec(ua);
  const iosVersion = ios ? `${ios[1]}${ios[2] ? `.${ios[2]}` : ""}` : "";
  let kind: "windows" | "android" | "iphone" | "ipad" | "mac" | "chromeos" | "linux" | "other" = "other";
  let system = "";
  if (/\bWindows NT\b/.test(ua) || platformHint === "windows") {
    kind = "windows";
    system = "Windows";
  } else if (/\bAndroid\b/.test(ua) || platformHint === "android") {
    kind = "android";
    const v = /\bAndroid\s+(\d+)/.exec(ua);
    system = v ? `Android ${v[1]}` : "Android";
  } else if (/\biPad\b/.test(ua)) {
    kind = "ipad";
    system = iosVersion ? `iPadOS ${iosVersion}` : "iPadOS";
  } else if (/\b(?:iPhone|iPod)\b/.test(ua)) {
    kind = "iphone";
    system = iosVersion ? `iOS ${iosVersion}` : "iOS";
  } else if (/\bCrOS\b/.test(ua) || platformHint === "chrome os" || platformHint === "chromeos") {
    kind = "chromeos";
    system = "ChromeOS";
  } else if (/\bMacintosh\b|\bMac OS X\b/.test(ua) || platformHint === "macos") {
    // An iPad asks for the desktop site in a Mac's words: only its touch screen tells it apart.
    kind = touchPoints > 1 ? "ipad" : "mac";
    system = kind === "ipad" ? "iPadOS" : "macOS";
  } else if (/\bLinux\b/.test(ua) || platformHint === "linux") {
    kind = "linux";
    system = "Linux";
  }
  const phoneHint = hints.mobile === "?1";
  let category: DeviceCategory = "computer";
  if (kind === "iphone") category = "mobile";
  else if (kind === "ipad") category = "tablet";
  else if (kind === "android") category = /\bMobile\b/.test(ua) || phoneHint ? "mobile" : "tablet";
  else if (kind === "other" && (/\bMobi/.test(ua) || phoneHint)) category = "mobile";
  const isBrowser = /^Mozilla\/\d/.test(ua) && browserName !== "";
  const shown = browserName || "a browser";
  const named: Record<typeof kind, string> = {
    windows: `Windows computer - ${shown}`,
    mac: `Mac computer - ${shown}`,
    linux: `Linux computer - ${shown}`,
    chromeos: `Chromebook - ${shown}`,
    android: category === "mobile" ? `Android phone - ${shown}` : `Android tablet - ${shown}`,
    iphone: `iPhone - ${shown}`,
    ipad: `iPad - ${shown}`,
    other: category === "mobile" ? `Phone - ${shown}` : `Computer - ${shown}`,
  };
  return {
    name: named[kind],
    category,
    client: browserName ? `${browserName}${browserVersion ? ` ${browserVersion}` : ""}` : clip(ua.split(/[\s/]/)[0], 40),
    system,
    browser: isBrowser,
  };
}

/** A header the Mitra server sends a phone's facts in: percent-encoded UTF-8, so a name in Gujarati travels as ASCII. */
function phoneHeader(req: DeviceRequest, name: string, max: number): string {
  const raw = req.header(name);
  if (!raw) return "";
  try {
    return clip(decodeURIComponent(raw), max);
  } catch {
    return clip(raw, max);
  }
}

/**
 * THE PHONE, AS THE MITRA SERVER SAYS IT (read only beside the right X-Mitra-Key): the phone's own id, the name its
 * owner gave it and its model ("Parth's phone (Pixel 8)"), its system, the app's version, the kind of device (phone,
 * tablet or desktop, as the app reads it) and the address the Mitra server saw it at.
 */
export function describePhone(req: DeviceRequest): Omit<DeviceFacts, "place"> {
  const id = phoneHeader(req, "x-mitra-device-id", 100);
  const owner = phoneHeader(req, "x-mitra-device-name", 80);
  const model = phoneHeader(req, "x-mitra-device-model", 80);
  const system = phoneHeader(req, "x-mitra-device-system", 60);
  const type = phoneHeader(req, "x-mitra-device-type", 20).toLowerCase();
  const app = phoneHeader(req, "x-mitra-app-version", 30);
  const address = phoneHeader(req, "x-mitra-device-address", 64);
  let category: DeviceCategory = "mobile";
  if (type === "tablet" || /\biPad/i.test(`${model} ${system}`)) category = "tablet";
  else if (type === "desktop" || (type !== "phone" && /^(windows|mac ?os|macos|web|linux)/i.test(system))) category = "computer";
  const name = owner && model && owner.toLowerCase() !== model.toLowerCase() ? `${owner} (${model})` : owner || model || "A phone";
  return {
    id: DEVICE_ID_RE.test(id) ? id : id ? `phone-${crypto.createHash("sha256").update(id).digest("hex").slice(0, 24)}` : "",
    name,
    category,
    client: app ? `Mitra app ${app}` : "Mitra app",
    system,
    address: ADDRESS_RE.test(address) ? plainAddress(address) : "",
  };
}

/** What the website's sign-in says of the browser (frontend/src/utils/deviceId.ts): its id, and how many touch points its screen has. */
function browserFacts(body: unknown): { id: string; touchPoints: number } {
  const device = body && typeof body === "object" ? (body as { device?: unknown }).device : undefined;
  if (!device || typeof device !== "object") return { id: "", touchPoints: 0 };
  const { id, touchPoints } = device as { id?: unknown; touchPoints?: unknown };
  return {
    id: typeof id === "string" && DEVICE_ID_RE.test(id) ? id : "",
    touchPoints: typeof touchPoints === "number" && Number.isFinite(touchPoints) ? Math.max(0, Math.min(20, Math.floor(touchPoints))) : 0,
  };
}

/** A device's sign-in line in the activity log: "Windows computer - Chrome (Website) from 10.0.0.5". */
export function deviceLine(d: Pick<DeviceFacts, "name" | "place" | "address">): string {
  return `${d.name} (${PLACE_WORDS.en[d.place] ?? d.place})${d.address ? ` from ${d.address}` : ""}`;
}

// ---------------------------------------------------------------------------
// the sessions

/** One session, as its row holds it. */
export interface SessionRecord {
  id: string;
  userId: string;
  device: DeviceFacts;
  signedInAt: Date;
  lastUsedAt: Date;
  endsAt: Date;
  endedAt: Date | null;
  endedWhy: SessionEndReason | null;
  /** The account that ended it: the person, or the super admin. */
  endedBy: string | null;
}

/** What a sign-in may do: go ahead, ending the sessions named in `replace`; or not, the account's places being held by `holding`. */
export type SignInDecision = { ok: true; replace: string[] } | { ok: false; holding: SessionRecord[] };

/**
 * THE RULE OF A SIGN-IN, over the account's open sessions. Its sessions on this very device (the same id), and the one
 * the request itself still carries, are replaced, never counted. Beyond them, an account held to the limit that has as
 * many devices signed in as it may is refused, naming them; a device counts once, however many of its sessions are open.
 */
export function decideSignIn(open: readonly SessionRecord[], device: Pick<DeviceFacts, "id">, rule: { limit: number | null; exempt: boolean; replace: readonly string[] }): SignInDecision {
  const replace = open.filter((s) => (device.id !== "" && s.device.id === device.id) || rule.replace.includes(s.id)).map((s) => s.id);
  if (rule.exempt || rule.limit === null) return { ok: true, replace };
  const holding: SessionRecord[] = [];
  const seen = new Set<string>();
  for (const s of open) {
    if (replace.includes(s.id)) continue;
    const key = s.device.id || `session:${s.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    holding.push(s);
  }
  return holding.length >= rule.limit ? { ok: false, holding } : { ok: true, replace };
}

/** Where the sessions are kept: PostgreSQL (postgresSessionStore) on the server, memory (memorySessionStore) in a test. */
export interface SessionStore {
  /**
   * One sign-in, under the account's own lock so two at once cannot both pass the limit: `decide` is handed the
   * account's open sessions (not ended, not past their end), oldest first; on its yes the replaced ones end and `row`
   * is added. Answers what `decide` said.
   */
  begin(row: SessionRecord, decide: (open: SessionRecord[]) => SignInDecision): Promise<SignInDecision>;
  get(id: string): Promise<SessionRecord | null>;
  /** Adds a row for a session started before rows were kept, unless one is there already; answers the row as stored. */
  adopt(row: SessionRecord): Promise<SessionRecord>;
  /** Ends a session still open; answers it as ended, or null when it was not open (no such session, or ended already). */
  end(id: string, why: SessionEndReason, by: string | null, at: Date): Promise<SessionRecord | null>;
  /** Ends every open session of one account; answers how many. */
  endAll(userId: string, why: SessionEndReason, by: string | null, at: Date): Promise<number>;
  /** Writes when it was last used. */
  touch(id: string, at: Date): Promise<void>;
  /** Every open session (not ended, not past its end), oldest first. */
  open(at: Date): Promise<SessionRecord[]>;
}

const isOpen = (s: SessionRecord, at: Date): boolean => s.endedAt === null && s.endsAt.getTime() > at.getTime();
const bySignIn = (a: SessionRecord, b: SessionRecord): number => a.signedInAt.getTime() - b.signedInAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const copyOf = (s: SessionRecord): SessionRecord => ({ ...s, device: { ...s.device } });

/** The sessions in memory: the same rules as PostgreSQL's, for the unit tests and an API test's own server. */
export function memorySessionStore(): SessionStore & { rows: Map<string, SessionRecord> } {
  const rows = new Map<string, SessionRecord>();
  return {
    rows,
    async begin(row, decide) {
      // No await between reading and writing: nothing else runs in between, as the lock makes it in PostgreSQL.
      const open = [...rows.values()].filter((s) => s.userId === row.userId && isOpen(s, row.signedInAt)).sort(bySignIn).map(copyOf);
      const decision = decide(open);
      if (!decision.ok) return decision;
      for (const id of decision.replace) {
        const s = rows.get(id);
        if (s && s.endedAt === null) Object.assign(s, { endedAt: row.signedInAt, endedWhy: "replaced", endedBy: row.userId });
      }
      rows.set(row.id, copyOf(row));
      return decision;
    },
    async get(id) {
      const s = rows.get(id);
      return s ? copyOf(s) : null;
    },
    async adopt(row) {
      if (!rows.has(row.id)) rows.set(row.id, copyOf(row));
      return copyOf(rows.get(row.id) as SessionRecord);
    },
    async end(id, why, by, at) {
      const s = rows.get(id);
      if (!s || s.endedAt !== null) return null;
      Object.assign(s, { endedAt: at, endedWhy: why, endedBy: by });
      return copyOf(s);
    },
    async endAll(userId, why, by, at) {
      let n = 0;
      for (const s of rows.values()) {
        if (s.userId === userId && isOpen(s, at)) {
          Object.assign(s, { endedAt: at, endedWhy: why, endedBy: by });
          n += 1;
        }
      }
      return n;
    },
    async touch(id, at) {
      const s = rows.get(id);
      if (s && s.endedAt === null && s.lastUsedAt.getTime() < at.getTime()) s.lastUsedAt = at;
    },
    async open(at) {
      return [...rows.values()].filter((s) => isOpen(s, at)).sort(bySignIn).map(copyOf);
    },
  };
}

interface SessionRow {
  id: string;
  user_id: string;
  device_id: string;
  device_name: string;
  device_category: string;
  place: string;
  device_client: string;
  device_system: string;
  address: string;
  signed_in_at: Date;
  last_used_at: Date;
  ends_at: Date;
  ended_at: Date | null;
  ended_why: string | null;
  ended_by: string | null;
}

const COLUMNS = "id, user_id, device_id, device_name, device_category, place, device_client, device_system, address, signed_in_at, last_used_at, ends_at, ended_at, ended_why, ended_by";
const INSERT = `INSERT INTO user_sessions (id, user_id, device_id, device_name, device_category, place, device_client, device_system, address, signed_in_at, last_used_at, ends_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`;
const CATEGORIES: readonly DeviceCategory[] = ["computer", "mobile", "tablet"];
const PLACES: readonly SessionPlace[] = ["website", "phone-app", "api"];
const REASONS: readonly SessionEndReason[] = ["signed-out", "super-admin", "replaced", "account-off"];

function recordOf(r: SessionRow): SessionRecord {
  return {
    id: r.id,
    userId: r.user_id,
    device: {
      id: r.device_id,
      name: r.device_name,
      category: (CATEGORIES as readonly string[]).includes(r.device_category) ? (r.device_category as DeviceCategory) : "computer",
      place: (PLACES as readonly string[]).includes(r.place) ? (r.place as SessionPlace) : "website",
      client: r.device_client,
      system: r.device_system,
      address: r.address,
    },
    signedInAt: new Date(r.signed_in_at),
    lastUsedAt: new Date(r.last_used_at),
    endsAt: new Date(r.ends_at),
    endedAt: r.ended_at ? new Date(r.ended_at) : null,
    endedWhy: r.ended_why && (REASONS as readonly string[]).includes(r.ended_why) ? (r.ended_why as SessionEndReason) : r.ended_at ? "signed-out" : null,
    endedBy: r.ended_by,
  };
}

const insertValues = (s: SessionRecord): unknown[] => [
  s.id,
  s.userId,
  s.device.id,
  s.device.name,
  s.device.category,
  s.device.place,
  s.device.client,
  s.device.system,
  s.device.address,
  s.signedInAt,
  s.lastUsedAt,
  s.endsAt,
];

/** The sessions in the server's PostgreSQL (backend/db.ts user_sessions). */
export function postgresSessionStore(): SessionStore {
  const get = async (id: string): Promise<SessionRecord | null> => {
    const { rows } = await database().query<SessionRow>(`SELECT ${COLUMNS} FROM user_sessions WHERE id = $1`, [id]);
    return rows[0] ? recordOf(rows[0]) : null;
  };
  return {
    begin: (row, decide) =>
      withClient((client) =>
        transaction(client, async () => {
          await client.query("SELECT pg_advisory_xact_lock($1::int, hashtext($2::text))", [SIGN_IN_LOCK, row.userId]);
          const found = await client.query<SessionRow>(`SELECT ${COLUMNS} FROM user_sessions WHERE user_id = $1 AND ended_at IS NULL AND ends_at > $2 ORDER BY signed_in_at, id`, [row.userId, row.signedInAt]);
          const decision = decide(found.rows.map(recordOf));
          if (!decision.ok) return decision;
          if (decision.replace.length > 0) {
            await client.query("UPDATE user_sessions SET ended_at = $2, ended_why = 'replaced', ended_by = $3 WHERE id = ANY($1::text[]) AND ended_at IS NULL", [decision.replace, row.signedInAt, row.userId]);
          }
          await client.query(INSERT, insertValues(row));
          return decision;
        })
      ),
    get,
    async adopt(row) {
      await database().query(`${INSERT} ON CONFLICT (id) DO NOTHING`, insertValues(row));
      return (await get(row.id)) ?? row;
    },
    async end(id, why, by, at) {
      const { rows } = await database().query<SessionRow>(`UPDATE user_sessions SET ended_at = $2, ended_why = $3, ended_by = $4 WHERE id = $1 AND ended_at IS NULL RETURNING ${COLUMNS}`, [id, at, why, by]);
      return rows[0] ? recordOf(rows[0]) : null;
    },
    async endAll(userId, why, by, at) {
      const result = await database().query("UPDATE user_sessions SET ended_at = $2, ended_why = $3, ended_by = $4 WHERE user_id = $1 AND ended_at IS NULL AND ends_at > $2", [userId, at, why, by]);
      return result.rowCount ?? 0;
    },
    async touch(id, at) {
      await database().query("UPDATE user_sessions SET last_used_at = $2 WHERE id = $1 AND ended_at IS NULL AND last_used_at < $2", [id, at]);
    },
    async open(at) {
      const { rows } = await database().query<SessionRow>(`SELECT ${COLUMNS} FROM user_sessions WHERE ended_at IS NULL AND ends_at > $1 ORDER BY signed_in_at, id`, [at]);
      return rows.map(recordOf);
    },
  };
}

// ---------------------------------------------------------------------------
// the server's door, over a store

/** A session as the super admin's page reads it (backend/accessRoutes.ts, frontend/src/api/accessApi.ts). */
export interface DeviceSessionJson {
  id: string;
  userId: string;
  name: string;
  category: DeviceCategory;
  place: SessionPlace;
  client: string;
  system: string;
  address: string;
  signedInAt: string;
  lastUsedAt: string;
  endsAt: string;
  /** Taken in from before devices were recorded (its name says so). */
  before: boolean;
}

export function sessionJson(s: SessionRecord): DeviceSessionJson {
  return {
    id: s.id,
    userId: s.userId,
    name: s.device.name,
    category: s.device.category,
    place: s.device.place,
    client: s.device.client,
    system: s.device.system,
    address: s.device.address,
    signedInAt: s.signedInAt.toISOString(),
    lastUsedAt: s.lastUsedAt.toISOString(),
    endsAt: s.endsAt.toISOString(),
    before: s.device.name === BEFORE_DEVICES_NAME,
  };
}

/** The 403 of a sign-in on one device too many: the words, and the devices that hold the places. */
export interface DeviceLimitBody {
  error: string;
  code: typeof DEVICE_LIMIT_CODE;
  limit: number;
  devices: { name: string; category: DeviceCategory; place: SessionPlace; since: string; sinceText: string }[];
}

/** The 401 of a request whose session was ended: the words, why, and when. */
export interface SessionEndedBody {
  error: string;
  code: typeof SESSION_ENDED_CODE;
  why: SessionEndReason;
  endedAt: string;
  endedAtText: string;
}

/** What a request's token says of its session, for the check. */
export interface SessionClaim {
  /** backend/auth.ts sessionKeyOf. */
  sessionId: string;
  userId: string;
  issuedAt: Date | null;
  endsAt: Date;
  request: DeviceRequest;
}

export interface DeviceSessionsOptions {
  /** PostgreSQL's by default. */
  store?: SessionStore;
  clock?: () => Date;
  /** DCRS_MAX_DEVICES by default; null for no limit. */
  limit?: number | null;
  /** MITRA_SERVER_KEY by default; "" trusts no phone's headers. */
  mitraKey?: string;
  /** The factory's time zone, for the times in words: PLANT_TIMEZONE by default. */
  timeZone?: () => string;
}

export interface DeviceSessions {
  readonly limit: number | null;
  /** Whether the Mitra server can name the phones (MITRA_SERVER_KEY is set here). */
  readonly phonesNamed: boolean;
  /** The device a request comes from. */
  deviceOf(req: DeviceRequest): DeviceFacts;
  /** Starts a session (its row) under the limit: ok, or the devices that hold the account's places. */
  signIn(input: { sessionId: string; user: { id: string; role: string }; device: DeviceFacts; endsAt: Date; replace?: readonly string[] }): Promise<{ ok: true; replaced: number } | { ok: false; holding: SessionRecord[] }>;
  /** A request's session: open (taken in once if it was made before sessions were kept), or ended. */
  check(claim: SessionClaim): Promise<{ ok: true; session: SessionRecord; adopted: boolean } | { ok: false; session: SessionRecord }>;
  /** The person's own sign-out: "ended" when it ended now, "already" when it had been ended before (no second line). */
  signOut(claim: SessionClaim): Promise<"ended" | "already">;
  get(id: string): Promise<SessionRecord | null>;
  end(id: string, why: SessionEndReason, by: string | null): Promise<SessionRecord | null>;
  endAll(userId: string, why: SessionEndReason, by: string | null): Promise<number>;
  /** Every open session, oldest first. */
  open(): Promise<SessionRecord[]>;
  /** The 403 of a refused sign-in, in a language. */
  limitRefusal(holding: readonly SessionRecord[], lang: DeviceLanguage): DeviceLimitBody;
  /** The 401 of an ended session, in a language; null for a session that simply ran to its end (the plain 401). */
  endedRefusal(session: SessionRecord, lang: DeviceLanguage): SessionEndedBody | null;
}

export function createDeviceSessions(opts: DeviceSessionsOptions = {}): DeviceSessions {
  const store = opts.store ?? postgresSessionStore();
  const clock = opts.clock ?? (() => new Date());
  const limit = opts.limit === undefined ? maxDevicesOf() : opts.limit;
  const key = opts.mitraKey === undefined ? mitraServerKey() : opts.mitraKey;
  const zone = opts.timeZone ?? plantTimeZone;
  // When each session was last written as used, by this server: with the row's own, at most once a minute.
  const touched = new Map<string, number>();

  /** A moment on the factory's clock: "09:02" today, "08-Oct 17:40" on an earlier day. */
  const timeText = (at: Date): string => {
    let tz = zone();
    try {
      new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    } catch {
      tz = "Asia/Kolkata";
    }
    const day = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
    const time = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
    if (day(at) === day(clock())) return time;
    const date = new Intl.DateTimeFormat("en-GB", { timeZone: tz, day: "2-digit", month: "short" }).format(at).replace(" ", "-");
    return `${date} ${time}`;
  };

  const deviceOf = (req: DeviceRequest): DeviceFacts => {
    const address = plainAddress(req.ip);
    // The phone, through the Mitra server: its headers are believed only beside the right key.
    if (key && mitraKeyMatches(req.header("x-mitra-key"), key)) {
      const phone = describePhone(req);
      return { ...phone, place: "phone-app", address: phone.address || address };
    }
    const sent = browserFacts(req.body);
    const seen = describeUserAgent(clip(req.header("user-agent"), 400), { mobile: req.header("sec-ch-ua-mobile"), platform: req.header("sec-ch-ua-platform") }, sent.touchPoints);
    if (seen.browser) return { id: sent.id, name: seen.name, category: seen.category, place: "website", client: seen.client, system: seen.system, address };
    // Another program signing in for somebody: the Mitra server without the key (or with one that does not match), or
    // another server (the Audit Assistant). It is a device of its own at each sign-in, at the address it came from.
    // The Mitra server signs in only for its phone app, so its sign-in is a mobile phone on the Mitra phone app, not a
    // computer (the owner asked to see at a glance which devices are mobiles; review of 12-Oct-2026): only which phone
    // is not known. Any other program's name is only its label (X-Client-Name), said as such.
    const label = clip(req.header("x-client-name"), 60);
    if (/mitra/i.test(label)) return { id: "", name: MITRA_UNNAMED_NAME, category: "mobile", place: "phone-app", client: label, system: "", address };
    return {
      id: "",
      name: `${label || seen.client || "A program"} - through the DCRS API`,
      category: "computer",
      place: "api",
      client: label || seen.client,
      system: "",
      address,
    };
  };

  const adoptRow = (claim: SessionClaim, now: Date): SessionRecord => {
    const seen = deviceOf(claim.request);
    return {
      id: claim.sessionId,
      userId: claim.userId,
      device: { ...seen, id: "", name: BEFORE_DEVICES_NAME },
      signedInAt: claim.issuedAt ?? now,
      lastUsedAt: now,
      endsAt: claim.endsAt,
      endedAt: null,
      endedWhy: null,
      endedBy: null,
    };
  };

  return {
    limit,
    phonesNamed: key !== "",
    deviceOf,
    async signIn(input) {
      const now = clock();
      const row: SessionRecord = { id: input.sessionId, userId: input.user.id, device: input.device, signedInAt: now, lastUsedAt: now, endsAt: input.endsAt, endedAt: null, endedWhy: null, endedBy: null };
      const exempt = input.user.role === "admin";
      const decision = await store.begin(row, (open) => decideSignIn(open, input.device, { limit, exempt, replace: input.replace ?? [] }));
      if (!decision.ok) return { ok: false, holding: decision.holding };
      touched.set(row.id, now.getTime());
      return { ok: true, replaced: decision.replace.length };
    },
    async check(claim) {
      const now = clock();
      let session = await store.get(claim.sessionId);
      let adopted = false;
      if (!session) {
        // Made before sessions were kept (no row): taken in once, so the release signs nobody out (§106).
        session = await store.adopt(adoptRow(claim, now));
        adopted = true;
      }
      if (session.userId !== claim.userId || session.endedAt !== null || session.endsAt.getTime() <= now.getTime()) return { ok: false, session };
      const last = Math.max(touched.get(session.id) ?? 0, session.lastUsedAt.getTime());
      if (now.getTime() - last >= TOUCH_EVERY_MS) {
        if (touched.size > 20_000) touched.clear();
        touched.set(session.id, now.getTime());
        void store.touch(session.id, now).catch((err: unknown) => console.error("[devices] last used not written:", err instanceof Error ? err.message : err));
      }
      return { ok: true, session, adopted };
    },
    async signOut(claim) {
      const now = clock();
      const session = (await store.get(claim.sessionId)) ?? (await store.adopt(adoptRow(claim, now)));
      if (session.userId !== claim.userId || session.endedAt !== null) return "already";
      const ended = await store.end(session.id, "signed-out", claim.userId, now);
      return ended ? "ended" : "already";
    },
    get: (id) => store.get(id),
    end: (id, why, by) => store.end(id, why, by, clock()),
    endAll: (userId, why, by) => store.endAll(userId, why, by, clock()),
    open: () => store.open(clock()),
    limitRefusal(holding, lang) {
      const devices = holding.map((s) => ({ name: s.device.name, category: s.device.category, place: s.device.place, since: s.signedInAt.toISOString(), sinceText: timeText(s.signedInAt) }));
      return {
        error: deviceLimitRefusal(
          lang,
          devices.map((d) => ({ name: d.name, place: d.place, since: d.sinceText }))
        ),
        code: DEVICE_LIMIT_CODE,
        limit: limit ?? holding.length,
        devices,
      };
    },
    endedRefusal(session, lang) {
      if (session.endedAt === null || session.endedWhy === null) return null;
      const at = timeText(session.endedAt);
      return { error: sessionEndedWords(lang, session.endedWhy, at), code: SESSION_ENDED_CODE, why: session.endedWhy, endedAt: session.endedAt.toISOString(), endedAtText: at };
    },
  };
}
