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
import type { ComposeLines, LinesAnchor, LinesAnswer, LinesWriteResult, StoredItem, StoredItems, WriteResult } from "../db.ts";
import { registerStorageRoutes, type AccessRulesWriter, type StorageStore } from "../storageRoutes.ts";
import { Lines, answerLines, changesBetween, journalRows, journaled, saveLines, type JournalRow } from "../changeJournal.ts";
import { DOCS_JSON } from "./accessFixtures.ts";

class MemoryStorage implements StorageStore {
  items = new Map<string, { value: string; version: number; seq: number }>();
  /** The change journal (backend/db.ts app_storage_changes), each row with its item. */
  journal: (JournalRow & { scope: string; key: string })[] = [];
  seq = 0;
  private k = (scope: string, key: string) => `${scope}|${key}`;
  /** Stores the next version as it is, journaling the records' changes as db.ts writeItem does. */
  put(key: string, value: unknown, scope = "company"): { version: number; seq: number } {
    const before = this.items.get(this.k(scope, key));
    const written = this.store(scope, key, typeof value === "string" ? value : JSON.stringify(value));
    if (journaled(scope, key)) {
      const was = before ? Lines.parse(before.value) : null;
      const now = Lines.parse(this.items.get(this.k(scope, key))!.value);
      const changes = now && (!before || was) ? changesBetween(was, now) : null;
      if (changes) for (const row of journalRows(written.seq, written.version, changes)) this.journal.push({ ...row, scope, key });
    }
    return written;
  }
  private store(scope: string, key: string, value: string): { version: number; seq: number } {
    const now = this.items.get(this.k(scope, key));
    this.seq += 1;
    const next = { value, version: (now?.version ?? 0) + 1, seq: this.seq };
    this.items.set(this.k(scope, key), next);
    return { version: next.version, seq: next.seq };
  }
  value(key: string): unknown {
    return JSON.parse(this.items.get(this.k("company", key))!.value);
  }
  version(key: string): number {
    return this.items.get(this.k("company", key))?.version ?? 0;
  }
  /** The records as a browser holds them: the version and the write that made it. */
  anchor(): LinesAnchor {
    const v = this.items.get(this.k("company", "records"))!;
    return { version: v.version, seq: v.seq };
  }
  async storedItems(userId: string, sinceSeq: number, withoutValueOf: readonly string[] = []): Promise<StoredItems> {
    const items: StoredItems["items"] = [];
    const versions: Record<string, number> = {};
    let seq = sinceSeq;
    for (const [k, v] of this.items) {
      const [scope, key] = k.split("|");
      if (scope !== "company" && scope !== userId) continue;
      versions[key] = v.version;
      seq = Math.max(seq, v.seq);
      if (v.seq > sinceSeq && !(scope === "company" && withoutValueOf.includes(key))) items.push({ scope: scope === "company" ? "company" : "user", key, value: v.value, version: v.version, seq: v.seq });
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
    const written = this.put(key, toStore, scope);
    return { ok: true, version: written.version, seq: written.seq };
  }
  async writeLines(scope: string, key: string, base: { version: number; seq: number | null }, _by: string, compose: ComposeLines): Promise<LinesWriteResult> {
    const now = this.items.get(this.k(scope, key));
    return saveLines(
      {
        key,
        stored: now ? { version: now.version, seq: now.seq } : null,
        lines: () => Lines.parse(now?.value),
        text: () => now!.value,
        span: async (from, to) => this.span(scope, key, from, to),
        write: async (value) => this.store(scope, key, value),
        journal: async (rows) => void this.journal.push(...rows.map((row) => ({ ...row, scope, key }))),
      },
      base,
      compose
    );
  }
  async lineChanges(scope: string, key: string, from: LinesAnchor): Promise<LinesAnswer | null> {
    const now = this.items.get(this.k(scope, key));
    return answerLines(now ? { version: now.version, seq: now.seq } : null, from, async (a, b) => this.span(scope, key, a, b), () => Lines.parse(now?.value));
  }
  private span(scope: string, key: string, from: number, to: number): JournalRow[] {
    return this.journal.filter((row) => row.scope === scope && row.key === key && row.seq >= from && row.seq <= to);
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
  // As backend/index.ts does for every route: a JSON body is parsed before the routes (100 KB at most).
  app.use(express.json());
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

  it("never stores a record started on a document the person only reads, and says so in `kept`", async () => {
    const r = await put(s, "ankur", "records", [POUCHING, VISCOSITY, rec("p-new", "qc-inspection-pouching", "In Progress")]);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.kept, ["p-new"]);
    assert.equal((s.store.value("records") as { id: string }[]).some((x) => x.id === "p-new"), false);
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

  it("the definitions: a stored one is changed only with Edit on it, and otherwise left as stored", async () => {
    const docs = JSON.parse(DOCS_JSON) as { id: string; name: string }[];
    const r = await put(s, "vinay", "documents", docs.map((d) => (d.id === "qc-viscosity" ? { ...d, name: "Renamed" } : d)));
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.kept, ["qc-viscosity"]);
    assert.equal((s.store.value("documents") as { id: string; name: string }[]).find((d) => d.id === "qc-viscosity")?.name, "Lamination Adhesive Viscosity Record");
    const admin = await put(s, "admin", "documents", docs.map((d) => (d.id === "qc-viscosity" ? { ...d, name: "Renamed" } : d)));
    assert.equal(admin.status, 200);
    assert.equal((s.store.value("documents") as { id: string; name: string }[]).find((d) => d.id === "qc-viscosity")?.name, "Renamed");
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

// ---------------------------------------------------------------------------
// ONE RECORD PER SAVE (REQUIREMENTS §108): a save sends the records that changed (PATCH), and a browser asking what
// changed is handed only those, by the change journal.

interface Answer {
  status: number;
  body: Record<string, any>;
}

async function patch(s: Server, who: string, changes: { changed?: unknown[]; removed?: string[] }, base: { version: number; seq?: number | null }, scope?: string, type = "text/plain;charset=utf-8"): Promise<Answer> {
  // As the browser sends it: text, so the server's JSON parser of every route (100 KB) never takes it.
  const headers: Record<string, string> = { "x-test-user": who, "Content-Type": type, "X-Base-Version": String(base.version) };
  if (base.seq !== undefined && base.seq !== null) headers["X-Base-Seq"] = String(base.seq);
  if (scope !== undefined) headers["X-Scope"] = scope;
  const res = await fetch(`${s.base}/api/storage/records`, { method: "PATCH", headers, body: JSON.stringify(changes) });
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

/** GET /api/storage as a browser holding the records at `anchor` asks it. */
async function getSince(s: Server, who: string, anchor: { version: number; seq: number }, since = 0) {
  const res = await fetch(`${s.base}/api/storage?since=${since}`, {
    headers: { "x-test-user": who, "X-Records-Version": String(anchor.version), "X-Records-Seq": String(anchor.seq) },
  });
  return (await res.json()) as { items: { key: string; value?: string; version: number; seq: number; changes?: { from: number; changed: { id: string }[]; removed: string[] } }[]; seq: number };
}

const recordsOf = (s: Server) => s.store.value("records") as { id: string; status: string; data: { v: number }; documentId: string }[];
const filled = (r: ReturnType<typeof rec>, v: number) => ({ ...r, data: { v }, history: [...r.history, entry("edited")] });

describe("one record per save: the records that changed, laid over the item as stored (§108)", () => {
  let s: Server;
  before(async () => (s = await start()));
  after(() => s.close());

  it("a save of one record is stored beside every other record as it was, and journaled by its id", async () => {
    const anchor = s.store.anchor();
    const r = await patch(s, "admin", { changed: [filled(VISCOSITY, 2)] }, anchor);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.version, anchor.version + 1);
    assert.deepEqual(r.body.changes, { from: anchor.version, changed: [], removed: [] }, "nothing it has not seen");
    const all = recordsOf(s);
    assert.deepEqual(all.map((x) => x.id), ["hr-1", "p-1", "v-1"], "in place, the others as they were");
    assert.equal(all.find((x) => x.id === "v-1")!.data.v, 2);
    const rows = s.store.journal.filter((row) => row.seq === r.body.seq);
    assert.deepEqual(rows.map((row) => row.recordId), [null, "v-1"], "the write, and the one record it changed");
  });

  it("somebody else's save in between, of another record: no 409, both kept, and the answer hands back theirs", async () => {
    const anchor = s.store.anchor();
    const theirs = await patch(s, "admin", { changed: [filled(POUCHING, 3)] }, anchor);
    assert.equal(theirs.status, 200);
    // The same copy, a moment later, saves another record.
    const mine = await patch(s, "admin", { changed: [rec("v-new", "qc-viscosity", "In Progress")] }, anchor);
    assert.equal(mine.status, 200, JSON.stringify(mine.body));
    assert.equal(mine.body.version, anchor.version + 2);
    assert.deepEqual(mine.body.changes.changed.map((x: { id: string }) => x.id), ["p-1"], "the record changed since its copy");
    assert.equal(mine.body.changes.changed[0].data.v, 3);
    const all = recordsOf(s);
    assert.equal(all.find((x) => x.id === "p-1")!.data.v, 3, "theirs kept");
    assert.ok(all.some((x) => x.id === "v-new"), "mine kept");
  });

  it("a save naming a record somebody else changed first: 409 with the records changed since, nothing written", async () => {
    const anchor = s.store.anchor();
    assert.equal((await patch(s, "admin", { changed: [filled(VISCOSITY, 4)] }, anchor)).status, 200);
    const version = s.store.version("records");
    const r = await patch(s, "admin", { changed: [filled(VISCOSITY, 5)] }, anchor);
    assert.equal(r.status, 409);
    assert.deepEqual(r.body.conflicts, ["v-1"]);
    assert.equal(r.body.version, version);
    assert.deepEqual(r.body.changes.changed.map((x: { id: string }) => x.id), ["v-1"]);
    assert.equal(r.body.changes.changed[0].data.v, 4, "their copy, to merge with");
    assert.equal(s.store.version("records"), version, "nothing written");
    // Merged and sent again from the version it was handed: taken.
    const again = await patch(s, "admin", { changed: [filled(VISCOSITY, 5)] }, { version: r.body.version, seq: r.body.seq });
    assert.equal(again.status, 200);
    assert.equal(recordsOf(s).find((x) => x.id === "v-1")!.data.v, 5);
  });

  it("a save sent twice (its answer lost on the way) is taken once, without a 409", async () => {
    const anchor = s.store.anchor();
    const change = { changed: [filled(POUCHING, 6)] };
    const first = await patch(s, "admin", change, anchor);
    assert.equal(first.status, 200);
    const second = await patch(s, "admin", change, anchor);
    assert.equal(second.status, 200, JSON.stringify(second.body));
    assert.equal(second.body.version, first.body.version, "nothing written the second time");
  });

  it("a removal travels; a record removed by somebody else since is no conflict for a save of others", async () => {
    const anchor = s.store.anchor();
    const r = await patch(s, "admin", { removed: ["v-new"] }, anchor);
    assert.equal(r.status, 200);
    assert.equal(recordsOf(s).some((x) => x.id === "v-new"), false);
    assert.ok(s.store.journal.some((row) => row.seq === r.body.seq && row.recordId === "v-new" && row.removed));
    const later = await patch(s, "admin", { changed: [filled(HR_RECORD, 7)] }, anchor);
    assert.equal(later.status, 200);
    assert.deepEqual(later.body.changes.removed, ["v-new"], "told it is gone");
  });

  it("the same blank sheet made on two computers at once: the one stored stays, and the other is told", async () => {
    const anchor = s.store.anchor();
    const sheet = (id: string, extra: Record<string, unknown> = {}) =>
      rec(id, "qc-viscosity", "Due", { periodKey: "qc-viscosity:2026-11-02", createdAt: "2026-11-01T00:00:00.000Z", updatedAt: "2026-11-01T00:00:00.000Z", history: [], ...extra });
    assert.equal((await patch(s, "admin", { changed: [sheet("sheet-a")] }, anchor)).status, 200);
    const second = await patch(s, "admin", { changed: [sheet("sheet-b")] }, anchor);
    assert.equal(second.status, 200, JSON.stringify(second.body));
    assert.deepEqual(second.body.changes.removed, ["sheet-b"], "its own gives way");
    assert.deepEqual(second.body.changes.changed.map((x: { id: string }) => x.id), ["sheet-a"], "to the one stored, handed to it");
    assert.deepEqual(recordsOf(s).filter((x) => x.id.startsWith("sheet-")).map((x) => x.id), ["sheet-a"]);
    // A sheet somebody worked on, made elsewhere for the same day, takes the place of the blank one stored.
    const worked = sheet("sheet-c", { status: "In Progress", updatedAt: "2026-11-02T05:00:00.000Z", history: [entry("edited")] });
    const third = await patch(s, "admin", { changed: [worked] }, s.store.anchor());
    assert.equal(third.status, 200);
    assert.deepEqual(third.body.changes.removed, ["sheet-a"]);
    assert.deepEqual(recordsOf(s).filter((x) => x.id.startsWith("sheet-")).map((x) => x.id), ["sheet-c"]);
  });

  it("the whole item stays writable (a first upload, the phones' engine), and that write is journaled by record", async () => {
    const anchor = s.store.anchor();
    const all = recordsOf(s).filter((x) => x.id !== "hr-1").map((x) => (x.id === "p-1" ? { ...x, data: { v: 8 } } : x));
    const w = await s.store.writeItem("company", "records", JSON.stringify(all), anchor.version, "engine@server");
    assert.equal(w.ok, true);
    const rows = s.store.journal.filter((row) => row.seq === (w as { seq: number }).seq);
    assert.deepEqual(rows.map((row) => [row.recordId, row.removed]), [[null, false], ["p-1", false], ["hr-1", true]]);
    const given = await getSince(s, "admin", anchor);
    const item = given.items.find((i) => i.key === "records")!;
    assert.equal(item.value, undefined, "not the whole item");
    assert.deepEqual(item.changes!.changed.map((x) => x.id), ["p-1"]);
    assert.deepEqual(item.changes!.removed, ["hr-1"]);
  });

  it("a save of more than the server's JSON parser takes (100 KB) is taken as text; a small one sent as JSON too", async () => {
    const big = Array.from({ length: 80 }, (_, i) => rec(`bulk-${i}`, "qc-viscosity", "Verified", { note: "z".repeat(2000) }));
    assert.ok(JSON.stringify({ changed: big }).length > 150_000);
    const r = await patch(s, "admin", { changed: big }, s.store.anchor());
    assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 300));
    const small = await patch(s, "admin", { removed: big.map((x) => x.id) }, s.store.anchor(), undefined, "application/json");
    assert.equal(small.status, 200, JSON.stringify(small.body).slice(0, 300));
    assert.equal(recordsOf(s).some((x) => x.id.startsWith("bulk-")), false);
  });

  it("refuses what is not a save of records, and a save with no version", async () => {
    const anchor = s.store.anchor();
    const res = await fetch(`${s.base}/api/storage/documents`, { method: "PATCH", headers: { "x-test-user": "admin", "X-Base-Version": "1" }, body: "{}" });
    assert.equal(res.status, 400);
    assert.equal((await patch(s, "admin", { changed: [{ data: 1 }] }, anchor)).status, 400, "a record with no id");
    const bad = await fetch(`${s.base}/api/storage/records`, { method: "PATCH", headers: { "x-test-user": "admin" }, body: JSON.stringify({ changed: [] }) });
    assert.equal(bad.status, 400);
  });
});

describe("one record per save, at each person's level (§96, §108)", () => {
  let s: Server;
  before(async () => (s = await start()));
  after(() => s.close());

  it("a Read-only person's own change is refused with 403 in plain words, record by record, and nothing is written", async () => {
    const scope = (await get(s, "ankur")).body.scope;
    const version = s.store.version("records");
    const r = await patch(s, "ankur", { changed: [filled(POUCHING, 2)] }, s.store.anchor(), scope);
    assert.equal(r.status, 403);
    assert.equal(r.body.code, "access-level");
    assert.equal(r.body.recordId, "p-1");
    assert.equal(r.body.error, "F/QC/37 Inspection Record - Pouching Process is Read only for you. Filling in a record needs Write access: ask the super admin for it.");
    assert.equal(s.store.version("records"), version);
    assert.deepEqual(r.body.changes.changed, [POUCHING], "the record as the database holds it, for the browser to put back");
    assert.ok(s.lines.some((l) => l.action === "Change refused" && l.who === "Ankur Raval"));
  });

  it("the change their level allows is taken, and everyone else's records stay as stored", async () => {
    const r = await patch(s, "ankur", { changed: [{ ...VISCOSITY, status: "Pending Verification", submittedBy: "Ankur Raval", history: [...VISCOSITY.history, entry("submitted")] }] }, s.store.anchor());
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const all = recordsOf(s);
    assert.deepEqual(all.map((x) => x.id).sort(), ["hr-1", "p-1", "v-1"]);
    assert.equal(all.find((x) => x.id === "v-1")!.status, "Pending Verification");
    assert.equal(all.find((x) => x.id === "hr-1")!.status, "Verified");
  });

  it("a sheet the app made on a document they only read is kept out, and the answer takes it back from their copy", async () => {
    const r = await patch(s, "ankur", { changed: [rec("sheet-1", "qc-inspection-pouching", "Due", { history: [] })] }, s.store.anchor());
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.kept, ["sheet-1"]);
    assert.deepEqual(r.body.changes.removed, ["sheet-1"]);
    assert.equal(recordsOf(s).some((x) => x.id === "sheet-1"), false);
  });

  it("a removal travels at Edit; below it the record is kept as stored and handed back", async () => {
    const kept = await patch(s, "ankur", { removed: ["p-1"] }, s.store.anchor());
    assert.equal(kept.status, 200);
    assert.deepEqual(kept.body.kept, ["p-1"]);
    assert.deepEqual(kept.body.changes.changed.map((x: { id: string }) => x.id), ["p-1"], "their copy gets it back");
    assert.ok(recordsOf(s).some((x) => x.id === "p-1"));
    const removed = await patch(s, "ankur", { removed: ["v-1"] }, s.store.anchor());
    assert.equal(removed.status, 200, "Edit on F-QC-30, the record he answers for");
    assert.equal(recordsOf(s).some((x) => x.id === "v-1"), false);
  });

  it("a copy made for other levels (X-Scope) is answered 409 with the person's own records, as a whole write is", async () => {
    const r = await patch(s, "ankur", { changed: [filled(VISCOSITY, 3)] }, s.store.anchor(), "QC");
    assert.equal(r.status, 409);
    assert.match(r.body.scope, /^v:/);
    assert.deepEqual(idsOf(JSON.parse(r.body.current.value)), ["p-1"]);
  });
});

describe("what changed, by the journal: GET /api/storage with the records a browser holds (§108)", () => {
  let s: Server;
  before(async () => (s = await start()));
  after(() => s.close());

  it("nothing for the records when the browser holds the stored version, its own save included (data-9)", async () => {
    const anchor = s.store.anchor();
    const w = await patch(s, "admin", { changed: [filled(VISCOSITY, 2)] }, anchor);
    const given = await getSince(s, "admin", { version: w.body.version, seq: w.body.seq });
    assert.equal(given.items.some((i) => i.key === "records"), false);
  });

  it("only the records changed since, and the ids removed, when the journal covers the span", async () => {
    const anchor = s.store.anchor();
    await patch(s, "admin", { changed: [filled(POUCHING, 3)] }, anchor);
    await patch(s, "admin", { removed: ["hr-1"] }, s.store.anchor());
    const given = await getSince(s, "admin", anchor, 999999);
    const item = given.items.find((i) => i.key === "records")!;
    assert.equal(item.value, undefined);
    assert.equal(item.version, s.store.version("records"));
    const stored = recordsOf(s).find((x) => x.id === "p-1");
    assert.deepEqual(item.changes, { from: anchor.version, changed: [stored], removed: ["hr-1"] });
  });

  it("the whole item when the journal does not cover it: a copy older than the journal, or another write of that version", async () => {
    const given = await getSince(s, "admin", { version: 1, seq: 1 });
    const item = given.items.find((i) => i.key === "records")!;
    assert.ok(item.value, "the whole item, as before");
    assert.equal(item.changes, undefined);
    const now = s.store.anchor();
    const other = await getSince(s, "admin", { version: now.version, seq: now.seq - 1 });
    assert.ok(other.items.find((i) => i.key === "records")?.value, "the same version from another write: the whole item");
  });

  it("a department's account is handed its own records' changes, and nothing of another department's, not even its id", async () => {
    const anchor = s.store.anchor();
    await patch(s, "admin", { changed: [rec("hr-2", "hr-competence", "In Progress"), filled(VISCOSITY, 9)] }, anchor);
    const given = await getSince(s, "ankur", anchor);
    const item = given.items.find((i) => i.key === "records")!;
    assert.deepEqual(item.changes!.changed.map((x) => x.id), ["v-1"]);
    assert.deepEqual(item.changes!.removed, [], "Human Resources' record is not his to hold");
    assert.equal(JSON.stringify(given).includes("hr-2"), false);
    // A record removed from the item is said by its id, whoever's it was: the copy drops it if it has it.
    const later = s.store.anchor();
    await patch(s, "admin", { removed: ["v-1"] }, later);
    assert.deepEqual((await getSince(s, "ankur", later)).items.find((i) => i.key === "records")!.changes!.removed, ["v-1"]);
  });

  it("the whole item again once what the person may see has changed since the copy (the access rules written)", async () => {
    const anchor = s.store.anchor();
    await patch(s, "admin", { changed: [filled(VISCOSITY, 10)] }, anchor);
    await put(s, "admin", "access", { version: 1, people: { "ankur.raval@gpp.local": { modules: { HR: "read" } } }, responsibility: {} });
    const given = await getSince(s, "ankur", anchor);
    const item = given.items.find((i) => i.key === "records")!;
    assert.ok(item.value, "the whole item");
    assert.deepEqual(idsOf(JSON.parse(item.value!)), ["hr-2", "p-1", "v-1"], "with Human Resources' records, now his to read");
  });
});

describe("a records item larger than the old body limit still saves one record (§108)", () => {
  let s: Server;
  before(async () => (s = await start()));
  after(() => s.close());

  it("26 million characters stored; a save of one record is a few hundred bytes and is taken", async () => {
    const padding = "x".repeat(2000);
    const many = Array.from({ length: 13_000 }, (_, i) => rec(`old-${i}`, "qc-viscosity", "Verified", { note: padding }));
    s.store.put("records", [HR_RECORD, POUCHING, VISCOSITY, ...many]);
    const size = s.store.items.get("company|records")!.value.length;
    assert.ok(size > 26_000_000, `the item is ${size} characters`);
    const body = JSON.stringify({ changed: [filled(VISCOSITY, 2)] });
    assert.ok(body.length < 1000, `the save is ${body.length} characters`);
    const r = await patch(s, "admin", { changed: [filled(VISCOSITY, 2)] }, s.store.anchor());
    assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 300));
    const after = s.store.items.get("company|records")!.value;
    assert.ok(after.length > 26_000_000);
    assert.equal((JSON.parse(after) as { id: string; data: { v: number } }[]).find((x) => x.id === "v-1")!.data.v, 2);
  });
});
