// MITRA WORKS ON EVERY DOCUMENT (REQUIREMENTS §206; the owner, 15-Nov-2026: "user should use this software and ai assistant
// can do work on every document easily according to user query"). For each of the documents that hold records - every
// module's - a new record is made as the app makes one, handed to Mitra as its page hands it over (the page's own
// documentKind), and asked, through the very tools the model calls:
//   * get_open_record - she reads the record;
//   * edit_open_record - a box of the form written with words a person would give, saved with "Asked of Mitra" in the
//     record's history. A form: a header box; a register with no header box: a line added.
// What any document fails is named, so nothing is left to luck.
// Run: npm run test:unit -- mitraEveryDocument
import test from "node:test";
import assert from "node:assert/strict";
import type { AssistantTarget } from "../src/store/AssistantContext";
import type { DocumentDefinition, LogSheetData } from "../src/types";
import type { MitraToolContext } from "../src/engine/mitraTypes";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded, masterRepository } from "../src/data/repositories/masterRepository";
import { ensureSeeded as ensureRecordsSeeded } from "../src/data/repositories/recordRepository";
import { getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import { createDefaultData } from "../src/engine/recordDefaults";
import { mitraTools, runTool } from "../src/engine/mitraTools";
import { todayISO } from "../src/utils/date";

ensureDocumentsSeeded();
ensureMasterSeeded();
ensureRecordsSeeded();
if (typeof (globalThis as { location?: unknown }).location === "undefined") {
  Object.defineProperty(globalThis, "location", { value: { hash: "" }, configurable: true, writable: true });
}

const today = todayISO();

/** The kind a page hands Mitra for a document (pages/RecordPage.tsx, CapaPage, GapPage, TrainingPage, CompliancePage). */
const PAGE_KIND: Record<string, string> = { "gap-inspection": "gap", "training-record": "training", "compliance-statement": "reference" };
const kindFor = (doc: DocumentDefinition): string => PAGE_KIND[doc.kind] ?? doc.kind;

const WORDS = "ZQ written by Mitra";

/** A patch a person's words would make on this document, and how to find the value afterwards. */
function patchFor(doc: DocumentDefinition, data: Record<string, unknown>): { patch: Record<string, unknown>; found: (after: unknown) => boolean } | null {
  if (doc.kind === "log-sheet") {
    const layout = getLogSheetLayout(doc.id);
    if (!layout) return null;
    const boxes = [...layout.headerFields, ...(layout.footerFields ?? [])].filter((f) => f.type === "text" || f.type === undefined);
    const box = boxes.find((f) => !f.autoFill) ?? boxes[0];
    if (box) return { patch: { header: { [box.key]: WORDS } }, found: (after) => (after as LogSheetData).header?.[box.key] === WORDS };
    const col = layout.columns.find((c) => (c.type === "text" || c.type === undefined) && !c.fixed && !c.computed);
    if (!col) return null;
    const found = (after: unknown) => ((after as LogSheetData).rows ?? []).some((r) => r[col.key] === WORDS);
    // A sheet that prints its own lines (time slots, one line, the format's rows): its first line filled in, as a person would.
    const rows = (data as unknown as LogSheetData).rows ?? [];
    if (rows.length > 0 && layout.rowMode.kind !== "free") return { patch: { itemEdits: [{ collection: "rows", match: { row: 1 }, set: { [col.key]: WORDS } }] }, found };
    return { patch: { addItems: { rows: [{ [col.key]: WORDS }] } }, found };
  }
  // A service report: the remarks on its first line; F/HR/18: who cleaned the first unit (as a person would say them).
  if (doc.kind === "service-report") {
    return { patch: { itemEdits: [{ collection: "lines", match: { row: 1 }, set: { remarks: WORDS } }] }, found: (after) => ((after as { lines?: { remarks?: string }[] }).lines ?? [])[0]?.remarks === WORDS };
  }
  if (doc.kind === "fly-catcher") {
    return { patch: { itemEdits: [{ collection: "entries", match: { pcId: "PC-01" }, set: { cleaningDoneBy: WORDS } }] }, found: (after) => ((after as { entries?: { pcId: string; cleaningDoneBy?: string }[] }).entries ?? []).some((e) => e.pcId === "PC-01" && e.cleaningDoneBy === WORDS) };
  }
  // Any other form: its first box written as words that is still blank, else its first box of words.
  const words = Object.keys(data).filter((k) => typeof data[k] === "string" && !/date|time|id$|status|signature|sign|origin/i.test(k));
  const key = words.find((k) => !String(data[k]).trim()) ?? words[0];
  if (!key) return null;
  return { patch: { [key]: WORDS }, found: (after) => (after as Record<string, unknown>)[key] === WORDS };
}

function targetOf(doc: DocumentDefinition, data: unknown) {
  let current = data;
  const commits: { note: string }[] = [];
  const target: AssistantTarget = {
    documentKind: kindFor(doc),
    documentId: doc.id,
    recordId: `rec-sweep-${doc.id}`,
    status: "In Progress",
    editable: true,
    currentData: data,
    getData: () => current,
    commit: (next, note) => {
      commits.push({ note });
      current = next;
    },
    title: `${doc.formatNo} ${doc.name}`,
  };
  return { target, commits, now: () => current };
}

function ctxOf(target: AssistantTarget): MitraToolContext {
  return {
    today,
    isDemo: true,
    language: "en",
    userName: "Sweep",
    currentRoute: `/record/${target.recordId}`,
    navigate: () => {},
    target,
    bump: () => {},
    attachments: [],
    confirm: async () => true,
    userWords: "write this on the form",
  };
}

test("Mitra reads and writes a record of every document that holds records, in every module", async () => {
  const docs = documentRepository.getRecordableUnscoped().filter((d) => !d.isReferenceOnly);
  assert.ok(docs.length >= 120, `${docs.length} documents`);
  const failures: string[] = [];
  const noPlace: string[] = [];
  for (const doc of docs) {
    const data = createDefaultData(doc, today, masterRepository.get()) as Record<string, unknown>;
    const { target, commits, now } = targetOf(doc, data);
    const ctx = ctxOf(target);
    const tools = mitraTools(ctx);
    const get = tools.find((t) => t.name === "get_open_record");
    const edit = tools.find((t) => t.name === "edit_open_record");
    if (!get || !edit) {
      failures.push(`${doc.formatNo} ${doc.id}: the record tools are not offered`);
      continue;
    }
    const read = await runTool(get, "{}", ctx);
    if (!read.ok) failures.push(`${doc.formatNo} ${doc.id}: get_open_record - ${read.content.slice(0, 120)}`);
    const plan = patchFor(doc, data);
    if (!plan) {
      noPlace.push(`${doc.formatNo} ${doc.id}`);
      continue;
    }
    const wrote = await runTool(edit, JSON.stringify({ patch: plan.patch }), ctx);
    if (!wrote.ok || commits.length !== 1 || !plan.found(now())) {
      failures.push(`${doc.formatNo} ${doc.id} (${kindFor(doc)}): edit_open_record ${JSON.stringify(plan.patch).slice(0, 80)} - ${wrote.content.slice(0, 160)}`);
      continue;
    }
    if (!/Asked of Mitra/.test(commits[0].note)) failures.push(`${doc.formatNo} ${doc.id}: the change is not noted as Mitra's`);
  }
  if (noPlace.length) console.log(`No blank box of words to write on (a form of choices and dates only): ${noPlace.join(", ")}`);
  console.log(`Mitra worked on ${docs.length - failures.length - noPlace.length} of ${docs.length} documents by word${noPlace.length ? `; ${noPlace.length} have no box of words` : ""}.`);
  assert.deepEqual(failures, [], failures.join("\n"));
});
