// DCRS'S OWN ENGINE, RUN ON THE SERVER FOR THE MITRA MOBILE APP (REQUIREMENTS §85).
//
// The owner, 30-Sep-2026: "whatever our AI assistant (Mitra) can do, the same
// can be done from that mobile chatbot". Everything Mitra does is done by the
// browser's engine (frontend/src/engine): a patch checked field by field
// (recordPatch.ts), a record submitted only past validation (validation.ts,
// recordLifecycle.ts), every change in the record's history and a line of the
// activity log (recordHistory.ts). A second copy of those rules on the server
// would drift from the first; so the server runs THIS file — bundled by
// backend/engineHost.ts with esbuild, exactly as scripts/unit-tests.ts bundles
// the unit tests, with frontend/tests/support/browserGlobals.ts injected — in
// a worker thread of its own, where the browser's globals harm nothing else.
// Two modules are put in the place of their browser versions: the activity log
// (./activityCollector.ts keeps the lines for the host to write) and the sync
// with the database (./syncStub.ts: the host itself loads and stores).
//
// ONE REQUEST, ONE PERSON. The host hands `load` the stored company items
// (records, documents, master, hrMasterData, referenceEdits, formatEdits,
// deletions, live-start, access — only those that changed since last time) and
// the person: their email, role and departments. Exactly as the server hands a
// browser its working copy (backend/storageRoutes.ts GET /api/storage), the
// person is given the records and deletions-log lines of the documents they
// see at Read or more by the super admin's access rules (REQUIREMENTS §96,
// engine/accessRules.ts through engine/departmentScope.ts setAccessScope), and
// HR Master Data only with Human Resources; and every change is checked against
// their level before it is made (start, fill, submit, verify, send back at
// Write; correct and delete at Edit), refused with 403 "access-level" in the
// website's own words (engine/accessWords.ts). Then the engine starts the way the app starts
// (data/bootstrap.ts): the issued definitions, master data and historical
// records seeded, this month's registers generated — in memory only. Then
// `run` does one thing: a read, or one change made through the very functions
// the record pages and Mitra's tools call (engine/mitraTools.ts). What that
// change touched — only the record it was made to, never what the start-up
// generated around it — comes back to the host as the new records item, laid
// over every record as stored, to be written with the version it was read at.
//
// NOTHING HERE IS WRITTEN BY ITSELF. The host writes; when somebody else wrote
// in between, it loads again and runs the change again.
import type {
  ChecklistSignoff,
  ComplaintChecklistData,
  DocumentDefinition,
  HistoryEntry,
  LogColumn,
  LogHeaderField,
  LogSheetData,
  LogSheetLayout,
  MasterData,
  RecordInstance,
  RecordStatus,
} from "../types";
import type { AssistantTarget } from "../store/AssistantContext";
import type { MitraAttachment, MitraTool, MitraToolContext } from "../engine/mitraTypes";
import { announceLoad, NAMESPACE, writtenSinceLoad } from "./syncStub";
import { drainActivity, logActivity, type ActivityEvent } from "./activityCollector";
import { readJSON } from "../data/storageAdapter";
import { settingsRepository } from "../data/repositories/settingsRepository";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded, masterRepository } from "../data/repositories/masterRepository";
import { ensureSeeded as ensureHrMasterSeeded, hrMasterRepository } from "../data/repositories/hrMasterRepository";
import { ensureSeeded as ensureRecordsSeeded, recordRepository } from "../data/repositories/recordRepository";
import { getLogSheetLayoutForRecord } from "../data/seed/logSheetLayouts";
import { departmentName, departmentOfDocument } from "../data/seed/departments";
import { formatEditFor } from "../data/formatEdits";
import { setFeatures } from "../engine/features";
import { departmentScope, documentLevel, isDocumentIdVisible, mayDo, setAccessScope, setDepartmentScope } from "../engine/departmentScope";
import {
  cancelCorrection,
  isCorrectableStatus,
  isEditableStatus,
  rejectRecord,
  reopenForCorrection,
  resumeAfterRejection,
  saveDraft,
  submitRecord,
  verifyRecord,
} from "../engine/recordLifecycle";
import { historyOf, recordLabel } from "../engine/recordHistory";
import { fieldLabels, humanKey, normDate } from "../engine/recordPatch";
import { withComputedCells } from "../engine/computedCells";
import { supersededRevisionOf, validateForSubmit, type ValidationResult } from "../engine/validation";
import { createRecordForDocument, deleteRecordWithTrail, recordCoveringDate, type DeletionEntry } from "../engine/recordCrud";
import { createDefaultData } from "../engine/recordDefaults";
import { prepareDueRecords } from "../engine/assistantPrepare";
import { computeReminders, ensureNearTermRecordsGenerated, routeForRecord } from "../engine/reminders";
import { computeBriefing, type BriefingItem } from "../engine/assistantBriefing";
import { buildAssistantContext, matchDocuments } from "../engine/assistantLocal";
import { findDocuments, keptByLabel, NOT_IN_DCRS_YET } from "../engine/documentFinder";
import { documentsByFormatNumberUnscoped } from "../engine/formatNumbers";
import { documentOpenRoute } from "../engine/documentRoutes";
import { getDocumentInfo } from "../engine/documentInfo";
import { scheduleLabel } from "../engine/frequencyEngine";
import { dayInfo, isCompanyHoliday, nextWeeklyOff, upcomingHolidays, weeklyOffDay, WEEKDAY_LONG, type DayInfo } from "../engine/holidays";
import { buildAccess, levelNeeded, type Access, type AccessAccount, type DocumentAction } from "../engine/accessRules";
import { refusalSentence, type AccessLanguage } from "../engine/accessWords";
import { planNotifications, type PlanPerson, type PlanRecord } from "../engine/notificationPlan";
import { ensureRecordIndex, readSearchQuery, searchRecords } from "../engine/recordSearch";
import { recordSearchText, snippetFor } from "../engine/recordText";
import { analyticIntent, buildEvidence, topicOfDocument, type AnalyticIntent } from "../engine/historyDigest";
import { describePerson, searchPeople } from "../engine/hrMaster";
import { hrMasterVisible } from "../engine/hrMasterAssistant";
import {
  allMachines,
  currentEquipmentList,
  describeMachine,
  EQUIPMENT_LIST_DOC_ID,
  EQUIPMENT_LIST_FORMAT_NO,
  EQUIPMENT_LIST_NAME,
  EQUIPMENT_LIST_ROUTE,
  equipmentMasterVisible,
  isPlaceholder,
  machineAsRead,
  machineByNumber,
  machineKey,
  machineNumbersIn,
  numberingGaps,
  outOfStepNote,
  readsOutOfStep,
  searchMachines,
  type Machine,
} from "../engine/equipmentMaster";
import { equipmentChatAnswer } from "../engine/equipmentMasterAssistant";
import { insightCounts, insightsHeadline, type Insight } from "../engine/insights";
import { scopedInsights } from "../engine/scopedInsights";
import { canSampleFill, SAMPLE_FILL_NOTE } from "../engine/sampleFill";
import { ALL_TOOLS } from "../engine/mitraTools";
import { currentPmIndex, isLinkedLine, pmActuals, pmCellText, PM_MONTH_KEYS, scheduleYear, schedulesLinked } from "../engine/pmSchedule";
import { addDays, compareISO, formatDisplayDate, todayISO } from "../utils/date";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : "");

/**
 * Bumped when the host and this file must change together (backend/engineHost.ts checks it). 2: the reads
 * "equipment" (F/MNT/01) and "insights" (what stands out), for the Mitra mobile app (2-Oct-2026). 3: the access rules
 * item, the morning prepare ("prepare"), the notification plan ("notifications"), the engine's clock (`now` on a
 * message), today by person and the reviewed submit (REQUIREMENTS §96, §97, 8-Oct-2026). 4: the person on `load`
 * (`account`), each request scoped and each change checked by the access levels (REQUIREMENTS §96, 9-Oct-2026).
 */
export const ENGINE_API_VERSION = 4;

// ---------------------------------------------------------------------------
// the engine's clock

// A RUN FOR ANOTHER MOMENT (REQUIREMENTS §97). The morning prepare and the notify job can be run by hand for a day and
// a time of the caller's own (POST /api/jobs/run: a suite's, or a throwaway server's "working-day morning"), and the
// unit tests hold the engine to a fixed moment. So a message may carry `now` (milliseconds): everything the engine
// dates while it answers (today, a record's stamps, its history) is dated at that moment. The worker is the engine's
// alone, so Date is replaced here only, and only once a message has asked for another moment; a message without `now`
// runs on the real clock.
const RealDate = Date;
let clockOffset = 0;

function useClock(now: unknown): void {
  if (typeof now !== "number" || !Number.isFinite(now)) {
    clockOffset = 0;
    return;
  }
  if (globalThis.Date === RealDate) {
    class EngineDate extends RealDate {
      constructor(...args: unknown[]) {
        if (args.length === 0) super(RealDate.now() + clockOffset);
        else super(...(args as ConstructorParameters<DateConstructor>));
      }
      static now(): number {
        return RealDate.now() + clockOffset;
      }
    }
    globalThis.Date = EngineDate as unknown as DateConstructor;
  }
  clockOffset = now - RealDate.now();
}

// ---------------------------------------------------------------------------
// what the host hands in and gets back

/** The company items DCRS's browser holds (backend/index.ts COMPANY_KEYS). */
// "access": the super admin's access rules (engine/accessRules.ts AccessRules, REQUIREMENTS §96), read by today and the notification plan.
export const ITEM_KEYS = ["records", "documents", "master", "hrMasterData", "referenceEdits", "formatEdits", "deletions", "live-start", "access"] as const;
export type ItemKey = (typeof ITEM_KEYS)[number];

/** One stored item: its seq and version, and its value when it changed since the last load (absent: as before). */
export interface LoadItem {
  seq: number;
  version: number;
  value?: string;
}

export interface LoadInput {
  /** What decides whether the engine must start again: the items' seqs, the scope, the day. */
  key: string;
  /** The departments the person is kept to, or null for every department (backend/index.ts accountDepartments). */
  departments: string[] | null;
  /**
   * The person, whose access levels scope the request (REQUIREMENTS §96): their email, role and departments. Left out
   * (a host before version 4), the departments alone scope it, as before levels existed.
   */
  account?: { email: string; role: string; departments: string[] } | null;
  /** Null for an item that is not stored at all. */
  items: Partial<Record<ItemKey, LoadItem | null>>;
}

export interface LoadAnswer {
  reloaded: boolean;
  ms: number;
  records: number;
  /** Items whose value the host must send again (it was not held here). */
  missing?: string[];
}

/** One line for the activity log, as the engine wrote it, with "Through <client>" before its detail. */
export interface ActivityLine {
  action: string;
  target: string;
  detail: string;
  documentId: string;
}

/** What a change asks the host to store. */
export interface WritePlan {
  /** The whole records item, every department's, with the change laid over it; written with baseVersion. */
  records?: { value: string; baseVersion: number };
  /** Lines to put at the head of the deletions log (engine/recordCrud.ts). */
  deletionsAdded?: DeletionEntry[];
  /** The day the system went live, when nothing stored had it and the morning prepare set it (written only where none is stored). */
  liveStart?: { value: string };
}

