import crypto from "node:crypto";
import type { Express, Request, RequestHandler, Response } from "express";
import { hashPassword, type PublicUser } from "./auth.ts";
import { createStaffUser, listUsers, readItem, setUserRole, writeItem, type StoredItem, type UserRow, type WriteResult } from "./db.ts";
import { ACCESS_KEY, AccessCatalogue, catalogueOf } from "./accessLevels.ts";
import { databaseLedger, type LedgerItem, type NotificationLedger } from "./notifications.ts";
import type { AccessRulesWriter } from "./storageRoutes.ts";
import { ACCESS_LEVELS, ACCESS_MODULES, DEFAULT_PEOPLE, LEVEL_WORDS, levelRank, normalizeAccessRules, type AccessAccount, type AccessLevel, type AccessRules } from "../frontend/src/engine/accessRules.ts";
import { PLANT_DEPARTMENTS } from "../frontend/src/data/seed/documentDepartments.ts";

// WHO MAY DO WHAT, SET BY THE SUPER ADMIN (REQUIREMENTS §96).
//
// The owner, 8-Oct-2026: "in our dashboard in the audit software I can give access from there only, and only the
// superadmin can do this: make an option for which user can access what, and give read, write and edit access
// accordingly." The rules are the company item "access" (frontend/src/engine/accessRules.ts AccessRules), kept in
// PostgreSQL beside "master":
//
//   GET  /api/access/rules                     any signed-in account: the rules, their version, and the plant's people
//   PUT  /api/access/rules                     the super admin: { rules, baseVersion } -> { version }; 409 when somebody
//                                              saved in between (the rules are made safe by normalizeAccessRules)
//   POST /api/access/accounts/create-missing   the super admin: an account for each of the plant's twelve people who has
//                                              none, on one first password (at least 8 characters) they change at their
//                                              first sign-in
//   POST /api/users/:id/role                   the super admin: { role: "admin" | "staff" } — never the plant's last
//                                              active super admin to staff; the account is switched on
//
// EVERY CHANGE IS SAID. Each person whose levels changed gets one line in the activity log naming who changed what
// for whom ("Quality Control: Read -> Edit"), and a notification (access_changed) for each thing changed, in the
// words of the level they now have; a change of who answers for a document is a line of its own, and each person
// gained or lost is told. Every account made is a line, and so is a change of role, which the person is told of too.
// The generic storage write of the item (PUT /api/storage/access) comes here as well (backend/storageRoutes.ts):
// there is one way to change the rules, and it is logged.

type LogActivity = (req: Request, who: PublicUser | null, action: string, target?: string, detail?: string, department?: string) => void;
type AuthedRequest = Request & { user: PublicUser };

/** Where the routes read and write: the server's own database by default, a test's stand-in otherwise. */
export interface AccessRulesStore {
  readItem(scope: string, key: string): Promise<StoredItem | null>;
  writeItem(scope: string, key: string, value: string, baseVersion: number | null, by: string, compose?: (stored: string | null) => string): Promise<WriteResult>;
  listUsers(): Promise<UserRow[]>;
  createStaffUser(u: { id: string; name: string; email: string; password_hash: string; created_at: string; departments: string }): Promise<UserRow | null>;
  setUserRole(id: string, role: "admin" | "staff"): ReturnType<typeof setUserRole>;
}

const databaseStore: AccessRulesStore = { readItem, writeItem, listUsers, createStaffUser, setUserRole };

export interface AccessRulesDeps {
  requireAuth: RequestHandler;
  logActivity: LogActivity;
  store?: AccessRulesStore;
  /** The notification ledger (backend/notifications.ts); the server's own by default. */
  ledger?: () => NotificationLedger;
  /** The time now; a test may fix it. */
  clock?: () => Date;
}

const MODULE_NAME = new Map(PLANT_DEPARTMENTS.map((d) => [d.code, d.name] as const));
const moduleName = (code: string): string => MODULE_NAME.get(code) ?? code;
const levelName = (level: AccessLevel | null | undefined): string => (level ? LEVEL_WORDS[level].name : "the owner's table");
const MIN_PASSWORD = 8;

function parseJson(value: string | null | undefined): unknown {
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

const accountOf = (u: Pick<UserRow, "email" | "role" | "departments">): AccessAccount => ({
  email: u.email.toLowerCase(),
  role: u.role,
  departments: String(u.departments ?? "")
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean),
});

// ---------------------------------------------------------------------------
// what changed between two sets of rules

/** One change of one person's own setting. */
export interface PersonChange {
  email: string;
  /** A module's setting (its code) or a document's (its id). */
  on: { module: string } | { documentId: string };
  /** The level set before and after; null when none was set (the owner's table decides). */
  from: AccessLevel | null;
  to: AccessLevel | null;
}

