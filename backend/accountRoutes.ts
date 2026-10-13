import type { Express, Request, RequestHandler, Response } from "express";
import type { PublicUser } from "./auth.ts";
import {
  bringBackAccount,
  formerSignIns,
  listAllUsers,
  removeAccounts,
  renameAccount,
  type AccessItemsNow,
  type BringBackOutcome,
  type RemoveOutcome,
  type RenameChange,
  type RenameOutcome,
  type UserRow,
} from "./db.ts";
import { hasNoPasswordYet } from "./passwordPolicy.ts";
import { catalogueOf } from "./accessLevels.ts";
import type { SessionEndReason } from "../frontend/src/engine/deviceWords.ts";
import { moveAccount, normalizeAccessRules } from "../frontend/src/engine/accessRules.ts";
import { RELEASED_MARK, releasedFrom, shownSignIn, signInAddress } from "../frontend/src/engine/accountNames.ts";
import { accountLanguageOf, accountWord, type AccountKey, type AccountLanguage } from "../frontend/src/engine/accountWords.ts";

// THE ACCOUNTS THE PLANT KEEPS (REQUIREMENTS §110): RENAME, REMOVE, BRING BACK, KEEP ONLY THESE.
//
// The owner, 12-Oct-2026: "So now make sure change username kapilabarad01@gmail.com change to kapila barad only and also
// remove all others except kapila, superadmin, admin, vinay, sandeep and bharat, chirag, ankur, dharmik". Before this
// nobody could rename an account or remove one: Users & Access could only switch one off.
//
//   POST /api/users/:id/rename       { name, email, replace? } -> { user, replaced, signedOut }. The name and the
//                                    sign-in ("kapila.barad" is taken as kapila.barad@gpp.local). A sign-in another
//                                    account holds is refused, 409 `sign-in-used`; when that account has never been used
//                                    (never signed in, no session, nothing of its own in the log or the storage), 409
//                                    `sign-in-unused` with the holder, and the same request with `replace: true` removes
//                                    it and gives its sign-in to this account in one step. What the super admin set for
//                                    the account and the documents it fills move with it to the new sign-in (the access
//                                    rules, engine/accessRules.ts moveAccount); its sessions end ("renamed", it signs in
//                                    again); names already written on records stay as written.
//   POST /api/users/:id/remove       -> { user, already }. Stamped removed, switched off, every session ended (phones too):
//                                    gone from every list of people, the notifications, the reminders, the minus score
//                                    and who fills what; nothing deleted. Never the super admin's own account (400
//                                    `own-account`), never the plant's last super admin who can sign in (409
//                                    `last-super-admin`).
//   POST /api/users/:id/bring-back   -> { user, signIn, holder }. On the list again, switched on or off as it was.
//   POST /api/users/keep-only        { keep: [ids], remove: [ids] } -> { removed }. Every account on the list but those
//                                    kept (and the super admin's own) removed in one step, and only when that is exactly
//                                    `remove`, the list the page showed before the confirm (409 `list-changed`
//                                    otherwise, with the list now).
//
// THE SUPER ADMIN'S ALONE, WHATEVER THE SCREEN SHOWS: every route answers 403 `super-admin-only` to anybody else, after
// the same sign-in check as every route (requireAuth). Every change is written in the activity log, old and new. Each
// is one transaction of PostgreSQL with the access rules (backend/db.ts renameAccount, removeAccounts,
// bringBackAccount): the removed accounts are listed in them ("removed"), so nobody answers for anything through one.
// The words of every answer in English, Gujarati or Hindi (X-Language), engine/accountWords.ts.

type LogActivity = (req: Request, who: PublicUser | null, action: string, target?: string, detail?: string, department?: string) => void;

/** Where the routes read and change the accounts: PostgreSQL by default (backend/db.ts), a test's stand-in otherwise. */
export interface AccountsStore {
  listAllUsers(): Promise<UserRow[]>;
  renameAccount: typeof renameAccount;
  removeAccounts: typeof removeAccounts;
  bringBackAccount: typeof bringBackAccount;
}

