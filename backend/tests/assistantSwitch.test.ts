// MITRA SWITCHED OFF FOR THE STAFF BY THE SUPER ADMIN (backend/assistantSwitch.ts; the owner, 2-Nov-2026), on a real
// Express server over an in-memory stand-in for PostgreSQL: on for everybody until the super admin says otherwise; read
// by anybody signed in; set by the super admin alone, with a line in the activity log; and the guard every Mitra route
// stands behind — the super admin always through, the staff only while the switch is on, 403 "assistant-off" otherwise.
// Run: npm run test:unit -- assistantSwitch
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import express, { type NextFunction, type Request, type Response } from "express";
import type { PublicUser } from "../auth.ts";
import type { StoredItem, WriteResult } from "../db.ts";
import { ASSISTANT_OFF_CODE, ASSISTANT_SWITCH_KEY, assistantAllowedFor, readAssistantSwitch, registerAssistantSwitchRoutes, type AssistantSwitchStore } from "../assistantSwitch.ts";

const NOW = new Date("2026-11-02T04:30:00.000Z");

class MemoryStore implements AssistantSwitchStore {
  items = new Map<string, { value: string; version: number; seq: number }>();
  seq = 0;
  async readItem(scope: string, key: string): Promise<StoredItem | null> {
    const v = this.items.get(`${scope}|${key}`);
    return v ? { key, ...v } : null;
  }
  async writeItem(scope: string, key: string, value: string, _baseVersion: number | null, _by: string): Promise<WriteResult> {
    const now = this.items.get(`${scope}|${key}`);
    this.seq += 1;
    this.items.set(`${scope}|${key}`, { value, version: (now?.version ?? 0) + 1, seq: this.seq });
    const w = this.items.get(`${scope}|${key}`)!;
    return { ok: true, version: w.version, seq: w.seq };
  }
}

const PEOPLE: Record<string, PublicUser> = {
  "u-admin": { id: "u-admin", name: "Super Admin", email: "superadmin05@gmail.com", role: "admin", departments: [] },
  "u-kapila": { id: "u-kapila", name: "Kapila Barad", email: "kapila.barad@gpp.local", role: "staff", departments: ["QC"] },
};

interface Server {
  base: string;
  store: MemoryStore;
  lines: { who: string | null; action: string; target: string; detail: string }[];
  close: () => Promise<void>;
}