/** One change of who answers for a document. */
export interface AnswersChange {
  documentId: string;
  before: string[];
  after: string[];
}

/** Every change between the rules as they were and as they are now, over a catalogue. */
export function rulesDiff(before: AccessRules, after: AccessRules, catalogue: AccessCatalogue): { people: PersonChange[]; answers: AnswersChange[] } {
  const people: PersonChange[] = [];
  const emails = new Set([...Object.keys(before.people), ...Object.keys(after.people)]);
  for (const email of [...emails].sort()) {
    const was = before.people[email] ?? {};
    const now = after.people[email] ?? {};
    for (const module of ACCESS_MODULES) {
      const from = was.modules?.[module] ?? null;
      const to = now.modules?.[module] ?? null;
      if (from !== to) people.push({ email, on: { module }, from, to });
    }
    const ids = new Set([...Object.keys(was.documents ?? {}), ...Object.keys(now.documents ?? {})]);
    for (const documentId of [...ids].sort()) {
      const from = was.documents?.[documentId] ?? null;
      const to = now.documents?.[documentId] ?? null;
      if (from !== to) people.push({ email, on: { documentId }, from, to });
    }
  }
  const beforeAccess = new AccessCatalogue(catalogue.docs, before).access;
  const afterAccess = new AccessCatalogue(catalogue.docs, after).access;
  const answers: AnswersChange[] = [];
  const ids = new Set([...catalogue.docs.map((d) => d.id), ...Object.keys(before.responsibility), ...Object.keys(after.responsibility)]);
  for (const documentId of [...ids].sort()) {
    const b = before.responsibility[documentId] ?? beforeAccess.responsible(documentId);
    const a = after.responsibility[documentId] ?? afterAccess.responsible(documentId);
    if (b.join(",") !== a.join(",")) answers.push({ documentId, before: b, after: a });
  }
  return { people, answers };
}

// ---------------------------------------------------------------------------
// the routes

export interface AccessRulesService extends AccessRulesWriter {
  /** The rules as stored, made safe, with their version (0 when none are stored). */
  read(): Promise<{ rules: AccessRules; version: number }>;
}

