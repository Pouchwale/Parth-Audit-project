// MITRA'S TOOLS (REQUIREMENTS §80) — what the model may ask the browser to do.
//
// The model never touches a record itself: it asks for one of these by name,
// with JSON arguments, and the BROWSER runs it — on the working copy, the open
// record and the router, which the server cannot reach. Every tool reuses the
// engine the pages and the widget already use (engine/recordPatch.ts,
// engine/sampleFill.ts, engine/recordCrud.ts, engine/formatCommands.ts +
// engine/formatOps.ts, engine/recordSearch.ts, engine/historyDigest.ts,
// engine/assistantLocal.ts, engine/reminders.ts, store/router.tsx), so what
// Mitra does by tool is exactly what a person does by button — checked,
// recorded in the record's history, and undoable the same way.
//
// THREE RULES THAT KEEP IT HONEST:
//   * only the tools that apply right now are offered (mitraTools): a record
//     has to be open before it can be changed, a document on screen before its
//     format can, an attachment in hand before it can be read;
//   * anything that destroys or reopens asks the person first, through
//     ctx.confirm (two chips in the chat), never the model twice;
//   * every result is compact JSON capped at 1,500 characters — the wire's own
//     limit, and the plant's token allowance (SPEC "Hard constraints").
import type { DocumentDefinition, FieldChange, LogColumn, LogFieldType, LogHeaderField, LogSheetData, LogSheetLayout, RecordInstance } from "../types";
import type { MitraTool, MitraToolContext, MitraToolResult, MitraToolRun, ToolSchema } from "./mitraTypes";
import { documentRepository } from "../data/repositories/documentRepository";
import { recordRepository } from "../data/repositories/recordRepository";
import { masterRepository } from "../data/repositories/masterRepository";
import { hrMasterRepository } from "../data/repositories/hrMasterRepository";
import { getLogSheetLayoutForRecord } from "../data/seed/logSheetLayouts";
import { hrPageForSlug } from "../data/seed/hrModule";
import { nextRevisionNo } from "../data/formatEdits";
import { buildAssistantContext, matchDocuments } from "./assistantLocal";
import { documentOpenRoute } from "./documentRoutes";
import { createRecordForDocument } from "./recordCrud";
import { computeReminders, routeForRecord } from "./reminders";
import { applyAssistantPatch, normDate } from "./recordPatch";
import { diffRecordData } from "./recordHistory";
import { canSampleFill, sampleFillAllowedFor, sampleFillDeclined, sampleFillRecord, SAMPLE_FILL_NOTE } from "./sampleFill";
import { applyFormatCommand, type FormatCommand, type Place, type TargetRef } from "./formatCommands";
import { canDesignGrid, commitFormatChange, draftOf, type BoxArea, type HeaderField } from "./formatOps";
import { designSessionFor } from "./designSession";
import { ensureRecordIndex, readSearchQuery, searchRecords } from "./recordSearch";
import { snippetFor } from "./recordText";
import { analyticIntent, buildEvidence } from "./historyDigest";
import { describePerson, searchPeople } from "./hrMaster";
import { hrMasterVisible } from "./hrMasterAssistant";
import { isDocumentIdVisible } from "./departmentScope";
import { currentPmIndex, isLinkedLine, pmActuals, pmCellText, PM_MONTH_KEYS, scheduleYear, schedulesLinked } from "./pmSchedule";
import { ASSISTANT_NAME } from "./assistantPersona";
import { t } from "../i18n";
import { addDays, compareISO, formatDisplayDate } from "../utils/date";
import { generateId } from "../utils/id";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

/** The wire's limit on one tool message (SPEC "Protocol"); the server refuses more. */
export const MAX_TOOL_RESULT_CHARS = 1500;
const TRUNCATED = "…(truncated)";
/** How much of an evidence pack, or of an attachment, fits one result with its wrapper. */
const EVIDENCE_CHARS = 1300;
export const ATTACHMENT_SLICE_CHARS = 1300;
/** How long a search waits for the record index to finish before answering with what it has. */
// Long enough for a large register on a slow laptop: a search that answers before the index is built says nothing was found.
const INDEX_WAIT_MS = 5000;

// ---------------------------------------------------------------------------
// small helpers

/** A word from i18n/strings.ts once it is there, the English until then (an unknown key comes back as its last segment). */
function say(key: string, english: string, vars: Record<string, string | number> = {}): string {
  const said = t(key, vars);
  if (said !== key.split(".").pop()) return said;
  return english.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : "");
