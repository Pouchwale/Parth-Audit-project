// WHAT MITRA DOES, FROM THE MITRA MOBILE APP (REQUIREMENTS §85): the routes of
// backend/apiV1Records.ts on a real Express server, answered by DCRS's own
// engine run in a worker (backend/engineHost.ts — the real bundle of
// frontend/src/engineHost/entry.ts), over an in-memory stand-in for the stored
// items. No database, no browser. What is proved here:
//   * the reads: documents found (the person's, kept by another department,
//     not in DCRS yet), one document's layout, today's facts, records listed,
//     searched and read, history's figures, HR Master Data (Human Resources only);
//   * the changes, each through DCRS's own engine: a record started (and
//     prepared as the app's start-up prepares it), a patch applied as Mitra's
//     edit_open_record applies it, submitted, verified by the super admin,
//     reopened with a reason and put back, sent back, a photo added, sample
//     data filled, a record deleted with its reason on the deletions log;
//   * the audit tie: every history entry in the person's name with a note
//     "Through <client>: …", and the activity lines DCRS writes for the change,
//     each detail beginning "Through <client>"; two edits in a row keep two
//     entries;
//   * the department scope as the server applies it to a browser, the
//     refusals in words (409 needs-reopen, invalid, wrong-status), a write
//     retried when somebody else saved in between and given up after three;
//   * the PDF through the printer (a stand-in; backend/pdfReport.ts is tested
//     on its own), and the photo's size and kind checked;
//   * today by person (REQUIREMENTS §96, §97): each item's module, canSubmit and
//     canVerify; a person the owner's table describes is given only what they
//     answer for; the super admin everything, counted by module;
//   * reviewed before submitted (§62, §97): a record the assistant prepared is
//     refused with 409 needs-review until the phone sends reviewed: true, and
//     its history then says "Submitted from the phone after review".
// The same routes are driven end to end by tests/e2e_mobile_mitra_api.py.
// Run: npm run test:unit -- apiV1Records
process.env.DCRS_WORKING_HOURS = "off";

import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import cookieParser from "cookie-parser";
import express, { type Request } from "express";
import { signSessionToken, type PublicUser } from "../auth.ts";
import type { StoredItem, UserRow, WriteResult } from "../db.ts";
import { registerApiV1, type ApiV1Store, type PdfPrinter } from "../apiV1.ts";
import { PHOTO_ROUTE } from "../apiV1Records.ts";
import { createEngineHost, type EngineHost } from "../engineHost.ts";
import { seededCalendar } from "../workingHours.ts";
import { addDaysISO, plantDay } from "../../frontend/src/engine/workingHoursCore.ts";

// The bundle is kept between runs in the system's temp folder (rebuilt when a file it is made from changes).
const BUNDLE_DIR = path.join(os.tmpdir(), "dcrs-engine-host-tests");

class MemoryStore implements ApiV1Store {
  users = new Map<string, UserRow>();
  items = new Map<string, { value: string; version: number; seq: number }>();
  seq = 0;
  /** Writes still to be refused as if somebody else had saved the same item a moment before. */
  conflictsToCome = 0;
  writes: { key: string; baseVersion: number; by: string; ok: boolean }[] = [];

  put(key: string, value: unknown): void {
    const now = this.items.get(key);
    this.seq += 1;
    this.items.set(key, { value: typeof value === "string" ? value : JSON.stringify(value), version: (now?.version ?? 0) + 1, seq: this.seq });
  }
  get<T = unknown>(key: string): T {
    return JSON.parse(this.items.get(key)?.value ?? "null") as T;
  }
  async userById(id: string): Promise<UserRow | undefined> {
    return this.users.get(id);
  }
  async itemSeq(scope: string, key: string): Promise<number | null> {
    return scope === "company" ? (this.items.get(key)?.seq ?? null) : null;
  }
  async readItem(scope: string, key: string): Promise<StoredItem | null> {
    const i = scope === "company" ? this.items.get(key) : undefined;
    return i ? { key, value: i.value, version: i.version, seq: i.seq } : null;
  }
  async writeItem(scope: string, key: string, value: string, baseVersion: number, by: string): Promise<WriteResult> {
    if (this.conflictsToCome > 0 && key === "records") {
      this.conflictsToCome -= 1;
      this.put(key, this.items.get(key)?.value ?? "[]");
    }
    const now = this.items.get(key);
    const ok = scope === "company" && (now ? now.version === baseVersion : baseVersion === 0);
    this.writes.push({ key, baseVersion, by, ok });
    if (!ok) return { ok: false, current: now ? { key, value: now.value, version: now.version, seq: now.seq } : null };
    this.put(key, value);
    const written = this.items.get(key)!;
    return { ok: true, version: written.version, seq: written.seq };
  }
}

function account(id: string, name: string, role: "admin" | "staff", departments: string, extra: Partial<UserRow> = {}): UserRow {
  return { id, name, email: `${id}@test.local`, password_hash: "x", role, created_at: "2026-01-01T00:00:00.000Z", departments, must_change_password: false, active: true, last_sign_in: null, ...extra };
}

