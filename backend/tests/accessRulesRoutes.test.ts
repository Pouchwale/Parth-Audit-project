// WHO MAY DO WHAT, SET BY THE SUPER ADMIN (REQUIREMENTS §96), backend/accessRulesRoutes.ts, on a real Express server over
// in-memory stand-ins for PostgreSQL and the notification ledger:
//   * GET /api/access/rules for anybody signed in: the rules, their version, the plant's people;
//   * PUT /api/access/rules the super admin's alone, with the version read (409 on a stale one), the rules made safe;
//     every change a line of the activity log naming who changed what for whom, and an access_changed notification to
//     each person concerned in the level they now have; a change of who answers for a document likewise;
//   * POST /api/access/accounts/create-missing: the twelve people's missing accounts, on a first password of at least 8
//     characters they must change, a line each;
//   * POST /api/users/:id/role: the super admin makes an account the super admin or staff, switched on, a line and a
//     notification — and never leaves the plant without an active super admin.
// Run: npm run test:unit -- accessRulesRoutes
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import express, { type NextFunction, type Request, type Response } from "express";
import type { PublicUser } from "../auth.ts";
import type { StoredItem, UserRow, WriteResult } from "../db.ts";
import { registerAccessRulesRoutes, type AccessRulesStore } from "../accessRulesRoutes.ts";
import { createMemoryLedger, type MemoryLedger } from "./memoryLedger.ts";
import { DOCS_JSON } from "./accessFixtures.ts";
import { DEFAULT_PEOPLE } from "../../frontend/src/engine/accessRules.ts";

const NOW = new Date("2026-10-09T05:30:00.000Z");

function row(id: string, name: string, email: string, role: "admin" | "staff", departments = "", extra: Partial<UserRow> = {}): UserRow {
  return { id, name, email, password_hash: "x", role, created_at: "2026-01-01T00:00:00.000Z", departments, must_change_password: false, active: true, last_sign_in: null, ...extra };
}

class MemoryAccessStore implements AccessRulesStore {
  items = new Map<string, { value: string; version: number; seq: number }>();
  users: UserRow[] = [];
  seq = 0;
  async readItem(scope: string, key: string): Promise<StoredItem | null> {
    const v = this.items.get(`${scope}|${key}`);
    return v ? { key, ...v } : null;
  }
  async writeItem(scope: string, key: string, value: string, baseVersion: number | null, _by: string, compose?: (stored: string | null) => string): Promise<WriteResult> {
    const now = this.items.get(`${scope}|${key}`);
    if (baseVersion !== null && (now ? now.version !== baseVersion : baseVersion !== 0)) return { ok: false, current: now ? { key, ...now } : null };
    const toStore = compose ? compose(now?.value ?? null) : value;
    this.seq += 1;
    this.items.set(`${scope}|${key}`, { value: toStore, version: (now?.version ?? 0) + 1, seq: this.seq });
    const w = this.items.get(`${scope}|${key}`)!;
    return { ok: true, version: w.version, seq: w.seq };
  }
  async listUsers(): Promise<UserRow[]> {
    return this.users.map((u) => ({ ...u }));
  }
  async createStaffUser(u: { id: string; name: string; email: string; password_hash: string; created_at: string; departments: string }): Promise<UserRow | null> {
    if (this.users.some((x) => x.email === u.email)) return null;
    const made = row(u.id, u.name, u.email, "staff", u.departments, { password_hash: u.password_hash, created_at: u.created_at, must_change_password: false });
    this.users.push(made);
    return { ...made };
  }
  async setUserRole(id: string, role: "admin" | "staff") {
    const u = this.users.find((x) => x.id === id);
    if (!u) return null;
    const before = { ...u };
    if (role === "staff" && u.role === "admin" && !this.users.some((x) => x.id !== id && x.role === "admin" && x.active)) return { refused: "last-super-admin" as const };
    u.role = role;
    u.active = true;
    if (role === "admin") u.departments = "";
    return { row: { ...u }, before };
  }
}

