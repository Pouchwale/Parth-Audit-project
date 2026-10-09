// THE APP'S DATA AT EACH PERSON'S LEVEL (REQUIREMENTS §55, §96), backend/storageRoutes.ts, on a real Express server
// over an in-memory stand-in for PostgreSQL (the same writeItem contract: the version check, then the composition of
// the value from what is stored, inside one transaction):
//   * GET /api/storage hands each person the records and deletions-log lines of the documents they see at Read or more,
//     HR Master Data only with Human Resources, the access rules to everybody, and the key of their copy;
//   * PUT /api/storage/records is checked record by record against the version stored, and refused with 403 and the
//     level in plain words for a person's own act their level does not allow; everyone else's lines are kept;
//   * the documents and the format edits are Edit's; the access rules are the super admin's, through their own writer;
//   * the super admin passes everything; an account nobody has described keeps its departments, as before.
// Run: npm run test:unit -- storageRoutes
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import express, { type NextFunction, type Request, type Response } from "express";
import type { PublicUser } from "../auth.ts";
import type { StoredItem, StoredItems, WriteResult } from "../db.ts";
import { registerStorageRoutes, type AccessRulesWriter, type StorageStore } from "../storageRoutes.ts";
import { DOCS_JSON } from "./accessFixtures.ts";

class MemoryStorage implements StorageStore {
  items = new Map<string, { value: string; version: number; seq: number }>();
  seq = 0;
  private k = (scope: string, key: string) => `${scope}|${key}`;
  put(key: string, value: unknown, scope = "company"): void {
    const now = this.items.get(this.k(scope, key));
    this.seq += 1;
    this.items.set(this.k(scope, key), { value: typeof value === "string" ? value : JSON.stringify(value), version: (now?.version ?? 0) + 1, seq: this.seq });
  }
  value(key: string): unknown {
    return JSON.parse(this.items.get(this.k("company", key))!.value);
  }
  version(key: string): number {
    return this.items.get(this.k("company", key))?.version ?? 0;
  }
  async storedItems(userId: string, sinceSeq: number): Promise<StoredItems> {
    const items: StoredItems["items"] = [];
    const versions: Record<string, number> = {};
    let seq = sinceSeq;
    for (const [k, v] of this.items) {
      const [scope, key] = k.split("|");
      if (scope !== "company" && scope !== userId) continue;
      versions[key] = v.version;
      seq = Math.max(seq, v.seq);
      if (v.seq > sinceSeq) items.push({ scope: scope === "company" ? "company" : "user", key, value: v.value, version: v.version, seq: v.seq });
    }
    return { items, seq, versions };
  }
  async readItem(scope: string, key: string): Promise<StoredItem | null> {
    const v = this.items.get(this.k(scope, key));
    return v ? { key, ...v } : null;
  }
  async writeItem(scope: string, key: string, value: string, baseVersion: number | null, _by: string, compose?: (stored: string | null) => string): Promise<WriteResult> {
    const now = this.items.get(this.k(scope, key));
    const current = now ? { key, ...now } : null;
    if (baseVersion !== null && (now ? now.version !== baseVersion : baseVersion !== 0)) return { ok: false, current };
    const toStore = compose ? compose(now ? now.value : null) : value; // throws: nothing is written
    this.put(key, toStore, scope);
    const written = this.items.get(this.k(scope, key))!;
    return { ok: true, version: written.version, seq: written.seq };
  }
  async deleteItem(scope: string, key: string): Promise<void> {
    this.items.delete(this.k(scope, key));
  }
  async itemSeq(scope: string, key: string): Promise<number | null> {
    return this.items.get(this.k(scope, key))?.seq ?? null;
  }
}

const USERS: Record<string, PublicUser> = {
  admin: { id: "u-admin", name: "Super Admin", email: "admin@gpp.local", role: "admin", departments: [] },
  ankur: { id: "u-ankur", name: "Ankur Raval", email: "ankur.raval@gpp.local", role: "staff", departments: ["QC"] },
  vinay: { id: "u-vinay", name: "Vinay Bhojak", email: "vinay.bhojak@gpp.local", role: "staff", departments: ["HR"] },
  kapila: { id: "u-kapila", name: "Kapila Barad", email: "kapila.barad@gpp.local", role: "staff", departments: ["QC"] },
  clerk: { id: "u-clerk", name: "Dept QC QA", email: "dept-qc@example.com", role: "staff", departments: ["QC"] },
  all: { id: "u-all", name: "Dept All QA", email: "dept-all@example.com", role: "staff", departments: [] },
};

