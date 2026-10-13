// THE ACCOUNTS THE PLANT KEEPS (REQUIREMENTS §110), backend/accountRoutes.ts on a real Express server.
//
// The owner, 12-Oct-2026: "change username kapilabarad01@gmail.com change to kapila barad only and also remove all
// others except kapila, superadmin, admin, vinay, sandeep and bharat, chirag, ankur, dharmik". Proved here:
//   * every route the super admin's alone (403 super-admin-only), nothing changed for anybody else;
//   * RENAME: the name and the sign-in, the old sign-in kept as a former one; the short name taken as the plant's own
//     address; what the super admin set and who fills what moved to the new sign-in; the account signed out everywhere
//     ("renamed"); a line naming old and new. A sign-in another account holds refused (409 sign-in-used); one held by an
//     account nobody has used offered (409 sign-in-unused, its holder named) and taken with "replace": the unused one
//     removed, its sign-in given up, the renamed account in its place, the owner's table's rights reaching it (the
//     owner's own case: kapilabarad01@gmail.com becomes kapila.barad@gpp.local). A failed sign-in line does not make an
//     account used. The refusals: no name, not an address, a given-up sign-in typed, no such account, a removed one;
//   * REMOVE: never the super admin's own, never so that no super admin can sign in; stamped, switched off, its sessions
//     ended, a line; listed as removed in the access rules, so a document only they filled has nobody and they have no
//     access; nothing of theirs deleted; asked again, "already";
//   * BRING BACK: on the list again, switched on or off as it was; off the removed list; a given-up sign-in given back
//     when nobody holds it, kept when somebody does; one not removed refused;
//   * KEEP ONLY THESE: every account not kept removed in one step and one write of the access rules, a line for the step
//     and one for each account; only when the list the page showed is the list now (409 list-changed with it); never
//     the super admin's own;
//   * THE SEEDING never adds back an account removed, given up or renamed away (backend/seedAccounts.ts).
// Each scenario runs over an in-memory stand-in that keeps backend/db.ts's own rules, and over PostgreSQL itself
// (backend/db.ts renameAccount, removeAccounts, bringBackAccount, seedUser, listUsers) when DCRS_ACCOUNTS_TEST_URL
// names a throwaway database: its users table and stored items are emptied first.
// Run: npm run test:unit -- accountRoutes
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import express, { type NextFunction, type Request, type Response } from "express";
import type { PublicUser } from "../auth.ts";
import type { AccessItemsNow, AccountChanger, BringBackOutcome, RemoveOutcome, RenameChange, RenameOutcome, UserRow } from "../db.ts";
import { registerAccountRoutes, type AccountsStore } from "../accountRoutes.ts";
import { seedAccountsToAdd, SEED_ACCOUNTS } from "../seedAccounts.ts";
import { catalogueOf } from "../accessLevels.ts";
import { buildAccess, normalizeAccessRules, type AccessRules } from "../../frontend/src/engine/accessRules.ts";
import { FORMER_SEPARATOR, releasedFrom, releasedSignIn } from "../../frontend/src/engine/accountNames.ts";

const NOW = new Date("2026-10-12T06:30:00.000Z");

// A few of the plant's documents: who fills each by the owner's table is in the comment.
const DOCS = [
  { id: "qc-inspection-pouching", formatNo: "F/QC/37", name: "Inspection Record - Pouching Process", kind: "log-sheet" }, // Kapila Barad
  { id: "qc-viscosity", formatNo: "F-QC-30", name: "Lamination Adhesive Viscosity Record", kind: "log-sheet" }, // Ankur Raval
  { id: "hr-competence", formatNo: "F/HR/01", name: "Personal Competence Records", kind: "log-sheet" }, // Vinay Bhojak, Sandeep Parekh
  { id: "mnt-pm-record", formatNo: "F/MNT/02", name: "Preventive Maintenance Plan & Record", kind: "log-sheet" }, // Raghunath Mane
  { id: "prd-alc-production", formatNo: "F-PRD-18", name: "Solvent Base Lamination - ALC & Production Report", kind: "log-sheet" }, // Vishnu Jadhav, Ajay Sinh Vaghela
];
const DOCS_JSON = JSON.stringify(DOCS);
const CATALOGUE = catalogueOf(DOCS_JSON);

const KAPILA = "kapila.barad@gpp.local";
const KAPILA_GMAIL = "kapilabarad01@gmail.com";
const RAGHUNATH = "raghunath.mane@gpp.local";

function row(id: string, name: string, email: string, role: "admin" | "staff", extra: Partial<UserRow> = {}): UserRow {
  return {
    id,
    name,
    email,
    password_hash: "x",
    role,
    created_at: "2026-01-01T00:00:00.000Z",
    departments: "",
    must_change_password: false,
    active: true,
    last_sign_in: null,
    removed_at: null,
    removed_by: null,
    active_before_removal: null,
    former_emails: "",
    ...extra,
  };
}