interface Server {
  base: string;
  store: MemoryAccessStore;
  ledger: MemoryLedger;
  lines: { who: string | null; action: string; target: string; detail: string }[];
  close: () => Promise<void>;
}

const SIGNED_IN: Record<string, PublicUser> = {};

async function start(): Promise<Server> {
  const store = new MemoryAccessStore();
  store.items.set("company|documents", { value: DOCS_JSON, version: 1, seq: 1 });
  store.users = [
    row("u-admin", "Super Admin", "admin@gpp.local", "admin"),
    row("u-kapila", "Kapila Barad", "kapila.barad@gpp.local", "staff", "QC"),
    row("u-vinay", "Vinay Bhojak", "vinay.bhojak@gpp.local", "staff", "HR"),
    row("u-ankur", "Ankur Raval", "ankur.raval@gpp.local", "staff", "QC"),
    row("u-owner", "Parth Raval", "parth@gpp.local", "staff", "QC", { active: false }),
  ];
  for (const u of store.users) SIGNED_IN[u.id] = { id: u.id, name: u.name, email: u.email, role: u.role, departments: u.departments ? u.departments.split(",") : [] };
  const ledger = createMemoryLedger(() => NOW);
  const lines: Server["lines"] = [];
  const app = express();
  app.use(express.json());
  const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
    const id = String(req.get("x-test-user"));
    const u = store.users.find((x) => x.id === id);
    if (!u) {
      res.status(401).json({ error: "Not authenticated." });
      return;
    }
    (req as Request & { user: PublicUser }).user = { id: u.id, name: u.name, email: u.email, role: u.role, departments: u.departments ? u.departments.split(",") : [] };
    next();
  };
  registerAccessRulesRoutes(app, { requireAuth, logActivity: (_r, who, action, target = "", detail = "") => lines.push({ who: who?.name ?? null, action, target, detail }), store, ledger: () => ledger, clock: () => NOW });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const { port } = server.address() as AddressInfo;
  return { base: `http://127.0.0.1:${port}`, store, ledger, lines, close: () => new Promise((resolve) => server.close(() => resolve())) };
}