const databaseAccounts: AccountsStore = { listAllUsers, renameAccount, removeAccounts, bringBackAccount };

/** Ends an account's sessions (backend/deviceSessions.ts endAll): how many were open. */
export interface SessionsEnder {
  endAll(userId: string, why: SessionEndReason, by: string | null): Promise<number>;
}

export interface AccountRoutesDeps {
  requireAuth: RequestHandler;
  logActivity: LogActivity;
  /** Where each person is signed in (§106): the server's own sessions. */
  sessions: SessionsEnder;
  store?: AccountsStore;
  /** The time now; a test may fix it. */
  clock?: () => Date;
}

// ---------------------------------------------------------------------------
// an account as Users & Access shows it

/** An account as the super admin's Users & Access reads it (GET /api/users and every answer here): never a password or its hash. */
export interface ManagedAccount {
  id: string;
  name: string;
  email: string;
  role: "admin" | "staff";
  departments: string[];
  createdAt: string;
  mustChangePassword: boolean;
  noPasswordYet: boolean;
  active: boolean;
  lastSignIn: string | null;
  /** When the super admin removed it (§110); null while it is on the list. */
  removedAt: string | null;
  /** Who removed it, by name; null while it is on the list. */
  removedBy: string | null;
  /** The sign-in it gave up to another account (a rename's "replace it"), or null. */
  signInGivenUp: string | null;
  /** The sign-ins it had before it was renamed. */
  formerSignIns: string[];
}

const splitCodes = (value: unknown): string[] =>
  String(value ?? "")
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);

/** The account as Users & Access shows it; `nameOf` names the super admin who removed it. */
export function managedAccount(row: UserRow, nameOf: (id: string) => string | null = () => null): ManagedAccount {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role === "admin" ? "admin" : "staff",
    departments: splitCodes(row.departments),
    createdAt: row.created_at,
    mustChangePassword: !!row.must_change_password,
    noPasswordYet: hasNoPasswordYet(row),
    active: row.active !== false,
    lastSignIn: row.last_sign_in ?? null,
    removedAt: row.removed_at ?? null,
    removedBy: row.removed_at && row.removed_by ? (nameOf(row.removed_by) ?? null) : null,
    signInGivenUp: releasedFrom(row.email),
    formerSignIns: formerSignIns(row),
  };
}

/** "Kapila Barad <kapila.barad@gpp.local>", as the activity log names an account. */
const named = (u: Pick<UserRow, "name" | "email">): string => `${u.name} <${shownSignIn(u.email)}>`.slice(0, 240);

// ---------------------------------------------------------------------------
// the access rules, rewritten with each change