export type Outcome =
  | { ok: true; status: number; body: unknown; write?: WritePlan; activity: ActivityLine[] }
  | { ok: false; status: number; code: string; error: string; extra?: Obj; activity: ActivityLine[]; write?: WritePlan };

/** The worker's one entry point (backend/engineHost.ts). `now`: the moment to answer at (the engine's clock), or the real one. */
export type EngineMessage = { kind: "load"; input: LoadInput; now?: number } | { kind: "run"; op: string; args: Obj; now?: number } | { kind: "ping" };

export async function handle(message: EngineMessage): Promise<unknown> {
  if (message.kind !== "ping") useClock(message.now);
  switch (message.kind) {
    case "ping":
      return { version: ENGINE_API_VERSION };
    case "load":
      return load(message.input);
    case "run":
      return run(message.op, message.args ?? {});
    default:
      throw new Error("unknown message");
  }
}

// ---------------------------------------------------------------------------
// loading a request's items

interface Held {
  seq: number;
  version: number;
  value: string | null;
}

const held = new Map<ItemKey, Held>();
let parsedLines: { key: string; seq: number; list: unknown[] }[] = [];
let viewKey: string | null = null;
/** A change ran since the last load: the engine holds what was not stored, and must start again. */
let dirty = true;
let departments: string[] | null = null;
/** The person the request is scoped to by the access levels; null on the old, department-only path. */
let viewer: AccessAccount | null = null;
/** The records as stored (the person's view of them), by id — what a change is laid over, and what "stored" means. */
let storedIds = new Set<string>();
let storedDeletionIds = new Set<string>();

function parsedList(key: ItemKey): unknown[] {
  const h = held.get(key);
  if (!h || h.value === null) return [];
  const kept = parsedLines.find((p) => p.key === key && p.seq === h.seq);
  if (kept) return kept.list;
  let list: unknown[] = [];
  try {
    const parsed: unknown = JSON.parse(h.value);
    list = Array.isArray(parsed) ? parsed : [];
  } catch {
    list = [];
  }
  parsedLines = [...parsedLines.filter((p) => p.key !== key), { key, seq: h.seq, list }];
  return list;
}

/** The stored definitions' format numbers — what the server scopes lines by (backend/index.ts documentFormatNos). */
function storedFormatNos(): Map<string, string> {
  const byId = new Map<string, string>();
  for (const d of parsedList("documents")) {
    if (isObj(d) && typeof d.id === "string" && typeof d.formatNo === "string") byId.set(d.id, d.formatNo);
  }
  return byId;
}

/** Whether a line of the records or the deletions log is the person's to hold (backend/accessLevels.ts AccessView.holds): a document at Read or more. */
function lineVisibility(): (line: unknown) => boolean {
  if (viewer) {
    return (line) => {
      const id = isObj(line) ? line.documentId : undefined;
      return typeof id !== "string" || !id || documentLevel(id) !== "none";
    };
  }
  const scope = departments;
  if (!scope) return () => true;
  const formatNos = storedFormatNos();
  return (line) => {
    const id = isObj(line) ? line.documentId : undefined;
    if (typeof id !== "string" || !id) return true;
    const code = departmentOfDocument(id, formatNos.get(id));
    return code === null || scope.includes(code);
  };
}

/** HR Master Data is held with Human Resources: a person who sees that module (backend/accessLevels.ts holdsHrMaster), or the department as before. */
const mayHoldHrMaster = (): boolean => {
  if (viewer) {
    const seen = departmentScope();
    return seen === null || seen.includes("HR");
  }
  return !departments || departments.includes("HR");
};

export function load(input: LoadInput): LoadAnswer {
  const started = Date.now();
  const missing: string[] = [];
  for (const key of ITEM_KEYS) {
    const given = input.items[key];
    if (given === null || given === undefined) {
      held.delete(key);
      continue;
    }
    if (typeof given.value === "string") held.set(key, { seq: given.seq, version: given.version, value: given.value });
    else if (held.get(key)?.seq !== given.seq) missing.push(key);
  }
  if (missing.length > 0) return { reloaded: false, ms: 0, records: 0, missing };
  if (input.key === viewKey && !dirty) return { reloaded: false, ms: Date.now() - started, records: storedIds.size };

  departments = input.departments && input.departments.length > 0 ? input.departments.map((c) => c.trim().toUpperCase()).filter(Boolean) : null;
  const who = input.account;
  viewer = who && typeof who.email === "string" ? { email: who.email.trim().toLowerCase(), role: who.role || "staff", departments: Array.isArray(who.departments) ? who.departments : [] } : null;

  // THE WORKING COPY, as the server would hand it to this person's browser. By the access levels: the catalogue the
  // rules read is the one the app's start-up makes (the issued definitions and the stored extras), so it is laid
  // first, the person and the rules set on it, and only then the records and the deletions log kept to what the
  // person sees. By departments (a host before version 4): as before.
  localStorage.clear();
  for (const key of ITEM_KEYS) {
    const value = held.get(key)?.value ?? null;
    if (value === null) continue;
    if (!viewer && (key === "records" || key === "deletions") && departments) continue;
    localStorage.setItem(NAMESPACE + key, value);
  }
  if (viewer) {
    ensureDocumentsSeeded();
    setAccessScope(viewer, readJSON<unknown>("access", null));
  } else setDepartmentScope(departments);
  const visible = lineVisibility();
  for (const key of ["records", "deletions"] as const) {
    const h = held.get(key);
    if (!h || h.value === null) continue;
    const all = parsedList(key);
    const mine = all.filter(visible);
    if (mine.length !== all.length) localStorage.setItem(NAMESPACE + key, JSON.stringify(mine));
    else localStorage.setItem(NAMESPACE + key, h.value);
  }
  if (!mayHoldHrMaster()) localStorage.removeItem(NAMESPACE + "hrMasterData");
  announceLoad();
  // The product has no Demo Mode (engine/features.ts): every record here is a Live one.
  setFeatures({ demoMode: false, signup: false, assistant: false });

  storedIds = new Set(recordRepository.getAll().map((r) => r.id));
  storedDeletionIds = new Set(readJSON<DeletionEntry[]>("deletions", []).map((d) => d.id));

  // THE APP'S START-UP (data/bootstrap.ts), in memory: the issued definitions, the
  // master data's seeded rows, HR Master Data (Human Resources only, as the server
  // allows), the historical records, and this month's registers — so "what is due
  // today" is what a browser opened now would say. None of it is stored from
  // here: a record only the start-up made is stored when a change is made to it.
  ensureDocumentsSeeded();
  ensureMasterSeeded();
  if (mayHoldHrMaster()) ensureHrMasterSeeded();
  ensureRecordsSeeded();
  ensureNearTermRecordsGenerated(false);
  drainActivity();

  viewKey = input.key;
  dirty = false;
  return { reloaded: true, ms: Date.now() - started, records: storedIds.size };
}

// ---------------------------------------------------------------------------
// running one request

/** The person the request is made for, and the server it came through. */
interface Who {
  userId: string;
  userName: string;
  client: string;
  /** The account's email and role, for its access level (engine/accessRules.ts). */
  email: string;
  role: string;
  /** The language a refusal is said in (the phone's X-Language): English, Hindi or Gujarati. */
  lang: AccessLanguage;
}

const CHANGE_OPS = new Set(["open", "change", "action", "photo", "sampleFill", "prepare"]);

export async function run(op: string, args: Obj): Promise<Outcome> {
  if (viewKey === null) throw new Error("nothing is loaded");
  const lang = str(args.lang);
  const who: Who = {
    userId: str(args.userId),
    userName: str(args.userName) || "User",
    client: str(args.client) || "DCRS API",
    email: str(args.email),
    role: str(args.role) || "staff",
    lang: lang === "hi" || lang === "gu" ? lang : "en",
  };
  // THIS REQUEST'S PERSON. The super admin's load is shared with the server's own jobs (both see everything): the
  // levels asked below are this person's own.
  if (viewer && who.email && who.email.toLowerCase() !== viewer.email) {
    viewer = { email: who.email.toLowerCase(), role: who.role, departments: Array.isArray(args.departments) ? (args.departments as unknown[]).map((d) => str(d)).filter(Boolean) : [] };
    setAccessScope(viewer);
  }
  const changes = CHANGE_OPS.has(op);
  if (changes) {
    dirty = true;
    touched = new Set();
    removed = new Set();
    drainActivity();
  }
  try {
    const outcome = await runOp(op, args, who);
    if (!changes) return outcome;
    const activity = drainActivity().map((line) => throughLine(line, who.client));
    const write = writePlan(who.client, op === "prepare");
    return { ...outcome, activity: [...outcome.activity, ...activity], ...(write ? { write } : {}) };
  } finally {
    if (changes) {
      touched = new Set();
      removed = new Set();
    }
  }
}

function runOp(op: string, args: Obj, who: Who): Outcome | Promise<Outcome> {
  switch (op) {
    case "documents":
      return documentsOp(args);
    case "document":
      return documentOp(args);
    case "today":
      return todayOp(who);
    case "records":
      return recordsOp(args);
    case "search":
      return searchOp(args, who);
    case "record":
      return recordOp(args);
    case "recordBrief":
      return recordBriefOp(args);
    case "figures":
      return figuresOp(args);
    case "people":
      return peopleOp(args);
    case "equipment":
      return equipmentOp(args);
    case "insights":
      return insightsOp(args);
    case "open":
      return openOp(args, who);
    case "change":
      return changeOp(args, who);
    case "action":
      return actionOp(args, who);
    case "photo":
      return photoOp(args, who);
    case "sampleFill":
      return sampleFillOp(args, who);
    case "prepare":
      return prepareOp();
    case "notifications":
      return notificationsOp(args);
    default:
      return refuse(400, "bad-request", `There is no such thing to do as "${op}".`);
  }
}

const done = (body: unknown, status = 200): Outcome => ({ ok: true, status, body, activity: [] });
const refuse = (status: number, code: string, error: string, extra?: Obj): Outcome => ({ ok: false, status, code, error, ...(extra ? { extra } : {}), activity: [] });

/** How a document is called in a sentence: its format number and name, or its name while the number is to be confirmed. */
function calledBy(documentId: string): string {
  const doc = documentRepository.getByIdUnscoped(documentId);
  if (!doc) return documentId;
  return doc.formatNo && !doc.formatNo.toUpperCase().startsWith("TO BE") ? `${doc.formatNo} ${doc.name}` : doc.name;
}

/**
 * THE PERSON'S LEVEL ON THE DOCUMENT, ASKED BEFORE A CHANGE (REQUIREMENTS §96): null when the step is allowed, else the
 * refusal — 403 "access-level", the website's own sentence in the person's language (engine/accessWords.ts), and the
 * level they have and the one the step needs. On the old, department-only path there are no levels to ask.
 */
function levelRefusal(documentId: string, action: DocumentAction, who: Who, recordId?: string): Outcome | null {
  if (!viewer || mayDo(documentId, action)) return null;
  const level = documentLevel(documentId);
  const needed = levelNeeded(action);
  return refuse(403, "access-level", refusalSentence(who.lang, calledBy(documentId), level, needed, action), {
    level,
    needed,
    action,
    documentId,
    ...(recordId ? { recordId } : {}),
  });
}