let n = 0;
const entry = (action: string) => ({ id: `h-${++n}`, at: "2026-10-08T05:00:00.000Z", by: "x", action });
const rec = (id: string, documentId: string, status: string, extra: Record<string, unknown> = {}) => ({ id, documentId, dueDate: "2026-10-08", status, isDemo: false, data: { v: 1 }, history: [entry("edited")], ...extra });

const HR_RECORD = rec("hr-1", "hr-competence", "Verified", { history: [entry("submitted"), entry("verified")] });
const POUCHING = rec("p-1", "qc-inspection-pouching", "In Progress");
const VISCOSITY = rec("v-1", "qc-viscosity", "In Progress");

interface Server {
  base: string;
  store: MemoryStorage;
  lines: { who: string | null; action: string; target: string; detail: string }[];
  rulesWrites: { by: string; rules: unknown; baseVersion: number | null }[];
  close: () => Promise<void>;
}

async function start(): Promise<Server> {
  const store = new MemoryStorage();
  store.put("documents", DOCS_JSON);
  store.put("records", [HR_RECORD, POUCHING, VISCOSITY]);
  store.put("deletions", [{ id: "d-1", documentId: "hr-competence" }, { id: "d-2", documentId: "qc-viscosity" }]);
  store.put("hrMasterData", { people: [] });
  store.put("formatEdits", { "qc-viscosity": { revisionNo: "01" } });
  store.put("access", { version: 1, people: {}, responsibility: {} });
  const lines: Server["lines"] = [];
  const rulesWrites: Server["rulesWrites"] = [];
  const writer: AccessRulesWriter = {
    async save(_req, by, rules, baseVersion) {
      rulesWrites.push({ by: by.email, rules, baseVersion });
      return store.writeItem("company", "access", JSON.stringify(rules), baseVersion, by.email);
    },
  };
  const app = express();
  const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
    const user = USERS[String(req.get("x-test-user"))];
    if (!user) {
      res.status(401).json({ error: "Not authenticated." });
      return;
    }
    (req as Request & { user: PublicUser }).user = user;
    next();
  };
  registerStorageRoutes(app, { requireAuth, logActivity: (_r, who, action, target = "", detail = "") => lines.push({ who: who?.name ?? null, action, target, detail }), store, accessRules: writer });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const { port } = server.address() as AddressInfo;
  return { base: `http://127.0.0.1:${port}`, store, lines, rulesWrites, close: () => new Promise((resolve) => server.close(() => resolve())) };
}

async function get(s: Server, who: string) {
  const res = await fetch(`${s.base}/api/storage`, { headers: { "x-test-user": who } });
  return { status: res.status, body: (await res.json()) as { items: { key: string; value: string; scope: string }[]; versions: Record<string, number>; denied: string[]; scope: string } };
}