async function start(): Promise<Server> {
  const store = new MemoryStore();
  const lines: Server["lines"] = [];
  const app = express();
  app.use(express.json());
  const signedIn = (req: Request): PublicUser | undefined => PEOPLE[String(req.get("x-test-user"))];
  const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
    const u = signedIn(req);
    if (!u) {
      res.status(401).json({ error: "Not authenticated." });
      return;
    }
    (req as Request & { user: PublicUser }).user = u;
    next();
  };
  const requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
    const u = signedIn(req);
    if (!u) {
      res.status(401).json({ error: "Not authenticated." });
      return;
    }
    if (u.role !== "admin") {
      res.status(403).json({ error: "Only the system administrator can change department access." });
      return;
    }
    (req as Request & { user: PublicUser }).user = u;
    next();
  };
  const { requireAssistant } = registerAssistantSwitchRoutes(app, { requireAuth, requireAdmin, logActivity: (_r, who, action, target = "", detail = "") => lines.push({ who: who?.name ?? null, action, target, detail }), store, clock: () => NOW });
  // A route of Mitra's, as backend/index.ts guards them.
  app.post("/api/assistant/chat", requireAuth, requireAssistant, (_req, res) => res.json({ reply: "Hello from the model." }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const { port } = server.address() as AddressInfo;
  return { base: `http://127.0.0.1:${port}`, store, lines, close: () => new Promise((resolve) => server.close(() => resolve())) };
}

async function call(s: Server, method: string, route: string, who: string, body?: unknown) {
  const res = await fetch(s.base + route, { method, headers: { "x-test-user": who, ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: (await res.json()) as any };
}

describe("Mitra for the staff: on until the super admin switches it off", () => {
  let s: Server;
  before(async () => (s = await start()));
  after(() => s.close());

  it("is on for everybody when nothing has been stored, and when what was stored cannot be read", async () => {
    assert.deepEqual(await readAssistantSwitch(s.store), { staff: true, by: "", at: "" });
    assert.equal(await assistantAllowedFor(PEOPLE["u-kapila"], s.store), true);
    s.store.items.set(`company|${ASSISTANT_SWITCH_KEY}`, { value: "not json", version: 1, seq: 1 });
    assert.equal((await readAssistantSwitch(s.store)).staff, true);
    s.store.items.delete(`company|${ASSISTANT_SWITCH_KEY}`);
    const r = await call(s, "GET", "/api/assistant/access", "u-kapila");
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { staff: true, mine: true, by: "", at: "" });
    assert.equal((await call(s, "POST", "/api/assistant/chat", "u-kapila", { message: "hi" })).status, 200);
    assert.equal((await call(s, "GET", "/api/assistant/access", "nobody")).status, 401);
  });

  it("is the super admin's to set, not the staff's, and only with a plain yes or no", async () => {
    const refused = await call(s, "PUT", "/api/assistant/access", "u-kapila", { staff: false });
    assert.equal(refused.status, 403);
    assert.equal((await call(s, "PUT", "/api/assistant/access", "u-admin", { staff: "no" })).status, 400);
    assert.equal((await readAssistantSwitch(s.store)).staff, true, "nothing changed");
    assert.deepEqual(s.lines, []);
  });

  it("switched off: the staff lose the page and every Mitra route, the super admin keeps them, and the log says who and when", async () => {
    const set = await call(s, "PUT", "/api/assistant/access", "u-admin", { staff: false });
    assert.equal(set.status, 200);
    assert.deepEqual(set.body, { staff: false, mine: true, by: "superadmin05@gmail.com", at: NOW.toISOString() });
    assert.deepEqual(s.lines, [{ who: "Super Admin", action: "Mitra switched off for the staff", target: "Mitra", detail: "Nobody but the super admin has Mitra: no Ask Mitra page, no floating Mitra, no Mitra buttons, and the server refuses Mitra's routes for them." }]);

    const kapila = await call(s, "GET", "/api/assistant/access", "u-kapila");
    assert.deepEqual(kapila.body, { staff: false, mine: false, by: "superadmin05@gmail.com", at: NOW.toISOString() });
    const chat = await call(s, "POST", "/api/assistant/chat", "u-kapila", { message: "hi" });
    assert.equal(chat.status, 403);
    assert.deepEqual(chat.body, { error: "Mitra has been switched off for the staff by the super admin.", code: ASSISTANT_OFF_CODE });
    assert.equal((await call(s, "POST", "/api/assistant/chat", "u-admin", { message: "hi" })).status, 200, "the super admin's own Mitra is never touched");
    assert.equal(await assistantAllowedFor(PEOPLE["u-admin"], s.store), true);
    assert.equal(await assistantAllowedFor(PEOPLE["u-kapila"], s.store), false);
  });

  it("set again as it is, nothing is written or logged; switched on again, everybody has it and the log says so", async () => {
    const same = await call(s, "PUT", "/api/assistant/access", "u-admin", { staff: false });
    assert.equal(same.status, 200);
    assert.equal(s.lines.length, 1);
    const on = await call(s, "PUT", "/api/assistant/access", "u-admin", { staff: true });
    assert.equal(on.body.staff, true);
    assert.equal(s.lines.length, 2);
    assert.equal(s.lines[1].action, "Mitra switched on for the staff");
    assert.equal((await call(s, "POST", "/api/assistant/chat", "u-kapila", { message: "hi" })).status, 200);
  });
});