/** A document the person does not see at all, in the website's words, with the module it is kept in. */
function notOpenWords(documentId: string, lang: AccessLanguage = "en"): string {
  const code = departmentOfDocument(documentId, documentRepository.getByIdUnscoped(documentId)?.formatNo);
  return refusalSentence(lang, `${calledBy(documentId)}${code ? ` (${departmentName(code)})` : ""}`, "none", "read", "view");
}

// ---------------------------------------------------------------------------
// what was changed, and how it is stored

let touched = new Set<string>();
let removed = new Set<string>();

/** "Through Mitra mobile app: …" — the words DCRS's audit trail gives a change made through another app (backend/findingsCore.ts throughNote). */
const through = (client: string, words: string): string => `Through ${client}: ${words}`;
const saidThrough = (client: string, words: string | undefined): boolean => !!words && words.startsWith(`Through ${client}`);

/** What each history entry says when the engine gave it no note of its own — the activity log's words (engine/recordHistory.ts). */
const ENTRY_WORDS: Record<string, string> = {
  prepared: "prepared",
  edited: "edited",
  "assistant-edit": "edited through Mitra",
  imported: "changed from an uploaded file",
  submitted: "submitted for verification",
  verified: "verified",
  rejected: "sent back",
  resumed: "resumed",
  reopened: "reopened for correction",
  "correction-cancelled": "correction cancelled",
};

function throughLine(line: ActivityEvent, client: string): ActivityLine {
  const detail = line.detail ?? "";
  const words = line.action.replace(/^Record /, "");
  return {
    action: line.action,
    target: line.target ?? "",
    detail: saidThrough(client, detail) ? detail : through(client, detail || words.charAt(0).toLowerCase() + words.slice(1)),
    documentId: line.documentId ?? "",
  };
}

/** The change as the host stores it: the touched records laid over EVERY record as stored, and the new deletions-log lines. */
function writePlan(client: string, withLiveStart = false): WritePlan | undefined {
  const upserts = new Map<string, RecordInstance>();
  for (const id of touched) {
    const r = recordRepository.getById(id);
    if (r) upserts.set(id, r);
  }
  const gone = new Set([...removed].filter((id) => storedIds.has(id) && !upserts.has(id)));
  const plan: WritePlan = {};
  if (upserts.size > 0 || gone.size > 0) {
    const next: unknown[] = [];
    for (const line of parsedList("records")) {
      const id = isObj(line) && typeof line.id === "string" ? line.id : null;
      if (id && gone.has(id)) continue;
      const mine = id ? upserts.get(id) : undefined;
      next.push(mine ?? line);
      if (id) upserts.delete(id);
    }
    for (const r of upserts.values()) next.push(r);
    plan.records = { value: JSON.stringify(next), baseVersion: held.get("records")?.version ?? 0 };
  }
  const added = readJSON<DeletionEntry[]>("deletions", []).filter((d) => !storedDeletionIds.has(d.id));
  if (added.length > 0) plan.deletionsAdded = added.map((d) => (saidThrough(client, d.reason) ? d : { ...d, reason: through(client, d.reason || "no reason given") }));
  // The go-live day the record generator set, when none was stored: without it the next day's run would take that day
  // as the go-live, and the records made today would read as leftovers from before it.
  if (withLiveStart && !held.has("live-start")) {
    const value = localStorage.getItem(NAMESPACE + "live-start");
    if (value) plan.liveStart = { value };
  }
  return plan.records || plan.deletionsAdded || plan.liveStart ? plan : undefined;
}

// SAID ONCE, AND KEPT APART. Two edits by one person within a quarter of an hour
// are folded into one history entry (engine/recordHistory.ts appendHistory) —
// right for a person typing, whose autosave would otherwise bury the history;
// wrong for changes made through another app, each of which must keep its own
// "Through …" note, as a CAPA finding closed through the API does
// (backend/findingsCore.ts). So a change through the app is saved with a mark
// at the end of the history that nothing can fold into, and the mark is taken
// out again at once: the entry, and its line in the activity log, are the
// engine's own.
const MARK_ID = "hist-engine-host-mark";

function savedApart(base: RecordInstance, save: (record: RecordInstance) => RecordInstance): RecordInstance {
  const mark: HistoryEntry = { id: MARK_ID, at: base.updatedAt ?? "", by: "", action: "prepared" };
  const saved = save({ ...base, history: [...(base.history ?? []), mark] });
  return recordRepository.upsert({ ...saved, history: (saved.history ?? []).filter((h) => h.id !== MARK_ID) });
}

/** Every entry a step added to a record's history says which app it came through, as the change's own note or its action. */
function markThrough(recordId: string, before: RecordInstance, client: string): HistoryEntry[] {
  const now = recordRepository.getById(recordId);
  if (!now) return [];
  const had = new Set((before.history ?? []).map((h) => h.id));
  const fresh = (now.history ?? []).filter((h) => !had.has(h.id));
  if (fresh.length === 0) return [];
  if (fresh.every((h) => saidThrough(client, h.note))) return fresh;
  const history = (now.history ?? []).map((h) => (had.has(h.id) || saidThrough(client, h.note) ? h : { ...h, note: through(client, h.note || ENTRY_WORDS[h.action] || h.action) }));
  const updated = recordRepository.upsert({ ...now, history });
  return (updated.history ?? []).filter((h) => !had.has(h.id));
}

// ---------------------------------------------------------------------------
// documents

const REFERENCE_KINDS = new Set(["chemical-master", "licence", "compliance-statement"]);
const isReference = (doc: DocumentDefinition): boolean => !!doc.isReferenceOnly || REFERENCE_KINDS.has(doc.kind);

function departmentOf(doc: Pick<DocumentDefinition, "id" | "formatNo">): { code: string; name: string } | null {
  const code = departmentOfDocument(doc.id, doc.formatNo);
  return code ? { code, name: departmentName(code) } : null;
}

function brief(doc: DocumentDefinition): Obj {
  return {
    id: doc.id,
    formatNo: doc.formatNo,
    name: doc.name,
    module: doc.module,
    section: doc.section ?? null,
    kind: doc.kind,
    schedule: { frequency: doc.frequency, rule: isReference(doc) ? "Reference only — no due dates" : scheduleLabel(doc) },
    department: departmentOf(doc),
    revisionNo: doc.revisionNo,
    referenceOnly: isReference(doc),
    route: documentOpenRoute(doc),
  };
}

function documentsOp(args: Obj): Outcome {
  const q = str(args.q);
  const limit = Math.max(1, Math.min(200, Number(args.limit) || 50));
  if (!q) {
    const all = documentRepository.getAll();
    return done({ query: "", documents: all.slice(0, limit).map(brief), total: all.length, kept: [], notInDcrs: [] });
  }
  const found = findDocuments(q);
  const yours: DocumentDefinition[] = [];
  const add = (d: DocumentDefinition | undefined) => {
    if (d && !yours.some((x) => x.id === d.id)) yours.push(d);
  };
  for (const f of found) if (f.kind === "yours") add(f.doc);
  // The words people use for a document (engine/assistantLocal.ts DOC_KEYWORDS), as Mitra's find_documents reads them.
  for (const id of matchDocuments(q.toLowerCase())) add(documentRepository.getById(id));
  const kept = found.flatMap((f) =>
    f.kind === "kept" ? [{ id: f.doc.id, formatNo: f.doc.formatNo, name: f.doc.name, module: f.doc.module, department: f.department, note: keptByLabel(f.department) }] : []
  );
  const notInDcrs = found.flatMap((f) => (f.kind === "master" ? [{ formatNo: f.format.formatNo, name: f.format.name, department: f.format.departmentName, note: NOT_IN_DCRS_YET }] : []));
  return done({ query: q, documents: yours.slice(0, limit).map(brief), total: yours.length, kept, notInDcrs });
}

/** A document the person may open, named by its id, its format number or its words — or the refusal. */
function documentNamed(said: string): { doc: DocumentDefinition } | { refusal: Outcome } {
  const s = said.trim();
  if (!s) return { refusal: refuse(400, "bad-request", "Say which document: its id or its format number (GET /api/v1/documents?q=… finds it).") };
  // An id or a format number is that document, or another department's — never a
  // guess at a different one. Words name a document only when exactly one of the
  // person's answers them: by the Search rule (engine/documentFinder.ts, every
  // word), else by the words people use for it (DOC_KEYWORDS, as Mitra reads them).
  const exact = documentRepository.getByIdUnscoped(s);
  const byNumber = exact ? [] : documentsByFormatNumberUnscoped(s);
  let doc = exact ? (isDocumentIdVisible(exact.id, exact.formatNo) ? exact : undefined) : byNumber.find((d) => isDocumentIdVisible(d.id, d.formatNo));
  let other = exact ?? byNumber[0];
  if (!doc && !other) {
    const found = findDocuments(s);
    const yours = found.flatMap((f) => (f.kind === "yours" ? [f.doc] : []));
    const aliases = matchDocuments(s.toLowerCase())
      .map((id) => documentRepository.getById(id))
      .filter((d): d is DocumentDefinition => !!d);
    doc = yours.length === 1 ? yours[0] : aliases.length === 1 ? aliases[0] : undefined;
    if (!doc && (yours.length > 1 || aliases.length > 1)) {
      const several = yours.length > 1 ? yours : aliases;
      return {
        refusal: refuse(400, "ambiguous", `Several documents answer "${s.slice(0, 80)}" — say which one, by its id or its format number.`, {
          candidates: several.slice(0, 12).map((d) => ({ id: d.id, formatNo: d.formatNo, name: d.name })),
        }),
      };
    }
    const kept = found.flatMap((f) => (f.kind === "kept" ? [f.doc] : []));
    if (!doc && kept.length === 1) other = kept[0];
  }
  if (doc) return { doc };
  if (other) {
    return {
      refusal: refuse(403, "not-your-department", notOpenWords(other.id), {
        document: { id: other.id, formatNo: other.formatNo, name: other.name },
      }),
    };
  }
  const listed = findDocuments(s).find((f) => f.kind === "master");
  if (listed && listed.kind === "master") {
    return { refusal: refuse(404, "not-in-dcrs", `${listed.format.formatNo} ${listed.format.name} is on the Master List of Formats (F/SYS/02), but it is not in DCRS yet.`) };
  }
  return { refusal: refuse(404, "not-found", `No document matches "${s.slice(0, 80)}". Find it with GET /api/v1/documents?q=… first.`) };
}

const fieldOf = (f: LogHeaderField | LogColumn): Obj => {
  const c = f as LogColumn;
  return {
    key: f.key,
    label: f.label,
    type: f.type,
    ...(f.options?.length ? { options: f.options } : {}),
    ...(f.required ? { required: true } : {}),
    ...(c.unit ? { unit: c.unit } : {}),
    ...(c.group ? { group: c.group } : {}),
    ...(c.fixed ? { printed: true } : {}),
    ...(f.computed ? { computed: true } : {}),
    ...(c.linkedFrom ? { readFrom: c.linkedFrom } : {}),
    ...(typeof c.min === "number" ? { min: c.min } : {}),
    ...(typeof c.max === "number" ? { max: c.max } : {}),
  };
};