async function put(s: Server, who: string, key: string, value: unknown, opts: { base?: number | "*"; scope?: string } = {}) {
  const headers: Record<string, string> = { "x-test-user": who, "Content-Type": "text/plain", "X-Base-Version": String(opts.base ?? s.store.version(key)) };
  if (opts.scope !== undefined) headers["X-Scope"] = opts.scope;
  const res = await fetch(`${s.base}/api/storage/${key}`, { method: "PUT", headers, body: typeof value === "string" ? value : JSON.stringify(value) });
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

const itemOf = (body: { items: { key: string; value: string }[] }, key: string): unknown => {
  const item = body.items.find((i) => i.key === key);
  return item ? JSON.parse(item.value) : undefined;
};
const idsOf = (list: unknown): string[] => ((list as { id: string }[]) ?? []).map((r) => r.id).sort();

describe("what each person is handed", () => {
  let s: Server;
  before(async () => (s = await start()));
  after(() => s.close());

  it("the records and deletions-log lines of the documents a person sees at Read or more", async () => {
    const ankur = (await get(s, "ankur")).body;
    assert.deepEqual(idsOf(itemOf(ankur, "records")), ["p-1", "v-1"], "Quality Control's, not Human Resources'");
    assert.deepEqual(idsOf(itemOf(ankur, "deletions")), ["d-2"]);
    assert.match(ankur.scope, /^v:/);
    const vinay = (await get(s, "vinay")).body;
    assert.deepEqual(idsOf(itemOf(vinay, "records")), ["hr-1"]);
    const kapila = (await get(s, "kapila")).body;
    assert.deepEqual(idsOf(itemOf(kapila, "records")), ["hr-1", "p-1", "v-1"], "she views every module");
    const admin = (await get(s, "admin")).body;
    assert.deepEqual(idsOf(itemOf(admin, "records")), ["hr-1", "p-1", "v-1"]);
    assert.equal(admin.scope, "*");
  });

  it("HR Master Data only with Human Resources (and its version not even named to anybody else)", async () => {
    const ankur = (await get(s, "ankur")).body;
    assert.deepEqual(ankur.denied, ["hrMasterData"]);
    assert.equal(itemOf(ankur, "hrMasterData"), undefined);
    assert.equal(ankur.versions.hrMasterData, undefined);
    assert.deepEqual((await get(s, "vinay")).body.denied, []);
    assert.deepEqual((await get(s, "kapila")).body.denied, []);
  });

  it("the access rules to everybody signed in", async () => {
    for (const who of ["ankur", "vinay", "admin", "clerk"]) assert.ok(itemOf((await get(s, who)).body, "access"), who);
  });

  it("an account nobody has described keeps what it had: its departments' lines, or every line", async () => {
    const clerk = (await get(s, "clerk")).body;
    assert.deepEqual(idsOf(itemOf(clerk, "records")), ["p-1", "v-1"]);
    assert.deepEqual(clerk.denied, ["hrMasterData"]);
    const all = (await get(s, "all")).body;
    assert.deepEqual(idsOf(itemOf(all, "records")), ["hr-1", "p-1", "v-1"]);
    assert.equal(all.scope, "*");
  });
});

describe("a write of the records, record by record", () => {
  let s: Server;
  before(async () => (s = await start()));
  after(() => s.close());

  it("refuses a Read-only person's own change with 403 and the level in plain words, and writes nothing", async () => {
    const version = s.store.version("records");
    const scope = (await get(s, "ankur")).body.scope;
    const r = await put(s, "ankur", "records", [{ ...POUCHING, data: { v: 2 }, history: [...POUCHING.history, entry("edited")] }, VISCOSITY], { scope });
    assert.equal(r.status, 403);
    assert.equal(r.body.code, "access-level");
    assert.equal(r.body.error, "F/QC/37 Inspection Record - Pouching Process is Read only for you. Filling in a record needs Write access: ask the super admin for it.");
    assert.equal(r.body.needed, "write");
    assert.equal(r.body.recordId, "p-1");
    assert.equal(s.store.version("records"), version, "nothing written");
    assert.ok(s.lines.some((l) => l.action === "Change refused" && l.who === "Ankur Raval"));
  });

  it("refuses a record started on a document the person only reads", async () => {
    const r = await put(s, "ankur", "records", [POUCHING, VISCOSITY, rec("p-new", "qc-inspection-pouching", "In Progress")]);
    assert.equal(r.status, 403);
    assert.equal(r.body.action, "start");
  });

  it("takes the change the person's level allows, and keeps everyone else's lines as stored", async () => {
    const filled = { ...VISCOSITY, status: "Pending Verification", submittedBy: "Ankur Raval", history: [...VISCOSITY.history, entry("submitted")] };
    const r = await put(s, "ankur", "records", [POUCHING, filled]);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const all = s.store.value("records") as { id: string; status: string }[];
    assert.deepEqual(all.map((x) => x.id).sort(), ["hr-1", "p-1", "v-1"]);
    assert.equal(all.find((x) => x.id === "v-1")?.status, "Pending Verification");
    assert.equal(all.find((x) => x.id === "hr-1")?.status, "Verified");
  });

  it("leaves the app's housekeeping as stored and says which (kept)", async () => {
    const r = await put(s, "ankur", "records", [...(s.store.value("records") as { documentId: string }[]).filter((x) => x.documentId !== "hr-competence"), rec("sheet-1", "qc-inspection-pouching", "Due", { history: [] })]);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.kept, ["sheet-1"]);
    assert.equal((s.store.value("records") as { id: string }[]).some((x) => x.id === "sheet-1"), false);
  });

  it("answers 409 with the person's own lines when the copy was made for other levels (X-Scope)", async () => {
    const r = await put(s, "ankur", "records", [POUCHING], { scope: "QC" });
    assert.equal(r.status, 409);
    assert.match(r.body.scope, /^v:/);
    assert.deepEqual(idsOf(JSON.parse(r.body.current.value)), ["p-1", "v-1"]);
  });

  it("answers 409 with the person's own lines when the item moved on", async () => {
    const r = await put(s, "ankur", "records", [POUCHING], { base: 1 });
    assert.equal(r.status, 409);
    assert.deepEqual(idsOf(JSON.parse(r.body.current.value)), ["p-1", "v-1"]);
  });

  it("the super admin's write is taken as it is", async () => {
    const r = await put(s, "admin", "records", [HR_RECORD]);
    assert.equal(r.status, 200);
    assert.deepEqual(idsOf(s.store.value("records")), ["hr-1"]);
  });
});

