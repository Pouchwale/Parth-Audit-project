// EVERY VALUE A RECORD PAGE BINDS LEADS TO THE VALUE (REQUIREMENTS §81).
//
// An edited Word or Excel file is read back through the bindings the record
// views put on each box (engine/roundTrip/bindingsFor.ts): a path that does not
// lead to the value it names would write an upload's change nowhere, or
// somewhere else. For every document that holds records, this starts one the
// way the record page does, fills it with sample data the way Mitra does
// (engine/sampleFill.ts) and walks every path the page would bind for it —
// the same builders the views call — checking that:
//   * the path parses and leads to a place in the data (getAtPath / pathExists),
//   * the value there is the kind of value the binding says (a number box holds
//     a number, a tick box a true/false, a date an ISO date …),
//   * writing that value back through setAtPath gives the same data,
//   * no two boxes on one page claim the same path (an id used twice would).
// Then the same over every record the plant already holds (the transcribed
// specimens), and over the two reference documents' pages — and, last, the
// real pages rendered to markup, so a box drawn without a binding is caught too.
import test from "node:test";
import assert from "node:assert/strict";
import type { DocumentDefinition, MasterData, RecordInstance } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { masterRepository, ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { ensureSeeded as ensureHrMasterSeeded } from "../src/data/repositories/hrMasterRepository";
import { recordRepository, ensureSeeded as ensureRecordsSeeded } from "../src/data/repositories/recordRepository";
import { getLogSheetLayoutForRecord } from "../src/data/seed/logSheetLayouts";
import { COMPLIANCE_STATEMENTS } from "../src/data/seed/complianceStatements";
import { nextWorkingDay } from "../src/engine/holidays";
import { createDefaultData } from "../src/engine/recordDefaults";
import { sampleFillRecord } from "../src/engine/sampleFill";
import { getAtPath, parseBindPath, pathExists, readBinding, setAtPath } from "../src/engine/roundTrip/bindPath";
import { bindProps, bindingsForRecord, flyRegisterBindings, propSeg, type Bound, type BindingContext } from "../src/engine/roundTrip/bindingsFor";
import { todayISO } from "../src/utils/date";
import { noProblems } from "./support/catalogue";
import { createElement as h, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server.edge";

ensureDocumentsSeeded();
ensureMasterSeeded();
ensureHrMasterSeeded();

const master: MasterData = masterRepository.get();
const recordable = documentRepository.getRecordable();
const today = todayISO();
// Today, and the next working day: on the Thursday weekly off the daily
// register arrives marked as a holiday and binds only the tick and the actions.
const dates = Array.from(new Set([today, nextWorkingDay(today, master)]));
const SEEDS = ["a", "b", "c"];

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function describeDoc(doc: DocumentDefinition): string {
  return `${doc.id} (${doc.formatNo} — ${doc.name})`;
}

function contextFor(doc: DocumentDefinition, record: { formatRevision?: string }): BindingContext {
  return {
    layout: doc.kind === "log-sheet" ? getLogSheetLayoutForRecord(doc.id, record) : undefined,
    checkpoints: master.checkpoints,
  };
}

/** Is `value` the kind of value a box of this binding writes? */
function kindProblem(b: Bound, value: unknown): string | null {
  if (value === undefined) return b.optional ? null : "no value there";
  const blank = value === null || value === "";
  switch (b.type) {
    case "number":
      return value === null || typeof value === "number" ? null : `a number box holds ${JSON.stringify(value)}`;
    case "bool":
      return typeof value === "boolean" ? null : `a tick box holds ${JSON.stringify(value)}`;
    case "date":
      return blank || (typeof value === "string" && ISO.test(value)) ? null : `a date box holds ${JSON.stringify(value)}`;
    case "time":
      return blank || (typeof value === "string" && TIME.test(value)) ? null : `a time box holds ${JSON.stringify(value)}`;
    case "yesno":
      return blank || value === "Yes" || value === "No" ? null : `a yes/no box holds ${JSON.stringify(value)}`;
    case "select":
      if (blank) return null;
      if (typeof value !== "string") return `a choice box holds ${JSON.stringify(value)}`;
      // A choice written before the format's list changed is kept as written; only its kind is checked.
      return null;
    default:
      return typeof value === "string" ? null : `a text box holds ${JSON.stringify(value)}`;
  }
}

/** Everything wrong with these bindings over this data, each line naming where. */
function bindingProblems(where: string, data: unknown, bindings: Bound[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const b of bindings) {
    const at = `${where} · ${b.path} ("${b.label}")`;
    if (!parseBindPath(b.path)) {
      problems.push(`${at}: the path does not parse`);
      continue;
    }
    if (seen.has(b.path)) problems.push(`${at}: bound twice on one page`);
    seen.add(b.path);
    if (!b.label.trim()) problems.push(`${at}: no label`);
    if (b.type === "select" && !(b.options && b.options.length)) problems.push(`${at}: a choice box with no choices`);
    if (!pathExists(data, b.path)) {
      problems.push(`${at}: leads nowhere in the data`);
      continue;
    }
    const value = getAtPath(data, b.path);
    const wrong = kindProblem(b, value);
    if (wrong) problems.push(`${at}: ${wrong}`);
    // Written back unchanged, the data is the same — setAtPath finds the same place getAtPath read.
    const back = setAtPath(data, b.path, value);
    if (!back.ok) problems.push(`${at}: setAtPath cannot write there`);
    else {
      try {
        assert.deepStrictEqual(back.data, value === undefined ? back.data : data);
      } catch {
        problems.push(`${at}: writing the value back changed the data`);
      }
    }
  }
  return problems;
}

function sampleProblems(): { problems: string[]; checked: number; kinds: Set<string> } {
  const problems: string[] = [];
  const kinds = new Set<string>();
  let checked = 0;
  for (const doc of recordable) {
    for (const dueDate of dates) {
      for (const seed of SEEDS) {
        const shell: RecordInstance = {
          id: `rt-${seed}-${doc.id}-${dueDate}`,
          documentId: doc.id,
          periodKey: dueDate,
          dueDate,
          status: "In Progress",
          isDemo: false,
          data: createDefaultData(doc, dueDate, master),
          createdAt: `${dueDate}T09:00:00.000Z`,
          updatedAt: `${dueDate}T09:00:00.000Z`,
        };
        const where = `${describeDoc(doc)} on ${dueDate} (seed ${seed})`;
        try {
          const filled = sampleFillRecord(doc, shell, master, "Unit QA");
          if (!filled) {
            problems.push(`${where}: the sample fill returned nothing`);
            break;
          }
          const bindings = bindingsForRecord(doc.kind, filled.data, contextFor(doc, shell));
          if (bindings === null) {
            problems.push(`${where}: no record page binds a document of kind "${doc.kind}"`);
            break;
          }
          if (bindings.length === 0) problems.push(`${where}: nothing on the page is bound`);
          kinds.add(doc.kind);
          checked += bindings.length;
          // A freshly filled record holds every box its page shows — only a checkpoint's note may be unwritten —
          // so here nothing else is let off as optional: a wrong key would otherwise pass as "not written yet".
          const strict = bindings.map((b) => ({ ...b, optional: b.optional && /\/note$/.test(b.path) }));
          const found = bindingProblems(where, filled.data, strict);
          problems.push(...found);
          // The blank shell as the page opens it, before anything is filled: every box it binds is there too.
          const blank = bindingsForRecord(doc.kind, shell.data, contextFor(doc, shell)) ?? [];
          const blankFound = bindingProblems(`${where} (blank)`, shell.data, blank).filter((p) => !/ · checkpoints\//.test(p));
          problems.push(...blankFound);
          if (found.length || blankFound.length) break; // one seed says it; the others would repeat it
        } catch (err) {
          problems.push(`${where}: threw ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
          break;
        }
      }
    }
  }
  return { problems, checked, kinds };
}

test("a numbered object key survives the path grammar", () => {
  const data = { checkpoints: { 7: { value: "Yes" }, 10: { value: "No", note: "" } } };
  assert.equal(propSeg(7), "%37");
  assert.equal(getAtPath(data, `checkpoints/${propSeg(7)}/value`), "Yes");
  assert.equal(getAtPath(data, `checkpoints/${propSeg(10)}/note`), "");
  const out = setAtPath(data, `checkpoints/${propSeg(10)}/value`, "Yes");
  assert.ok(out.ok);
  assert.deepEqual(out.ok && out.data, { checkpoints: { 7: { value: "Yes" }, 10: { value: "Yes", note: "" } } });
  // A plain digit segment is a position, so it would not have found the object's key.
  assert.equal(getAtPath(data, "checkpoints/7/value"), undefined);
});

test("the attributes a view spreads read back as the same binding", () => {
  const b: Bound = { path: "rows/@row-1/lotStatus", type: "select", label: "Row 1 · Lot Status", options: ["Accepted", "Rejected"] };
  const attrs = bindProps(b);
  // A stand-in element: readBinding only asks for attributes and the nearest record.
  const el = {
    getAttribute: (name: string) => attrs[name] ?? null,
    closest: () => ({ getAttribute: () => "rec-1" }),
  } as unknown as Element;
  const back = readBinding(el);
  assert.ok(back);
  assert.equal(back?.path, b.path);
  assert.equal(back?.type, "select");
  assert.equal(back?.label, b.label);
  assert.equal(back?.recordId, "rec-1");
  assert.deepEqual(
    back?.options.map((o) => o.value),
    ["Accepted", "Rejected"]
  );
  assert.deepEqual(bindProps(null), {});
});

test("every value a record page binds leads to the value — sample-filled records of every document", () => {
  const { problems, checked, kinds } = sampleProblems();
  noProblems("Bindings that do not lead to their value", problems);
  console.log(`  ${checked} bound values checked across ${recordable.length} documents (${[...kinds].sort().join(", ")})`);
});

test("every value a record page binds leads to the value — the plant's records on file", () => {
  ensureRecordsSeeded();
  const problems: string[] = [];
  let checked = 0;
  for (const record of recordRepository.getAll()) {
    const doc = documentRepository.getByIdUnscoped(record.documentId);
    if (!doc) continue;
    const bindings = bindingsForRecord(doc.kind, record.data, contextFor(doc, record));
    if (!bindings) continue;
    checked++;
    // A record written before a box existed may lack its value; the place for it must still be there.
    const where = `${describeDoc(doc)} record ${record.id} (${record.dueDate}, ${record.status})`;
    problems.push(...bindingProblems(where, record.data, bindings.map((b) => ({ ...b, optional: true }))).filter((p) => !/ · checkpoints\//.test(p) || !/leads nowhere/.test(p)));
  }
  noProblems("Bindings on the records on file that do not lead to their value", problems.slice(0, 60));
  assert.ok(checked > 0, "no record on file was checked");
  console.log(`  ${checked} records on file checked`);
});

test("the monthly fly catcher register binds only the entries a visit holds", () => {
  const data = { monthYear: "September-26", entries: [{ pcId: "PC-01", catchCountApprox: 4, tubeLightInstallDate: "2025-11-24", tubeLightDueDate: "2026-11-23", cleaningDoneBy: "A", verifiedBy: "B" }] };
  const bound = flyRegisterBindings(data, ["PC-01", "PC-02"]);
  assert.equal(bound.length, 5);
  noProblems("Register bindings", bindingProblems("F/HR/18 register", data, bound));
});

test("the reference documents' pages bind their values, in view and in edit", () => {
  const problems: string[] = [];
  for (const s of Object.values(COMPLIANCE_STATEMENTS)) {
    for (const editing of [false, true]) {
      problems.push(...bindingProblems(`${s.documentId} (${editing ? "edit" : "view"})`, s, bindingsForRecord("compliance-statement", s, { editing }) ?? []));
    }
  }
  const chart = { rows: master.serviceTypeChemicals };
  for (const editing of [false, true]) {
    problems.push(...bindingProblems(`chemical-master (${editing ? "edit" : "view"})`, chart, bindingsForRecord("chemical-master", chart, { editing }) ?? []));
  }
  noProblems("Reference bindings", problems);
});

// ---------------------------------------------------------------------------
// THE PAGES THEMSELVES. The builders above are what the views call; this
// renders the real pages (react-dom/server — its edge build, which neither
// needs Node's built-ins nor keeps the test process alive) with a sample-filled
// record open for writing AND signed off, and reads the markup back:
//   * every box inside the printed document ([data-print-doc]) — input, choice,
//     text area, tick — carries a binding, and so does every piece of words a
//     locked record shows in a box's place (.cell-text, .paragraph-text,
//     .caf-value, or the bound pieces inside one);
//   * every binding names a record ([data-bind-record]) and a path that leads
//     somewhere in that record's data.
// So a box added to a view later without a binding fails here, by name.

/** An element's opening tag as the markup has it, with the tags it sits inside. */
interface Tag {
  name: string;
  attrs: Record<string, string>;
  ancestors: Tag[];
  /** Its place among its parent's elements, from 0. */
  index: number;
  /** How many elements it holds so far (while the markup is read). */
  children: number;
}

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

function unescapeAttr(v: string): string {
  return v
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** Every opening tag of React's static markup (well-formed; ">" is always escaped inside attributes). */
function tagsOf(html: string): Tag[] {
  const out: Tag[] = [];
  const stack: Tag[] = [];
  let topLevel = 0;
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*?)(\/?)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const [, closing, rawName, rest, selfClosing] = m;
    const name = rawName.toLowerCase();
    if (closing) {
      const at = stack.map((t) => t.name).lastIndexOf(name);
      if (at !== -1) stack.length = at;
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const a of rest.matchAll(/([^\s=]+)(?:="([^"]*)")?/g)) attrs[a[1]] = unescapeAttr(a[2] ?? "");
    const parent = stack[stack.length - 1];
    const tag: Tag = { name, attrs, ancestors: stack.slice(), index: parent ? parent.children++ : topLevel++, children: 0 };
    out.push(tag);
    if (!selfClosing && !VOID.has(name)) stack.push(tag);
  }
  return out;
}

const classes = (t: Tag) => (t.attrs.class ?? "").split(/\s+/);
const within = (t: Tag, pick: (a: Tag) => boolean) => t.ancestors.some(pick);
const recordOf = (t: Tag): string | undefined => (t.attrs["data-bind-record"] ? t.attrs["data-bind-record"] : [...t.ancestors].reverse().find((a) => a.attrs["data-bind-record"])?.attrs["data-bind-record"]);

/** Why this box carries no binding on purpose, or null when it should carry one. */
function unboundOnPurpose(t: Tag): string | null {
  if (t.attrs.type === "file" || t.attrs.type === "hidden") return "a file picker";
  if (within(t, (a) => a.attrs["data-section"] === "hr-master-fetch" || a.attrs["data-section"] === "equipment-fetch")) return "the fetch bar";
  if ((t.attrs.title ?? "").startsWith("Same as line")) return "the service report's mirrored quantity";
  if (/-address$/.test(t.attrs["data-field"] ?? "")) return "an address held as several lines, edited joined";
  if (t.attrs["data-field"] === "fhr18-add-date" || t.attrs["data-field"] === "soc-lines") return "not a value of the record";
  return null;
}

/** What is wrong with the bindings in this page's markup; `dataOf` gives a bound record's data. */
function markupProblems(
  where: string,
  html: string,
  dataOf: (recordId: string) => unknown,
  /** A value this page shows unbound on purpose (a worked-out cell), with why; null otherwise. */
  alsoUnbound: (t: Tag) => string | null = () => null
): { problems: string[]; bound: number } {
  const problems: string[] = [];
  const tags = tagsOf(html);
  const inDoc = (t: Tag) => within(t, (a) => "data-print-doc" in a.attrs);
  const boundInside = new Set<Tag>();
  for (const t of tags) if (t.attrs["data-bind"]) for (const a of t.ancestors) boundInside.add(a);
  let bound = 0;
  const describe = (t: Tag) => `<${t.name}${Object.entries(t.attrs).map(([k, v]) => (k === "class" || k.startsWith("data-") || k === "type" ? ` ${k}="${v}"` : "")).join("")}>`;
  for (const t of tags) {
    if (!inDoc(t)) continue;
    const isBox = t.name === "input" || t.name === "select" || t.name === "textarea";
    const isWords =
      (t.name === "span" && classes(t).includes("cell-text") && !("data-computed" in t.attrs)) ||
      (t.name === "p" && classes(t).includes("paragraph-text")) ||
      classes(t).includes("caf-value");
    if ((isBox || isWords) && !t.attrs["data-bind"] && !boundInside.has(t) && !unboundOnPurpose(t) && !alsoUnbound(t)) problems.push(`${where}: ${describe(t)} shows a value with no binding`);
    const path = t.attrs["data-bind"];
    if (!path) continue;
    bound++;
    const type = t.attrs["data-bind-type"];
    const recordId = recordOf(t);
    if (!recordId) {
      problems.push(`${where}: ${describe(t)} is bound but inside no [data-bind-record]`);
      continue;
    }
    const data = dataOf(recordId);
    if (data === undefined) problems.push(`${where}: ${describe(t)} names record ${recordId}, which is not the one on the page`);
    else if (!parseBindPath(path) || !pathExists(data, path)) problems.push(`${where}: ${describe(t)} — ${path} leads nowhere in record ${recordId}`);
    if (!type || !["text", "paragraph", "number", "date", "time", "yesno", "select", "bool"].includes(type)) problems.push(`${where}: ${describe(t)} has no binding type`);
    if (!t.attrs["data-bind-label"]) problems.push(`${where}: ${describe(t)} has no label`);
  }
  for (const t of tags) {
    if (!("data-bind-table" in t.attrs)) continue;
    const heads = tags.filter((x) => x.name === "th" && x.ancestors.includes(t) && x.attrs["data-bind-col"]);
    if (heads.length === 0) problems.push(`${where}: a free-row grid names no column`);
  }
  return { problems, bound };
}

// The router reads the address the moment it loads, and there is none in a
// test: one is given first, and the pages are loaded after it (import(), not a
// static import, which would load the router before this line ran).
const scopeGlobals = globalThis as unknown as Record<string, unknown>;
if (!scopeGlobals.location) scopeGlobals.location = { hash: "", href: "http://localhost/", pathname: "/", search: "", origin: "http://localhost" };
if (!scopeGlobals.history) scopeGlobals.history = { state: null, replaceState() {}, pushState() {}, go() {}, back() {} };

async function loadPages() {
  const [auth, store, router, assistant, recordPage, capa, gap, training, compliance, chemical, fly, daily] = await Promise.all([
    import("../src/store/AuthContext"),
    import("../src/store/AppStore"),
    import("../src/store/router"),
    import("../src/store/AssistantContext"),
    import("../src/pages/RecordPage"),
    import("../src/pages/CapaPage"),
    import("../src/pages/GapPage"),
    import("../src/pages/TrainingPage"),
    import("../src/pages/CompliancePage"),
    import("../src/pages/ChemicalMasterPage"),
    import("../src/components/records/FlyCatcherRegisterSheet"),
    import("../src/components/records/DailyRegisterSheet"),
  ]);
  const render = (el: ReactElement): string =>
    renderToStaticMarkup(h(auth.AuthProvider, null, h(store.AppStoreProvider, null, h(router.RouterProvider, null, h(assistant.AssistantProvider, null, el)))));
  return {
    render,
    RecordPage: recordPage.RecordPage,
    ComplaintChecklistPage: capa.ComplaintChecklistPage,
    GapRecordPage: gap.GapRecordPage,
    TrainingRecordPage: training.TrainingRecordPage,
    ComplianceDetailPage: compliance.ComplianceDetailPage,
    ChemicalMasterPage: chemical.ChemicalMasterPage,
    FlyCatcherRegisterSheet: fly.FlyCatcherRegisterSheet,
    DailyRegisterSheet: daily.DailyRegisterSheet,
  };
}
type Pages = Awaited<ReturnType<typeof loadPages>>;

function pageFor(P: Pages, doc: DocumentDefinition, recordId: string): ReactElement | null {
  const { ComplaintChecklistPage, GapRecordPage, TrainingRecordPage, RecordPage } = P;
  switch (doc.kind) {
    case "complaint-checklist":
      return h(ComplaintChecklistPage, { recordId });
    case "gap-inspection":
      return h(GapRecordPage, { recordId });
    case "training-record":
      return h(TrainingRecordPage, { recordId });
    case "daily-pest-monitoring":
    case "fly-catcher":
    case "service-report":
    case "log-sheet":
    case "complaint-ack":
    case "service-agreement":
    case "pest-responsibilities":
      return h(RecordPage, { recordId });
    default:
      return null;
  }
}

test("every value on every record page carries a binding that leads to it — open for writing and signed off", async () => {
  const P = await loadPages();
  const problems: string[] = [];
  let bound = 0;
  let pages = 0;
  // A working day, so the daily register draws its checkpoints.
  const dueDate = nextWorkingDay(today, master);
  for (const doc of recordable) {
    const shell: RecordInstance = {
      id: `dom-${doc.id}`,
      documentId: doc.id,
      periodKey: `dom-${dueDate}`,
      dueDate,
      status: "In Progress",
      isDemo: false,
      data: createDefaultData(doc, dueDate, master),
      createdAt: `${dueDate}T09:00:00.000Z`,
      updatedAt: `${dueDate}T09:00:00.000Z`,
    };
    const filled = sampleFillRecord(doc, shell, master, "Unit QA");
    if (!filled) continue; // reported by the test above
    for (const status of ["In Progress", "Verified"] as const) {
      const record: RecordInstance = { ...shell, data: filled.data, status };
      recordRepository.upsert(record);
      const page = pageFor(P, doc, record.id);
      if (!page) {
        problems.push(`${describeDoc(doc)}: no page draws a document of kind "${doc.kind}"`);
        break;
      }
      const where = `${describeDoc(doc)} (${status})`;
      try {
        const html = P.render(page);
        // A log sheet's worked-out column reads as words and is not bound: the cell's place in its line says which column it is.
        const layout = doc.kind === "log-sheet" ? getLogSheetLayoutForRecord(doc.id, record) : undefined;
        const computedCell = (t: Tag): string | null => {
          if (!layout) return null;
          const td = [...t.ancestors].reverse().find((a) => a.name === "td");
          const inGrid = t.ancestors.some((a) => a.name === "table" && classes(a).includes("log-sheet"));
          return td && inGrid && layout.columns[td.index - 1]?.computed ? "a worked-out cell" : null;
        };
        const found = markupProblems(where, html, (id) => (id === record.id ? recordRepository.getById(id)?.data : undefined), computedCell);
        if (found.bound === 0) problems.push(`${where}: nothing on the page is bound`);
        problems.push(...found.problems.slice(0, 8));
        bound += found.bound;
        pages++;
      } catch (err) {
        problems.push(`${where}: rendering threw ${err instanceof Error ? (err.stack ?? err.message).split("\n").slice(0, 4).join(" | ") : String(err)}`);
      }
    }
  }
  noProblems("Values on the record pages without a binding that leads to them", problems);
  console.log(`  ${bound} bound boxes on ${pages} rendered pages`);
});

test("the monthly registers and the reference pages bind every value they show", async () => {
  const P = await loadPages();
  const { render, FlyCatcherRegisterSheet, DailyRegisterSheet, ComplianceDetailPage, ChemicalMasterPage } = P;
  const problems: string[] = [];
  const onFile = (id: string) => recordRepository.getById(id)?.data;
  const [y, m] = nextWorkingDay(today, master).split("-").map(Number);
  // The records the test above left on file include a fly catcher visit and a daily sheet of this month.
  for (const [name, el] of [
    ["F/HR/18 register", h(FlyCatcherRegisterSheet, { year: y, month: m - 1, isDemo: false })],
    ["F/HR/17 register", h(DailyRegisterSheet, { year: y, month: m - 1, isDemo: false })],
  ] as const) {
    const found = markupProblems(name, render(el), onFile);
    problems.push(...found.problems);
    if (found.bound === 0) problems.push(`${name}: nothing on the register is bound`);
  }
  for (const s of Object.values(COMPLIANCE_STATEMENTS)) {
    const found = markupProblems(s.documentId, render(h(ComplianceDetailPage, { documentId: s.documentId })), (id) => (id === s.documentId ? s : undefined));
    problems.push(...found.problems);
    if (found.bound === 0) problems.push(`${s.documentId}: nothing on the statement is bound`);
  }
  const chart = { rows: master.serviceTypeChemicals };
  const found = markupProblems("chemical-master", render(h(ChemicalMasterPage, null)), (id) => (id === "chemical-master" ? chart : undefined));
  problems.push(...found.problems);
  if (found.bound === 0) problems.push("chemical-master: nothing on the chart is bound");
  noProblems("Register and reference values without a binding that leads to them", problems);
});