/** The plant at the start of each scenario. `used`: accounts that have signed in and worked. */
function plant(): { users: UserRow[]; used: string[]; failedOnly: string[] } {
  return {
    // Made one after another, in this order (the lists are by when an account was made).
    users: [
      row("u-admin", "Super Admin", "admin@gpp.local", "admin"),
      row("u-owner", "Owner", "superadmin05@gmail.com", "admin"),
      row("u-kgmail", "kapilabarad01", KAPILA_GMAIL, "staff", { departments: "QC" }),
      row("u-kseed", "Kapila Barad", KAPILA, "staff", { departments: "QC" }),
      row("u-vinay", "Vinay Bhojak", "vinay.bhojak@gpp.local", "staff", { departments: "HR" }),
      row("u-raghu", "Raghunath Mane", RAGHUNATH, "staff", { departments: "MNT" }),
      row("u-off", "Left Already", "left.already@gpp.local", "staff", { active: false }),
      row("u-temp1", "Playwright QA", "playwright-qa@example.com", "staff"),
      row("u-temp2", "Visual QA", "visual-qa@example.com", "staff"),
    ].map((u, i) => ({ ...u, created_at: `2026-01-01T00:00:${String(i).padStart(2, "0")}.000Z` })),
    used: ["u-admin", "u-owner", "u-kgmail", "u-vinay", "u-temp1", "u-temp2"],
    // Somebody typed Kapila Barad's seeded address with a wrong password: a line with its id, still never used.
    failedOnly: ["u-kseed"],
  };
}

// ---------------------------------------------------------------------------
// the stand-in: backend/db.ts's rules over arrays

class MemoryAccounts implements AccountsStore {
  users: UserRow[] = [];
  used = new Set<string>();
  items = new Map<string, string>();
  accessWrites = 0;

  private now = (): AccessItemsNow => ({ access: this.items.get("access") ?? null, documents: this.items.get("documents") ?? null });
  private writeAccess(next: string | null): void {
    if (next === null || next === (this.items.get("access") ?? null)) return;
    this.items.set("access", next);
    this.accessWrites += 1;
  }
  private anotherSuperAdmin(leaving: readonly string[]): boolean {
    return this.users.some((u) => u.role === "admin" && u.active && !u.removed_at && !leaving.includes(u.id));
  }
  private copy = (u: UserRow): UserRow => ({ ...u });

  listAllUsers = async (): Promise<UserRow[]> => this.users.map(this.copy);

  renameAccount = async (input: { id: string; name: string; email: string; replace: boolean; by: AccountChanger; at: string; compose: (now: AccessItemsNow, change: RenameChange) => string | null }): Promise<RenameOutcome> => {
    const target = this.users.find((u) => u.id === input.id);
    if (!target) return { kind: "not-found" };
    const before = this.copy(target);
    if (target.removed_at) return { kind: "removed", row: before };
    if (target.email === input.email && target.name === input.name) return { kind: "unchanged", row: before };
    let holderBefore: UserRow | null = null;
    let replaced: UserRow | null = null;
    if (target.email !== input.email) {
      const holder = this.users.find((u) => u.email === input.email);
      if (holder) {
        holderBefore = this.copy(holder);
        const unused = !this.used.has(holder.id) && !holder.last_sign_in;
        if (!input.replace || !unused) return { kind: "held", row: before, holder: holderBefore, unused };
        if (holder.role === "admin" && holder.active && !holder.removed_at && !this.anotherSuperAdmin([holder.id])) return { kind: "last-super-admin", row: before, holder: holderBefore };
        if (!holder.removed_at) {
          holder.removed_by = input.by.id;
          holder.active_before_removal = holder.active;
          holder.removed_at = input.at;
        }
        holder.active = false;
        holder.email = releasedSignIn(holder.email, holder.id);
        replaced = this.copy(holder);
      }
    }
    const formers = String(target.former_emails ?? "").split(FORMER_SEPARATOR).filter(Boolean);
    if (target.email !== input.email && !formers.includes(target.email)) formers.push(target.email);
    target.name = input.name;
    target.email = input.email;
    target.former_emails = formers.join(FORMER_SEPARATOR);
    this.writeAccess(input.compose(this.now(), { from: before.email, to: input.email, released: replaced?.email ?? null }));
    return { kind: "renamed", before, row: this.copy(target), replaced, replacedBefore: replaced ? holderBefore : null };
  };