describe("the definitions, the format edits, HR Master Data and the access rules", () => {
  let s: Server;
  before(async () => (s = await start()));
  after(() => s.close());

  it("a format edit of a document the person has not Edit on is refused; of one they have, taken", async () => {
    const refused = await put(s, "ankur", "formatEdits", { "qc-viscosity": { revisionNo: "01" }, "qc-inspection-pouching": { revisionNo: "01" } });
    assert.equal(refused.status, 403);
    assert.equal(refused.body.action, "format");
    assert.equal(refused.body.error, "F/QC/37 Inspection Record - Pouching Process is Read only for you. Changing the format needs Edit access: ask the super admin for it.");
    const taken = await put(s, "ankur", "formatEdits", { "qc-viscosity": { revisionNo: "02" } });
    assert.equal(taken.status, 200, JSON.stringify(taken.body));
  });

  it("the definitions: Edit's", async () => {
    const docs = JSON.parse(DOCS_JSON) as { id: string; name: string }[];
    const r = await put(s, "vinay", "documents", docs.map((d) => (d.id === "qc-viscosity" ? { ...d, name: "Renamed" } : d)));
    assert.equal(r.status, 403);
    assert.equal(r.body.level, "none");
    assert.equal((await put(s, "admin", "documents", docs)).status, 200);
  });

  it("HR Master Data: refused to whoever does not see Human Resources, taken from HR", async () => {
    const refused = await put(s, "ankur", "hrMasterData", { people: [{ name: "x" }] });
    assert.equal(refused.status, 403);
    assert.equal(refused.body.error, "This account's departments do not hold that.");
    assert.equal((await put(s, "vinay", "hrMasterData", { people: [{ name: "x" }] })).status, 200);
  });

  it("the access rules: the super admin's alone, and through the rules' own writer", async () => {
    const refused = await put(s, "kapila", "access", { version: 1, people: {}, responsibility: {} });
    assert.equal(refused.status, 403);
    assert.equal(refused.body.code, "super-admin-only");
    assert.equal(refused.body.error, "Only the super admin changes who may do what.");
    assert.equal(s.rulesWrites.length, 0);
    const taken = await put(s, "admin", "access", { version: 1, people: { "ankur.raval@gpp.local": { modules: { HR: "read" } } }, responsibility: {} });
    assert.equal(taken.status, 200);
    assert.equal(s.rulesWrites.length, 1);
    // ...and Ankur's view follows at once: Human Resources' record is his to read now.
    assert.deepEqual(idsOf(itemOf((await get(s, "ankur")).body, "records")), ["hr-1", "p-1", "v-1"]);
  });

  it("the company's items are removed by the super admin alone", async () => {
    const res = await fetch(`${s.base}/api/storage/access`, { method: "DELETE", headers: { "x-test-user": "ankur" } });
    assert.equal(res.status, 403);
    const ok = await fetch(`${s.base}/api/storage/access`, { method: "DELETE", headers: { "x-test-user": "admin" } });
    assert.equal(ok.status, 204);
    assert.ok(s.lines.some((l) => l.action === "Access changed" && l.target === "Everybody"));
  });
});