export function registerAccessRulesRoutes(app: Express, deps: AccessRulesDeps): AccessRulesService {
  const { requireAuth, logActivity } = deps;
  const store = deps.store ?? databaseStore;
  const ledger = deps.ledger ?? databaseLedger;
  const clock = deps.clock ?? (() => new Date());

  /** The super admin, or null having answered 403 in the words given. */
  const superAdmin = (req: Request, res: Response, words: string): PublicUser | null => {
    const user = (req as Partial<AuthedRequest>).user;
    if (!user || user.role !== "admin") {
      res.status(403).json({ error: words, code: "super-admin-only" });
      return null;
    }
    return user;
  };

  const catalogueNow = async (rules: AccessRules): Promise<AccessCatalogue> => new AccessCatalogue(catalogueOf((await store.readItem("company", "documents"))?.value ?? null), rules);

  /** Tells one person, in the ledger; a notification that cannot be written never fails the change. */
  const tell = (items: LedgerItem[]): void => {
    if (items.length === 0) return;
    void (async () => {
      const l = ledger();
      for (const item of items) await l.add(item);
    })().catch((err: unknown) => console.error("[access] a notification could not be written:", err instanceof Error ? err.message : err));
  };

  /** The lines and the notifications of one saved change of the rules. */
  const announce = async (req: Request, by: PublicUser, before: AccessRules, after: AccessRules, version: number): Promise<void> => {
    const catalogue = await catalogueNow(after);
    const { people, answers } = rulesDiff(before, after, catalogue);
    if (people.length === 0 && answers.length === 0) return;
    const users = await store.listUsers();
    const byEmail = new Map(users.map((u) => [u.email.toLowerCase(), u] as const));
    const nameOf = (email: string): string => byEmail.get(email)?.name ?? DEFAULT_PEOPLE.find((p) => p.email === email)?.name ?? email;
    const whom = (email: string): string => `${nameOf(email)} <${email}>`;
    const access = catalogue.access;
    const notes: LedgerItem[] = [];
    const noteFor = (email: string, thing: string, data: LedgerItem["data"]): void => {
      const u = byEmail.get(email);
      if (!u || !u.active) return;
      notes.push({ userId: u.id, kind: "access_changed", key: `access_changed|${version}|${thing}`, priority: "medium", data: { ...data, by: by.name } });
    };

    // One line per person, every change of theirs in it.
    const perPerson = new Map<string, string[]>();
    for (const c of people) {
      const what = "module" in c.on ? moduleName(c.on.module) : catalogue.title(c.on.documentId);
      const u = byEmail.get(c.email);
      const account = u ? accountOf(u) : { email: c.email, role: "staff", departments: [] };
      const now = "module" in c.on ? access.moduleLevel(account, c.on.module) : access.level(account, c.on.documentId);
      const toWords = c.to ? levelName(c.to) : `the owner's table (${levelName(now)})`;
      const list = perPerson.get(c.email) ?? [];
      list.push(`${what}: ${levelName(c.from)} → ${toWords}`);
      perPerson.set(c.email, list);
      if ("module" in c.on) noteFor(c.email, `m:${c.on.module}`, { module: c.on.module, level: now });
      else {
        const d = catalogue.byId.get(c.on.documentId);
        noteFor(c.email, `d:${c.on.documentId}`, { documentId: c.on.documentId, documentName: d?.name ?? c.on.documentId, ...(d?.formatNo ? { formatNo: d.formatNo } : {}), ...(d?.department ? { module: d.department } : {}), level: now });
      }
    }
    for (const [email, parts] of perPerson) logActivity(req, by, "Access changed", whom(email).slice(0, 240), parts.join("; ").slice(0, 600));

    for (const a of answers) {
      const d = catalogue.byId.get(a.documentId);
      const names = (list: string[]): string => (list.length ? list.map(nameOf).join(", ") : "nobody (the super admin)");
      logActivity(req, by, "Who answers for a document changed", catalogue.title(a.documentId).slice(0, 240), `${names(a.before)} → ${names(a.after)}`.slice(0, 600), d?.department ?? "");
      for (const email of new Set([...a.before, ...a.after])) {
        if (a.before.includes(email) === a.after.includes(email)) continue;
        const u = byEmail.get(email);
        if (!u) continue;
        noteFor(email, `a:${a.documentId}`, { documentId: a.documentId, documentName: d?.name ?? a.documentId, ...(d?.formatNo ? { formatNo: d.formatNo } : {}), ...(d?.department ? { module: d.department } : {}), level: access.level(accountOf(u), a.documentId) });
      }
    }
    tell(notes);
  };

  const service: AccessRulesService = {
    async read() {
      const item = await store.readItem("company", ACCESS_KEY);
      return { rules: normalizeAccessRules(parseJson(item?.value ?? null)), version: item?.version ?? 0 };
    },
    async save(req, by, rules, baseVersion) {
      const after = normalizeAccessRules(rules);
      let storedBefore: string | null = null;
      const result = await store.writeItem("company", ACCESS_KEY, JSON.stringify(after), baseVersion, by.email, (stored) => {
        storedBefore = stored;
        return JSON.stringify(after);
      });
      if (result.ok) {
        const before = normalizeAccessRules(parseJson(storedBefore));
        await announce(req, by, before, after, result.version).catch((err: unknown) => console.error("[access] the change could not be announced:", err instanceof Error ? err.message : err));
      }
      return result;
    },
  };

  app.get("/api/access/rules", requireAuth, async (_req: Request, res: Response): Promise<void> => {
    const { rules, version } = await service.read();
    res.set("Cache-Control", "no-store");
    res.json({ rules, version, defaults: { people: DEFAULT_PEOPLE } });
  });

  app.put("/api/access/rules", requireAuth, async (req: Request, res: Response): Promise<void> => {
    const me = superAdmin(req, res, "Only the super admin changes who may do what.");
    if (!me) return;
    const body = (req.body ?? {}) as { rules?: unknown; baseVersion?: unknown };
    if (!body.rules || typeof body.rules !== "object" || Array.isArray(body.rules)) {
      res.status(400).json({ error: "Send the rules as an object: { rules, baseVersion }.", code: "bad-request" });
      return;
    }
    if (typeof body.baseVersion !== "number" || !Number.isSafeInteger(body.baseVersion) || body.baseVersion < 0) {
      res.status(400).json({ error: "baseVersion is the version the page read (GET /api/access/rules), 0 when none were stored.", code: "bad-request" });
      return;
    }
    const result = await service.save(req, me, body.rules, body.baseVersion);
    if (result.ok) {
      res.json({ version: result.version });
      return;
    }
    res.status(409).json({
      error: "Somebody saved the access rules after this page read them. Reload and make the change again.",
      code: "stale",
      current: { rules: normalizeAccessRules(parseJson(result.current?.value ?? null)), version: result.current?.version ?? 0 },
    });
  });

  // THE PLANT'S PEOPLE, ONE BUTTON (REQUIREMENTS §96): an account for each of the twelve the owner named who has none,
  // at name.surname@gpp.local, on one first password the super admin types, which they sign in with (§105).
  app.post("/api/access/accounts/create-missing", requireAuth, async (req: Request, res: Response): Promise<void> => {
    const me = superAdmin(req, res, "Only the super admin creates accounts.");
    if (!me) return;
    const password = (req.body ?? {}).password;
    if (typeof password !== "string" || password.length < MIN_PASSWORD) {
      res.status(400).json({ error: "The first password must be at least 8 characters.", code: "bad-request" });
      return;
    }
    const { rules } = await service.read();
    const access = (await catalogueNow(rules)).access;
    const have = new Set((await store.listUsers()).map((u) => u.email.toLowerCase()));
    const created: { name: string; email: string }[] = [];
    const existing: string[] = [];
    for (const person of DEFAULT_PEOPLE) {
      if (have.has(person.email)) {
        existing.push(person.email);
        continue;
      }
      // Kept to the modules they see (what they answer for), which is what a page that still reads departments shows them.
      const modules = access.modules({ email: person.email, role: "staff", departments: [] }).map((m) => m.module);
      const departments = modules.length >= ACCESS_MODULES.length ? "" : modules.join(",");
      const row = await store.createStaffUser({
        id: crypto.randomUUID(),
        name: person.name,
        email: person.email,
        password_hash: await hashPassword(password),
        created_at: clock().toISOString(),
        departments,
      });
      if (!row) {
        existing.push(person.email);
        continue;
      }
      created.push({ name: person.name, email: person.email });
      // The password is never written down — not here, not in the log.
      logActivity(req, me, "Account created by the administrator", `${person.name} <${person.email}>`, `From the plant's list of people (REQUIREMENTS §96); ${departments ? `departments: ${departments.split(",").join(", ")}` : "every department"}; they sign in with the password the super admin typed`);
    }
    res.json({ created, existing });
  });

  // THE SUPER ADMIN, OR STAFF (REQUIREMENTS §96): the role, which no screen could change before 9-Oct-2026.
  app.post("/api/users/:id/role", requireAuth, async (req: Request, res: Response): Promise<void> => {
    const me = superAdmin(req, res, "Only the super admin can make an account the super admin, or staff.");
    if (!me) return;
    const role = (req.body ?? {}).role;
    if (role !== "admin" && role !== "staff") {
      res.status(400).json({ error: 'Say the role: "admin" (the super admin) or "staff".', code: "bad-request" });
      return;
    }
    const done = await store.setUserRole(String(req.params.id ?? ""), role);
    if (!done) {
      res.status(404).json({ error: "No such account.", code: "not-found" });
      return;
    }
    if ("refused" in done) {
      res.status(409).json({ error: "This is the plant's only active super admin. Make another account the super admin first, so the plant always has one.", code: "last-super-admin" });
      return;
    }
    const { row, before } = done;
    const changed = before.role !== row.role || before.active !== row.active;
    if (changed) {
      const roleWords = (r: string): string => (r === "admin" ? "Super admin" : "Staff");
      const detail = [
        before.role !== row.role ? `${roleWords(before.role)} → ${roleWords(row.role)}` : `Still ${roleWords(row.role)}`,
        before.active ? "" : "switched on",
        row.role === "admin" && before.departments ? "every module (no departments kept)" : "",
      ]
        .filter(Boolean)
        .join("; ");
      logActivity(req, me, "Role changed", `${row.name} <${row.email}>`, detail);
      // The person is told, in the words of the level they now have.
      let level: AccessLevel = "edit";
      let what = "every module, as the super admin";
      if (row.role !== "admin") {
        const { rules } = await service.read();
        const top = (await catalogueNow(rules)).access.modules(accountOf(row)).reduce<AccessLevel>((m, x) => (levelRank(x.level) > levelRank(m) ? x.level : m), "none");
        level = ACCESS_LEVELS.includes(top) ? top : "none";
        what = "DCRS, as a member of staff (no longer the super admin)";
      }
      tell([{ userId: row.id, kind: "access_changed", key: `access_changed|role|${clock().getTime()}`, priority: "high", data: { level, documentName: what, by: me.name } }]);
    }
    res.json({
      user: {
        id: row.id,
        name: row.name,
        email: row.email,
        role: row.role,
        departments: String(row.departments ?? "")
          .split(",")
          .map((c) => c.trim().toUpperCase())
          .filter(Boolean),
        createdAt: row.created_at,
        mustChangePassword: row.must_change_password,
        active: row.active,
        lastSignIn: row.last_sign_in,
      },
    });
  });

  return service;
}