  removeAccounts = async (input: { ids: readonly string[]; keep?: readonly string[]; by: AccountChanger; at: string; compose: (now: AccessItemsNow, removedEmails: string[]) => string | null }): Promise<RemoveOutcome> => {
    let targets: UserRow[];
    if (input.keep) {
      const kept = new Set([...input.keep, input.by.id]);
      targets = this.users.filter((u) => !u.removed_at && !kept.has(u.id));
      const asked = new Set(input.ids);
      if (targets.length !== asked.size || targets.some((u) => !asked.has(u.id))) return { kind: "list-changed", remove: targets.map(this.copy) };
    } else {
      targets = this.users.filter((u) => input.ids.includes(u.id));
      const missing = input.ids.filter((id) => !targets.some((u) => u.id === id));
      if (missing.length) return { kind: "not-found", ids: missing };
    }
    if (targets.some((u) => u.id === input.by.id)) return { kind: "own-account" };
    const going = targets.filter((u) => !u.removed_at);
    const already = targets.filter((u) => !!u.removed_at).map(this.copy);
    const boss = going.find((u) => u.role === "admin" && u.active);
    if (boss && !this.anotherSuperAdmin(going.map((u) => u.id))) return { kind: "last-super-admin", row: this.copy(boss) };
    for (const u of going) {
      u.removed_at = input.at;
      u.removed_by = input.by.id;
      u.active_before_removal = u.active;
      u.active = false;
    }
    if (going.length) this.writeAccess(input.compose(this.now(), going.map((u) => u.email)));
    return { kind: "removed", rows: going.map(this.copy), already };
  };

  bringBackAccount = async (input: { id: string; by: AccountChanger; compose: (now: AccessItemsNow, change: { was: string; now: string }) => string | null }): Promise<BringBackOutcome> => {
    const u = this.users.find((x) => x.id === input.id);
    if (!u) return { kind: "not-found" };
    const before = this.copy(u);
    if (!u.removed_at) return { kind: "not-removed", row: before };
    let signIn: "kept" | "restored" | "taken" = "kept";
    let holder: UserRow | null = null;
    const gaveUp = releasedFrom(u.email);
    if (gaveUp) {
      const h = this.users.find((x) => x.email === gaveUp);
      if (h) {
        holder = this.copy(h);
        signIn = "taken";
      } else {
        u.email = gaveUp;
        signIn = "restored";
      }
    }
    u.removed_at = null;
    u.removed_by = null;
    u.active = u.active_before_removal ?? true;
    u.active_before_removal = null;
    this.writeAccess(input.compose(this.now(), { was: before.email, now: u.email }));
    return { kind: "back", before, row: this.copy(u), signIn, holder };
  };
}

// ---------------------------------------------------------------------------
// one scenario's world, over the stand-in or over PostgreSQL

interface World {
  store: AccountsStore;
  user(id: string): Promise<UserRow | undefined>;
  rules(): Promise<AccessRules>;
  setRules(rules: unknown): Promise<void>;
  accessWrites(): Promise<number>;
  /** The plant's accounts as the lists see them (backend/db.ts listUsers): the removed left out. */
  listed(): Promise<string[]>;
  /** Whether the seeding would add each of these named accounts now (seedAccountsToAdd, and on PostgreSQL seedUser too). */
  seeds(emails: string[]): Promise<Record<string, boolean>>;
  close(): Promise<void>;
}

type MakeWorld = () => Promise<World>;

const memoryWorld: MakeWorld = async () => {
  const store = new MemoryAccounts();
  const start = plant();
  store.users = start.users.map((u) => ({ ...u }));
  for (const id of start.used) store.used.add(id);
  store.items.set("documents", DOCS_JSON);
  return {
    store,
    user: async (id) => store.users.find((u) => u.id === id),
    rules: async () => normalizeAccessRules(JSON.parse(store.items.get("access") ?? "null")),
    setRules: async (rules) => void store.items.set("access", JSON.stringify(rules)),
    accessWrites: async () => store.accessWrites,
    listed: async () => store.users.filter((u) => !u.removed_at).map((u) => u.id),
    seeds: async (emails) => {
      const adds = new Set(seedAccountsToAdd(store.users).map((a) => a.email));
      return Object.fromEntries(emails.map((e) => [e, adds.has(e)]));
    },
    close: async () => undefined,
  };
};

const PG_URL = process.env.DCRS_ACCOUNTS_TEST_URL;