const USERS = {
  admin: account("u-admin", "Super Admin", "admin", ""),
  qc: account("u-qc", "Kapila Barad", "staff", "QC"),
  hr: account("u-hr", "Vinay Bhojak", "staff", "HR"),
  change: account("u-change", "New Person", "staff", "QC", { must_change_password: true }),
  // A person the owner's table describes (engine/accessRules.ts): F/QC/13, F/QC/34 (and F/MNT/09, 10) are his.
  zala: account("u-zala", "Ajay Zala", "staff", "QC", { email: "ajay.zala@gpp.local" }),
};

const tokenOf = (row: UserRow): string => {
  const user: PublicUser = { id: row.id, name: row.name, email: row.email, role: row.role, departments: row.departments ? row.departments.split(",") : [] };
  return signSessionToken(user);
};
const T = Object.fromEntries(Object.entries(USERS).map(([k, u]) => [k, tokenOf(u)])) as Record<keyof typeof USERS, string>;
const CLIENT = { "X-Client-Name": "Mitra mobile app" };

interface Logged {
  who: string | null;
  action: string;
  target: string;
  detail: string;
  department: string;
}

interface Server {
  base: string;
  store: MemoryStore;
  lines: Logged[];
  printed: { recordId: string }[];
  engine: EngineHost;
  close: () => Promise<void>;
}

// An HR record already on file: the QC account's changes must leave it exactly as stored.
const HR_RECORD = {
  id: "rec-hr-pest-1",
  documentId: "daily-pest-monitoring",
  periodKey: "daily-pest-monitoring:2026-09-01",
  dueDate: "2026-09-01",
  status: "Submitted",
  isDemo: false,
  data: { isHoliday: false, checkpoints: { 1: { value: "Yes" } }, timeOfChecking: "09:30", checker: "Roshni", summaryActions: [], rodentCatches: [], photos: [] },
  createdAt: "2026-09-01T04:00:00.000Z",
  updatedAt: "2026-09-01T05:00:00.000Z",
  submittedBy: "Roshni",
};