async function call(s: Server, method: string, route: string, who: string, body?: unknown) {
  const res = await fetch(s.base + route, { method, headers: { "x-test-user": who, ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: (await res.json()) as any };
}

const settle = () => new Promise((r) => setTimeout(r, 30));

describe("the rules: read by everybody, set by the super admin", () => {
  let s: Server;
  before(async () => (s = await start()));
  after(() => s.close());

  it("anybody signed in reads them, with the version and the plant's people; nobody signed in does not", async () => {
    const r = await call(s, "GET", "/api/access/rules", "u-ankur");
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.rules, { version: 1, people: {}, responsibility: {} });
    assert.equal(r.body.version, 0);
    assert.deepEqual(r.body.defaults.people, DEFAULT_PEOPLE);
    assert.equal((await call(s, "GET", "/api/access/rules", "nobody")).status, 401);
  });

  it("refuses anybody but the super admin, in words", async () => {
    const r = await call(s, "PUT", "/api/access/rules", "u-kapila", { rules: { people: {} }, baseVersion: 0 });
    assert.equal(r.status, 403);
    assert.deepEqual(r.body, { error: "Only the super admin changes who may do what.", code: "super-admin-only" });
  });

  it("refuses a body that is not { rules, baseVersion }", async () => {
    assert.equal((await call(s, "PUT", "/api/access/rules", "u-admin", { rules: [], baseVersion: 0 })).status, 400);
    assert.equal((await call(s, "PUT", "/api/access/rules", "u-admin", { rules: {}, baseVersion: "1" })).status, 400);
  });

  it("saves them made safe, logs who changed what for whom, and tells the person in the level they now have", async () => {
    const r = await call(s, "PUT", "/api/access/rules", "u-admin", {
      rules: { people: { "Ankur.Raval@gpp.local": { modules: { HR: "read", XX: "edit" }, documents: { "qc-inspection-pouching": "write", "qc-viscosity": "owner" } } }, responsibility: {} },
      baseVersion: 0,
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.version, 1);
    const stored = JSON.parse(s.store.items.get("company|access")!.value);
    assert.deepEqual(stored, { version: 1, people: { "ankur.raval@gpp.local": { modules: { HR: "read" }, documents: { "qc-inspection-pouching": "write" } } }, responsibility: {} }, "junk dropped, the email in small letters");
    const line = s.lines.find((l) => l.action === "Access changed");
    assert.ok(line, JSON.stringify(s.lines));
    assert.equal(line.who, "Super Admin");
    assert.equal(line.target, "Ankur Raval <ankur.raval@gpp.local>");
    assert.equal(line.detail, "Human Resources: the owner's table → Read; F/QC/37 Inspection Record - Pouching Process: the owner's table → Write");
    await settle();
    const told = s.ledger.rows.filter((x) => x.userId === "u-ankur" && x.kind === "access_changed");
    assert.equal(told.length, 2);
    assert.deepEqual(told.map((t) => [t.data.module, t.data.documentId, t.data.level, t.data.by]).sort(), [
      ["HR", undefined, "read", "Super Admin"],
      ["QC", "qc-inspection-pouching", "write", "Super Admin"],
    ]);
    const read = await call(s, "GET", "/api/access/rules", "u-vinay");
    assert.equal(read.body.version, 1);
  });

  it("answers 409 with the rules as they stand when somebody saved in between", async () => {
    const r = await call(s, "PUT", "/api/access/rules", "u-admin", { rules: { people: {} }, baseVersion: 0 });
    assert.equal(r.status, 409);
    assert.equal(r.body.code, "stale");
    assert.equal(r.body.error, "Somebody saved the access rules after this page read them. Reload and make the change again.");
    assert.equal(r.body.current.version, 1);
    assert.ok(r.body.current.rules.people["ankur.raval@gpp.local"]);
  });

  it("a setting taken off goes back to the owner's table, said with the level it gives", async () => {
    s.lines.length = 0;
    const r = await call(s, "PUT", "/api/access/rules", "u-admin", { rules: { people: { "ankur.raval@gpp.local": { modules: { HR: "read" } } }, responsibility: {} }, baseVersion: 1 });
    assert.equal(r.status, 200);
    assert.equal(s.lines.find((l) => l.action === "Access changed")?.detail, "F/QC/37 Inspection Record - Pouching Process: Write → the owner's table (Read)");
  });

  it("who answers for a document: a line of its own, and each person gained or lost is told", async () => {
    s.lines.length = 0;
    const r = await call(s, "PUT", "/api/access/rules", "u-admin", { rules: { people: { "ankur.raval@gpp.local": { modules: { HR: "read" } } }, responsibility: { "qc-inspection-pouching": ["ankur.raval@gpp.local"] } }, baseVersion: 2 });
    assert.equal(r.status, 200);
    const line = s.lines.find((l) => l.action === "Who answers for a document changed");
    assert.equal(line?.target, "F/QC/37 Inspection Record - Pouching Process");
    assert.equal(line?.detail, "Kapila Barad → Ankur Raval");
    await settle();
    const ankur = s.ledger.rows.find((x) => x.userId === "u-ankur" && x.key.endsWith("|a:qc-inspection-pouching"));
    assert.equal(ankur?.data.level, "edit", "he answers for it now");
    const kapila = s.ledger.rows.find((x) => x.userId === "u-kapila" && x.key.endsWith("|a:qc-inspection-pouching"));
    assert.equal(kapila?.data.level, "edit", "she still edits all of QC");
  });

  it("a write that changes nothing says nothing", async () => {
    s.lines.length = 0;
    const r = await call(s, "PUT", "/api/access/rules", "u-admin", { rules: { people: { "ankur.raval@gpp.local": { modules: { HR: "read" } } }, responsibility: { "qc-inspection-pouching": ["ankur.raval@gpp.local"] } }, baseVersion: 3 });
    assert.equal(r.status, 200);
    assert.deepEqual(s.lines, []);
  });
});

describe("the plant's missing accounts, in one go", () => {
  let s: Server;
  before(async () => (s = await start()));
  after(() => s.close());

  it("refuses anybody but the super admin, and a first password under 8 characters", async () => {
    assert.equal((await call(s, "POST", "/api/access/accounts/create-missing", "u-vinay", { password: "LongEnough1" })).status, 403);
    const short = await call(s, "POST", "/api/access/accounts/create-missing", "u-admin", { password: "short" });
    assert.equal(short.status, 400);
    assert.equal(short.body.error, "The first password must be at least 8 characters.");
  });

  it("makes each of the twelve who has none, on the password they sign in with, a line each; the rest are named", async () => {
    const r = await call(s, "POST", "/api/access/accounts/create-missing", "u-admin", { password: "FirstPass@1" });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.existing.sort(), ["ankur.raval@gpp.local", "kapila.barad@gpp.local", "vinay.bhojak@gpp.local"]);
    assert.equal(r.body.created.length, 9);
    assert.ok(r.body.created.some((c: { name: string; email: string }) => c.name === "Ajay Sinh Vaghela" && c.email === "ajaysinh.vaghela@gpp.local"));
    const made = s.store.users.filter((u) => r.body.created.some((c: { email: string }) => c.email === u.email));
    assert.ok(made.every((u) => !u.must_change_password && u.role === "staff" && u.password_hash !== "FirstPass@1"));
    assert.ok(s.lines.some((l) => l.detail.includes("they sign in with the password the super admin typed")), "nobody is told to choose their own (§105)");
    assert.equal(s.store.users.find((u) => u.email === "chirag.parmar@gpp.local")?.departments, "PUR", "kept to the modules he sees");
    assert.equal(s.lines.filter((l) => l.action === "Account created by the administrator").length, 9);
    assert.ok(s.lines.every((l) => !l.detail.includes("FirstPass@1")), "the password is never written down");
    const again = await call(s, "POST", "/api/access/accounts/create-missing", "u-admin", { password: "FirstPass@1" });
    assert.deepEqual(again.body.created, []);
    assert.equal(again.body.existing.length, 12);
  });
});

describe("the super admin, or staff", () => {
  let s: Server;
  before(async () => (s = await start()));
  after(() => s.close());

  it("refuses anybody but the super admin, a role it does not know, and an account that is not there", async () => {
    assert.equal((await call(s, "POST", "/api/users/u-owner/role", "u-kapila", { role: "admin" })).status, 403);
    assert.equal((await call(s, "POST", "/api/users/u-owner/role", "u-admin", { role: "boss" })).status, 400);
    assert.equal((await call(s, "POST", "/api/users/nobody/role", "u-admin", { role: "admin" })).status, 404);
  });

  it("never leaves the plant without an active super admin", async () => {
    const r = await call(s, "POST", "/api/users/u-admin/role", "u-admin", { role: "staff" });
    assert.equal(r.status, 409);
    assert.equal(r.body.code, "last-super-admin");
  });

  it("makes the owner's account the super admin: switched on, every module, a line, and he is told", async () => {
    const r = await call(s, "POST", "/api/users/u-owner/role", "u-admin", { role: "admin" });
    assert.equal(r.status, 200);
    assert.equal(r.body.user.role, "admin");
    assert.equal(r.body.user.active, true);
    assert.deepEqual(r.body.user.departments, []);
    const line = s.lines.find((l) => l.action === "Role changed");
    assert.equal(line?.target, "Parth Raval <parth@gpp.local>");
    assert.equal(line?.detail, "Staff → Super admin; switched on; every module (no departments kept)");
    await settle();
    const told = s.ledger.rows.find((x) => x.userId === "u-owner" && x.kind === "access_changed");
    assert.equal(told?.data.level, "edit");
    assert.equal(told?.priority, "high");
    // With a second super admin, the first may become staff.
    const back = await call(s, "POST", "/api/users/u-admin/role", "u-owner", { role: "staff" });
    assert.equal(back.status, 200);
    assert.equal(back.body.user.role, "staff");
  });
});