const postgresWorld: MakeWorld = async () => {
  process.env.DATABASE_URL = PG_URL;
  const db = await import("../db.ts");
  await db.openDatabase();
  const q = db.database();
  await q.query("TRUNCATE users CASCADE");
  // The log is only ever added to (§62): its lines are taken away as the archive takes them, in a transaction that says so.
  await db.withClient((c) =>
    db.transaction(c, async () => {
      await c.query("SET LOCAL dcrs.archiving = 'on'");
      await c.query("DELETE FROM activity_log");
    })
  );
  await q.query("DELETE FROM app_storage WHERE scope = 'company' AND key IN ('access', 'documents')");
  const start = plant();
  for (const u of start.users) {
    await q.query(
      `INSERT INTO users (id, name, email, password_hash, role, created_at, departments, must_change_password, active, last_sign_in)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [u.id, u.name, u.email, u.password_hash, u.role, u.created_at, u.departments, u.must_change_password, u.active, start.used.includes(u.id) ? NOW.toISOString() : null]
    );
  }
  // Worked: a line of their own in the activity log. Never used: only a failed sign-in line, which anybody causes.
  for (const id of start.used) await q.query("INSERT INTO activity_log (user_id, user_name, action) VALUES ($1, $1, 'Record saved')", [id]);
  for (const id of start.failedOnly) await q.query("INSERT INTO activity_log (user_id, user_name, action) VALUES ($1, $1, 'Sign-in failed')", [id]);
  await q.query("INSERT INTO app_storage (scope, key, value) VALUES ('company', 'documents', $1)", [DOCS_JSON]);
  const version = async (): Promise<number> => Number((await q.query<{ v: number }>("SELECT version AS v FROM app_storage WHERE scope = 'company' AND key = 'access'")).rows[0]?.v ?? 0);
  const startVersion = { at: 0 };
  return {
    store: { listAllUsers: db.listAllUsers, renameAccount: db.renameAccount, removeAccounts: db.removeAccounts, bringBackAccount: db.bringBackAccount },
    user: async (id) => db.getUserById(id),
    rules: async () => normalizeAccessRules(JSON.parse((await db.readItem("company", "access"))?.value ?? "null")),
    setRules: async (rules) => {
      await db.writeItem("company", "access", JSON.stringify(rules), null, "test");
      startVersion.at = await version();
    },
    accessWrites: async () => (await version()) - startVersion.at,
    listed: async () => (await db.listUsers()).map((u) => u.id),
    seeds: async (emails) => {
      const adds = new Set(seedAccountsToAdd(await db.listAllUsers()).map((a) => a.email));
      const out: Record<string, boolean> = {};
      for (const e of emails) {
        // The statement's own rule too: it adds nothing for a sign-in held, given up or had before (rolled back after).
        const client = await q.connect();
        try {
          await client.query("BEGIN");
          const seed = SEED_ACCOUNTS.find((a) => a.email === e)!;
          const { rowCount } = await client.query(
            `INSERT INTO users (id, name, email, password_hash, role, created_at, departments, must_change_password)
             SELECT $1, $2, $3, 'x', $4, '2026-10-12', '', false
              WHERE NOT EXISTS (SELECT 1 FROM users WHERE split_part(email, '#removed-', 1) = $3 OR $3 = ANY(string_to_array(former_emails, $5)))
             ON CONFLICT (email) DO NOTHING`,
            [`seed-${e}`, seed.name, e, seed.role, FORMER_SEPARATOR]
          );
          await client.query("ROLLBACK");
          assert.equal((rowCount ?? 0) > 0, adds.has(e), `seedUser and seedAccountsToAdd agree on ${e}`);
        } finally {
          client.release();
        }
        out[e] = adds.has(e);
      }
      return out;
    },
    close: () => db.closeDatabase(),
  };
};

// ---------------------------------------------------------------------------
// the server

interface Server {
  base: string;
  world: World;
  lines: { who: string | null; action: string; target: string; detail: string }[];
  ended: { userId: string; why: string; by: string | null }[];
  close: () => Promise<void>;
}

async function start(make: MakeWorld): Promise<Server> {
  const world = await make();
  const lines: Server["lines"] = [];
  const ended: Server["ended"] = [];
  const app = express();
  app.use(express.json());
  const requireAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const u = await world.user(String(req.get("x-test-user")));
    if (!u || !u.active || u.removed_at) {
      res.status(401).json({ error: "Not authenticated." });
      return;
    }
    (req as Request & { user: PublicUser }).user = { id: u.id, name: u.name, email: u.email, role: u.role, departments: u.departments ? u.departments.split(",") : [] };
    next();
  };
  registerAccountRoutes(app, {
    requireAuth,
    logActivity: (_r, who, action, target = "", detail = "") => lines.push({ who: who?.name ?? null, action, target, detail }),
    sessions: {
      endAll: async (userId, why, by) => {
        ended.push({ userId, why, by });
        return 2;
      },
    },
    store: world.store,
    clock: () => NOW,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const { port } = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${port}`,
    world,
    lines,
    ended,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await world.close();
    },
  };
}

async function call(s: Server, route: string, who: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(s.base + route, { method: "POST", headers: { "x-test-user": who, "Content-Type": "application/json", ...headers }, body: JSON.stringify(body ?? {}) });
  return { status: res.status, body: (await res.json()) as any };
}

const access = (rules: AccessRules) => buildAccess(CATALOGUE, rules);
const staff = (email: string) => ({ email, role: "staff", departments: [] as string[] });

// ---------------------------------------------------------------------------
// the scenarios, over each world

