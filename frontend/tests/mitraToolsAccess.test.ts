// MITRA REFUSES WHAT THE PERSON'S LEVEL DOES NOT ALLOW (REQUIREMENTS §96, engine/mitraTools.ts).
//
// The owner, 8-Oct-2026: the super admin gives each person Read, Write or Edit, and "the bot can do [an operation]
// with the user's permission". Mitra's tools act as the signed-in person, so they follow the same level the pages do:
//   * a Read person cannot start, fill, submit or verify a record of the document, and cannot change its format;
//   * a Write person cannot delete a record or change the format (Edit);
//   * the refusal is said in the person's language (Hindi when asked in Devanagari, Gujarati when the chat is in
//     Gujarati) and names the level the step needs; nothing is written.
// Run: npm run test:unit -- mitraToolsAccess
import test from "node:test";
import assert from "node:assert/strict";
import type { AssistantTarget } from "../src/store/AssistantContext";
import type { MitraToolContext } from "../src/engine/mitraTypes";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded, masterRepository } from "../src/data/repositories/masterRepository";
import { ensureSeeded as ensureRecordsSeeded, recordRepository } from "../src/data/repositories/recordRepository";
import { createDefaultData } from "../src/engine/recordDefaults";
import { mitraTools, runTool } from "../src/engine/mitraTools";
import { setAccessRules, setAccessScope, setDepartmentScope } from "../src/engine/departmentScope";
import { addDays, todayISO } from "../src/utils/date";

ensureDocumentsSeeded();
ensureMasterSeeded();
ensureRecordsSeeded();

if (typeof (globalThis as { location?: unknown }).location === "undefined") {
  Object.defineProperty(globalThis, "location", { value: { hash: "" }, configurable: true, writable: true });
}

const today = todayISO();

function ctxOf(over: Partial<MitraToolContext> = {}): MitraToolContext {
  return {
    today,
    isDemo: false,
    language: "en",
    userName: "Vinay Bhojak",
    currentRoute: "/dashboard",
    navigate: () => {},
    target: null,
    bump: () => {},
    attachments: [],
    confirm: async () => true,
    userWords: "please do it",
    ...over,
  };
}

function openRecord(documentId: string, over: Partial<AssistantTarget> = {}) {
  const doc = documentRepository.getAllUnscoped().find((d) => d.id === documentId)!;
  const commits: unknown[] = [];
  let submitted = 0;
  const target: AssistantTarget = {
    documentKind: doc.kind,
    documentId,
    recordId: `rec-${documentId}`,
    status: "In Progress",
    editable: true,
    currentData: createDefaultData(doc, today, masterRepository.get()),
    getData: () => createDefaultData(doc, today, masterRepository.get()),
    commit: (next) => {
      commits.push(next);
    },
    submit: () => {
      submitted += 1;
      return { ok: true, errors: [] };
    },
    title: doc.name,
    ...over,
  };
  return { target, commits, submitted: () => submitted };
}

const run = (ctx: MitraToolContext, name: string, args: unknown) => {
  const found = mitraTools(ctx).find((x) => x.name === name);
  assert.ok(found, `${name} is offered here`);
  return runTool(found!, JSON.stringify(args), ctx);
};

function asVinay<T>(run: () => Promise<T>): Promise<T> {
  setAccessScope({ email: "vinay.bhojak@gpp.local", role: "staff", departments: ["HR"] }, null);
  return run().finally(() => {
    setDepartmentScope(null);
    setAccessRules(null);
  });
}

test("a Read person cannot start, fill or submit a record through Mitra, and is told which level it needs", () =>
  asVinay(async () => {
    // F/HR/15 is Kapila Barad's: Read for Vinay Bhojak.
    const date = addDays(today, 400);
    const start = await run(ctxOf(), "open_document", { documentId: "hr-daily-cleaning", dateISO: date, create: true });
    assert.equal(start.ok, false);
    assert.match(start.content, /Read only for you/);
    assert.match(start.content, /Write access/);
    assert.equal(recordRepository.query({ documentId: "hr-daily-cleaning", isDemo: false, dueDate: date }).length, 0, "nothing was started");

    const open = openRecord("hr-daily-cleaning", { editable: false });
    const fill = await run(ctxOf({ target: open.target }), "edit_open_record", { patch: { remarks: "x" } });
    assert.equal(fill.ok, false);
    assert.match(fill.content, /Write access/);
    assert.equal(open.commits.length, 0);

    const editableTarget = openRecord("hr-daily-cleaning");
    const submit = await run(ctxOf({ target: editableTarget.target }), "record_action", { action: "submit" });
    assert.equal(submit.ok, false);
    assert.match(submit.content, /Submitting a record needs Write access/);
    assert.equal(editableTarget.submitted(), 0, "nothing was submitted");
  }));

test("the refusal is in the language the person asked in", () =>
  asVinay(async () => {
    const open = openRecord("hr-daily-cleaning");
    const hindi = await run(ctxOf({ target: open.target, userWords: "इसे जमा करो" }), "record_action", { action: "submit" });
    assert.equal(hindi.ok, false);
    assert.match(hindi.content, /[ऀ-ॿ]/);
    const gujarati = await run(ctxOf({ target: open.target, language: "gu", userWords: "submit it" }), "record_action", { action: "submit" });
    assert.match(gujarati.content, /[઀-૿]/);
  }));

test("a Write person may submit, but deleting a record and changing the format need Edit", async () => {
  // Stored by the super admin: Vinay Bhojak at Write (not Edit) on F/HR/01.
  setAccessScope({ email: "vinay.bhojak@gpp.local", role: "staff", departments: ["HR"] }, { version: 1, people: { "vinay.bhojak@gpp.local": { documents: { "hr-competence": "write" } } }, responsibility: {} });
  try {
    const open = openRecord("hr-competence");
    const submit = await run(ctxOf({ target: open.target }), "record_action", { action: "submit" });
    assert.equal(submit.ok, true, submit.content);
    const del = await run(ctxOf({ target: { ...open.target, remove: () => assert.fail("deleted") } }), "record_action", { action: "delete", reason: "duplicate" });
    assert.equal(del.ok, false);
    assert.match(del.content, /Deleting a record needs Edit access/);
    const format = await run(ctxOf({ target: open.target, currentRoute: "/document/hr-competence" }), "change_format", { change: { op: "rename", label: "Name", newLabel: "Full name" } });
    assert.equal(format.ok, false);
    assert.match(format.content, /Changing the format needs Edit access/);
  } finally {
    setDepartmentScope(null);
    setAccessRules(null);
  }
});