const bool = (v: unknown): boolean => v === true || v === "true" || v === 1 || v === "1" || v === "yes";
const int = (v: unknown, fallback: number): number => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.floor(n) : fallback;
};
const short = (s: string, max: number): string => (s.length > max ? `${s.slice(0, Math.max(0, max - 1))}…` : s);
/** An object argument, given as one or as JSON text. */
function asObject(v: unknown): Obj | null {
  if (isObj(v)) return v;
  if (typeof v === "string" && v.trim().startsWith("{")) {
    try {
      const parsed: unknown = JSON.parse(v);
      return isObj(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

const ok = (result: Obj, card: string, navigated?: string): MitraToolResult => ({ ok: true, result: { ok: true, ...result }, card, ...(navigated ? { navigated } : {}) });
const no = (why: string, extra: Obj = {}, card?: string): MitraToolResult => ({ ok: false, result: { ok: false, why, ...extra }, card: card ?? short(why, 90) });

const noteOf = (ctx: MitraToolContext): string => `Asked of ${ASSISTANT_NAME}: ${short(ctx.userWords.trim() || "(spoken)", 200)}`;

// THE ROUTER'S OWN CHECK OF A ROUTE (store/router.tsx isValidAppRoute — the one
// list of pages the app has). That module reads window.location the moment it
// loads, which is a browser's to give: asked for only when a route is checked,
// so the engine loads without one (the unit tests), and in the built app it is
// the very module App.tsx has already loaded — esbuild inlines the import.
let routerLoading: Promise<typeof import("../store/router")> | null = null;
async function validAppRoute(route: string): Promise<boolean> {
  routerLoading ??= import("../store/router");
  return (await routerLoading).isValidAppRoute(route);
}
const formatAndName = (doc: Pick<DocumentDefinition, "formatNo" | "name">): string => `${doc.formatNo.startsWith("TO BE") ? "" : `${doc.formatNo} `}${doc.name}`;

// ---------------------------------------------------------------------------
// where things are

/**
 * THE DOCUMENT ON A PAGE THAT REGISTERS NO RECORD (REQUIREMENTS §60): a format's
 * own page — /document/{id}, or /hr/{slug} for an HR format. A record page hands
 * over its live record instead (ctx.target), so it is not looked for here. The
 * same reading as components/common/DocumentAssistant.tsx documentOnPath.
 */
export function documentOnPath(path: string): string | null {
  const [root, slug] = path.split("/").filter(Boolean);
  if (root === "document" && slug) return slug;
  if (root === "hr" && slug) return hrPageForSlug(slug)?.docId ?? null;
  return null;
}

/** The document a format change would be about: the open record's, else the one whose page is on screen. */
export const documentOnScreen = (ctx: Pick<MitraToolContext, "target" | "currentRoute">): string | null => ctx.target?.documentId ?? documentOnPath(ctx.currentRoute);

const ROUTE_WORDS: Record<string, string> = {
  "/": "the Dashboard",
  "/dashboard": "the Dashboard",
  "/library": "the Document Library",
  "/calendar": "the Record Calendar",
  "/reports": "Reports",
  "/insights": "Insights",
  "/search": "Search",
  "/pest-control": "Pest Control",
  "/pest/daily": "the Daily Monitoring register",
  "/gap": "CAPA",
  "/gap/internal": "Internal CAPA",
  "/gap/external": "External CAPA",
  "/hr": "HR Records",
  "/hr/master-data": "HR Master Data",
  "/qc": "QC Records",
  "/performance": "the Performance Scorecard",
  "/activity": "the Activity Log",
  "/users": "Users & Access",
  "/assistant": "Ask Mitra",
  "/master-data": "Master Data",
  "/chemical-master": "the Chemical Master",
  "/licence": "the Service Provider Licence",
  "/files": "Document Files",
  "/training": "Training Records",
};

/** A route in words, for the step card: "Opened the Dashboard", "Opened the day view for 26-Sep-2026". */
export function routeWords(route: string): string {
  const clean = route.length > 1 ? route.replace(/\/+$/, "") : route;
  if (ROUTE_WORDS[clean]) return ROUTE_WORDS[clean];
  const [root, a] = clean.split("/").filter(Boolean);
  if (root === "day" && a) return `the day view for ${formatDisplayDate(a)}`;
  if (root === "record" && a) {
    const r = recordRepository.getById(a);
    const d = r ? documentRepository.getById(r.documentId) : undefined;
    return r && d ? `the ${d.name} of ${formatDisplayDate(r.dueDate)}` : "the record";
  }
  if (root === "document" && a) return documentRepository.getById(a)?.name ?? "the document page";
  if (root === "hr" && a) {
    const page = hrPageForSlug(a);
    return (page && documentRepository.getById(page.docId)?.name) ?? "the HR page";
  }
  if (root === "gap" && a) return a === "complaint" ? "the complaint checklist" : "the inspection findings report";
  if (root === "training" && a) return "the training record";
  if (root === "reports") return "Reports";
  if (root === "files") return "Document Files";
  if (root === "calendar") return "the Record Calendar";
  if (root === "pest") return "Pest Control";
  if (root === "library") return "the Document Library";
  return clean;
}

const STOP_WORDS = new Set(["the", "and", "for", "open", "show", "find", "document", "documents", "record", "records", "format", "form", "please", "pls", "with", "from", "this", "that"]);

/** Documents whose name, number, module or section holds the most of the words said — for a name matchDocuments does not know. */
function documentsByWords(lower: string): DocumentDefinition[] {
  const words = lower.split(/[^a-z0-9/]+/).filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
  if (words.length === 0) return [];
  const scored = documentRepository
    .getAll()
    .map((d) => {
      const hay = `${d.name} ${d.formatNo} ${d.module} ${d.section ?? ""}`.toLowerCase();
      return { d, n: words.filter((w) => hay.includes(w)).length };
    })
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n);
  const best = scored[0]?.n ?? 0;
  return scored.filter((x) => x.n === best).map((x) => x.d);
}

/** A document by its id, its format number, or the words the plant calls it by — one document, or none. */
export function findDocument(idOrWords: string): DocumentDefinition | undefined {
  const s = idOrWords.trim();
  if (!s) return undefined;
  const byId = documentRepository.getById(s);
  if (byId) return byId;
  const lower = s.toLowerCase();
  const ids = matchDocuments(lower);
  if (ids.length === 1) return documentRepository.getById(ids[0]);
  const named = documentRepository.getAll().filter((d) => d.name.toLowerCase() === lower || d.formatNo.toLowerCase() === lower);
  if (named.length === 1) return named[0];
  const byWords = documentsByWords(lower);
  return byWords.length === 1 ? byWords[0] : undefined;
}

const brief = (d: DocumentDefinition): Obj => ({
  id: d.id,
  name: d.name,
  formatNo: d.formatNo,
  module: d.module,
  kind: d.kind,
  schedule: d.frequency,
  ...(d.isReferenceOnly ? { reference: true } : {}),
});

// ---------------------------------------------------------------------------
// fitting a result into the wire's 1,500 characters

/** Lists cut to their first `keep` items (with a count of the rest), long strings to 300 characters. */
function shrink(value: unknown, keep: number): unknown {
  if (Array.isArray(value)) {
    const head = value.slice(0, keep).map((v) => shrink(v, keep));
    return value.length > keep ? [...head, `…+${value.length - keep} more`] : head;
  }
  if (isObj(value)) {
    const out: Obj = {};
    for (const [k, v] of Object.entries(value)) out[k] = shrink(v, keep);
    return out;
  }
  if (typeof value === "string" && value.length > 300) return `${value.slice(0, 297)}…`;
  return value;
}

/**
 * `value` shaped to fit `budget` characters of JSON: whole first, then with
 * its lists cut to their first items, and as a last resort the text itself cut.
 */
export function fitValue(value: unknown, budget: number): { value: unknown; truncated: boolean } {
  const whole = JSON.stringify(value) ?? "null";
  if (whole.length <= budget) return { value, truncated: false };
  for (const keep of [24, 12, 6, 3, 2, 1]) {
    const cut = shrink(value, keep);
    if ((JSON.stringify(cut) ?? "null").length <= budget) return { value: cut, truncated: true };
  }
  return { value: `${whole.slice(0, Math.max(0, budget - TRUNCATED.length))}${TRUNCATED}`, truncated: true };
}

/** A result's JSON for the model, capped at the wire's limit. */
export function capContent(result: unknown): string {
  const json = JSON.stringify(result) ?? "null";
  return json.length <= MAX_TOOL_RESULT_CHARS ? json : `${json.slice(0, MAX_TOOL_RESULT_CHARS - TRUNCATED.length)}${TRUNCATED}`;
}

/** The arguments a call carries: an object, `{}` for none, null when the JSON cannot be read. */
export function parseToolArgs(argsJson: string | undefined | null): Obj | null {
  const s = (argsJson ?? "").trim();
  if (!s) return {};
  try {
    const parsed: unknown = JSON.parse(s);
    return isObj(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Runs one tool call: parses the arguments, runs the tool, and caps the
 * stringified result at 1,500 characters. A tool that throws, or arguments that
 * are not JSON, come back as a failed result the model can read — never as an
 * exception out of the loop.
 */
export async function runTool(tool: MitraTool, argsJson: string, ctx: MitraToolContext): Promise<MitraToolRun> {
  const args = parseToolArgs(argsJson);
  if (args === null) {
    const result = { ok: false, error: "the arguments were not valid JSON; send a JSON object" };
    return { ok: false, result, content: capContent(result), card: say("ai.step.badArguments", "The arguments could not be read") };
  }
  try {
    const out = await tool.run(args, ctx);
    return { ok: out.ok, result: out.result, content: capContent(out.result), card: out.card, ...(out.navigated ? { navigated: out.navigated } : {}) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Mitra's tool ${tool.name} failed`, err);
    const result = { ok: false, error: short(message, 300) };
    return { ok: false, result, content: capContent(result), card: say("ai.step.threw", "{tool} failed: {why}", { tool: tool.name, why: short(message, 80) }) };
  }
}

// ---------------------------------------------------------------------------
// the open record, described

const isLayout = (v: unknown): v is LogSheetLayout => isObj(v) && Array.isArray(v.columns) && Array.isArray(v.headerFields);

const fieldWords = (f: LogHeaderField | LogColumn): string => {
  const col = f as LogColumn;
  const flags = [f.type, col.unit, col.fixed ? "printed" : "", col.computed ? "computed" : "", f.required ? "required" : ""].filter(Boolean).join(", ");
  return `${f.key}: ${short(f.label, 40)} (${flags})`;
};

/** A log sheet's layout in a few lines: what each key is, so a patch names the right box. */
function layoutSummary(layout: LogSheetLayout, data: Obj): Obj {
  return {
    boxes: [...layout.headerFields, ...(layout.footerFields ?? [])].map(fieldWords),
    columns: layout.columns.map(fieldWords),
    rowMode: layout.rowMode.kind,
    rows: Array.isArray(data.rows) ? data.rows.length : 0,
  };
}

/** The record's data without the `_layout` a log sheet's target adds for the model, or the `_linked` Actuals added below. */
function dataOf(raw: unknown): { data: Obj; layout: LogSheetLayout | undefined } {
  if (!isObj(raw)) return { data: { value: raw }, layout: undefined };
  const { _layout, _linked, ...data } = raw;
  void _linked;
  return { data, layout: isLayout(_layout) ? _layout : undefined };
}

/**
 * F/MNT/03's ACTUAL DATES AS F/MNT/02 GIVES THEM (REQUIREMENTS §82): a Rev 01
 * schedule stores none — each is read from the machine's F/MNT/02 when the
 * sheet is shown (engine/pmSchedule.ts). So the model is shown them beside the
 * data as `_linked`, line by line with the F/MNT/02 record and who did the PM,
 * exactly as the sheet shows them. Never stored: dataOf strips it, and a patch
 * that tries to write an Actual is refused (engine/recordPatch.ts).
 */
function linkedActuals(record: RecordInstance | undefined): Obj | undefined {
  if (!record || !schedulesLinked(record)) return undefined;
  const layout = getLogSheetLayoutForRecord(record.documentId, record);
  if (!layout?.columns.some((c) => c.linkedFrom)) return undefined;
  const rows = (record.data as LogSheetData | undefined)?.rows ?? [];
  const lines = pmActuals(rows, scheduleYear(record), currentPmIndex(record.isDemo));
  const actuals: string[] = [];
  const notLinked: string[] = [];
  lines.forEach((line, i) => {
    if (!isLinkedLine(line)) {
      const why = `${line.machine || `row ${i + 1}`}: ${line.unlinked.split(". ")[0].replace(/^Not linked: /, "")} — not linked`;
      if (!notLinked.includes(why)) notLinked.push(why);
      return;
    }
    const months = line.months.map((cell, m) => (cell.length ? `${PM_MONTH_KEYS[m]} ${pmCellText(cell)}` : "")).filter(Boolean);
    if (months.length === 0) return;
    const sources = [...new Set(line.months.flat().map((d) => `${d.recordId}${d.maintenance ? ` by ${d.maintenance}` : ""}`))];
    actuals.push(`row ${i + 1} ${line.machine} ${String(rows[i]?.frequency ?? "")}: ${months.join(", ")} (F/MNT/02 ${sources.join("; ")})`);
  });
  return {
    note: "Actual dates are read from each machine's F/MNT/02 and are not stored on this sheet; * = that F/MNT/02 is not yet Verified. To change one, change the date on the machine's F/MNT/02.",
    actuals,
    ...(notLinked.length ? { notLinked } : {}),
  };
}

const changeOf = (c: FieldChange): Obj => ({ field: short(c.label, 60), from: short(c.before, 40), to: short(c.after, 40) });

function photoListOf(data: unknown): { key: "photos" | "scans"; items: unknown[] } | null {
  if (!isObj(data)) return null;
  if (Array.isArray(data.photos)) return { key: "photos", items: data.photos };
  if (Array.isArray(data.scans)) return { key: "scans", items: data.scans };
  return null;
}

const safeData = (target: NonNullable<MitraToolContext["target"]>): unknown => {
  try {
    return target.getData();
  } catch {
    return undefined;
  }
};

// ---------------------------------------------------------------------------
// a format change, said as JSON, read as a FormatCommand (engine/formatCommands.ts)

const HEADER_FIELDS = new Set<string>(["companyName", "title", "formatNo", "revisionNo", "revisionDate"]);

function fieldTypeOf(s: string): LogFieldType | undefined {
  const w = s.toLowerCase().trim();
  if (!w) return undefined;
  if (/^(num|figure|int|decimal|float)/.test(w)) return "number";
  if (w === "date") return "date";
  if (w === "time") return "time";
  if (/^(yes|bool|tick|check)/.test(w)) return "yesno";
  if (/^(select|choice|option|drop|list)/.test(w)) return "select";
  if (/^(para|prose|long|multi)/.test(w)) return "paragraph";
  return "text";
}

function formatCommandOf(c: Obj): FormatCommand | { why: string } {
  const op = str(c.op).toLowerCase().replace(/[\s-]+/g, "_");
  const label = str(c.label);
  const ref = (said: string): TargetRef => ({ said });
  const after = str(c.after);
  const before = str(c.before);
  const place = (): Place | undefined => (after ? { rel: "after", ref: ref(after) } : before ? { rel: "before", ref: ref(before) } : undefined);
  switch (op) {
    case "add_column":
    case "add_box":
    case "add": {
      if (!label) return { why: "label needed: what the new column or box is called" };
      const noun = op === "add_box" || str(c.noun) === "box" ? "box" : "column";
      const options = Array.isArray(c.options) ? c.options.map((o) => str(o)).filter(Boolean) : [];
      const type = options.length ? "select" : fieldTypeOf(str(c.type));
      const area = str(c.area);
      return {
        kind: "add",
        noun,
        label,
        ...(type ? { type } : {}),
        ...(options.length ? { options } : {}),
        ...(noun === "box" && (area === "footer" || area === "header") ? { area: area as BoxArea } : {}),
        ...(place() ? { place: place() } : {}),
      };
    }
    case "remove":
    case "delete":
      if (!label) return { why: "label needed: the column, box or printed line to remove" };
      return { kind: "remove", target: ref(label) };
    case "rename": {
      const to = str(c.newLabel) || str(c.to);
      if (!label || !to) return { why: "label and newLabel needed" };
      return { kind: "rename", target: ref(label), to };
    }
    case "move": {
      if (!label) return { why: "label needed: what to move" };
      const p = place();
      const by = int(c.by, 0);
      const to = str(c.to).toLowerCase();
      return { kind: "move", target: ref(label), to: p ?? (by !== 0 ? { by } : to === "start" ? { rel: "start" } : { rel: "end" }) };
    }
    case "set_header": {
      const field = str(c.field);
      const value = str(c.value);
      if (!HEADER_FIELDS.has(field)) return { why: "field must be companyName, title, formatNo, revisionNo or revisionDate" };
      if (!value) return { why: "value needed" };
      return { kind: "setHeader", changes: [{ field: field as HeaderField, value }] };
    }
    default:
      return { why: `unknown op "${op}" — use add_column, add_box, remove, rename, move or set_header` };
  }
}

// ---------------------------------------------------------------------------
// the record index, brought up to date before a search

async function settleIndex(opts: { isDemo: boolean; includeDrafts?: boolean }): Promise<boolean> {
  const started = Date.now();
  let status = ensureRecordIndex(opts);
  while (!status.ready && Date.now() - started < INDEX_WAIT_MS) {
    await new Promise((r) => setTimeout(r, 25));
    status = ensureRecordIndex(opts);
  }
  return status.ready;
}

// ---------------------------------------------------------------------------
// the tools

const objectSchema = (properties: Record<string, unknown>, required: string[] = []): Record<string, unknown> => ({
  type: "object",
  properties,
  ...(required.length ? { required } : {}),
});
const S = { type: "string" } as const;
const I = { type: "integer" } as const;

const NAVIGATE: MitraTool = {
  name: "navigate",
  description: "Open a page of this app by route: /dashboard, /day/YYYY-MM-DD, /reports, /calendar, /gap, /insights, /library, /search, /hr, /files.",
  parameters: objectSchema({ route: S }, ["route"]),
  writes: true,
  run: async (args, ctx) => {
    const raw = str(args.route).replace(/^#/, "");
    if (!raw) return no("route needed");
    const route = raw.startsWith("/") ? raw : `/${raw}`;
    const clean = route.length > 1 ? route.replace(/\/+$/, "") : route;
    if (!(await validAppRoute(clean))) return no(`${clean} is not a page of this app`, { route: clean });
    ctx.navigate(clean);
    return ok({ route: clean }, say("ai.step.opened", "Opened {what}", { what: routeWords(clean) }), clean);
  },
};

const FIND_DOCUMENTS: MitraTool = {
  name: "find_documents",
  description: "Find documents by name, format number (F/HR/17), alias or module: id, name, formatNo, module, kind, schedule (up to 12).",
  parameters: objectSchema({ query: S }, ["query"]),
  run: (args) => {
    const query = str(args.query);
    if (!query) return no("query needed");
    const lower = query.toLowerCase();
    let docs = matchDocuments(lower)
      .map((id) => documentRepository.getById(id))
      .filter((d): d is DocumentDefinition => !!d);
    if (docs.length === 0) docs = documentsByWords(lower);
    if (docs.length === 0) return no("no document matches — try other words, or the format number", { documents: [] });
    const list = docs.slice(0, 12).map(brief);
    const card =
      docs.length === 1
        ? say("ai.step.foundDocument", "Found {what}", { what: formatAndName(docs[0]) })
        : say("ai.step.foundDocuments", "Found {n} documents", { n: docs.length });
    return ok({ documents: list, count: docs.length }, card);
  },
};

const OPEN_DOCUMENT: MitraTool = {
  name: "open_document",
  description: "Open a document: its record for dateISO (default today; create=true starts one) or its own page. Navigates. Returns route.",
  parameters: objectSchema({ documentId: S, dateISO: S, create: { type: "boolean" } }, ["documentId"]),
  writes: true,
  run: (args, ctx) => {
    const doc = findDocument(str(args.documentId));
    if (!doc) return no("unknown document — use find_documents first");
    if (doc.isReferenceOnly || ["chemical-master", "licence", "compliance-statement"].includes(doc.kind)) {
      const route = documentOpenRoute(doc);
      ctx.navigate(route);
      return ok({ route, reference: true }, say("ai.step.opened", "Opened {what}", { what: doc.name }), route);
    }
    const dateISO = str(args.dateISO);
    const date = dateISO ? normDate(dateISO, ctx.today) : ctx.today;
    if (!date) return no(`"${dateISO}" is not a date — give YYYY-MM-DD`);
    if (bool(args.create)) {
      const { record, existed } = createRecordForDocument(doc, { dateISO: date, isDemo: ctx.isDemo });
      ctx.bump();
      const route = routeForRecord(doc, record.id);
      ctx.navigate(route);
      const card = existed
        ? say("ai.step.openedRecord", "Opened the {doc} of {date}", { doc: doc.name, date: formatDisplayDate(record.dueDate) })
        : say("ai.step.startedRecord", "Started a {doc} for {date}", { doc: doc.name, date: formatDisplayDate(date) });
      return ok({ recordId: record.id, route, existed, status: record.status, dueDate: record.dueDate }, card, route);
    }
    const records = recordRepository
      .query({ documentId: doc.id, isDemo: ctx.isDemo, dueDate: date })
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    const record = records[0];
    if (record) {
      const route = routeForRecord(doc, record.id);
      ctx.navigate(route);
      return ok(
        { recordId: record.id, route, existed: true, status: record.status, dueDate: record.dueDate },
        say("ai.step.openedRecord", "Opened the {doc} of {date}", { doc: doc.name, date: formatDisplayDate(record.dueDate) }),
        route
      );
    }
    const route = documentOpenRoute(doc);
    ctx.navigate(route);
    return ok({ route, note: `no ${doc.name} record for ${formatDisplayDate(date)}; call again with create:true to start one` }, say("ai.step.opened", "Opened {what}", { what: doc.name }), route);
  },
};

const GET_OPEN_RECORD: MitraTool = {
  name: "get_open_record",
  description: "Read the record open on screen: status, editable, layout (field keys, labels, types) and data.",
  parameters: objectSchema({}),
  run: (_args, ctx) => {
    const tgt = ctx.target;
    if (!tgt) return no("no record is open — open one first");
    const doc = documentRepository.getById(tgt.documentId);
    const { data, layout: carried } = dataOf(tgt.currentData ?? tgt.getData());
    const stored = recordRepository.getById(tgt.recordId);
    const layout = tgt.documentKind === "log-sheet" ? carried ?? getLogSheetLayoutForRecord(tgt.documentId, stored) : undefined;
    // What is on screen, with the Actuals a schedule reads from F/MNT/02 beside it (never stored).
    const linked = stored ? linkedActuals({ ...stored, data }) : undefined;
    const head: Obj = {
      recordId: tgt.recordId,
      documentId: tgt.documentId,
      kind: tgt.documentKind,
      title: tgt.title ?? doc?.name ?? tgt.documentId,
      status: tgt.status,
      editable: tgt.editable,
      ...(!tgt.editable && tgt.reopen ? { canReopen: true } : {}),
      ...(layout ? { layout: layoutSummary(layout, data) } : {}),
    };
    const budget = MAX_TOOL_RESULT_CHARS - (JSON.stringify({ ok: true, ...head }) ?? "").length - 40;
    const fitted = fitValue(linked ? { _linked: linked, ...data } : data, Math.max(200, budget));
    return ok({ ...head, data: fitted.value, ...(fitted.truncated ? { truncated: true } : {}) }, say("ai.step.readRecord", "Read {what}", { what: String(head.title) }));
  },
};

const EDIT_OPEN_RECORD: MitraTool = {
  name: "edit_open_record",
  description: "Change the open record. patch: {field:value}; log sheet: header{key:value}, itemEdits[{collection,match,set}]; F/HR/17 checkpoints{n:value}.",
  parameters: objectSchema({ patch: { type: "object" } }, ["patch"]),
  writes: true,
  run: async (args, ctx) => {
    const tgt = ctx.target;
    if (!tgt) return no("no record is open — open one first");
    const patch = asObject(args.patch);
    if (!patch || Object.keys(patch).length === 0) return no("patch needed: an object of the fields to change");
    const before = tgt.getData();
    const record = recordRepository.getById(tgt.recordId);
    const { data: next, problems } = applyAssistantPatch(tgt.documentKind, tgt.documentId, before, patch, record);
    const changes = diffRecordData(before, next, tgt.labels);
    if (changes.length === 0) return no("nothing on the form changed", { rejected: problems.slice(0, 6) });
    const note = noteOf(ctx);
    const title = tgt.title ?? documentRepository.getById(tgt.documentId)?.name ?? "this record";
    if (!tgt.editable) {
      if (!tgt.reopen) return no(`${title} is ${tgt.status} and cannot be changed from here`);
      const yes = await ctx.confirm(
        say("ai.confirm.reopen", "{title} is {status}. Reopen it for correction and make {n} change(s)? It will need submitting and verifying again.", { title, status: tgt.status, n: changes.length }),
        say("ai.confirm.yesCorrect", "Yes, correct it"),
        say("ai.confirm.noLeave", "No, leave it")
      );
      if (!yes) return no("the person chose not to reopen the record", {}, say("ai.step.leftAsWas", "Left as it was"));
      tgt.reopen(note);
    }
    tgt.commit(next, note);
    return ok(
      {
        changes: changes.slice(0, 20).map(changeOf),
        ...(changes.length > 20 ? { more: changes.length - 20 } : {}),
        ...(problems.length ? { rejected: problems.slice(0, 8) } : {}),
      },
      say("ai.step.filled", "Filled {n} boxes on {title}", { n: changes.length, title })
    );
  },
};

const FILL_WITH_SAMPLE: MitraTool = {
  name: "fill_open_record_with_sample_data",
  description: "Fill the open record with realistic sample data, marked made up; never submits. Demo Mode only: a live record is the person's to fill.",
  parameters: objectSchema({}),
  writes: true,
  run: async (_args, ctx) => {
    const tgt = ctx.target;
    if (!tgt) return no("no record is open — open one first");
    const doc = documentRepository.getById(tgt.documentId);
    const record = recordRepository.getById(tgt.recordId);
    if (!doc || !record) return no("the open record could not be read");
    if (!canSampleFill(doc.kind)) return no(`${doc.name} is kept as issued — there is no sample data for it`);
    // A live record holds only what people saw (REQUIREMENTS §98): sample data is Demo Mode's.
    if (!sampleFillAllowedFor(record)) return no(sampleFillDeclined(ctx.userWords).replace(/[.।]$/, ""), { live: true }, say("ai.step.sampleDeclined", "Sample data is for Demo Mode"));
    const result = sampleFillRecord(doc, record, masterRepository.get(), ctx.userName);
    if (!result) return no("no sample data could be put together for this one");
    const before = tgt.getData();
    const changes = diffRecordData(before, result.data, tgt.labels);
    if (changes.length === 0) return no("the record was already filled in — nothing changed", { summary: result.summary.slice(0, 4) });
    const title = tgt.title ?? doc.name;
    if (!tgt.editable) {
      if (!tgt.reopen) return no(`${title} is ${tgt.status} and cannot be changed from here`);
      const yes = await ctx.confirm(
        say("ai.confirm.reopenSample", "{title} is {status}. Reopen it for correction and fill it with sample data? It will need submitting and verifying again.", { title, status: tgt.status }),
        say("ai.confirm.yesFill", "Yes, fill it"),
        say("ai.confirm.noLeave", "No, leave it")
      );
      if (!yes) return no("the person chose not to reopen the record", {}, say("ai.step.leftAsWas", "Left as it was"));
      tgt.reopen(SAMPLE_FILL_NOTE);
    }
    tgt.commit(result.data, SAMPLE_FILL_NOTE);
    return ok(
      { summary: result.summary.slice(0, 6), changed: changes.length, note: "sample values — realistic but made up; the person must check every one before submitting" },
      say("ai.step.sampleFilled", "Filled {title} with sample data", { title })
    );
  },
};

const START_GUIDED_FILL: MitraTool = {
  name: "start_guided_fill",
  description: "Fill a record question by question in the chat: the open one, or documentId (+dateISO) to start one first.",
  parameters: objectSchema({ documentId: S, dateISO: S }),
  writes: true,
  run: (args, ctx) => {
    if (!ctx.runWidgetAction) return no("the question-by-question fill is not available on this page");
    const said = str(args.documentId);
    const doc = said ? findDocument(said) : undefined;
    if (said && !doc) return no("unknown document — use find_documents first");
    const dateISO = str(args.dateISO) ? normDate(str(args.dateISO), ctx.today) : null;
    if (str(args.dateISO) && !dateISO) return no(`"${str(args.dateISO)}" is not a date — give YYYY-MM-DD`);
    ctx.runWidgetAction({ type: "startInterview", ...(doc ? { documentId: doc.id } : {}), ...(dateISO ? { dateISO } : {}) });
    return ok({ started: true, ...(doc ? { documentId: doc.id } : {}) }, say("ai.step.guidedStarted", "Started the question-by-question fill"));
  },
};

const RECORD_ACTIONS = ["submit", "verify", "cancel_correction", "print", "delete", "approve", "send_back"] as const;

const RECORD_ACTION: MitraTool = {
  name: "record_action",
  description: "Act on the open record: submit, verify, cancel_correction, print, delete (reason needed), approve, send_back (reason).",
  parameters: objectSchema({ action: { type: "string", enum: [...RECORD_ACTIONS] }, reason: S }, ["action"]),
  writes: true,
  run: async (args, ctx) => {
    const tgt = ctx.target;
    if (!tgt) return no("no record is open — open one first");
    const action = str(args.action).toLowerCase().replace(/[\s-]+/g, "_");
    const reason = str(args.reason);
    const title = tgt.title ?? documentRepository.getById(tgt.documentId)?.name ?? "the record";
    const outcome = (r: { ok: boolean; errors: string[] }, did: string, couldNot: string): MitraToolResult =>
      r.ok ? ok({ done: action }, `${did} ${title}`) : no(r.errors.join(" ") || `could not ${couldNot} ${title}`, { errors: r.errors.slice(0, 5) });
    switch (action) {
      case "submit":
        if (!tgt.submit) return no(`${title} cannot be submitted from here (it is ${tgt.status})`);
        return outcome(tgt.submit(), say("ai.step.submitted", "Submitted"), "submit");
      case "verify":
        if (!tgt.verify) return no(`${title} is not waiting for verification`);
        return outcome(tgt.verify(), say("ai.step.verified", "Verified"), "verify");
      case "cancel_correction":
        if (!tgt.cancelCorrection) return no(`${title} is not open for correction, so there is nothing to put back`);
        tgt.cancelCorrection();
        return ok({ done: action }, say("ai.step.putBack", "Put {title} back as it was", { title }));
      case "print":
        if (!tgt.print) return no("nothing here can be printed from the chat");
        tgt.print();
        return ok({ done: action }, say("ai.step.printing", "Printing {title}", { title }));
      case "delete": {
        if (!tgt.remove) return no(`${title} cannot be deleted from here`);
        if (!reason) return no("reason needed — ask the person why the record is to be deleted, then call again with reason");
        const yes = await ctx.confirm(
          say("ai.confirm.delete", "Delete {title}? It is {status}. The deletion is recorded with the reason and cannot be undone.", { title, status: tgt.status }),
          say("ai.confirm.yesDelete", "Delete it"),
          say("ai.confirm.keep", "Keep it")
        );
        if (!yes) return no("the person chose to keep the record", {}, say("ai.step.kept", "Kept {title}", { title }));
        tgt.remove(reason);
        return ok({ done: action, deleted: true }, say("ai.step.deleted", "Deleted {title}", { title }));
      }
      case "approve":
        if (!tgt.checklist) return no("only a complaint checklist has an approval step");
        if (!tgt.checklist.canApprove) return no(`${title} is not yours to approve, or is not waiting for approval`);
        return outcome(tgt.checklist.approve(), say("ai.step.approved", "Approved"), "approve");
      case "send_back":
        if (!tgt.checklist) return no("only a complaint checklist can be sent back");
        if (!reason) return no("reason needed — what should they fix?");
        tgt.checklist.sendBack(reason);
        return ok({ done: action }, say("ai.step.sentBack", "Sent {title} back", { title }));
      default:
        return no(`unknown action "${action}" — use ${RECORD_ACTIONS.join(", ")}`);
    }
  },
};

const CHANGE_FORMAT: MitraTool = {
  name: "change_format",
  description: "Change the format on screen: op add_column|add_box|remove|rename|move|set_header (companyName|title|formatNo|revisionNo|revisionDate).",
  parameters: objectSchema({
    change: objectSchema({ op: S, label: S, newLabel: S, after: S, before: S, type: S, field: S, value: S }, ["op"]),
  }, ["change"]),
  writes: true,
  run: async (args, ctx) => {
    const change = asObject(args.change);
    if (!change) return no("change needed: {op, label, …}");
    const documentId = documentOnScreen(ctx);
    const doc = documentId ? documentRepository.getById(documentId) : undefined;
    if (!doc) return no("open the document first — its own page, or one of its records — then ask again");
    const cmd = formatCommandOf(change);
    if ("why" in cmd) return no(cmd.why);
    if (!canDesignGrid(doc) && cmd.kind !== "setHeader" && cmd.kind !== "renameFormat") {
      return no(`${formatAndName(doc)} is drawn by the program itself, not from a layout, so only its header (set_header) can be changed here`);
    }
    const session = designSessionFor(doc.id);
    const res = applyFormatCommand(session ? session.getDraft() : draftOf(doc), cmd, ctx.language);
    if (!res.ok) return no(res.ask, { ...(res.choices?.length ? { choices: res.choices.slice(0, 6) } : {}), ...(res.refused ? { refused: true } : {}) });
    if (session) {
      // A designer is open on this document: the change goes onto ITS draft, in front of the person, saved with everything else there.
      session.apply(res.draft, `${ASSISTANT_NAME} ${res.what}`);
      return ok({ described: res.what, unsaved: true, note: "put on the open designer's draft; the person saves it there" }, say("ai.step.formatDrafted", "Changed the sheet on screen: {what}", { what: res.what }));
    }
    const rev = res.draft.revisionNo && res.draft.revisionNo !== doc.revisionNo ? res.draft.revisionNo : nextRevisionNo(doc.revisionNo);
    const yes = await ctx.confirm(
      say("ai.confirm.formatChange", "I will {plan} on {doc}. Save it as Rev {rev}, in your name, with your words as the reason? Records on file are not touched.", {
        plan: res.plan,
        doc: formatAndName(doc),
        rev,
      }),
      say("ai.confirm.yesSaveRev", "Yes, save as Rev {rev}", { rev }),
      say("ai.confirm.noLeave", "No, leave it")
    );
    if (!yes) return no("the person chose not to save the format change", {}, say("ai.step.leftAsWas", "Left as it was"));
    const saved = commitFormatChange(doc, res.draft, { actor: ctx.userName, reason: noteOf(ctx) });
    if (!saved.ok) return no(saved.error);
    ctx.bump();
    return ok(
      { described: saved.revision.summary, revision: saved.revision.revisionNo },
      say("ai.step.formatSaved", "Saved {doc} as Rev {rev}", { doc: formatAndName({ formatNo: res.draft.formatNo ?? doc.formatNo, name: res.draft.name }), rev: saved.revision.revisionNo })
    );
  },
};

const SEARCH_RECORDS: MitraTool = {
  name: "search_records",
  description: "Search words written on records (names, codes, remarks), newest first; optional documentId, from, to. Returns snippets and routes.",
  parameters: objectSchema({ query: S, documentId: S, from: S, to: S, limit: I }, ["query"]),
  run: async (args, ctx) => {
    const query = str(args.query);
    if (!query) return no("query needed");
    const isDemo = ctx.isDemo;
    const limit = Math.min(10, Math.max(1, int(args.limit, 10)));
    const from = str(args.from) ? normDate(str(args.from), ctx.today) : null;
    const to = str(args.to) ? normDate(str(args.to), ctx.today) : null;
    const said = str(args.documentId);
    const onlyDoc = said ? findDocument(said) : undefined;
    if (said && !onlyDoc) return no("unknown documentId — use find_documents first");
    const reading = readSearchQuery(query);
    const docIds = onlyDoc ? [onlyDoc.id] : reading.documentIds ?? undefined;
    const inRange = (r: { dueDate: string }): boolean => (!from || compareISO(r.dueDate, from) >= 0) && (!to || compareISO(r.dueDate, to) <= 0);
    const nameOf = (documentId: string): string => documentRepository.getById(documentId)?.name ?? documentId;
    if (reading.kind === "register" || !reading.words.trim()) {
      // Only a format number was given: that document's latest records, blank sheets included.
      const ids = docIds ?? [];
      if (ids.length === 0) return no("name a document, or give words to look for");
      const records = ids
        .flatMap((id) => recordRepository.query({ documentId: id, isDemo }))
        .filter(inRange)
        .sort((a, b) => compareISO(b.dueDate, a.dueDate));
      const hits = records.slice(0, limit).map((r) => ({ recordId: r.id, documentId: r.documentId, name: nameOf(r.documentId), dueDate: r.dueDate, status: r.status, route: routeForRecord(documentRepository.getById(r.documentId), r.id) }));
      return ok({ hits, total: records.length }, say("ai.step.listed", "Listed {n} records", { n: records.length }));
    }
    // Never "nothing found" from an index still being built: that is a false answer Mitra would pass on as fact.
    if (!(await settleIndex({ isDemo }))) {
      return { ok: false, result: { error: "The search index is still being built — try the search again in a moment." }, card: say("ai.step.searching", "Searching the records…") };
    }
    const res = searchRecords(reading.words, { isDemo, limit: 60, documentIds: docIds });
    const hits = res.hits
      .filter(inRange)
      .slice(0, limit)
      .map((h) => ({
        recordId: h.id,
        documentId: h.documentId,
        name: nameOf(h.documentId),
        dueDate: h.dueDate,
        status: h.status,
        snippet: short(snippetFor(h.cells, res.terms), 110),
        route: routeForRecord(documentRepository.getById(h.documentId), h.id),
      }));
    const total = from || to ? hits.length : res.total;
    return ok(
      {
        hits,
        total,
        ...(res.ready ? {} : { note: "the index is still being built — ask again for a complete answer" }),
        ...(total === 0 ? { note: "only what people wrote on records is searched; blank or prepared sheets are listed with list_records" } : {}),
      },
      say("ai.step.searched", "Found {n} records for “{what}”", { n: total, what: short(query, 40) })
    );
  },
};

const LIST_RECORDS: MitraTool = {
  name: "list_records",
  description: "List one document's records between from and to (default the last 31 days), optional status. documentId from find_documents.",
  parameters: objectSchema({ documentId: S, from: S, to: S, status: S }, ["documentId"]),
  run: (args, ctx) => {
    const doc = findDocument(str(args.documentId));
    if (!doc) return no("unknown document — use find_documents first");
    const to = str(args.to) ? normDate(str(args.to), ctx.today) : ctx.today;
    if (!to) return no(`"${str(args.to)}" is not a date — give YYYY-MM-DD`);
    const from = str(args.from) ? normDate(str(args.from), ctx.today) : addDays(to, -31);
    if (!from) return no(`"${str(args.from)}" is not a date — give YYYY-MM-DD`);
    const [lo, hi] = compareISO(from, to) <= 0 ? [from, to] : [to, from];
    const status = str(args.status).toLowerCase().replace(/[\s_-]+/g, " ");
    const records = recordRepository
      .query({ documentId: doc.id, isDemo: ctx.isDemo, fromDate: lo, toDate: hi })
      .filter((r) => !status || r.status.toLowerCase() === status)
      .sort((a, b) => compareISO(b.dueDate, a.dueDate));
    const list = records.slice(0, 40).map((r) => ({ recordId: r.id, dueDate: r.dueDate, status: r.status, ...(r.submittedBy ? { submittedBy: r.submittedBy } : {}) }));
    const head = { document: doc.name, documentId: doc.id, from: lo, to: hi, count: records.length };
    const fitted = fitValue(list, MAX_TOOL_RESULT_CHARS - (JSON.stringify({ ok: true, ...head }) ?? "").length - 40);
    return ok(
      { ...head, records: fitted.value, ...(fitted.truncated ? { truncated: true } : {}) },
      say("ai.step.listedOf", "Listed {n} {doc} records ({from} to {to})", { n: records.length, doc: doc.name, from: formatDisplayDate(lo), to: formatDisplayDate(hi) })
    );
  },
};

const GET_RECORD: MitraTool = {
  name: "get_record",
  description: "Read one record by recordId: document, date, status, route and data.",
  parameters: objectSchema({ recordId: S }, ["recordId"]),
  run: (args) => {
    const id = str(args.recordId);
    if (!id) return no("recordId needed");
    const record = recordRepository.getById(id);
    if (!record || !isDocumentIdVisible(record.documentId)) return no("no such record, or not one you may see");
    const doc = documentRepository.getById(record.documentId);
    const head = { recordId: record.id, documentId: record.documentId, name: doc?.name ?? record.documentId, dueDate: record.dueDate, status: record.status, route: routeForRecord(doc, record.id) };
    const { data } = dataOf(record.data);
    const linked = linkedActuals(record);
    const fitted = fitValue(linked ? { _linked: linked, ...data } : data, MAX_TOOL_RESULT_CHARS - (JSON.stringify({ ok: true, ...head }) ?? "").length - 40);
    return ok({ ...head, data: fitted.value, ...(fitted.truncated ? { truncated: true } : {}) }, say("ai.step.readRecordOf", "Read the {doc} of {date}", { doc: head.name, date: formatDisplayDate(record.dueDate) }));
  },
};

const HISTORY_FIGURES: MitraTool = {
  name: "history_figures",
  description: "Figures from the records for a question about history (trend, most/least, counts, on time). Returns evidence lines.",
  parameters: objectSchema({ question: S }, ["question"]),
  run: (args, ctx) => {
    const question = str(args.question);
    if (!question) return no("question needed");
    const intent = analyticIntent(question, ctx.today);
    if (!intent) return no("not a question about history — say what is asked and for which period, e.g. “which machine broke down most this year”");
    const pack = buildEvidence(intent, ctx.isDemo, EVIDENCE_CHARS);
    return ok({ period: intent.label, evidence: pack.text, recordIds: pack.recordIds.slice(0, 5) }, say("ai.step.figures", "Worked out the figures for {period}", { period: intent.label }));
  },
};

const TODAYS_FACTS: MitraTool = {
  name: "todays_facts",
  description: "Today: working day or holiday, next holidays, what is due, overdue and pending, with routes.",
  parameters: objectSchema({}),
  run: (_args, ctx) => {
    const facts = short(buildAssistantContext(ctx.isDemo, ctx.userName), 800);
    const pending = computeReminders(ctx.isDemo)
      .slice(0, 6)
      .map((r) => ({ document: r.documentName, dueDate: r.dueDate, urgency: r.urgency, route: r.route }));
    return ok({ facts, pending }, say("ai.step.facts", "Read today's facts"));
  },
};

const READ_ATTACHMENT: MitraTool = {
  name: "read_attachment",
  description: "Read part of an attached file's text by id; from/to are character offsets (up to 1300 chars a call).",
  parameters: objectSchema({ id: S, from: I, to: I }, ["id"]),
  run: (args, ctx) => {
    const id = str(args.id);
    const list = ctx.attachments;
    const a = list.find((x) => x.id === id) ?? list.find((x) => x.name.toLowerCase() === id.toLowerCase()) ?? (/^\d+$/.test(id) ? list[Number(id) - 1] : undefined);
    if (!a) return no("no such attachment", { attachments: list.map((x) => ({ id: x.id, name: x.name, status: x.status, characters: x.characters })) });
    if (a.status === "reading") return no(`${a.name} is still being read — try again in a moment`);
    if (a.status === "failed") return no(`${a.name} could not be read${a.note ? `: ${a.note}` : ""}`);
    const total = a.text.length;
    if (total === 0) return no(`${a.name} has no readable text${a.note ? `: ${a.note}` : ""}`);
    const from = Math.max(0, Math.min(int(args.from, 0), total));
    const to = Math.min(total, Math.max(from, int(args.to, from + ATTACHMENT_SLICE_CHARS)), from + ATTACHMENT_SLICE_CHARS);
    return ok(
      { id: a.id, name: a.name, characters: total, from, to, text: a.text.slice(from, to), ...(to < total ? { more: true } : {}) },
      say("ai.step.readAttachment", "Read {name} ({from}–{to} of {total})", { name: a.name, from, to, total })
    );
  },
};

const ADD_PHOTO: MitraTool = {
  name: "add_photo_to_open_record",
  description: "Add an attached image (attachmentId) to the open record's photo or scan list.",
  parameters: objectSchema({ attachmentId: S }, ["attachmentId"]),
  writes: true,
  run: async (args, ctx) => {
    const tgt = ctx.target;
    if (!tgt) return no("no record is open — open one first");
    const id = str(args.attachmentId);
    const a = ctx.attachments.find((x) => x.id === id) ?? ctx.attachments.find((x) => x.name.toLowerCase() === id.toLowerCase());
    if (!a) return no("no such attachment", { attachments: ctx.attachments.filter((x) => x.kind === "image").map((x) => ({ id: x.id, name: x.name })) });
    if (a.kind !== "image" || !a.dataUrl) return no(`${a.name} is not an image that can be added (images up to 2 MB)`);
    const before = tgt.getData();
    const list = photoListOf(before);
    if (!list) return no("this record has no photo or scan list");
    const title = tgt.title ?? "the record";
    const note = noteOf(ctx);
    if (!tgt.editable) {
      if (!tgt.reopen) return no(`${title} is ${tgt.status} and cannot be changed from here`);
      const yes = await ctx.confirm(
        say("ai.confirm.reopen", "{title} is {status}. Reopen it for correction and make {n} change(s)? It will need submitting and verifying again.", { title, status: tgt.status, n: 1 }),
        say("ai.confirm.yesCorrect", "Yes, correct it"),
        say("ai.confirm.noLeave", "No, leave it")
      );
      if (!yes) return no("the person chose not to reopen the record", {}, say("ai.step.leftAsWas", "Left as it was"));
      tgt.reopen(note);
    }
    const addedAt = new Date().toISOString();
    const entry = list.key === "scans" ? { id: generateId("scan"), name: a.name, kind: "image", dataUrl: a.dataUrl, addedAt } : { id: generateId("photo"), name: a.name, dataUrl: a.dataUrl, addedAt };
    tgt.commit({ ...(before as Obj), [list.key]: [...list.items, entry] }, note);
    return ok({ added: a.name, list: list.key, count: list.items.length + 1 }, say("ai.step.photoAdded", "Added {name} to {title}", { name: a.name, title }));
  },
};

const ASK_USER: MitraTool = {
  name: "ask_user",
  description: "Ask the person one short question with 2-4 options when the instruction is unclear. Ends your turn.",
  parameters: objectSchema({ question: S, options: { type: "array", items: S } }, ["question", "options"]),
  endsTurn: true,
  run: (args) => {
    const question = str(args.question);
    if (!question) return no("question needed");
    const options = (Array.isArray(args.options) ? args.options : [])
      .map((o) => str(o))
      .filter(Boolean)
      .slice(0, 4);
    return ok({ asked: true, question, options }, short(question, 90));
  },
};

const HR_MASTER_LOOKUP: MitraTool = {
  name: "hr_master_lookup",
  description: "Look up a person on HR Master Data by name or GP3 No.: up to 5 people with department and designation.",
  parameters: objectSchema({ query: S }, ["query"]),
  run: (args) => {
    const query = str(args.query);
    if (!query) return no("query needed");
    const { exact, candidates } = searchPeople(query, hrMasterRepository.all(), 5);
    const people = candidates.map((p) => ({ gp3: p.gp3No, name: p.fullName, department: p.department, designation: p.designation }));
    if (people.length === 0) return no(`nobody called “${query}” is on HR Master Data`, { people: [] });
    return ok({ people, ...(exact ? { exact: describePerson(exact) } : {}) }, say("ai.step.peopleFound", "Found {n} on HR Master Data", { n: people.length }));
  },
};

/** Every tool there is, for tests and for describing what Mitra can do. */
export const ALL_TOOLS: readonly MitraTool[] = [
  NAVIGATE,
  FIND_DOCUMENTS,
  OPEN_DOCUMENT,
  GET_OPEN_RECORD,
  EDIT_OPEN_RECORD,
  FILL_WITH_SAMPLE,
  START_GUIDED_FILL,
  RECORD_ACTION,
  CHANGE_FORMAT,
  SEARCH_RECORDS,
  LIST_RECORDS,
  GET_RECORD,
  HISTORY_FIGURES,
  TODAYS_FACTS,
  READ_ATTACHMENT,
  ADD_PHOTO,
  ASK_USER,
  HR_MASTER_LOOKUP,
];

/**
 * The tools that make sense right now: a record's own tools only while one is
 * open, the format's while a document is on screen, the attachments' while
 * there are any, HR Master Data's for the departments that may see it.
 */
export function mitraTools(ctx: MitraToolContext): MitraTool[] {
  const tools: MitraTool[] = [NAVIGATE, FIND_DOCUMENTS, OPEN_DOCUMENT];
  const tgt = ctx.target;
  if (tgt) {
    tools.push(GET_OPEN_RECORD, EDIT_OPEN_RECORD);
    const kind = documentRepository.getById(tgt.documentId)?.kind;
    if (kind && canSampleFill(kind)) tools.push(FILL_WITH_SAMPLE);
    tools.push(RECORD_ACTION);
    if (ctx.attachments.length > 0 && photoListOf(safeData(tgt))) tools.push(ADD_PHOTO);
  }
  if (ctx.runWidgetAction) tools.push(START_GUIDED_FILL);
  if (documentOnScreen(ctx)) tools.push(CHANGE_FORMAT);
  tools.push(SEARCH_RECORDS, LIST_RECORDS, GET_RECORD, HISTORY_FIGURES, TODAYS_FACTS);
  if (ctx.attachments.length > 0) tools.push(READ_ATTACHMENT);
  if (hrMasterVisible()) tools.push(HR_MASTER_LOOKUP);
  tools.push(ASK_USER);
  return tools;
}

/** The OpenAI function shape Groq takes (SPEC "Protocol"). */
export function toolSchemas(tools: readonly MitraTool[]): ToolSchema[] {
  return tools.map((tool) => ({ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.parameters } }));
}

const ACTION_RUNNING: Record<string, string> = {
  submit: "Submitting the record…",
  verify: "Verifying the record…",
  cancel_correction: "Cancelling the correction…",
  print: "Printing the document…",
  delete: "Deleting the record…",
  approve: "Approving the checklist…",
  send_back: "Sending the checklist back…",
};

/** The label of a step while it runs — "Opening the Dashboard…", "Filling in the open record…". */
export function describeStep(toolName: string, args: Record<string, unknown>): string {
  switch (toolName) {
    case "navigate": {
      const route = str(args.route);
      return say("ai.step.opening", "Opening {what}…", { what: route ? routeWords(route.startsWith("/") ? route : `/${route}`) : "the page" });
    }
    case "find_documents":
      return say("ai.step.finding", "Finding documents for “{what}”…", { what: short(str(args.query), 40) });
    case "open_document": {
      const doc = findDocument(str(args.documentId));
      return say("ai.step.opening", "Opening {what}…", { what: doc ? `the ${doc.name}${bool(args.create) ? " record" : ""}` : "the document" });
    }
    case "get_open_record":
      return say("ai.step.reading", "Reading the open record…");
    case "edit_open_record":
      return say("ai.step.filling", "Filling in the open record…");
    case "fill_open_record_with_sample_data":
      return say("ai.step.sampleFilling", "Filling with sample data…");
    case "start_guided_fill":
      return say("ai.step.guidedStarting", "Starting the question-by-question fill…");
    case "record_action":
      return ACTION_RUNNING[str(args.action).toLowerCase().replace(/[\s-]+/g, "_")] ?? say("ai.step.acting", "Acting on the record…");
    case "change_format":
      return say("ai.step.changingFormat", "Changing the format…");
    case "search_records":
      return say("ai.step.searching", "Searching records for “{what}”…", { what: short(str(args.query), 40) });
    case "list_records":
      return say("ai.step.listing", "Listing records…");
    case "get_record":
      return say("ai.step.readingRecord", "Reading a record…");
    case "history_figures":
      return say("ai.step.working", "Working out the figures…");
    case "todays_facts":
      return say("ai.step.readingFacts", "Reading today's facts…");
    case "read_attachment":
      return say("ai.step.readingFile", "Reading the attached file…");
    case "add_photo_to_open_record":
      return say("ai.step.addingPhoto", "Adding the photo…");
    case "ask_user":
      return say("ai.step.asking", "Asking you…");
    case "hr_master_lookup":
      return say("ai.step.lookingUp", "Looking up HR Master Data…");
    default:
      return say("ai.step.running", "Running {tool}…", { tool: toolName });
  }
}