function contract(title: string, make: MakeWorld): void {
  describe(`the accounts (REQUIREMENTS §110), ${title}`, () => {
    describe("the super admin's alone", () => {
      let s: Server;
      before(async () => (s = await start(make)));
      after(() => s.close());

      it("refuses every route to anybody else, in words, and changes nothing", async () => {
        for (const [route, body] of [
          ["/api/users/u-raghu/rename", { name: "R", email: "r@gpp.local" }],
          ["/api/users/u-raghu/remove", {}],
          ["/api/users/u-raghu/bring-back", {}],
          ["/api/users/keep-only", { keep: ["u-vinay"], remove: [] }],
        ] as const) {
          const r = await call(s, route, "u-vinay", body);
          assert.equal(r.status, 403, route);
          assert.equal(r.body.code, "super-admin-only");
          assert.match(r.body.error, /Only the super admin/);
        }
        const gu = await call(s, "/api/users/u-raghu/remove", "u-vinay", {}, { "x-language": "gu" });
        assert.match(gu.body.error, /સુપર એડમિન/, "in Gujarati when asked");
        const hi = await call(s, "/api/users/u-raghu/remove", "u-vinay", {}, { "x-language": "hi" });
        assert.match(hi.body.error, /सुपर एडमिन/, "in Hindi when asked");
        assert.equal((await s.world.user("u-raghu"))?.removed_at ?? null, null);
        assert.equal(s.lines.length, 0);
        assert.equal(s.ended.length, 0);
      });
    });

    describe("renaming", () => {
      let s: Server;
      before(async () => (s = await start(make)));
      after(() => s.close());

      it("refuses no name, a sign-in that is not one, a given-up sign-in, no such account", async () => {
        assert.equal((await call(s, "/api/users/u-vinay/rename", "u-admin", { name: "  ", email: "v@gpp.local" })).body.code, "bad-name");
        assert.equal((await call(s, "/api/users/u-vinay/rename", "u-admin", { name: "x".repeat(101), email: "v@gpp.local" })).body.code, "bad-name");
        const notOne = await call(s, "/api/users/u-vinay/rename", "u-admin", { name: "Vinay", email: "not an@address" });
        assert.equal(notOne.status, 400);
        assert.equal(notOne.body.code, "bad-sign-in");
        assert.equal((await call(s, "/api/users/u-vinay/rename", "u-admin", { name: "Vinay", email: releasedSignIn(KAPILA, "u-x") })).body.code, "bad-sign-in");
        const none = await call(s, "/api/users/u-nobody/rename", "u-admin", { name: "N", email: "n@gpp.local" });
        assert.equal(none.status, 404);
        assert.equal(none.body.code, "no-such-account");
        assert.equal(s.lines.length, 0);
      });

      it("refuses a sign-in an account that has been used holds, naming it, and changes nothing", async () => {
        const r = await call(s, "/api/users/u-kgmail/rename", "u-admin", { name: "Kapila Barad", email: "vinay.bhojak@gpp.local", replace: true });
        assert.equal(r.status, 409);
        assert.equal(r.body.code, "sign-in-used");
        assert.deepEqual(r.body.holder, { id: "u-vinay", name: "Vinay Bhojak", email: "vinay.bhojak@gpp.local", unused: false, removed: false });
        assert.match(r.body.error, /Vinay Bhojak, an account that has been used/);
        assert.equal((await s.world.user("u-kgmail"))?.email, KAPILA_GMAIL);
        assert.equal((await s.world.user("u-vinay"))?.removed_at ?? null, null);
        assert.equal(s.ended.length, 0);
      });

      it("offers to replace an account nobody has used (a failed sign-in does not count), and without 'replace' changes nothing", async () => {
        const r = await call(s, "/api/users/u-kgmail/rename", "u-admin", { name: "Kapila Barad", email: "Kapila Barad" });
        assert.equal(r.status, 409);
        assert.equal(r.body.code, "sign-in-unused");
        assert.deepEqual(r.body.holder, { id: "u-kseed", name: "Kapila Barad", email: KAPILA, unused: true, removed: false });
        assert.match(r.body.error, /an account nobody has used\. Replace it/);
        assert.equal((await s.world.user("u-kseed"))?.email, KAPILA);
        assert.equal((await s.world.user("u-kgmail"))?.email, KAPILA_GMAIL);
      });

      it("THE OWNER'S CASE: kapilabarad01@gmail.com becomes Kapila Barad, kapila.barad@gpp.local, replacing the unused seeded account; her settings move and the table's rights reach her", async () => {
        // What the super admin had set for her gmail account, and a document she was made to fill.
        await s.world.setRules({ version: 1, people: { [KAPILA_GMAIL]: { documents: { "qc-viscosity": "write" } } }, responsibility: { "hr-competence": ["vinay.bhojak@gpp.local", KAPILA_GMAIL] } });
        const before = access(await s.world.rules());
        assert.equal(before.level(staff(KAPILA_GMAIL), "qc-viscosity"), "write");
        const r = await call(s, "/api/users/u-kgmail/rename", "u-admin", { name: "Kapila Barad", email: "kapila.barad", replace: true });
        assert.equal(r.status, 200, JSON.stringify(r.body));
        assert.equal(r.body.user.email, KAPILA, "the short name is the plant's own address");
        assert.equal(r.body.user.name, "Kapila Barad");
        assert.deepEqual(r.body.user.formerSignIns, [KAPILA_GMAIL]);
        assert.equal(r.body.signedOut, 2);
        assert.equal(r.body.replaced.id, "u-kseed");
        assert.equal(r.body.replaced.signInGivenUp, KAPILA);
        // The unused account: removed, switched off, its sign-in given up; nothing deleted.
        const seeded = await s.world.user("u-kseed");
        assert.ok(seeded?.removed_at, "the unused account is removed");
        assert.equal(seeded?.active, false);
        assert.equal(seeded?.removed_by, "u-admin");
        assert.equal(releasedFrom(seeded?.email ?? ""), KAPILA);
        // Signed out everywhere: she to sign in again, the unused one's (none) with it.
        assert.deepEqual(
          s.ended.map((e) => [e.userId, e.why, e.by]),
          [
            ["u-kgmail", "renamed", "u-admin"],
            ["u-kseed", "account-off", "u-admin"],
          ]
        );
        // The access rules: her own setting and her place in who fills what under the new sign-in; the given-up one removed.
        const rules = await s.world.rules();
        assert.deepEqual(rules.people[KAPILA], { documents: { "qc-viscosity": "write" } });
        assert.equal(rules.people[KAPILA_GMAIL], undefined);
        assert.deepEqual(rules.responsibility["hr-competence"], ["vinay.bhojak@gpp.local", KAPILA]);
        assert.deepEqual(rules.removed, [seeded!.email]);
        const now = access(rules);
        assert.equal(now.level(staff(KAPILA), "qc-viscosity"), "write", "her own setting moved with her");
        assert.equal(now.level(staff(KAPILA), "qc-inspection-pouching"), "edit", "the owner's table: she fills QC");
        assert.equal(now.level(staff(KAPILA), "prd-alc-production"), "read", "the owner's table: Kapila Barad views every module");
        assert.ok(now.responsible("qc-inspection-pouching").includes(KAPILA));
        assert.equal(now.level(staff(KAPILA_GMAIL), "qc-inspection-pouching"), "edit", "the old address is nobody's: it keeps what an undescribed account keeps");
        // The activity log: old and new, and the account replaced.
        const renamed = s.lines.find((l) => l.action === "Account renamed");
        assert.ok(renamed, JSON.stringify(s.lines));
        assert.equal(renamed!.target, `Kapila Barad <${KAPILA}>`);
        assert.match(renamed!.detail, /Was kapilabarad01 <kapilabarad01@gmail\.com>: name kapilabarad01 → Kapila Barad, sign-in kapilabarad01@gmail\.com → kapila\.barad@gpp\.local/);
        assert.match(renamed!.detail, /signed out on 2 devices/);
        assert.match(renamed!.detail, /replaced Kapila Barad <kapila\.barad@gpp\.local>, which nobody had used: removed/);
        assert.ok(s.lines.some((l) => l.action === "Account removed" && l.target === `Kapila Barad <${KAPILA}>`));
        // Nobody else's account changed.
        assert.equal((await s.world.user("u-vinay"))?.email, "vinay.bhojak@gpp.local");
      });

      it("refuses to rename a removed account, and answers a rename that changes nothing as unchanged", async () => {
        const removed = await call(s, "/api/users/u-kseed/rename", "u-admin", { name: "Again", email: "again@gpp.local" });
        assert.equal(removed.status, 409);
        assert.equal(removed.body.code, "removed-account");
        const same = await call(s, "/api/users/u-vinay/rename", "u-admin", { name: "Vinay Bhojak", email: "vinay.bhojak@gpp.local" });
        assert.equal(same.status, 200);
        assert.equal(same.body.unchanged, true);
      });

      it("a new name alone signs nobody out", async () => {
        const endedBefore = s.ended.length;
        const r = await call(s, "/api/users/u-vinay/rename", "u-admin", { name: "Vinay  Bhojak  ", email: "vinay.bhojak@gpp.local" });
        assert.equal(r.status, 200);
        assert.equal(r.body.user.name, "Vinay Bhojak", "spaces tidied: the same name");
        const renamed = await call(s, "/api/users/u-vinay/rename", "u-admin", { name: "Vinay B. Bhojak", email: "vinay.bhojak@gpp.local" });
        assert.equal(renamed.body.user.name, "Vinay B. Bhojak");
        assert.equal(renamed.body.signedOut, 0);
        assert.equal(s.ended.length, endedBefore);
      });
    });

    describe("removing and bringing back", () => {
      let s: Server;
      before(async () => (s = await start(make)));
      after(() => s.close());

      it("never the super admin's own account", async () => {
        const r = await call(s, "/api/users/u-admin/remove", "u-admin");
        assert.equal(r.status, 400);
        assert.equal(r.body.code, "own-account");
        assert.equal((await s.world.user("u-admin"))?.removed_at ?? null, null);
      });

      it("removes an account: stamped, switched off, signed out, a line; off every list and out of who fills what; nothing deleted", async () => {
        assert.deepEqual(access(await s.world.rules()).responsible("mnt-pm-record"), [RAGHUNATH], "the owner's table: Raghunath Mane fills F/MNT/02");
        const r = await call(s, "/api/users/u-raghu/remove", "u-admin");
        assert.equal(r.status, 200, JSON.stringify(r.body));
        assert.equal(r.body.already, false);
        assert.equal(r.body.user.removedBy, "Super Admin");
        const u = await s.world.user("u-raghu");
        assert.equal(u?.removed_at, NOW.toISOString());
        assert.equal(u?.active, false);
        assert.equal(u?.active_before_removal, true);
        assert.equal(u?.email, RAGHUNATH, "it keeps its sign-in");
        assert.deepEqual(s.ended.at(-1), { userId: "u-raghu", why: "account-off", by: "u-admin" });
        const line = s.lines.at(-1)!;
        assert.equal(line.action, "Account removed");
        assert.equal(line.target, `Raghunath Mane <${RAGHUNATH}>`);
        assert.match(line.detail, /Switched off and signed out on 2 devices; nothing of theirs is deleted/);
        assert.ok(!(await s.world.listed()).includes("u-raghu"), "off the plant's list (listUsers)");
        const rules = await s.world.rules();
        assert.deepEqual(rules.removed, [RAGHUNATH]);
        const now = access(rules);
        assert.deepEqual(now.responsible("mnt-pm-record"), [], "Nobody fills this: the super admin answers for it");
        assert.equal(now.level(staff(RAGHUNATH), "mnt-pm-record"), "none");
        assert.deepEqual(now.answersFor(staff(RAGHUNATH)), []);
        // Asked again: already removed, no second line.
        const lines = s.lines.length;
        const again = await call(s, "/api/users/u-raghu/remove", "u-admin");
        assert.equal(again.status, 200);
        assert.equal(again.body.already, true);
        assert.equal(s.lines.length, lines);
      });

      it("the seeding never adds a removed account back", async () => {
        assert.deepEqual(await s.world.seeds([RAGHUNATH]), { [RAGHUNATH]: false });
      });

      it("brings it back: on the list, as it was, off the removed list; one not removed is refused", async () => {
        const not = await call(s, "/api/users/u-vinay/bring-back", "u-admin");
        assert.equal(not.status, 409);
        assert.equal(not.body.code, "not-removed");
        const r = await call(s, "/api/users/u-raghu/bring-back", "u-admin");
        assert.equal(r.status, 200, JSON.stringify(r.body));
        assert.equal(r.body.signIn, "kept");
        const u = await s.world.user("u-raghu");
        assert.equal(u?.removed_at ?? null, null);
        assert.equal(u?.active, true);
        assert.ok((await s.world.listed()).includes("u-raghu"));
        assert.equal((await s.world.rules()).removed, undefined);
        assert.deepEqual(access(await s.world.rules()).responsible("mnt-pm-record"), [RAGHUNATH], "he fills F/MNT/02 again");
        assert.equal(s.lines.at(-1)?.action, "Account brought back");
        assert.match(s.lines.at(-1)!.detail, /switched on as it was/);
      });

      it("an account switched off before it was removed comes back switched off", async () => {
        await call(s, "/api/users/u-off/remove", "u-admin");
        const r = await call(s, "/api/users/u-off/bring-back", "u-admin");
        assert.equal(r.body.user.active, false);
        assert.equal((await s.world.user("u-off"))?.active, false);
      });

      it("a given-up sign-in comes back when nobody holds it, and stays given up while somebody does", async () => {
        // Kapila's gmail account takes the seeded one's sign-in; the seeded one, brought back, cannot have it.
        await call(s, "/api/users/u-kgmail/rename", "u-admin", { name: "Kapila Barad", email: KAPILA, replace: true });
        const taken = await call(s, "/api/users/u-kseed/bring-back", "u-admin");
        assert.equal(taken.status, 200);
        assert.equal(taken.body.signIn, "taken");
        assert.equal(taken.body.holder.id, "u-kgmail");
        assert.equal(releasedFrom((await s.world.user("u-kseed"))?.email ?? ""), KAPILA);
        // Removed again, and her account renamed away: now its own sign-in is free, and it is given back.
        await call(s, "/api/users/u-kseed/remove", "u-admin");
        await call(s, "/api/users/u-kgmail/rename", "u-admin", { name: "Kapila Barad", email: "kapila@gpp.local" });
        const restored = await call(s, "/api/users/u-kseed/bring-back", "u-admin");
        assert.equal(restored.body.signIn, "restored");
        assert.equal((await s.world.user("u-kseed"))?.email, KAPILA);
        assert.equal((await s.world.rules()).removed, undefined, "neither sign-in is on the removed list");
      });

      it("the seeding never adds back a sign-in given up, or one an account had before it was renamed", async () => {
        // u-kgmail had kapila.barad@gpp.local before it became kapila@gpp.local; u-kseed now holds it again, so both hold.
        const seeds = await s.world.seeds([KAPILA, "vinay.bhojak@gpp.local", "anil.ravad@gpp.local"]);
        assert.deepEqual(seeds, { [KAPILA]: false, "vinay.bhojak@gpp.local": false, "anil.ravad@gpp.local": true });
      });
    });

    describe("keep only these", () => {
      let s: Server;
      before(async () => (s = await start(make)));
      after(() => s.close());

      it("refuses a request that does not say what to keep, keeps and removes the same account, or would remove the super admin's own", async () => {
        assert.equal((await call(s, "/api/users/keep-only", "u-admin", { keep: "everybody" })).body.code, "bad-request");
        assert.equal((await call(s, "/api/users/keep-only", "u-admin", { keep: ["u-vinay"], remove: ["u-vinay"] })).body.code, "bad-request");
        assert.equal((await call(s, "/api/users/keep-only", "u-admin", { keep: [], remove: ["u-admin"] })).body.code, "own-account");
      });

      it("refuses when the list shown is not the list now, with the list now, and removes nothing", async () => {
        const keep = ["u-owner", "u-kgmail", "u-vinay"];
        const r = await call(s, "/api/users/keep-only", "u-admin", { keep, remove: ["u-temp1", "u-temp2"] });
        assert.equal(r.status, 409);
        assert.equal(r.body.code, "list-changed");
        assert.deepEqual(r.body.remove.map((u: { id: string }) => u.id).sort(), ["u-kseed", "u-off", "u-raghu", "u-temp1", "u-temp2"]);
        for (const id of ["u-temp1", "u-temp2", "u-raghu"]) assert.equal((await s.world.user(id))?.removed_at ?? null, null);
      });

      it("removes every account not kept in one step: one write of the access rules, a line for the step and one for each", async () => {
        const writes = await s.world.accessWrites();
        const keep = ["u-owner", "u-kgmail", "u-vinay"];
        const remove = ["u-kseed", "u-off", "u-raghu", "u-temp1", "u-temp2"];
        const r = await call(s, "/api/users/keep-only", "u-admin", { keep, remove });
        assert.equal(r.status, 200, JSON.stringify(r.body));
        assert.deepEqual(r.body.removed.map((u: { id: string }) => u.id).sort(), remove);
        assert.deepEqual((await s.world.listed()).sort(), ["u-admin", "u-kgmail", "u-owner", "u-vinay"], "the super admin's own is always kept");
        assert.equal((await s.world.accessWrites()) - writes, 1, "the access rules written once");
        assert.deepEqual((await s.world.rules()).removed, ["kapila.barad@gpp.local", "left.already@gpp.local", "playwright-qa@example.com", RAGHUNATH, "visual-qa@example.com"]);
        const step = s.lines.find((l) => l.action === "Only these accounts kept");
        assert.ok(step);
        assert.equal(step!.target, "5 accounts removed");
        assert.match(step!.detail, /Kept: Super Admin, Owner, kapilabarad01, Vinay Bhojak\. Removed: /);
        assert.equal(s.lines.filter((l) => l.action === "Account removed").length, 5);
        assert.equal(s.ended.filter((e) => e.why === "account-off").length, 5);
      });
    });

    describe("never without a super admin who can sign in", () => {
      let s: Server;
      before(async () => (s = await start(make)));
      after(() => s.close());

      it("removing every active super admin at once is refused (the store's own check)", async () => {
        const out = await s.world.store.removeAccounts({ ids: ["u-admin", "u-owner"], by: { id: "u-vinay", email: "vinay.bhojak@gpp.local" }, at: NOW.toISOString(), compose: () => null });
        assert.equal(out.kind, "last-super-admin");
        assert.equal((await s.world.user("u-admin"))?.removed_at ?? null, null);
        assert.equal((await s.world.user("u-owner"))?.removed_at ?? null, null);
        const one = await s.world.store.removeAccounts({ ids: ["u-owner"], by: { id: "u-vinay", email: "vinay.bhojak@gpp.local" }, at: NOW.toISOString(), compose: () => null });
        assert.equal(one.kind, "removed", "one of two may go");
      });
    });
  });
}