async function start(): Promise<Server> {
  const store = new MemoryStore();
  for (const u of Object.values(USERS)) store.users.set(u.id, { ...u });
  store.put("records", [HR_RECORD]);
  const lines: Logged[] = [];
  const printed: { recordId: string }[] = [];
  const app = express();
  // As backend/index.ts: the general parser passes the photo route by - it reads its own, after sign-in.
  const json = express.json();
  app.use((req, res, next) => (req.method === "POST" && PHOTO_ROUTE.test(req.path) ? next() : json(req, res, next)));
  app.use(cookieParser());
  const pdf: PdfPrinter = {
    browserPath: () => "C:/fake/chrome.exe",
    render: async (o) => {
      printed.push({ recordId: o.recordId });
      return Buffer.from("%PDF-1.7\n% a stand-in\n%%EOF\n");
    },
  };
  const engine = createEngineHost({ store, bundleDir: BUNDLE_DIR });
  registerApiV1(app, {
    requireAuth: (_req, _res, next) => next(),
    logActivity: (_req: Request, who, action, target = "", detail = "", department = "") => lines.push({ who: who?.name ?? null, action, target, detail, department }),
    store,
    pdf,
    appBuilt: () => true,
    engine,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const { port } = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${port}`,
    store,
    lines,
    printed,
    engine,
    close: async () => {
      await engine.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = any;

async function call(s: Server, method: string, route: string, token: string, body?: unknown, headers: Record<string, string> = CLIENT): Promise<{ status: number; body: Body; headers: Headers }> {
  const h: Record<string, string> = { ...headers, Authorization: `Bearer ${token}` };
  if (body !== undefined) h["Content-Type"] = "application/json";
  const res = await fetch(s.base + route, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const type = res.headers.get("content-type") ?? "";
  return { status: res.status, headers: res.headers, body: type.includes("json") ? await res.json() : Buffer.from(await res.arrayBuffer()) };
}

const storedRecord = (s: Server, id: string): Body => (s.store.get<Body[]>("records") ?? []).find((r: Body) => r.id === id);

// The note the day's readings are entered with when the record is started (the person's own, from the phone).
const READINGS_NOTE = "The day's hourly readings, entered on the phone";

// A tiny real PNG: one white pixel.
const PNG_1PX = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

describe("the Mitra mobile app's routes, answered by DCRS's own engine", { timeout: 300_000 }, () => {
  let s: Server;
  let recordId = "";
  // THE DAY THE TESTS WORK ON: the latest working day of the plant's calendar, up to today. DCRS prepares a
  // day's blank register (engine/assistantPrepare.ts) only on a working day, so on the weekly off or a
  // festival "today's" viscosity sheet stays blank and cannot be submitted — the tests would then depend on
  // the day of the week they run on (they failed on Thursday 1-Oct-2026). The engine counts days by this
  // computer's clock, so the local date is the starting point.
  let workingDay = "";
  before(async () => {
    const calendar = await seededCalendar();
    const now = new Date();
    let day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    for (let i = 0; i < 14 && !/^(working|adjustment)$/.test(plantDay(day, calendar).kind); i++) day = addDaysISO(day, -1);
    workingDay = day;
    s = await start();
    // The plant went live on that day: DCRS prepares no blank register dated before its live start
    // (engine/assistantPrepare.ts), and a first start would otherwise set it to today.
    s.store.put("live-start", { date: workingDay });
    await s.engine.warm();
  });
  after(() => s.close());

  it("GET /documents finds the person's own documents, another department's as kept, and the master list's not in DCRS", async () => {
    const own = await call(s, "GET", "/api/v1/documents?q=viscosity", T.qc);
    assert.equal(own.status, 200);
    assert.ok(own.body.documents.some((d: Body) => d.id === "qc-viscosity" && d.formatNo && d.department.code === "QC"), JSON.stringify(own.body).slice(0, 400));
    const kept = await call(s, "GET", "/api/v1/documents?q=F/HR/17", T.qc);
    assert.equal(kept.status, 200);
    assert.equal(kept.body.documents.length, 0);
    assert.ok(kept.body.kept.some((d: Body) => d.id === "daily-pest-monitoring" && /Kept by Human Resources/.test(d.note)), JSON.stringify(kept.body));
    const all = await call(s, "GET", "/api/v1/documents", T.qc);
    assert.equal(all.status, 200);
    assert.ok(all.body.total > 5 && all.body.documents.every((d: Body) => d.department === null || d.department.code === "QC"), "without q: only the person's documents");
    const bad = await call(s, "GET", `/api/v1/documents?q=${"x".repeat(201)}`, T.qc);
    assert.equal(bad.status, 400);
  });

  it("GET /documents/{id} says what it is, who fills it, when and how; another department's is refused", async () => {
    const one = await call(s, "GET", "/api/v1/documents/qc-viscosity", T.qc);
    assert.equal(one.status, 200);
    assert.equal(one.body.id, "qc-viscosity");
    assert.equal(one.body.layout.kind, "log-sheet");
    assert.ok(one.body.layout.columns.some((c: Body) => c.key === "viscosity" && c.type === "number"));
    assert.ok(one.body.when && one.body.how && one.body.who && one.body.patchShape);
    const byNumber = await call(s, "GET", `/api/v1/documents/${encodeURIComponent("F-QC-30")}`, T.qc);
    assert.equal(byNumber.status, 200);
    assert.equal(byNumber.body.id, "qc-viscosity");
    const other = await call(s, "GET", "/api/v1/documents/daily-pest-monitoring", T.qc);
    assert.equal(other.status, 403);
    assert.equal(other.body.code, "not-your-department");
    assert.match(other.body.error, /Human Resources/);
    const none = await call(s, "GET", "/api/v1/documents/no-such-thing-at-all", T.qc);
    assert.equal(none.status, 404);
  });

  it("GET /today gives the day, the next holidays and what is due, overdue and waiting", async () => {
    const r = await call(s, "GET", "/api/v1/today", T.qc);
    assert.equal(r.status, 200);
    assert.match(r.body.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(r.body.day && typeof r.body.day.closed === "boolean");
    assert.ok(Array.isArray(r.body.nextHolidays) && Array.isArray(r.body.due) && Array.isArray(r.body.overdue) && Array.isArray(r.body.awaitingVerification));
    assert.ok(r.body.workingHours, "the plant's hours are said too");
    assert.match(r.body.facts, /Today:/);
    // Worded for the caller (§84 addendum, 6-Oct-2026): the staff's hours; staff are told nothing new.
    assert.match(r.body.workingHours.hoursText, /^Staff working hours: .* The super admin can sign in at any time\.$/);
    assert.equal(r.body.workingHours.forYou, null);
  });

  it("GET /today by person: each item's module and what the person may do with it; a described person gets only what they answer for; the super admin gets the modules' counts", async () => {
    const qc = await call(s, "GET", "/api/v1/today", T.qc);
    assert.equal(qc.status, 200);
    const lists = ["overdue", "due", "upcoming", "readyToSubmit", "needsInput", "awaitingVerification"];
    const every = (body: Body): Body[] => lists.flatMap((l) => body[l] as Body[]);
    const all = every(qc.body);
    assert.ok(all.length > 0, "an account nobody described keeps what it had: its department's work");
    for (const i of all) {
      assert.equal(i.module, "QC", JSON.stringify(i));
      assert.equal(typeof i.canSubmit, "boolean");
      assert.equal(typeof i.canVerify, "boolean");
    }
    assert.ok(all.some((i) => i.canSubmit === true), "Edit in its own department: it may submit");
    assert.equal(qc.body.byModule, undefined, "the counts by module are the super admin's");
    const zala = await call(s, "GET", "/api/v1/today", T.zala);
    assert.equal(zala.status, 200);
    const his = lists.filter((l) => l !== "awaitingVerification").flatMap((l) => zala.body[l] as Body[]);
    assert.ok(his.length < all.length, `only what he answers for (${his.length} of ${all.length})`);
    for (const i of his) assert.match(i.formatNo, /QC\W*(13|34)\b|QC\W*40\W*[AB]\b/, `${i.formatNo} ${i.document} is not his`);
    const admin = await call(s, "GET", "/api/v1/today", T.admin);
    assert.ok(Array.isArray(admin.body.byModule) && admin.body.byModule.length > 0, JSON.stringify(admin.body.byModule));
    for (const m of admin.body.byModule) assert.ok(typeof m.overdue === "number" && typeof m.awaitingVerification === "number");
  });

  it("GET /today tells the super admin the hours are the staff's and that he can keep working — what Mitra on the phone is given", async () => {
    const r = await call(s, "GET", "/api/v1/today", T.admin);
    assert.equal(r.status, 200);
    assert.equal(r.body.workingHours.heldToHours, false);
    assert.equal(r.body.workingHours.forYou, "You are the super admin: these are the staff's hours, and you can keep working at any time.");
    for (const words of [r.body.workingHours.hoursText, r.body.workingHours.todayText]) assert.doesNotMatch(words, /DCRS is open|opens again|DCRS is closed|not open yet/, words);
  });

  it("POST /records starts today's record of a QC log sheet, prepared as the app's start-up prepares it, and says it through the app", async () => {
    const r = await call(s, "POST", "/api/v1/records", T.qc, { documentId: "qc-viscosity", date: workingDay });
    assert.equal(r.status, 201, JSON.stringify(r.body).slice(0, 400));
    assert.equal(r.body.created, true);
    recordId = r.body.record.recordId;
    assert.ok(recordId);
    assert.equal(r.body.record.status, "In Progress");
    assert.equal(r.body.record.editable, true);
    const stored = storedRecord(s, recordId);
    assert.ok(stored, "the record is stored");
    assert.deepEqual(storedRecord(s, HR_RECORD.id), HR_RECORD, "Human Resources' record is left exactly as it was");
    const opened = s.lines.find((l) => l.action === "Record opened");
    assert.ok(opened, "the opening is in the activity log");
    assert.equal(opened!.who, "Kapila Barad");
    assert.match(opened!.detail, /^Through Mitra mobile app/);
    assert.equal(opened!.department, "QC");
    const again = await call(s, "POST", "/api/v1/records", T.qc, { documentId: "F-QC-30", date: workingDay });
    assert.equal(again.status, 200);
    assert.equal(again.body.created, false);
    assert.equal(again.body.record.recordId, recordId, "the day's record, not a second one");
    // DCRS prepares a blank register it generated for a working day with the known parts only, never a reading
    // (engine/assistantPrepare.ts, REQUIREMENTS §98); a record started for a day no register was waiting on is
    // started empty. Either way the readings are the person's: Kapila Barad enters the day's hourly readings from
    // the phone, through the route the Review screen saves each answer with, so what follows reads, changes and
    // submits a record a person filled, whatever day the tests run on. Nothing is filled with sample data.
    const slots = (storedRecord(s, recordId).data.rows as Body[]).map((row: Body) => String(row.time));
    assert.equal(slots.length, 24, "one line for each hour of the day");
    const entered = await call(s, "POST", `/api/v1/records/${recordId}/changes`, T.qc, {
      patch: { itemEdits: slots.map((time, i) => ({ collection: "rows", match: { time }, set: { viscosity: (19.6 + (i % 5) * 0.2).toFixed(1), testedBy: "Kapila Barad" } })) },
      note: READINGS_NOTE,
    });
    assert.equal(entered.status, 200, JSON.stringify(entered.body).slice(0, 400));
    const after = storedRecord(s, recordId);
    assert.ok(after.data.rows.every((row: Body) => typeof row.viscosity === "number" && row.testedBy === "Kapila Barad"), "every hour's reading is the one entered");
    assert.ok(!after.history.some((h: Body) => /sample data/i.test(`${h.note ?? ""} ${h.action ?? ""}`)), "nothing was filled with sample data");
  });

  it("GET /records/{id} gives the layout, the data in words and as stored, and the history", async () => {
    const r = await call(s, "GET", `/api/v1/records/${recordId}`, T.qc);
    assert.equal(r.status, 200);
    assert.equal(r.body.document.formatNo, "F-QC-30");
    assert.equal(r.body.layout.rows.mode, "timeSlots");
    assert.ok(Array.isArray(r.body.data.rows) && r.body.data.rows.length === 24);
    assert.ok(r.body.inWords.length > 0 && r.body.inWords.every((c: Body) => typeof c.label === "string"));
    assert.deepEqual(r.body.actions, ["submit", "delete"]);
  });

  it("GET /records/{id} offers only what the person's level allows (REQUIREMENTS §96): Read gets no box and no button, Write no delete", async () => {
    // The people review of 9-Oct-2026: Vinay Bhojak, who reads F/HR/17, was sent editable: true and actions
    // [submit, delete], so the phone drew input boxes and a Submit button that DCRS then refused.
    const own = await call(s, "GET", `/api/v1/records/${recordId}`, T.qc);
    assert.equal(own.status, 200);
    assert.equal(own.body.editable, true);
    assert.equal(own.body.canSubmit, true);
    assert.equal(own.body.canVerify, false, "in progress: nothing to verify yet");
    assert.ok(Array.isArray(own.body.problems), "what still stops a submit, by DCRS's own checks");
    // Ajay Zala sees Quality Control, but F-QC-30 is Ankur Raval's: Read only for him.
    const read = await call(s, "GET", `/api/v1/records/${recordId}`, T.zala);
    assert.equal(read.status, 200, JSON.stringify(read.body).slice(0, 300));
    assert.equal(read.body.editable, false);
    assert.deepEqual(read.body.actions, []);
    assert.equal(read.body.canSubmit, false);
    assert.equal(read.body.canVerify, false);
    assert.equal(read.body.canReopen, false);
    assert.deepEqual(read.body.problems, []);
    // Given Write on it (and not Edit): he may fill and submit it, never delete it.
    s.store.put("access", { version: 1, people: { "ajay.zala@gpp.local": { documents: { "qc-viscosity": "write" } } }, responsibility: {} });
    try {
      const write = await call(s, "GET", `/api/v1/records/${recordId}`, T.zala);
      assert.equal(write.status, 200);
      assert.equal(write.body.editable, true);
      assert.equal(write.body.canSubmit, true);
      assert.deepEqual(write.body.actions, ["submit"]);
    } finally {
      s.store.put("access", null);
    }
  });

  it("POST /records/{id}/changes applies Mitra's patch through DCRS's engine, noted as through the app; a second one keeps its own entry", async () => {
    const r = await call(s, "POST", `/api/v1/records/${recordId}/changes`, T.qc, {
      patch: { itemEdits: [{ collection: "rows", match: { time: "10:00" }, set: { viscosity: "20.4", testedBy: "Kapila" } }] },
      note: "10 o'clock reading from the floor",
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.ok(r.body.changes.some((c: Body) => /10:00/.test(c.label) && c.after === "20.4"), JSON.stringify(r.body.changes));
    const entry = r.body.history.at(-1);
    assert.equal(entry.action, "assistant-edit");
    assert.equal(entry.note, "Through Mitra mobile app: 10 o'clock reading from the floor");
    const stored = storedRecord(s, recordId);
    assert.equal(stored.data.rows.find((row: Body) => row.time === "10:00").viscosity, 20.4, "stored as a number, as the form stores it");
    assert.equal(stored.history.at(-1).by, "Kapila Barad");
    const line = s.lines.filter((l) => l.action === "Record edited through Mitra").at(-1);
    assert.ok(line);
    assert.match(line!.detail, /^Through Mitra mobile app: 10 o'clock reading/);

    const second = await call(s, "POST", `/api/v1/records/${recordId}/changes`, T.qc, { patch: { itemEdits: [{ collection: "rows", match: { time: "11:00" }, set: { viscosity: 20.1 } }] } });
    assert.equal(second.status, 200);
    // The two changes of this test, beside the day's readings entered when the record was started.
    const ours = (note: string): boolean => !/sample data/.test(note) && !note.includes(READINGS_NOTE);
    const history = storedRecord(s, recordId).history;
    const edits = history.filter((h: Body) => h.action === "assistant-edit" && ours(h.note ?? ""));
    assert.equal(edits.length, 2, "the second change is not folded into the first");
    assert.equal(edits[1].note, "Through Mitra mobile app: changes asked for in the chat");
    assert.equal(s.lines.filter((l) => l.action === "Record edited through Mitra" && ours(l.detail)).length, 2);
  });

  it("a patch that changes nothing is refused with the reasons; a value the form cannot hold is left out", async () => {
    const r = await call(s, "POST", `/api/v1/records/${recordId}/changes`, T.qc, { patch: { notAField: "x" } });
    assert.equal(r.status, 400);
    assert.equal(r.body.code, "nothing-changed");
    assert.ok(r.body.problems.some((p: string) => /notAField/.test(p)));
    const bad = await call(s, "POST", `/api/v1/records/${recordId}/changes`, T.qc, { patch: { itemEdits: [{ collection: "rows", match: { time: "12:00" }, set: { viscosity: "thick" } }] } });
    assert.equal(bad.status, 400);
    assert.ok(bad.body.problems.some((p: string) => /needs a number/.test(p)), JSON.stringify(bad.body));
    const none = await call(s, "POST", `/api/v1/records/${recordId}/changes`, T.qc, {});
    assert.equal(none.status, 400);
    assert.equal(none.body.code, "bad-patch");
  });

  it("GET /records/search finds the record by what was written on it; GET /records lists it", async () => {
    const found = await call(s, "GET", "/api/v1/records/search?q=Kapila", T.qc);
    assert.equal(found.status, 200);
    assert.ok(found.body.hits.some((h: Body) => h.recordId === recordId && h.snippet), JSON.stringify(found.body).slice(0, 500));
    const listed = await call(s, "GET", "/api/v1/records?documentId=qc-viscosity", T.qc);
    assert.equal(listed.status, 200);
    assert.ok(listed.body.records.some((x: Body) => x.recordId === recordId && x.status === "In Progress"));
    const badStatus = await call(s, "GET", "/api/v1/records?documentId=qc-viscosity&status=Lost", T.qc);
    assert.equal(badStatus.status, 400);
  });

  it("another department's record is refused, and so is HR Master Data to anyone outside Human Resources", async () => {
    const hrRecord = await call(s, "GET", `/api/v1/records/${HR_RECORD.id}`, T.qc);
    assert.equal(hrRecord.status, 403);
    assert.equal(hrRecord.body.code, "not-your-department");
    const qcRecord = await call(s, "GET", `/api/v1/records/${recordId}`, T.hr);
    assert.equal(qcRecord.status, 403);
    const hrList = await call(s, "GET", "/api/v1/records?documentId=qc-viscosity", T.hr);
    assert.equal(hrList.status, 403);
    const people = await call(s, "GET", "/api/v1/people?q=Roshni", T.qc);
    assert.equal(people.status, 403);
    assert.match(people.body.error, /Human Resources/);
    const hr = await call(s, "GET", "/api/v1/people?q=a", T.hr);
    assert.equal(hr.status, 200);
    assert.ok(Array.isArray(hr.body.people));
    const figures = await call(s, "GET", `/api/v1/figures?question=${encodeURIComponent("which machine broke down most this year?")}`, T.admin);
    assert.equal(figures.status, 200, JSON.stringify(figures.body));
    assert.ok(Array.isArray(figures.body.evidence) && figures.body.period);
    const notHistory = await call(s, "GET", `/api/v1/figures?question=${encodeURIComponent("hello")}`, T.admin);
    assert.equal(notHistory.status, 400);
    assert.equal(notHistory.body.code, "not-history");
  });

  it("the phone's figures carry the Performance Scorecard's minus score (REQUIREMENTS §92)", async () => {
    // The HR record on file, due 01-Sep-2026, counts: the plant's line and HR's carry the minus score beside the score.
    const late = await call(s, "GET", `/api/v1/figures?question=${encodeURIComponent("who was late in September 2026?")}`, T.admin);
    assert.equal(late.status, 200, JSON.stringify(late.body));
    const evidence = late.body.evidence as string[];
    const plant = evidence.find((l) => l.includes("Performance Scorecard")) ?? "";
    assert.match(plant, /minus score (0%|−\d+%) \(the share of the records due never done, as FMS counts it: 8 of 10 done is −20%\)/, JSON.stringify(evidence));
    assert.ok(evidence.some((l) => /\(HR\): score \d+, minus score (0%|−\d+%),/.test(l)), JSON.stringify(evidence));
  });

  it("submit, then a change is refused until the record is reopened; the super admin verifies it", async () => {
    // The person reviewed it on the phone first (a record the assistant prepared needs it; any record may say it).
    const submitted = await call(s, "POST", `/api/v1/records/${recordId}/actions`, T.qc, { action: "submit", reviewed: true });
    assert.equal(submitted.status, 200, JSON.stringify(submitted.body));
    assert.equal(submitted.body.status, "Pending Verification");
    assert.equal(submitted.body.history.at(-1).note, "Through Mitra mobile app: Submitted from the phone after review");
    const line = s.lines.find((l) => l.action === "Record submitted for verification");
    assert.ok(line);
    assert.match(line!.detail, /^Through Mitra mobile app/);
    assert.equal(storedRecord(s, recordId).submittedBy, "Kapila Barad");

    const locked = await call(s, "POST", `/api/v1/records/${recordId}/changes`, T.qc, { patch: { itemEdits: [{ collection: "rows", match: { time: "10:00" }, set: { viscosity: 20.2 } }] } });
    assert.equal(locked.status, 409);
    assert.equal(locked.body.code, "needs-reopen");
    assert.equal(locked.body.canReopen, true);

    const twice = await call(s, "POST", `/api/v1/records/${recordId}/actions`, T.qc, { action: "submit" });
    assert.equal(twice.status, 409);
    assert.equal(twice.body.code, "wrong-status");

    const verified = await call(s, "POST", `/api/v1/records/${recordId}/actions`, T.admin, { action: "approve" });
    assert.equal(verified.status, 200, JSON.stringify(verified.body));
    assert.equal(verified.body.status, "Verified");
    assert.equal(storedRecord(s, recordId).verifiedBy, "Super Admin");
    assert.ok(s.lines.some((l) => l.action === "Record verified" && l.who === "Super Admin" && /^Through Mitra mobile app/.test(l.detail)));
  });

  it("reopen takes a reason; cancel_correction puts it back as it was; send_back and resume", async () => {
    const noReason = await call(s, "POST", `/api/v1/records/${recordId}/actions`, T.qc, { action: "reopen" });
    assert.equal(noReason.status, 400);
    assert.equal(noReason.body.code, "needs-reason");
    const reopened = await call(s, "POST", `/api/v1/records/${recordId}/actions`, T.qc, { action: "reopen", reason: "A reading was written against the wrong hour" });
    assert.equal(reopened.status, 200, JSON.stringify(reopened.body));
    assert.equal(reopened.body.status, "In Progress");
    assert.equal(reopened.body.history.at(-1).note, "Through Mitra mobile app: A reading was written against the wrong hour");
    const back = await call(s, "POST", `/api/v1/records/${recordId}/actions`, T.qc, { action: "cancel_correction" });
    assert.equal(back.status, 200);
    assert.equal(back.body.status, "Verified");

    // A fresh one, submitted and sent back, then resumed.
    const other = await call(s, "POST", "/api/v1/records", T.qc, { documentId: "qc-viscosity", date: "2026-09-02" });
    assert.ok(other.status === 201 || other.status === 200, JSON.stringify(other.body).slice(0, 300));
    const id = other.body.record.recordId;
    const filled = await call(s, "POST", `/api/v1/records/${id}/sample-fill`, T.qc);
    assert.equal(filled.status, 200, JSON.stringify(filled.body));
    assert.equal(filled.body.madeUp, true);
    assert.match(filled.body.history.at(-1).note, /^Through Mitra mobile app: Filled with sample data/);
    const sub = await call(s, "POST", `/api/v1/records/${id}/actions`, T.qc, { action: "submit" });
    assert.equal(sub.status, 200, JSON.stringify(sub.body));
    const sentBack = await call(s, "POST", `/api/v1/records/${id}/actions`, T.admin, { action: "send_back", reason: "Sign the sheet" });
    assert.equal(sentBack.status, 200);
    assert.equal(sentBack.body.status, "Rejected");
    const resumed = await call(s, "POST", `/api/v1/records/${id}/actions`, T.qc, { action: "resume" });
    assert.equal(resumed.status, 200);
    assert.equal(resumed.body.status, "In Progress");
  });

  it("a record the assistant prepared is submitted only after the person reviewed it: 409 needs-review, then reviewed: true", async () => {
    const opened = await call(s, "POST", "/api/v1/records", T.qc, { documentId: "qc-viscosity", date: "2026-09-05" });
    assert.ok(opened.status === 201 || opened.status === 200, JSON.stringify(opened.body).slice(0, 300));
    const id = opened.body.record.recordId;
    const filled = await call(s, "POST", `/api/v1/records/${id}/sample-fill`, T.qc);
    assert.equal(filled.status, 200, JSON.stringify(filled.body).slice(0, 300));
    // As the morning prepare leaves it: stamped as the assistant's, still In Progress.
    const records = s.store.get<Body[]>("records");
    s.store.put(
      "records",
      records.map((r: Body) => (r.id === id ? { ...r, prepared: { at: "2026-09-05T03:00:00.000Z", by: "assistant", notes: ["Prepared by the assistant"] } } : r))
    );
    const unreviewed = await call(s, "POST", `/api/v1/records/${id}/actions`, T.qc, { action: "submit" });
    assert.equal(unreviewed.status, 409);
    assert.equal(unreviewed.body.code, "needs-review");
    assert.match(unreviewed.body.error, /Reviewed and correct/);
    assert.equal(storedRecord(s, id).status, "In Progress", "nothing was submitted");
    const notABoolean = await call(s, "POST", `/api/v1/records/${id}/actions`, T.qc, { action: "submit", reviewed: "yes" });
    assert.equal(notABoolean.status, 400);
    const reviewed = await call(s, "POST", `/api/v1/records/${id}/actions`, T.qc, { action: "submit", reviewed: true });
    assert.equal(reviewed.status, 200, JSON.stringify(reviewed.body).slice(0, 400));
    assert.equal(reviewed.body.status, "Pending Verification");
    const entry = storedRecord(s, id).history.filter((h: Body) => h.action === "submitted").at(-1);
    assert.equal(entry.note, "Through Mitra mobile app: Submitted from the phone after review");
    assert.equal(entry.by, "Kapila Barad");
  });

  it("an empty required cell stops a submit with DCRS's own words (409 invalid)", async () => {
    const opened = await call(s, "POST", "/api/v1/records", T.qc, { documentId: "qc-viscosity", date: "2030-01-02" });
    assert.equal(opened.status, 201);
    const id = opened.body.record.recordId;
    const refused = await call(s, "POST", `/api/v1/records/${id}/actions`, T.qc, { action: "submit" });
    assert.equal(refused.status, 409);
    assert.equal(refused.body.code, "invalid");
    assert.ok(refused.body.problems.some((p: string) => /is required/.test(p)), JSON.stringify(refused.body).slice(0, 300));
    const deleted = await call(s, "POST", `/api/v1/records/${id}/actions`, T.qc, { action: "delete" });
    assert.equal(deleted.status, 400);
    const gone = await call(s, "POST", `/api/v1/records/${id}/actions`, T.qc, { action: "delete", reason: "Opened for the wrong year" });
    assert.equal(gone.status, 200);
    assert.equal(storedRecord(s, id), undefined, "gone from the records");
    const log = s.store.get<Body[]>("deletions");
    assert.equal(log[0].recordId, id);
    assert.equal(log[0].reason, "Through Mitra mobile app: Opened for the wrong year");
    assert.equal(log[0].deletedBy, "Kapila Barad");
    assert.ok(s.lines.some((l) => l.action === "Record deleted" && /^Through Mitra mobile app/.test(l.detail)));
  });

  it("a write that meets somebody else's is worked out again on what is stored now; after three it is given up", async () => {
    const before = s.store.writes.length;
    s.store.conflictsToCome = 1;
    const r = await call(s, "POST", "/api/v1/records", T.qc, { documentId: "qc-viscosity", date: "2026-09-03" });
    assert.ok(r.status === 201 || r.status === 200, JSON.stringify(r.body).slice(0, 300));
    const tries = s.store.writes.slice(before).filter((w) => w.key === "records");
    assert.equal(tries.length, 2);
    assert.deepEqual(tries.map((w) => w.ok), [false, true]);
    s.store.conflictsToCome = 3;
    const busy = await call(s, "POST", "/api/v1/records", T.qc, { documentId: "qc-viscosity", date: "2026-09-04" });
    assert.equal(busy.status, 409);
    assert.equal(busy.body.code, "busy");
    s.store.conflictsToCome = 0;
  });

  it("a photo goes onto the record's photo list; its size and kind are checked", async () => {
    const ack = await call(s, "POST", "/api/v1/records", T.admin, { documentId: "capa-complaint-ack" });
    assert.ok(ack.status === 201 || ack.status === 200, JSON.stringify(ack.body).slice(0, 300));
    const id = ack.body.record.recordId;
    const added = await call(s, "POST", `/api/v1/records/${id}/photos`, T.admin, { fileName: "seal.png", mimeType: "image/png", dataBase64: PNG_1PX });
    assert.equal(added.status, 200, JSON.stringify(added.body));
    assert.equal(added.body.list, "photos");
    const stored = storedRecord(s, id);
    assert.equal(stored.data.photos.length, 1);
    assert.match(stored.data.photos[0].dataUrl, /^data:image\/png;base64,/);
    assert.match(stored.history.at(-1).note, /^Through Mitra mobile app: photo seal\.png added/);
    const wrongKind = await call(s, "POST", `/api/v1/records/${id}/photos`, T.admin, { fileName: "seal.jpg", mimeType: "image/jpeg", dataBase64: PNG_1PX });
    assert.equal(wrongKind.status, 415);
    // One byte over the 512 KB limit: refused by the route's own words, not by the server's 100 KB JSON limit.
    const jpegOf = (n: number) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(n - 4)]);
    const big = await call(s, "POST", `/api/v1/records/${id}/photos`, T.admin, { fileName: "big.jpg", mimeType: "image/jpeg", dataBase64: jpegOf(512 * 1024 + 1).toString("base64") });
    assert.equal(big.status, 413);
    assert.equal(big.body.code, "too-large", "refused by the route's own words, not by the server's 100 KB JSON limit");
    // An unscaled phone photo (3 MB) is past the route's own 1 MB reader: the same answer, with the advice to scale it.
    const phone = await call(s, "POST", `/api/v1/records/${id}/photos`, T.admin, { fileName: "phone.jpg", mimeType: "image/jpeg", dataBase64: jpegOf(3 * 1024 * 1024).toString("base64") });
    assert.equal(phone.status, 413);
    assert.equal(phone.body.code, "too-large", JSON.stringify(phone.body).slice(0, 200));
    assert.match(phone.body.error, /Scale it to at most 1024 pixels/);
    // Past the server's general 100 KB JSON limit, and exactly at the 512 KB one: this route reads its own body.
    const jpeg = jpegOf(512 * 1024);
    const larger = await call(s, "POST", `/api/v1/records/${id}/photos`, T.admin, { fileName: "floor.jpg", mimeType: "image/jpeg", dataBase64: jpeg.toString("base64") });
    assert.equal(larger.status, 200, JSON.stringify(larger.body).slice(0, 300));
    assert.equal(larger.body.count, 2);
    const noList = await call(s, "POST", `/api/v1/records/${recordId}/photos`, T.qc, { fileName: "x.png", mimeType: "image/png", dataBase64: PNG_1PX });
    assert.equal(noList.status, 409);
    assert.equal(noList.body.code, "no-photo-list");
  });

  it("GET /records/{id}/pdf prints the record's page and logs the download; a CAPA report prints from its own page", async () => {
    const r = await call(s, "GET", `/api/v1/records/${recordId}/pdf`, T.qc);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("content-type"), "application/pdf");
    assert.match(r.headers.get("content-disposition") ?? "", /^attachment; filename="F-QC-30 Lamination Adhesive Viscosity Record \d{4}-\d{2}-\d{2}\.pdf"$/);
    assert.equal(s.printed.at(-1)?.recordId, recordId);
    assert.ok(s.lines.some((l) => l.action === "Document downloaded as PDF" && /^Through Mitra mobile app/.test(l.detail)));
    const gap = await call(s, "POST", "/api/v1/records", T.admin, { documentId: "gap-inspection" });
    assert.ok(gap.status === 201, JSON.stringify(gap.body).slice(0, 300));
    const refused = await call(s, "GET", `/api/v1/records/${gap.body.record.recordId}/pdf`, T.admin);
    assert.equal(refused.status, 409);
    assert.equal(refused.body.code, "pdf-not-offered");
  });

  it("the same checks as every /api/v1 route: not signed in, and still on the administrator's password", async () => {
    const none = await fetch(`${s.base}/api/v1/today`);
    assert.equal(none.status, 401);
    const change = await call(s, "GET", "/api/v1/today", T.change);
    assert.equal(change.status, 403);
    assert.equal(change.body.code, "password-change-required");
  });
});