function typeOfValue(key: string, value: unknown): string {
  if (typeof value === "boolean") return "yesno";
  if (typeof value === "number") return "number";
  if (Array.isArray(value)) return "list";
  if (isObj(value)) return "group";
  if (/date/i.test(key)) return "date";
  if (/^time|Time/.test(key)) return "time";
  return value === null ? "number or blank" : "text";
}

/** What the form is made of, in the keys a patch names: a log sheet's boxes and columns, F/HR/17's check points, any other form's fields. */
function layoutOf(doc: DocumentDefinition, record?: RecordInstance): Obj {
  if (doc.kind === "log-sheet") {
    const l: LogSheetLayout | undefined = getLogSheetLayoutForRecord(doc.id, record);
    if (l) {
      const mode = l.rowMode;
      const rows = record && isObj(record.data) && Array.isArray((record.data as Obj).rows) ? ((record.data as Obj).rows as unknown[]).length : undefined;
      return {
        kind: "log-sheet",
        header: l.headerFields.map(fieldOf),
        footer: (l.footerFields ?? []).map(fieldOf),
        columns: l.columns.map(fieldOf),
        rows: {
          mode: mode.kind,
          ...(mode.kind === "timeSlots" ? { slotKey: mode.slotKey, slots: mode.slots } : {}),
          ...(mode.kind === "fixedRows" ? { fixed: mode.rows.length } : {}),
          ...(rows !== undefined ? { count: rows } : {}),
        },
      };
    }
  }
  const master: MasterData = masterRepository.get();
  if (doc.kind === "daily-pest-monitoring") {
    return {
      kind: doc.kind,
      checkpoints: master.checkpoints.map((c) => ({ number: Number(c.no), question: c.text, answer: c.responseType, ...(c.notePrompt ? { noteAsks: c.notePrompt } : {}), ...(c.flagWhen ? { findingWhen: c.flagWhen } : {}) })),
      fields: [
        { key: "checker", label: "Checker", type: "text" },
        { key: "timeOfChecking", label: "Time of checking", type: "time" },
        { key: "isHoliday", label: "Holiday", type: "yesno" },
      ],
      lists: [
        { key: "rodentCatches", label: "Rodent catches", items: ["trapBoxNo", "location", "count"] },
        { key: "summaryActions", label: "Observations and actions", items: ["dateOfObservation", "descriptionOfObservation", "actionTaken", "remarks"] },
      ],
    };
  }
  const data = record?.data ?? createDefaultData(doc, todayISO(), master);
  if (!isObj(data)) return { kind: doc.kind, fields: [] };
  const fields: Obj[] = [];
  for (const [key, value] of Object.entries(data)) {
    const type = typeOfValue(key, value);
    const field: Obj = { key, label: humanKey(key), type };
    if (Array.isArray(value)) {
      const first = value.find(isObj);
      if (first) field.items = Object.keys(first).filter((k) => k !== "id");
      field.count = value.length;
    } else if (isObj(value)) field.parts = Object.keys(value);
    fields.push(field);
  }
  return { kind: doc.kind, fields };
}

/** How a change to this kind of form is written (engine/recordPatch.ts applyAssistantPatch, Mitra's edit_open_record). */
function patchShape(doc: DocumentDefinition): string {
  switch (doc.kind) {
    case "log-sheet":
      return 'A box: {"header": {"<box key>": value}}. One line: {"itemEdits": [{"collection": "rows", "match": {"<slot key>": "10:00"} or {"row": 2}, "set": {"<column key>": value}}]}. Printed and computed columns cannot be written.';
    case "daily-pest-monitoring":
      return 'Check points by number: {"checkpoints": {"1": "Yes", "4": 100, "8": {"value": "Yes", "note": "near the store"}}, "checker": "Name", "timeOfChecking": "09:30"}.';
    case "gap-inspection":
      return 'A field: {"inspectionDate": "YYYY-MM-DD"}. One finding: {"itemEdits": [{"collection": "findings", "match": {"sNo": 1}, "set": {"correctiveActionClient": "…", "targetDate": "YYYY-MM-DD"}}]}.';
    case "complaint-checklist":
      return 'A field: {"customerName": "…"}. One activity: {"itemEdits": [{"collection": "sections", "match": {"key": "A"}, …}]} — the checklist is answered one activity at a time, A1 to E32.';
    default:
      return 'A field: {"<field key>": value}. One line of a list: {"itemEdits": [{"collection": "<list key>", "match": {"<key>": value} or {"row": 2}, "set": {"<key>": value}}]}.';
  }
}

function documentOp(args: Obj): Outcome {
  const named = documentNamed(str(args.id));
  if ("refusal" in named) return named.refusal;
  const doc = named.doc;
  const master = masterRepository.get();
  const info = getDocumentInfo(doc, master);
  const today = todayISO();
  // The latest up to today: the calendar keeps the coming weeks' blank sheets too, which are not "latest".
  const records = isReference(doc)
    ? []
    : recordRepository.query({ documentId: doc.id, isDemo: false, toDate: today }).sort((a, b) => compareISO(b.dueDate, a.dueDate));
  const edit = formatEditFor(doc.id);
  return done({
    ...brief(doc),
    description: doc.description,
    revisionDate: doc.revisionDate,
    companyName: doc.companyName ?? null,
    sourceFile: doc.sourceFile,
    formatChangedInDcrs: !!edit,
    what: info.what,
    who: { label: info.whoLabel, people: info.who.map((e) => ({ name: e.name, role: e.role })) },
    when: info.when,
    how: info.how,
    layout: isReference(doc) ? null : layoutOf(doc),
    patchShape: isReference(doc) ? null : patchShape(doc),
    records: {
      count: records.length,
      latest: records.slice(0, 5).map((r) => ({ recordId: storedIds.has(r.id) ? r.id : null, dueDate: r.dueDate, status: r.status, started: storedIds.has(r.id) })),
    },
  });
}

// ---------------------------------------------------------------------------
// today

function dayJson(d: DayInfo): Obj {
  return { date: d.date, weekday: d.weekday, kind: d.kind, closed: d.isHoliday, ...(d.name ? { name: d.name } : {}), label: d.label };
}

/** The access rules as stored (engine/accessRules.ts), over every document: what each account may do, and what it answers for. */
function accessNow(): Access {
  const docs = documentRepository.getAllUnscoped().map((d) => ({ id: d.id, formatNo: d.formatNo, department: departmentOfDocument(d.id, d.formatNo), reference: isReference(d) }));
  return buildAccess(docs, readJSON<unknown>("access", null));
}