contract("in memory", memoryWorld);
if (PG_URL) contract("on PostgreSQL (DCRS_ACCOUNTS_TEST_URL)", postgresWorld);
else {
  describe("the accounts (REQUIREMENTS §110), on PostgreSQL", () => {
    it("skipped (DCRS_ACCOUNTS_TEST_URL is not set; the same checks run on a throwaway database when it is)", { skip: true }, () => undefined);
  });
}

describe("the seeding (backend/seedAccounts.ts seedAccountsToAdd)", () => {
  it("adds only what no account has, gave up or had before a rename", () => {
    const onFile = [
      { email: "admin@gpp.local" },
      // Removed: keeps its sign-in.
      { email: RAGHUNATH },
      // Gave its sign-in up to another account.
      { email: releasedSignIn("anil.ravad@gpp.local", "u-anil") },
      // Renamed away from it.
      { email: "vishnu@gpp.local", former_emails: ["vishnu.jadhav@gpp.local", "v.j@gpp.local"].join(FORMER_SEPARATOR) },
    ];
    const adds = seedAccountsToAdd(onFile).map((a) => a.email);
    for (const kept of ["admin@gpp.local", RAGHUNATH, "anil.ravad@gpp.local", "vishnu.jadhav@gpp.local"]) assert.ok(!adds.includes(kept), kept);
    assert.ok(adds.includes(KAPILA) && adds.includes("ajay.zala@gpp.local"));
    assert.equal(adds.length, SEED_ACCOUNTS.length - 4);
  });
});