function parseJson(value: string | null): unknown {
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/** The new value of the access item, or null when the change leaves the rules as they were (nothing is written then). */
function rulesValue(now: AccessItemsNow, next: unknown): string | null {
  const before = normalizeAccessRules(parseJson(now.access));
  const after = normalizeAccessRules(next);
  return JSON.stringify(after) === JSON.stringify(before) ? null : JSON.stringify(after);
}

/** A rename: what was set for the account and who it fills for go to the new sign-in; a replaced account's given-up sign-in is listed as removed. */
export function composeRename(now: AccessItemsNow, change: RenameChange): string | null {
  const moved = moveAccount(parseJson(now.access), catalogueOf(now.documents), change.from, change.to);
  const removed = [...(moved.removed ?? []), ...(change.released ? [change.released] : [])];
  return rulesValue(now, { ...moved, removed });
}

/** Accounts removed: their sign-ins on the removed list. */
export function composeRemoval(now: AccessItemsNow, emails: readonly string[]): string | null {
  const rules = normalizeAccessRules(parseJson(now.access));
  return rulesValue(now, { ...rules, removed: [...(rules.removed ?? []), ...emails] });
}

/** An account brought back: off the removed list, by the sign-in it had and by the one it has now. */
export function composeBringBack(now: AccessItemsNow, change: { was: string; now: string }): string | null {
  const rules = normalizeAccessRules(parseJson(now.access));
  return rulesValue(now, { ...rules, removed: (rules.removed ?? []).filter((e) => e !== change.was.toLowerCase() && e !== change.now.toLowerCase()) });
}

// ---------------------------------------------------------------------------
// the routes

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;
const MAX_NAME_LENGTH = 100;
/** The most accounts one "Keep only these" names. */
const MAX_LISTED = 2000;

type AuthedRequest = Request & { user?: PublicUser };

export function registerAccountRoutes(app: Express, deps: AccountRoutesDeps): void {
  const { requireAuth, logActivity, sessions } = deps;
  const store = deps.store ?? databaseAccounts;
  const clock = deps.clock ?? (() => new Date());

  const languageOf = (req: Request): AccountLanguage => accountLanguageOf(req.get("x-language"));
  const refuse = (res: Response, status: number, code: string, lang: AccountLanguage, key: AccountKey, vars: Record<string, string | number> = {}, more: Record<string, unknown> = {}): void => {
    res.status(status).json({ error: accountWord(lang, key, vars), code, ...more });
  };

  /** The super admin, or null having answered 403. */
  const superAdmin = (req: Request, res: Response): PublicUser | null => {
    const user = (req as AuthedRequest).user;
    if (!user || user.role !== "admin") {
      refuse(res, 403, "super-admin-only", languageOf(req), "err.superAdminOnly");
      return null;
    }
    return user;
  };

  /** Every account's name by id, for "removed by". */
  const namesNow = async (): Promise<(id: string) => string | null> => {
    const all = await store.listAllUsers();
    const byId = new Map(all.map((u) => [u.id, u.name] as const));
    return (id) => byId.get(id) ?? null;
  };

  /** Ends an account's sessions; a failure is said in the log line, never the change's. */
  const signOut = async (userId: string, why: SessionEndReason, by: string): Promise<number> => {
    try {
      return await sessions.endAll(userId, why, by);
    } catch (err) {
      console.error("[accounts] the sessions could not be ended:", err instanceof Error ? err.message : err);
      return 0;
    }
  };
  const devicesWords = (n: number): string => `${n} device${n === 1 ? "" : "s"}`;

  // RENAME (§110).
  app.post("/api/users/:id/rename", requireAuth, async (req: Request, res: Response): Promise<void> => {
    const me = superAdmin(req, res);
    if (!me) return;
    const lang = languageOf(req);
    const body = (req.body ?? {}) as { name?: unknown; email?: unknown; replace?: unknown };
    const name = typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
    if (!name || name.length > MAX_NAME_LENGTH) {
      refuse(res, 400, "bad-name", lang, "err.badName");
      return;
    }
    // The short name is a sign-in of the plant's own: "kapila.barad" or "kapila barad" is kapila.barad@gpp.local.
    const email = signInAddress(body.email);
    if (!email || email.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(email) || email.includes(RELEASED_MARK)) {
      refuse(res, 400, "bad-sign-in", lang, "err.badSignIn");
      return;
    }
    const outcome: RenameOutcome = await store.renameAccount({
      id: String(req.params.id ?? ""),
      name,
      email,
      replace: body.replace === true,
      by: { id: me.id, email: me.email },
      at: clock().toISOString(),
      compose: composeRename,
    });
    switch (outcome.kind) {
      case "not-found":
        refuse(res, 404, "no-such-account", lang, "err.noSuchAccount");
        return;
      case "removed":
        refuse(res, 409, "removed-account", lang, "err.renameRemoved", { name: outcome.row.name });
        return;
      case "unchanged":
        res.json({ user: managedAccount(outcome.row), unchanged: true, replaced: null, signedOut: 0 });
        return;
      case "held": {
        const holder = { id: outcome.holder.id, name: outcome.holder.name, email: shownSignIn(outcome.holder.email), unused: outcome.unused, removed: !!outcome.holder.removed_at };
        if (outcome.unused) refuse(res, 409, "sign-in-unused", lang, "err.signInUnused", { email, holder: outcome.holder.name, name }, { holder });
        else refuse(res, 409, "sign-in-used", lang, "err.signInUsed", { email, holder: outcome.holder.name }, { holder });
        return;
      }
      case "last-super-admin":
        refuse(res, 409, "last-super-admin", lang, "err.lastSuperAdmin", { name: outcome.holder.name });
        return;
      case "renamed": {
        const { before, row, replaced, replacedBefore } = outcome;
        // A new sign-in ends every session of the account: it signs in again with the new one. A new name alone ends none.
        const newSignIn = before.email !== row.email;
        const signedOut = newSignIn ? await signOut(row.id, "renamed", me.id) : 0;
        if (replaced) await signOut(replaced.id, "account-off", me.id);
        const changed = [
          before.name !== row.name ? `name ${before.name} → ${row.name}` : "",
          before.email !== row.email ? `sign-in ${before.email} → ${row.email}` : "",
        ].filter(Boolean);
        const detail = [
          `Was ${named(before)}: ${changed.join(", ")}`,
          newSignIn ? "what was set for the account and the documents it fills moved to the new sign-in" : "",
          newSignIn ? `signed out on ${devicesWords(signedOut)} to sign in again with the new sign-in` : "",
          replacedBefore ? `replaced ${named(replacedBefore)}, which nobody had used: removed` : "",
          "names already written on records stay as written",
        ]
          .filter(Boolean)
          .join("; ");
        logActivity(req, me, "Account renamed", named(row), detail.slice(0, 600));
        if (replacedBefore) logActivity(req, me, "Account removed", named(replacedBefore), `Never used; its sign-in went to ${row.name} with a rename ("Replace it"); nothing of it is deleted`.slice(0, 600));
        res.json({
          user: managedAccount(row),
          replaced: replaced ? managedAccount(replaced, (id) => (id === me.id ? me.name : null)) : null,
          signedOut,
        });
        return;
      }
    }
  });

  /** The answer of a removal that went through: each account's sessions ended and its line written. */
  const afterRemoval = async (req: Request, me: PublicUser, rows: readonly UserRow[], how: string): Promise<void> => {
    for (const row of rows) {
      const n = await signOut(row.id, "account-off", me.id);
      logActivity(req, me, "Account removed", named(row), `${how}Switched off and signed out on ${devicesWords(n)}; nothing of theirs is deleted: their name stays on what they wrote`.slice(0, 600));
    }
  };

  // REMOVE (§110).
  app.post("/api/users/:id/remove", requireAuth, async (req: Request, res: Response): Promise<void> => {
    const me = superAdmin(req, res);
    if (!me) return;
    const lang = languageOf(req);
    const id = String(req.params.id ?? "");
    if (id === me.id) {
      refuse(res, 400, "own-account", lang, "err.ownAccount");
      return;
    }
    const outcome: RemoveOutcome = await store.removeAccounts({ ids: [id], by: { id: me.id, email: me.email }, at: clock().toISOString(), compose: composeRemoval });
    if (outcome.kind === "not-found") {
      refuse(res, 404, "no-such-account", lang, "err.noSuchAccount");
      return;
    }
    if (outcome.kind === "own-account") {
      refuse(res, 400, "own-account", lang, "err.ownAccount");
      return;
    }
    if (outcome.kind === "last-super-admin") {
      refuse(res, 409, "last-super-admin", lang, "err.lastSuperAdmin", { name: outcome.row.name });
      return;
    }
    if (outcome.kind === "list-changed") {
      refuse(res, 409, "list-changed", lang, "err.listChanged");
      return;
    }
    await afterRemoval(req, me, outcome.rows, "");
    const nameOf = await namesNow();
    const row = outcome.rows[0] ?? outcome.already[0];
    res.json({ user: managedAccount(row, nameOf), already: outcome.rows.length === 0 });
  });

  // BRING BACK (§110).
  app.post("/api/users/:id/bring-back", requireAuth, async (req: Request, res: Response): Promise<void> => {
    const me = superAdmin(req, res);
    if (!me) return;
    const lang = languageOf(req);
    const outcome: BringBackOutcome = await store.bringBackAccount({ id: String(req.params.id ?? ""), by: { id: me.id, email: me.email }, compose: composeBringBack });
    if (outcome.kind === "not-found") {
      refuse(res, 404, "no-such-account", lang, "err.noSuchAccount");
      return;
    }
    if (outcome.kind === "not-removed") {
      refuse(res, 409, "not-removed", lang, "err.notRemoved", { name: outcome.row.name });
      return;
    }
    const { before, row, signIn, holder } = outcome;
    const detail = [
      `On the plant's list again, switched ${row.active ? "on" : "off"} as it was when it was removed`,
      signIn === "restored" ? `its sign-in ${row.email} given back` : "",
      signIn === "taken" && holder ? `its old sign-in ${shownSignIn(before.email)} is ${holder.name}'s now: it keeps ${before.email} until it is renamed` : "",
    ]
      .filter(Boolean)
      .join("; ");
    logActivity(req, me, "Account brought back", named(row), detail.slice(0, 600));
    res.json({ user: managedAccount(row), signIn, holder: holder ? { id: holder.id, name: holder.name, email: holder.email } : null });
  });

  // KEEP ONLY THESE (§110): one step, the list shown before the confirm.
  app.post("/api/users/keep-only", requireAuth, async (req: Request, res: Response): Promise<void> => {
    const me = superAdmin(req, res);
    if (!me) return;
    const lang = languageOf(req);
    const body = (req.body ?? {}) as { keep?: unknown; remove?: unknown };
    const ids = (v: unknown): string[] | null =>
      Array.isArray(v) && v.length <= MAX_LISTED && v.every((x) => typeof x === "string" && x.length > 0 && x.length <= 100) ? Array.from(new Set(v as string[])) : null;
    const keep = ids(body.keep);
    const remove = ids(body.remove);
    if (!keep || !remove || keep.some((id) => remove.includes(id))) {
      refuse(res, 400, "bad-request", lang, "err.keepWhom");
      return;
    }
    if (remove.includes(me.id)) {
      refuse(res, 400, "own-account", lang, "err.ownAccount");
      return;
    }
    const outcome: RemoveOutcome = await store.removeAccounts({ ids: remove, keep, by: { id: me.id, email: me.email }, at: clock().toISOString(), compose: composeRemoval });
    if (outcome.kind === "list-changed") {
      refuse(res, 409, "list-changed", lang, "err.listChanged", {}, { remove: outcome.remove.map((u) => ({ id: u.id, name: u.name, email: shownSignIn(u.email) })) });
      return;
    }
    if (outcome.kind === "last-super-admin") {
      refuse(res, 409, "last-super-admin", lang, "err.lastSuperAdmin", { name: outcome.row.name });
      return;
    }
    if (outcome.kind !== "removed") {
      refuse(res, outcome.kind === "own-account" ? 400 : 404, outcome.kind === "own-account" ? "own-account" : "no-such-account", lang, outcome.kind === "own-account" ? "err.ownAccount" : "err.noSuchAccount");
      return;
    }
    const all = await store.listAllUsers();
    const kept = all.filter((u) => !u.removed_at).map((u) => u.name);
    logActivity(
      req,
      me,
      "Only these accounts kept",
      `${outcome.rows.length} account${outcome.rows.length === 1 ? "" : "s"} removed`,
      `Kept: ${kept.join(", ")}. Removed: ${outcome.rows.map((u) => named(u)).join(", ")}`.slice(0, 600)
    );
    await afterRemoval(req, me, outcome.rows, 'With "Keep only these". ');
    const nameOf = (id: string) => all.find((u) => u.id === id)?.name ?? null;
    res.json({ removed: outcome.rows.map((u) => managedAccount(u, nameOf)) });
  });
}