// TODAY BY PERSON (REQUIREMENTS §96, §97). A person is given what they answer for and the records they may verify;
// an account nobody has described yet (it answers for nothing) keeps what it had: every document it may fill. The
// super admin is given everything, counted by module. Each item says its module, and whether this person may submit or
// verify it now, so the phone shows only the buttons the level allows.
function todayOp(who: Who): Outcome {
  const master = masterRepository.get();
  const today = todayISO();
  const docs = new Map(documentRepository.getRecordable().map((d) => [d.id, d] as const));
  const access = accessNow();
  const account: AccessAccount = { email: who.email, role: who.role, departments: departments ?? [] };
  const boss = access.isBoss(account);
  const answers = new Set(boss ? [] : access.answersFor(account));
  const mine = (documentId: string): boolean => boss || answers.has(documentId) || (answers.size === 0 && access.may(account, documentId, "fill"));
  const mayVerify = (documentId: string): boolean => access.may(account, documentId, "verify");
  const item = (x: { documentId: string; recordId: string; dueDate: string; route: string }, extra: Obj = {}): Obj => {
    const doc = docs.get(x.documentId);
    const stored = storedIds.has(x.recordId);
    const status = recordRepository.getById(x.recordId)?.status ?? null;
    return {
      documentId: x.documentId,
      formatNo: doc?.formatNo ?? "",
      document: doc?.name ?? x.documentId,
      module: departmentOfDocument(x.documentId, doc?.formatNo) ?? null,
      dueDate: x.dueDate,
      status,
      // A register the calendar has not stored yet: POST /api/v1/records {documentId, date} starts it.
      recordId: stored ? x.recordId : null,
      started: stored,
      ...(stored ? { route: x.route } : {}),
      canSubmit: (status === null || isEditableStatus(status)) && access.may(account, x.documentId, "submit"),
      canVerify: status !== null && VERIFIABLE.includes(status) && mayVerify(x.documentId),
      ...extra,
    };
  };
  const reminders = computeReminders(false).filter((r) => mine(r.documentId));
  const briefing = computeBriefing(who.userName);
  const brief = (b: BriefingItem): Obj => item(b, b.errors.length ? { problems: b.errors.slice(0, 5) } : {});
  const lists = {
    overdue: reminders.filter((r) => r.urgency === "overdue").map((r) => item(r)),
    due: reminders.filter((r) => r.urgency === "due").map((r) => item(r)),
    upcoming: reminders.filter((r) => r.urgency === "upcoming").map((r) => item(r)),
    readyToSubmit: briefing.ready.filter((b) => mine(b.documentId)).map(brief),
    needsInput: briefing.needsInput.filter((b) => mine(b.documentId)).map(brief),
    awaitingVerification: briefing.awaitingVerification.filter((b) => boss || mayVerify(b.documentId)).map(brief),
  };
  let byModule: Obj[] | undefined;
  if (boss) {
    const counts = new Map<string, Record<string, number>>();
    for (const [list, entries] of Object.entries(lists)) {
      for (const e of entries) {
        const module = typeof e.module === "string" ? e.module : "";
        let c = counts.get(module);
        if (!c) counts.set(module, (c = { overdue: 0, due: 0, upcoming: 0, readyToSubmit: 0, needsInput: 0, awaitingVerification: 0 }));
        c[list] += 1;
      }
    }
    byModule = [...counts.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(([module, c]) => ({ module: module || null, ...c }));
  }
  return done({
    date: today,
    day: dayJson(dayInfo(today, master)),
    tomorrow: dayJson(dayInfo(addDays(today, 1), master)),
    weeklyOff: { day: WEEKDAY_LONG[weeklyOffDay(master)], next: nextWeeklyOff(addDays(today, 1), master) },
    nextHolidays: upcomingHolidays(today, master, 8, 150).map(dayJson),
    ...lists,
    ...(byModule ? { byModule } : {}),
    facts: buildAssistantContext(false, who.userName),
  });
}

// ---------------------------------------------------------------------------
// the server's own jobs (REQUIREMENTS §97): run as the system, over every department

const systemOnly = (): Outcome => refuse(403, "system-only", "This is the server's own job, run over every department.");
/** The server's own caller (backend/notificationJobs.ts SYSTEM_CALLER, as the super admin): every document, every department. */
const asTheSystem = (): boolean => (viewer ? viewer.role === "admin" : !departments);

// THE MORNING PREPARE (backend/notificationJobs.ts "morning-prepare"). What a browser does when it opens the app
// (data/bootstrap.ts, engine/assistantPrepare.ts), done on the server whether or not anybody opens it: the near-term
// sheets of every Live document made (at the load, engine/reminders.ts ensureNearTermRecordsGenerated), and every
// blank sheet due by today prepared by the ONE rule the browser runs (prepareDueRecords: the known parts only, never a
// reading; a sheet a person has started is never touched). Stored as a browser stores them: every Live record the
// start-up made that is not stored yet, and each one prepared. Run again, it finds them stored and prepares nothing.
function prepareOp(): Outcome {
  if (!asTheSystem()) return systemOnly();
  const today = todayISO();
  const prepared = prepareDueRecords(today);
  const preparedIds = new Set(prepared.map((r) => r.id));
  let made = 0;
  for (const r of recordRepository.getAll()) {
    if (r.isDemo !== false || storedIds.has(r.id)) continue;
    touched.add(r.id);
    if (!preparedIds.has(r.id)) made += 1;
  }
  for (const r of prepared) touched.add(r.id);
  const byModule = new Map<string, number>();
  for (const r of prepared) {
    const code = departmentOfDocument(r.documentId, documentRepository.getByIdUnscoped(r.documentId)?.formatNo) ?? "";
    byModule.set(code, (byModule.get(code) ?? 0) + 1);
  }
  return done({
    date: today,
    prepared: prepared.length,
    sheetsMade: made,
    modules: [...byModule.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(([module, count]) => ({ module: module || null, count })),
    records: prepared.map((r) => ({ recordId: r.id, documentId: r.documentId, dueDate: r.dueDate, status: r.status })),
  });
}

// THE NOTIFICATION PLAN (backend/notificationJobs.ts "notify"): for every active account the server hands in, in one
// load, what it should be told now (engine/notificationPlan.ts), from the plant's records, the documents, the calendar
// and the access rules as stored. Read only: the server keeps the ledger.
function notificationsOp(args: Obj): Outcome {
  if (!asTheSystem()) return systemOnly();
  const access = accessNow();
  const accounts = Array.isArray(args.accounts) ? args.accounts.filter(isObj) : [];
  const people: PlanPerson[] = accounts
    .filter((a) => a.active !== false && str(a.id))
    .map((a) => {
      const account: AccessAccount = { email: str(a.email), role: str(a.role) || "staff", departments: Array.isArray(a.departments) ? a.departments.map((d) => str(d)).filter(Boolean) : [] };
      const boss = access.isBoss(account);
      return { id: str(a.id), name: str(a.name), boss, answersFor: new Set(boss ? [] : access.answersFor(account)), mayVerify: (id: string) => access.may(account, id, "verify") };
    });
  const master = masterRepository.get();
  const today = todayISO();
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const docs = documentRepository.getRecordableUnscoped();
  const byId = new Map(docs.map((d) => [d.id, d] as const));
  const records: PlanRecord[] = [];
  for (const r of recordRepository.getAll()) {
    const doc = byId.get(r.documentId);
    if (r.isDemo !== false || !doc) continue;
    // What still stops a submit, asked only of an open record whose day has come: the readings waiting.
    const open = r.status === "In Progress" && compareISO(r.dueDate, today) <= 0;
    records.push({
      id: r.id,
      documentId: r.documentId,
      dueDate: r.dueDate,
      status: r.status,
      stored: storedIds.has(r.id),
      prepared: !!r.prepared,
      problems: open ? validateForSubmit(doc, r).errors.length : 0,
      submittedBy: r.submittedBy ?? null,
      rejectedBy: r.rejectedBy ?? null,
      rejectionReason: r.rejectionReason ?? null,
      rejections: (r.history ?? []).filter((h) => h.action === "rejected").length,
    });
  }
  const times = isObj(args.summaryTimes) && str(args.summaryTimes.morning) && str(args.summaryTimes.evening) ? { morning: str(args.summaryTimes.morning), evening: str(args.summaryTimes.evening) } : undefined;
  const items = planNotifications({
    today,
    time,
    documents: docs.map((d) => ({ id: d.id, formatNo: d.formatNo, name: d.name, module: departmentOfDocument(d.id, d.formatNo), schedule: d.schedule, reference: isReference(d) })),
    records,
    people,
    isClosedDay: (d) => isCompanyHoliday(d, master),
    countedFrom: settingsRepository.get().liveStartDate,
    ...(times ? { summaryTimes: times } : {}),
  });
  return done({ date: today, time, users: people.map((p) => p.id), items });
}

// ---------------------------------------------------------------------------
// records

const STATUSES: RecordStatus[] = ["Scheduled", "Due", "In Progress", "Submitted", "Pending Verification", "Verified", "Rejected"];
const VERIFIABLE: RecordStatus[] = ["Submitted", "Pending Verification"];

function dateArg(value: unknown, today: string): string | null | undefined {
  const s = str(value);
  if (!s) return undefined;
  return normDate(s, today);
}

function listItem(r: RecordInstance, doc: DocumentDefinition | undefined): Obj {
  const stored = storedIds.has(r.id);
  return {
    recordId: stored ? r.id : null,
    started: stored,
    documentId: r.documentId,
    formatNo: doc?.formatNo ?? "",
    document: doc?.name ?? r.documentId,
    dueDate: r.dueDate,
    status: r.status,
    ...(r.submittedBy ? { submittedBy: r.submittedBy } : {}),
    ...(r.verifiedBy ? { verifiedBy: r.verifiedBy } : {}),
    ...(stored ? { updatedAt: r.updatedAt, route: routeForRecord(doc, r.id) } : {}),
  };
}

function recordsOp(args: Obj): Outcome {
  const today = todayISO();
  const said = str(args.documentId);
  let doc: DocumentDefinition | undefined;
  if (said) {
    const named = documentNamed(said);
    if ("refusal" in named) return named.refusal;
    doc = named.doc;
  }
  const toGiven = dateArg(args.to, today);
  const fromGiven = dateArg(args.from, today);
  if (toGiven === null || fromGiven === null) return refuse(400, "bad-date", "from and to must be dates written YYYY-MM-DD (or today, yesterday).");
  const to = toGiven ?? today;
  const from = fromGiven ?? addDays(to, -31);
  const [lo, hi] = compareISO(from, to) <= 0 ? [from, to] : [to, from];
  const wanted = str(args.status).toLowerCase().replace(/[\s_-]+/g, " ");
  const status = wanted ? STATUSES.find((s) => s.toLowerCase() === wanted) : undefined;
  if (wanted && !status) return refuse(400, "bad-request", `status must be one of: ${STATUSES.join(", ")}.`);
  const limit = Math.max(1, Math.min(200, Number(args.limit) || 50));
  const records = recordRepository
    .query({ ...(doc ? { documentId: doc.id } : {}), isDemo: false, fromDate: lo, toDate: hi })
    .filter((r) => !status || r.status === status)
    .sort((a, b) => compareISO(b.dueDate, a.dueDate) || (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
  const docs = new Map(documentRepository.getAll().map((d) => [d.id, d] as const));
  return done({
    ...(doc ? { document: brief(doc) } : {}),
    from: lo,
    to: hi,
    ...(status ? { status } : {}),
    total: records.length,
    records: records.slice(0, limit).map((r) => listItem(r, docs.get(r.documentId))),
  });
}

/** The longest a search waits for the index to be built, in slices, before answering with what there is. */
const INDEX_BUILD_MS = 30_000;

function searchOp(args: Obj, who: Who): Outcome {
  const q = str(args.q);
  if (!q) return refuse(400, "bad-request", "q is needed: the words to look for.");
  const today = todayISO();
  const limit = Math.max(1, Math.min(100, Number(args.limit) || 20));
  const from = dateArg(args.from, today);
  const to = dateArg(args.to, today);
  if (from === null || to === null) return refuse(400, "bad-date", "from and to must be dates written YYYY-MM-DD.");
  let onlyDoc: DocumentDefinition | undefined;
  if (str(args.documentId)) {
    const named = documentNamed(str(args.documentId));
    if ("refusal" in named) return named.refusal;
    onlyDoc = named.doc;
  }
  const inRange = (r: { dueDate: string }): boolean => (!from || compareISO(r.dueDate, from) >= 0) && (!to || compareISO(r.dueDate, to) <= 0);
  const docs = new Map(documentRepository.getAll().map((d) => [d.id, d] as const));
  const reading = readSearchQuery(q);
  const docIds = onlyDoc ? [onlyDoc.id] : (reading.documentIds ?? undefined);
  if (reading.kind === "register" || !reading.words.trim()) {
    // Only a format number was given: that document's latest records (Mitra's search_records does the same).
    const ids = docIds ?? [];
    if (ids.length === 0) return refuse(400, "bad-request", "Name a document, or give words to look for.");
    const records = ids
      .flatMap((id) => recordRepository.query({ documentId: id, isDemo: false }))
      .filter(inRange)
      .sort((a, b) => compareISO(b.dueDate, a.dueDate));
    return done({ query: q, kind: "register", total: records.length, hits: records.slice(0, limit).map((r) => listItem(r, docs.get(r.documentId))) });
  }
  // The index is built here and now, slice by slice, so nothing is ever answered from half of it.
  const opts = { isDemo: false, account: who.userId };
  const started = Date.now();
  let status = ensureRecordIndex(opts);
  while (!status.ready && Date.now() - started < INDEX_BUILD_MS) status = ensureRecordIndex(opts);
  const res = searchRecords(reading.words, { ...opts, limit: 500, documentIds: docIds });
  const hits = res.hits.filter(inRange);
  return done({
    query: q,
    kind: "words",
    total: from || to ? hits.length : res.total,
    complete: res.complete,
    hits: hits.slice(0, limit).map((h) => ({ ...listItem(recordRepository.getById(h.id) ?? (h as unknown as RecordInstance), docs.get(h.documentId)), snippet: snippetFor(h.cells, res.terms) })),
    ...(res.total === 0 ? { note: "Only what people wrote on records is searched; blank or prepared sheets are listed with GET /api/v1/records." } : {}),
  });
}

/** The record the person asked for, and its document — or the refusal DCRS's own page gives. */
function recordNamed(id: string): { record: RecordInstance; doc: DocumentDefinition } | { refusal: Outcome } {
  const wanted = id.trim();
  const record = wanted ? recordRepository.getById(wanted) : undefined;
  if (!record || !storedIds.has(record.id)) {
    // Not in this person's copy. Another department's, the server says whose (pages/RecordPage.tsx NotYourDepartment); otherwise there is none.
    const elsewhere = parsedList("records").find((r) => isObj(r) && r.id === wanted && r.isDemo === false) as Obj | undefined;
    if (elsewhere && typeof elsewhere.documentId === "string") {
      const docId = elsewhere.documentId;
      const other = documentRepository.getByIdUnscoped(docId);
      return {
        refusal: refuse(403, "not-your-department", notOpenWords(docId)),
      };
    }
    return { refusal: refuse(404, "not-found", `There is no record "${wanted.slice(0, 80)}" in DCRS.`) };
  }
  if (record.isDemo !== false) return { refusal: refuse(404, "not-found", `There is no record "${wanted.slice(0, 80)}" in DCRS.`) };
  const doc = documentRepository.getById(record.documentId);
  if (!doc) {
    const other = documentRepository.getByIdUnscoped(record.documentId);
    if (other && !isDocumentIdVisible(other.id, other.formatNo)) {
      return { refusal: refuse(403, "not-your-department", notOpenWords(other.id)) };
    }
    return { refusal: refuse(404, "not-found", "The document this record was made for is no longer in DCRS.") };
  }
  return { record, doc };
}

/** Which of DCRS's pages this record opens on — and so which page's own handlers act on it. */
type PageKind = "record" | "gap" | "training" | "complaint";
function pageOf(doc: DocumentDefinition): PageKind | null {
  if (isReference(doc)) return null;
  if (doc.kind === "gap-inspection") return "gap";
  if (doc.kind === "training-record") return "training";
  if (doc.kind === "complaint-checklist") return "complaint";
  return "record";
}

/** The kind Mitra's patch checker is told the open record is: what each page registers (store/AssistantContext.tsx). */
const patchKindOf = (doc: DocumentDefinition, page: PageKind): string => (page === "gap" ? "gap" : page === "training" ? "training" : doc.kind);

const titleOf = (doc: DocumentDefinition, record: RecordInstance): string => `the ${doc.name} of ${formatDisplayDate(record.dueDate)}`;

/** What can be done to it now, as the page's action bar offers it (components/records/RecordActionBar.tsx). */
function actionsFor(record: RecordInstance, page: PageKind): string[] {
  const out: string[] = [];
  if (isEditableStatus(record.status)) out.push("submit");
  if (VERIFIABLE.includes(record.status)) out.push("verify", "send_back");
  if (record.status === "Rejected") out.push("resume");
  if (isCorrectableStatus(record.status) && !(page === "record" && supersededRevisionOf(record))) out.push("reopen");
  if (record.correction) out.push("cancel_correction");
  out.push("delete");
  return out;
}

/** F/MNT/03's Actual dates, read from each machine's F/MNT/02 as the sheet shows them — as Mitra's get_record gives them (engine/mitraTools.ts). */
function linkedActuals(record: RecordInstance): Obj | undefined {
  if (!schedulesLinked(record)) return undefined;
  const layout = getLogSheetLayoutForRecord(record.documentId, record);
  if (!layout?.columns.some((c) => c.linkedFrom)) return undefined;
  const rows = (record.data as LogSheetData | undefined)?.rows ?? [];
  const lines = pmActuals(rows, scheduleYear(record), currentPmIndex(record.isDemo));
  const actuals: string[] = [];
  lines.forEach((line, i) => {
    if (!isLinkedLine(line)) return;
    const months = line.months.map((cell, m) => (cell.length ? `${PM_MONTH_KEYS[m]} ${pmCellText(cell)}` : "")).filter(Boolean);
    if (months.length) actuals.push(`row ${i + 1} ${line.machine}: ${months.join(", ")}`);
  });
  return { note: "Actual dates are read from each machine's F/MNT/02 and are not stored on this sheet; * = that F/MNT/02 is not yet Verified.", actuals };
}

function historyJson(h: HistoryEntry): Obj {
  return {
    at: h.at,
    by: h.by,
    action: h.action,
    ...(h.note ? { note: h.note } : {}),
    ...(h.changes?.length ? { changes: h.changes.map((c) => ({ label: c.label, before: c.before, after: c.after })) } : {}),
    ...(h.moreChanges ? { moreChanges: h.moreChanges } : {}),
    ...(h.fromStatus ? { fromStatus: h.fromStatus } : {}),
  };
}

const HISTORY_SHOWN = 50;

function stripped(data: unknown): unknown {
  if (!isObj(data)) return data;
  const { _layout, _linked, ...rest } = data;
  void _layout;
  void _linked;
  return rest;
}

function recordJson(record: RecordInstance, doc: DocumentDefinition): Obj {
  const page = pageOf(doc) ?? "record";
  const layout = doc.kind === "log-sheet" ? getLogSheetLayoutForRecord(doc.id, record) : undefined;
  const cells = recordSearchText(record, doc, layout).cells;
  const history = historyOf(record);
  const linked = linkedActuals(record);
  return {
    recordId: record.id,
    documentId: doc.id,
    document: { id: doc.id, formatNo: doc.formatNo, name: doc.name, kind: doc.kind, module: doc.module, department: departmentOf(doc) },
    date: record.dueDate,
    status: record.status,
    editable: isEditableStatus(record.status),
    canReopen: actionsFor(record, page).includes("reopen"),
    actions: actionsFor(record, page),
    ...(record.submittedBy ? { submittedBy: record.submittedBy, submittedAt: record.submittedAt ?? null } : {}),
    ...(record.verifiedBy ? { verifiedBy: record.verifiedBy, verifiedAt: record.verifiedAt ?? null } : {}),
    ...(record.status === "Rejected" ? { sentBackBy: record.rejectedBy ?? null, sentBackBecause: record.rejectionReason ?? null } : {}),
    correction: record.correction ? { reason: record.correction.reason, by: record.correction.by, at: record.correction.at, fromStatus: record.correction.fromStatus } : null,
    prepared: record.prepared ? { at: record.prepared.at, notes: record.prepared.notes, basedOn: record.prepared.basedOn } : null,
    ...(record.formatRevision ? { formatRevision: record.formatRevision } : {}),
    photos: photoListOf(record.data)?.key ?? null,
    layout: layoutOf(doc, record),
    patchShape: patchShape(doc),
    inWords: cells.map((c) => ({ ...(c.where ? { where: c.where } : {}), label: c.label, value: c.value })),
    data: stripped(record.data),
    ...(linked ? { linked } : {}),
    history: history.slice(-HISTORY_SHOWN).map(historyJson),
    historyTotal: history.length,
    route: routeForRecord(doc, record.id),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function recordOp(args: Obj): Outcome {
  const found = recordNamed(str(args.id));
  if ("refusal" in found) return found.refusal;
  return done(recordJson(found.record, found.doc));
}

/** Just what the PDF route needs: that the person may print it, and what to call the file. */
function recordBriefOp(args: Obj): Outcome {
  const found = recordNamed(str(args.id));
  if ("refusal" in found) return found.refusal;
  const { record, doc } = found;
  return done({ recordId: record.id, documentId: doc.id, kind: doc.kind, formatNo: doc.formatNo, name: doc.name, dueDate: record.dueDate, status: record.status, label: recordLabel(record) });
}

// ---------------------------------------------------------------------------
// history and people

/** How much of an evidence pack one answer carries: more than Mitra's 1,300 (the model's budget), less than the Insights page's. */
const EVIDENCE_CHARS = 4000;

function figuresOp(args: Obj): Outcome {
  const question = str(args.question);
  if (!question) return refuse(400, "bad-request", "question is needed: what is asked about the records' history.");
  const today = todayISO();
  const found = analyticIntent(question, today);
  if (!found) return refuse(400, "not-history", "That is not a question about history. Say what is asked and for which period, for example: which machine broke down most this year.");
  let intent: AnalyticIntent = found;
  const from = dateArg(args.from, today);
  const to = dateArg(args.to, today);
  if (from === null || to === null) return refuse(400, "bad-date", "from and to must be dates written YYYY-MM-DD.");
  if (str(args.documentId)) {
    const named = documentNamed(str(args.documentId));
    if ("refusal" in named) return named.refusal;
    const topic = topicOfDocument(named.doc.id);
    intent = { ...intent, documentIds: [named.doc.id], topics: topic ? [topic] : intent.topics };
  }
  if (from || to) {
    const lo = from ?? intent.from;
    const hi = to && compareISO(to, today) <= 0 ? to : today;
    intent = { ...intent, from: lo, to: hi, label: `${formatDisplayDate(lo)} to ${formatDisplayDate(hi)}`, periodNamed: true };
  }
  if (intent !== found) intent = { ...intent, key: `${intent.general ? "g" : ""}|${intent.topics.join(",")}|${[...intent.documentIds].sort().join(",")}|${intent.from}|${intent.to}|${intent.label}` };
  const pack = buildEvidence(intent, false, EVIDENCE_CHARS);
  return done({
    question,
    period: intent.label,
    from: intent.from,
    to: intent.to,
    topics: intent.topics,
    evidence: pack.text.split("\n").filter(Boolean),
    sections: pack.sections.map((s) => ({ heading: s.heading, facts: s.facts.map((f) => ({ text: f.plain ?? f.text, recordIds: f.recordIds })) })),
    recordIds: pack.recordIds,
  });
}

function peopleOp(args: Obj): Outcome {
  if (!hrMasterVisible()) return refuse(403, "not-your-department", "HR Master Data is kept by Human Resources, and this account is not kept to it.");
  const q = str(args.q);
  if (!q) return refuse(400, "bad-request", "q is needed: a name or a GP3 No.");
  const { exact, candidates } = searchPeople(q, hrMasterRepository.all(), 5);
  return done({
    query: q,
    people: candidates.map((p) => ({ gp3: p.gp3No, name: p.fullName, department: p.department, designation: p.designation, joiningDate: p.joiningDate || null })),
    ...(exact ? { exact: describePerson(exact) } : {}),
  });
}

// ---------------------------------------------------------------------------
// the equipment list, and what stands out

// THE EQUIPMENT LIST, F/MNT/01 (REQUIREMENTS §74). DCRS's Mitra answers "which
// machine is M-47?", "where is the Delta 330", "machines in QC" from the list's
// current record (engine/equipmentMasterAssistant.ts, in her rules path, and the
// same facts in her live facts). Here is the same: her own words for the
// question, and the machines the words name — by DCRS's own search, which never
// picks a machine by a model name alone, because the list repeats them. The list
// is Maintenance's: anybody else is refused, as Mitra refuses them.

/** The most machines one answer lists. */
const MACHINES_SHOWN_MAX = 100;

/** A line of F/MNT/01 as Mitra reads it: put back in step where the list prints it one column out, and "NA" or "-" as nothing. */
function machineJson(m: Machine): Obj {
  const read = machineAsRead(m);
  const value = (v: string): string | null => (isPlaceholder(v) ? null : v.trim());
  return {
    machineNo: m.machineNo,
    description: value(read.description),
    model: value(read.model),
    manufacturer: value(read.manufacturer),
    location: value(read.location),
    // The list's own "Department" column: a section of the plant (Flexo, Common), not one of DCRS's departments.
    section: value(read.department),
    size: value(read.size),
    month: value(read.month),
    year: value(read.year),
    serialNo: value(read.serialNo),
    countryOfOrigin: value(read.countryOfOrigin),
    summary: describeMachine(m),
    ...(readsOutOfStep(m) ? { note: outOfStepNote(m).trim() } : {}),
  };
}

function equipmentListJson(machines: Machine[]): Obj {
  const record = currentEquipmentList();
  const numbers = machines
    .map((m) => machineKey(m.machineNo))
    .filter(Boolean)
    .map((k) => Number(k.slice(2)))
    .sort((a, b) => a - b);
  const label = (n: number) => `M-${String(n).padStart(2, "0")}`;
  return {
    documentId: EQUIPMENT_LIST_DOC_ID,
    formatNo: EQUIPMENT_LIST_FORMAT_NO,
    name: EQUIPMENT_LIST_NAME,
    recordId: record && storedIds.has(record.id) ? record.id : null,
    date: record?.dueDate ?? null,
    status: record?.status ?? null,
    machines: machines.length,
    numbered: numbers.length ? { first: label(numbers[0]), last: label(numbers[numbers.length - 1]), count: numbers.length } : null,
    gaps: numberingGaps(machines),
    route: EQUIPMENT_LIST_ROUTE,
  };
}

function equipmentOp(args: Obj): Outcome {
  if (!equipmentMasterVisible()) {
    return refuse(
      403,
      "not-your-department",
      notOpenWords(EQUIPMENT_LIST_DOC_ID)
    );
  }
  const q = str(args.q);
  const limit = Math.max(1, Math.min(MACHINES_SHOWN_MAX, Number(args.limit) || 20));
  const machines = allMachines();
  const list = equipmentListJson(machines);
  if (machines.length === 0) {
    return done({ query: q, list, answer: `There is no ${EQUIPMENT_LIST_NAME} (${EQUIPMENT_LIST_FORMAT_NO}) on file yet, so there is no machine to look up.`, exact: null, total: 0, machines: [] });
  }
  if (!q) return done({ query: "", list, answer: null, exact: null, total: machines.length, machines: machines.slice(0, limit).map(machineJson) });
  // Mitra's own answer to the words, as her rules path gives it ("open the equipment list" opens a page, which an app cannot).
  const said = equipmentChatAnswer(q);
  const answer = said && !said.navigate ? said.reply : null;
  const found = searchMachines(q, machines, machines.length);
  // WHICH MACHINES: the ones the words name by number (M-47), or the one a serial only it has names; otherwise, when
  // Mitra has no answer of her own, the ones DCRS's search finds for the words. A question she answers in words
  // ("machines in QC", "how many machines") is hers alone: the search, which wants every word of a question, would
  // list other machines than she names.
  const named = machineNumbersIn(q).flatMap((n) => machineByNumber(n, machines) ?? []);
  const shown = named.length > 0 ? named : answer !== null ? (found.exact ? [found.exact] : []) : found.candidates;
  return done({
    query: q,
    list,
    answer,
    exact: found.exact ? found.exact.machineNo : null,
    total: shown.length,
    machines: shown.slice(0, limit).map(machineJson),
  });
}

// WHAT STANDS OUT (REQUIREMENTS §75). With every message, DCRS's Mitra is given
// one line of what stands out in the records the person can see — the counts by
// severity and the most severe titles (engine/assistantLocal.ts
// buildAssistantContext, engine/insights.ts insightsHeadline) — from the very
// insights the Insights page and the Dashboard's card show (engine/scopedInsights.ts),
// worked out by the insight rules over the person's departments only. Here is
// that line, and the insights behind it, most severe first.

const INSIGHTS_SHOWN = 10;
const INSIGHTS_SHOWN_MAX = 50;
const EVIDENCE_SHOWN = 5;

function insightJson(i: Insight, docs: Map<string, DocumentDefinition>): Obj {
  const doc = i.documentId ? docs.get(i.documentId) : undefined;
  return {
    id: i.id,
    rule: i.rule,
    severity: i.severity,
    module: i.module,
    ...(i.documentId ? { documentId: i.documentId, formatNo: doc?.formatNo ?? "", document: doc?.name ?? i.documentId } : {}),
    title: i.title,
    detail: i.detail,
    ...(i.metric ? { metric: i.metric } : {}),
    evidence: i.evidence.slice(0, EVIDENCE_SHOWN).map((e) => ({
      // A record the calendar has not stored yet has no id to open it by, as in the lists.
      recordId: storedIds.has(e.recordId) ? e.recordId : null,
      documentId: e.documentId,
      dueDate: e.dueDate,
      ...(e.field ? { field: e.field } : {}),
      ...(e.value ? { value: e.value } : {}),
    })),
    evidenceTotal: i.evidenceTotal ?? i.evidence.length,
    ...(i.suggestedCapa ? { suggestedCapa: i.suggestedCapa } : {}),
    ...(i.route ? { route: i.route } : {}),
  };
}

function insightsOp(args: Obj): Outcome {
  const limit = Math.max(1, Math.min(INSIGHTS_SHOWN_MAX, Number(args.limit) || INSIGHTS_SHOWN));
  const insights = scopedInsights(false);
  const docs = new Map(documentRepository.getAll().map((d) => [d.id, d] as const));
  return done({
    date: todayISO(),
    headline: insightsHeadline(insights, 400),
    counts: insightCounts(insights),
    total: insights.length,
    insights: insights.slice(0, limit).map((i) => insightJson(i, docs)),
  });
}

// ---------------------------------------------------------------------------
// the changes

function openOp(args: Obj, who: Who): Outcome {
  const named = documentNamed(str(args.documentId));
  if ("refusal" in named) return named.refusal;
  const doc = named.doc;
  if (isReference(doc)) return refuse(409, "reference-only", `${doc.name} is kept as issued; it has no records to fill.`);
  const today = todayISO();
  const date = dateArg(args.date, today);
  if (date === null) return refuse(400, "bad-date", "date must be a date written YYYY-MM-DD (or today, yesterday, tomorrow).");
  // A record not stored yet is started by opening it: Write's (REQUIREMENTS §96). One stored already is only opened.
  const covering = recordCoveringDate(doc, date ?? today, false);
  if (!covering || !storedIds.has(covering.id)) {
    const refused = levelRefusal(doc.id, "start", who);
    if (refused) return refused;
  }
  const { record: made } = createRecordForDocument(doc, { dateISO: date ?? today, isDemo: false });
  const wasStored = storedIds.has(made.id);
  let record = made;
  // PREPARED, as the app's start-up prepares every blank register due today or
  // earlier before the Dashboard is drawn (engine/assistantPrepare.ts) — so the
  // record opened here is the record a browser opened now would show. Only for a
  // person who may fill it: the server's morning prepare does the rest.
  if ((record.status === "Scheduled" || record.status === "Due") && !record.prepared && compareISO(record.dueDate, today) <= 0 && (!viewer || mayDo(doc.id, "fill"))) {
    prepareDueRecords(today);
    record = recordRepository.getById(record.id) ?? record;
  }
  if (!wasStored || record !== made) touched.add(record.id);
  // Opening a record is a line of the activity log (pages/RecordPage.tsx).
  logActivity("Record opened", recordLabel(record), record.status, record.documentId);
  return done({ created: !wasStored, record: recordJson(record, doc) }, wasStored ? 200 : 201);
}

interface PageHandlers {
  doc: DocumentDefinition;
  page: PageKind;
  labels: Record<string, string>;
}

function handlersFor(doc: DocumentDefinition, record: RecordInstance): PageHandlers | null {
  const page = pageOf(doc);
  if (!page) return null;
  // The labels a record's history is written in: a log sheet's printed ones (pages/RecordPage.tsx); none on the other pages.
  return { doc, page, labels: page === "record" ? fieldLabels(doc.kind, doc.id, record) : {} };
}

/** Saves a change to the record's data exactly as its page's commit does (pages/RecordPage.tsx, GapPage.tsx, TrainingPage.tsx, CapaPage.tsx). */
function commitOn(h: PageHandlers, recordId: string, next: unknown, note: string, action: "assistant-edit" | "imported", userName: string): boolean {
  const base = recordRepository.getById(recordId);
  if (!base || !isEditableStatus(base.status)) return false;
  const data = h.page === "record" ? withComputedCells(h.doc.id, next) : h.page === "complaint" ? next : { ...(base.data as Obj), ...(next as Obj) };
  savedApart(base, (b) => saveDraft(b, data, userName, { action, note, ...(h.page === "record" ? { labels: h.labels } : {}) }));
  touched.add(recordId);
  return true;
}

/** The open record as Mitra's tools see it (store/AssistantContext.tsx AssistantTarget), for one change through the app. */
function targetFor(h: PageHandlers, record: RecordInstance, userName: string, noteFor: (toolNote: string) => string): AssistantTarget {
  return {
    documentKind: patchKindOf(h.doc, h.page),
    documentId: h.doc.id,
    recordId: record.id,
    status: record.status,
    editable: isEditableStatus(record.status),
    currentData: record.data,
    getData: () => recordRepository.getById(record.id)?.data,
    labels: h.labels,
    commit: (next, toolNote, action) => {
      commitOn(h, record.id, next, noteFor(toolNote), action ?? "assistant-edit", userName);
    },
    title: titleOf(h.doc, record),
  };
}

function toolContext(target: AssistantTarget, who: Who, words: string, attachments: MitraAttachment[] = []): MitraToolContext {
  return {
    today: todayISO(),
    isDemo: false,
    language: "en",
    userName: who.userName,
    currentRoute: routeForRecord(documentRepository.getById(target.documentId), target.recordId),
    navigate: () => undefined,
    target,
    bump: () => undefined,
    attachments,
    // Nothing is asked here: the app asked the person before it called, and a record
    // that would need reopening is refused before any tool runs.
    confirm: async () => false,
    userWords: words,
  };
}

function tool(name: string): MitraTool {
  const found = ALL_TOOLS.find((t) => t.name === name);
  if (!found) throw new Error(`Mitra has no tool called ${name}`);
  return found;
}

/** A change to a record that is not open for writing: refused, and the person is told to reopen it first — as Mitra asks before changing one. */
function needsReopen(record: RecordInstance, doc: DocumentDefinition, page: PageKind): Outcome {
  const canReopen = actionsFor(record, page).includes("reopen");
  return refuse(
    409,
    "needs-reopen",
    `${titleOf(doc, record)} is ${record.status} and cannot be changed as it stands. ${
      canReopen ? 'Reopen it for correction first, with a reason (action "reopen"); it will then need submitting and verifying again.' : "It cannot be reopened from here."
    }`,
    { status: record.status, canReopen }
  );
}

function changeSummary(record: RecordInstance, doc: DocumentDefinition, entries: HistoryEntry[]): Obj {
  const page = pageOf(doc) ?? "record";
  return {
    recordId: record.id,
    status: record.status,
    editable: isEditableStatus(record.status),
    actions: actionsFor(record, page),
    history: entries.map(historyJson),
    route: routeForRecord(doc, record.id),
  };
}

async function changeOp(args: Obj, who: Who): Promise<Outcome> {
  const found = recordNamed(str(args.id));
  if ("refusal" in found) return found.refusal;
  const { record, doc } = found;
  const h = handlersFor(doc, record);
  if (!h) return refuse(409, "reference-only", `${doc.name} is kept as issued; it has no record to change.`);
  const refused = levelRefusal(doc.id, record.correction ? "correct" : "fill", who, record.id);
  if (refused) return refused;
  if (!isEditableStatus(record.status)) return needsReopen(record, doc, h.page);
  const patch = args.patch;
  if (!isObj(patch) || Object.keys(patch).length === 0) return refuse(400, "bad-patch", "patch is needed: an object of the fields to change (see patchShape in GET /api/v1/records/{id}).");
  const said = str(args.note);
  const note = through(who.client, said || "changes asked for in the chat");
  const target = targetFor(h, record, who.userName, () => note);
  const before = record;
  // MITRA'S OWN edit_open_record: the patch checked and normalised field by field
  // (engine/recordPatch.ts applyAssistantPatch), what it changes worked out, and
  // the change saved through the page's own commit.
  const result = await tool("edit_open_record").run({ patch }, toolContext(target, who, said || "changes asked for in the chat"));
  const answer = (result.result ?? {}) as Obj;
  if (!result.ok) {
    const problems = Array.isArray(answer.rejected) ? answer.rejected : [];
    return refuse(400, "nothing-changed", `Nothing on the form changed${typeof answer.why === "string" && answer.why !== "nothing on the form changed" ? `: ${answer.why}` : "."}`, { problems });
  }
  const entries = markThrough(record.id, before, who.client);
  const now = recordRepository.getById(record.id) ?? record;
  const entry = entries[entries.length - 1];
  return done({
    ...changeSummary(now, doc, entries),
    changes: (entry?.changes ?? []).map((c) => ({ label: c.label, before: c.before, after: c.after })),
    ...(entry?.moreChanges ? { moreChanges: entry.moreChanges } : {}),
    problems: Array.isArray(answer.rejected) ? answer.rejected : [],
  });
}

async function sampleFillOp(args: Obj, who: Who): Promise<Outcome> {
  const found = recordNamed(str(args.id));
  if ("refusal" in found) return found.refusal;
  const { record, doc } = found;
  const h = handlersFor(doc, record);
  if (!h || !canSampleFill(doc.kind)) return refuse(409, "no-sample", `${doc.name} is kept as issued — there is no sample data for it.`);
  const refused = levelRefusal(doc.id, record.correction ? "correct" : "fill", who, record.id);
  if (refused) return refused;
  if (!isEditableStatus(record.status)) return needsReopen(record, doc, h.page);
  const target = targetFor(h, record, who.userName, (toolNote) => through(who.client, toolNote || SAMPLE_FILL_NOTE));
  // MITRA'S OWN fill_open_record_with_sample_data (engine/sampleFill.ts): realistic, made up, marked so, never submitted.
  const result = await tool("fill_open_record_with_sample_data").run({}, toolContext(target, who, "fill it with sample data"));
  const answer = (result.result ?? {}) as Obj;
  if (!result.ok) return refuse(409, "nothing-changed", typeof answer.why === "string" ? `Nothing changed: ${answer.why}.` : "Nothing changed.");
  const entries = markThrough(record.id, record, who.client);
  const now = recordRepository.getById(record.id) ?? record;
  return done({
    ...changeSummary(now, doc, entries),
    summary: Array.isArray(answer.summary) ? answer.summary : [],
    changed: typeof answer.changed === "number" ? answer.changed : entries[0]?.changes?.length ?? 0,
    madeUp: true,
    note: "Sample values — realistic but made up. The person must check every one before submitting; nothing was submitted.",
  });
}

function photoListOf(data: unknown): { key: "photos" | "scans"; items: unknown[] } | null {
  if (!isObj(data)) return null;
  if (Array.isArray(data.photos)) return { key: "photos", items: data.photos };
  if (Array.isArray(data.scans)) return { key: "scans", items: data.scans };
  return null;
}

async function photoOp(args: Obj, who: Who): Promise<Outcome> {
  const found = recordNamed(str(args.id));
  if ("refusal" in found) return found.refusal;
  const { record, doc } = found;
  const h = handlersFor(doc, record);
  if (!h || !photoListOf(record.data)) return refuse(409, "no-photo-list", `${doc.name} has no photo or scan list.`);
  const refused = levelRefusal(doc.id, record.correction ? "correct" : "fill", who, record.id);
  if (refused) return refused;
  if (!isEditableStatus(record.status)) return needsReopen(record, doc, h.page);
  const name = str(args.fileName) || "photo.jpg";
  const dataUrl = str(args.dataUrl);
  const size = Number(args.size) || 0;
  const said = str(args.note);
  const note = through(who.client, said || `photo ${name} added`);
  const attachment: MitraAttachment = { id: "app-photo", name, kind: "image", size, status: "ready", text: "", characters: 0, dataUrl };
  const target = targetFor(h, record, who.userName, () => note);
  // MITRA'S OWN add_photo_to_open_record: the picture goes on the record's photo or scan list as the page keeps it.
  const result = await tool("add_photo_to_open_record").run({ attachmentId: attachment.id }, toolContext(target, who, said || `add ${name}`, [attachment]));
  const answer = (result.result ?? {}) as Obj;
  if (!result.ok) return refuse(409, "not-added", typeof answer.why === "string" ? `The photo was not added: ${answer.why}.` : "The photo was not added.");
  const entries = markThrough(record.id, record, who.client);
  const now = recordRepository.getById(record.id) ?? record;
  return done({ ...changeSummary(now, doc, entries), added: name, list: answer.list ?? photoListOf(now.data)?.key, count: answer.count ?? photoListOf(now.data)?.items.length ?? 0 });
}

/** What approval (Verify) writes in a complaint checklist's Approved By — pages/CapaPage.tsx approvalSignoff, word for word (a page file cannot be bundled here). */
function approvalSignoff(was: ChecklistSignoff, approver: string, today: string): ChecklistSignoff {
  return { name: approver, designation: (was.designation ?? "").trim() || "QA Head", date: today };
}

const ACTION_NAMES: Record<string, string> = {
  submit: "submit",
  verify: "verify",
  approve: "verify",
  send_back: "send_back",
  sendback: "send_back",
  reject: "send_back",
  resume: "resume",
  reopen: "reopen",
  correct: "reopen",
  cancel_correction: "cancel_correction",
  delete: "delete",
};

/** What each action needs (engine/accessRules.ts): resume is the filler's own; reopen and cancel a correction are a correction. */
const ACTION_NEEDS: Record<string, DocumentAction> = {
  submit: "submit",
  verify: "verify",
  send_back: "send_back",
  resume: "fill",
  reopen: "correct",
  cancel_correction: "correct",
  delete: "delete",
};

const invalid = (errors: string[], what: string): Outcome =>
  refuse(409, "invalid", `${what} cannot be done yet: ${errors.join(" ")}`.slice(0, 1200), { problems: errors });

function actionOp(args: Obj, who: Who): Outcome {
  const said = str(args.action).toLowerCase().replace(/[\s-]+/g, "_");
  const action = ACTION_NAMES[said];
  if (!action) return refuse(400, "bad-action", 'action must be one of: submit, verify (approve), send_back, resume, reopen, cancel_correction, delete.');
  const found = recordNamed(str(args.id));
  if ("refusal" in found) return found.refusal;
  const { record: stored, doc } = found;
  const h = handlersFor(doc, stored);
  if (!h) return refuse(409, "reference-only", `${doc.name} is kept as issued; it has no record to act on.`);
  const levelRefused = levelRefusal(doc.id, ACTION_NEEDS[action] ?? "correct", who, stored.id);
  if (levelRefused) return levelRefused;
  const reason = str(args.reason);
  const user = who.userName;
  const title = titleOf(doc, stored);
  const wrongStatus = (why: string): Outcome => refuse(409, "wrong-status", `${title} is ${stored.status}: ${why}`, { status: stored.status, actions: actionsFor(stored, h.page) });
  const finish = (what: string): Outcome => {
    touched.add(stored.id);
    const entries = markThrough(stored.id, stored, who.client);
    const now = recordRepository.getById(stored.id) ?? stored;
    return done({ done: action, did: what, ...changeSummary(now, doc, entries) });
  };
  const today = todayISO();
  const check = (r: ValidationResult, what: string): Outcome | null => (r.valid ? null : invalid(r.errors, what));

  switch (action) {
    case "submit": {
      if (!isEditableStatus(stored.status)) return wrongStatus("only a record being filled in can be submitted.");
      // REVIEWED BEFORE SUBMITTED (REQUIREMENTS §62, §97): a record the assistant prepared is submitted only after the
      // person checked every value and ticked "Reviewed and correct"; the phone then sends reviewed: true.
      if (stored.prepared && args.reviewed !== true) {
        return refuse(409, "needs-review", `The assistant prepared ${title}. Check every value, tick "Reviewed and correct", then submit it.`);
      }
      let base = stored;
      if (h.page === "complaint") {
        // Submit stamps Prepared By with the person when nobody typed a name (pages/CapaPage.tsx doSubmit) — kept even when the submit is refused.
        const data = stored.data as ComplaintChecklistData;
        const preparedBy = { name: data.preparedBy.name.trim() || user, designation: data.preparedBy.designation, date: data.preparedBy.date ?? today };
        base = recordRepository.upsert({ ...stored, data: { ...data, preparedBy } } as RecordInstance);
        touched.add(stored.id);
      }
      const { result } = submitRecord(doc, base, user);
      const refused = check(result, "Submitting it");
      if (refused) return refused;
      if (args.reviewed === true) {
        // The history says the person reviewed it first: "Through Mitra mobile app: Submitted from the phone after review".
        const now = recordRepository.getById(stored.id);
        const had = new Set((stored.history ?? []).map((h) => h.id));
        if (now) {
          const history = (now.history ?? []).map((h) =>
            had.has(h.id) || h.action !== "submitted" ? h : { ...h, note: h.note ? `Submitted from the phone after review. ${h.note}` : "Submitted from the phone after review" }
          );
          recordRepository.upsert({ ...now, history });
        }
      }
      return finish("Submitted for verification");
    }
    case "verify": {
      if (!VERIFIABLE.includes(stored.status)) return wrongStatus("only a submitted record can be verified.");
      let base = stored;
      if (h.page === "complaint") {
        // Approval stamps Approved By with the approver and today (pages/CapaPage.tsx doApprove).
        const data = stored.data as ComplaintChecklistData;
        base = recordRepository.upsert({ ...stored, data: { ...data, approvedBy: approvalSignoff(data.approvedBy, user, today) } } as RecordInstance);
        touched.add(stored.id);
      }
      const { result } = verifyRecord(doc, base, user);
      return check(result, "Verifying it") ?? finish(h.page === "complaint" ? "Approved" : "Verified");
    }
    case "send_back": {
      if (!VERIFIABLE.includes(stored.status)) return wrongStatus("only a submitted record waiting for verification can be sent back.");
      if (!reason) return refuse(400, "needs-reason", "reason is needed: say what must be put right.");
      rejectRecord(stored, user, reason);
      return finish("Sent back");
    }
    case "resume": {
      if (stored.status !== "Rejected") return wrongStatus("only a record that was sent back can be resumed.");
      resumeAfterRejection(stored, user);
      return finish("Resumed");
    }
    case "reopen": {
      if (!actionsFor(stored, h.page).includes("reopen")) {
        return wrongStatus(isCorrectableStatus(stored.status) ? "it is kept as written on a revision the format has since replaced." : "only a submitted, verified or sent-back record is reopened for correction.");
      }
      if (!reason) return refuse(400, "needs-reason", "reason is needed: say why the record is being corrected.");
      reopenForCorrection(stored, user, reason);
      return finish("Reopened for correction");
    }
    case "cancel_correction": {
      if (!stored.correction) return wrongStatus("it is not open for correction, so there is nothing to put back.");
      if (h.page === "record" && !isEditableStatus(stored.status)) return wrongStatus("it is not open for writing.");
      cancelCorrection(stored, user, h.page === "record" ? h.labels : {});
      return finish("Put back as it was");
    }
    case "delete": {
      if (!reason) return refuse(400, "needs-reason", "reason is needed: say why the record is to be deleted. The deletion is recorded with it.");
      deleteRecordWithTrail(stored, user, reason);
      removed.add(stored.id);
      return done({ done: action, did: "Deleted", recordId: stored.id, deleted: true, status: stored.status });
    }
    default:
      return refuse(400, "bad-action", "Unknown action.");
  }
}

/** For the host's checks: which items the engine wrote since the load (only records and deletions are ever stored from here). */
export function itemsWritten(): string[] {
  return writtenSinceLoad();
}
