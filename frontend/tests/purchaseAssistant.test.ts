// MITRA'S PURCHASE TOOLS (REQUIREMENTS §200; the owner, 7-Nov-2026: "the data which are fetching from master data should be
// fetch perfectly for all the document of that module ... in Pur-01 ... when user upload the pdf files then make sure it
// will fetch perfectly ... and if even told to ai assistant then it can also able to do it properly"):
//   * purchase_master_lookup finds a supplier of Purchase Master Data by name or Vendor Code;
//   * fetch_supplier_into_open_record writes a supplier onto the open record as the Fetch bar does - the boxes of a form, a
//     line of a register, every supplier at once - a box already written asked about first, replaced only on yes;
//   * fill_open_record_from_supplier_form reads the supplier's own form from an attachment (the server's reader, stubbed
//     here) and writes its boxes onto F/PUR/01, and nowhere else;
//   * neither record tool is offered off a Purchase record, and none writes on a record that is not open for writing.
// Run: npm run test:unit -- purchaseAssistant
import test from "node:test";
import assert from "node:assert/strict";
import type { AssistantTarget } from "../src/store/AssistantContext";
import type { LogSheetData } from "../src/types";
import type { MitraAttachment, MitraToolContext } from "../src/engine/mitraTypes";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded, masterRepository } from "../src/data/repositories/masterRepository";
import { ensureSeeded as ensurePurchaseSeeded, purchaseMasterRepository } from "../src/data/repositories/purchaseMasterRepository";
import { ensureSeeded as ensureRecordsSeeded } from "../src/data/repositories/recordRepository";
import { createDefaultData } from "../src/engine/recordDefaults";
import { mitraTools, runTool } from "../src/engine/mitraTools";
import { allSuppliers, supplierLinkFor } from "../src/engine/purchaseMasterLinks";
import { todayISO } from "../src/utils/date";

ensureDocumentsSeeded();
ensureMasterSeeded();
ensurePurchaseSeeded();
ensureRecordsSeeded();
if (typeof (globalThis as { location?: unknown }).location === "undefined") {
  Object.defineProperty(globalThis, "location", { value: { hash: "" }, configurable: true, writable: true });
}

const today = todayISO();

function ctxOf(over: Partial<MitraToolContext> = {}, answer = true): MitraToolContext & { confirmations: string[] } {
  const confirmations: string[] = [];
  return {
    today,
    isDemo: true,
    language: "en",
    userName: "Unit Test",
    currentRoute: "/record/rec-fake",
    navigate: () => {},
    target: null,
    bump: () => {},
    attachments: [],
    confirm: async (question) => {
      confirmations.push(question);
      return answer;
    },
    userWords: "fetch the supplier",
    ...over,
    confirmations,
  };
}

function targetOf(documentId: string, data: LogSheetData, over: Partial<AssistantTarget> = {}) {
  let current: unknown = data;
  const commits: { data: LogSheetData; note: string }[] = [];
  const target: AssistantTarget = {
    documentKind: "log-sheet",
    documentId,
    recordId: "rec-fake",
    status: "In Progress",
    editable: true,
    currentData: data,
    getData: () => current,
    commit: (next, note) => {
      commits.push({ data: next as LogSheetData, note });
      current = next;
    },
    title: "the test record",
    ...over,
  };
  return { target, commits, header: () => (current as LogSheetData).header ?? {}, rows: () => (current as LogSheetData).rows };
}

const blank = (documentId: string): LogSheetData => {
  const doc = documentRepository.getById(documentId);
  assert.ok(doc, documentId);
  return createDefaultData(doc!, today, masterRepository.get()) as LogSheetData;
};

const run = (ctx: MitraToolContext, name: string, args: unknown) => {
  const tool = mitraTools(ctx).find((x) => x.name === name);
  assert.ok(tool, `${name} is offered here`);
  return runTool(tool!, JSON.stringify(args), ctx);
};

const first = () => {
  const s = allSuppliers()[0];
  assert.ok(s, "Purchase Master Data is seeded");
  return s;
};

test("purchase_master_lookup finds a supplier by name and by Vendor Code, and says when nobody is called that", async () => {
  const ctx = ctxOf();
  const s = first();
  const byName = await run(ctx, "purchase_master_lookup", { query: s.supplierName });
  assert.equal(byName.ok, true, byName.content);
  assert.match(byName.content, new RegExp(s.supplierName.slice(0, 12).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  if (s.vendorCode.trim()) {
    const byCode = await run(ctx, "purchase_master_lookup", { query: s.vendorCode });
    assert.equal(byCode.ok, true, byCode.content);
  }
  const nobody = await run(ctx, "purchase_master_lookup", { query: "zqx nobody at all" });
  assert.equal(nobody.ok, false);
});

test("fetch_supplier_into_open_record fills F/PUR/01's boxes from the list; a box already written is asked about, replaced only on yes or on replace", async () => {
  const s = first();
  const { target, commits, header } = targetOf("pur-supplier-registration", blank("pur-supplier-registration"));
  const link = supplierLinkFor("pur-supplier-registration")!;
  const ctx = ctxOf({ target });
  const filled = await run(ctx, "fetch_supplier_into_open_record", { supplier: s.supplierName });
  assert.equal(filled.ok, true, filled.content);
  assert.equal(commits.length, 1);
  assert.equal(header()[link.idField], s.supplierName, "the supplier's name on the form");
  assert.match(commits[0].note, /Asked of Mitra/);
  // The same supplier again: nothing to fetch.
  const again = await run(ctx, "fetch_supplier_into_open_record", { supplier: s.supplierName });
  assert.equal(again.ok, false);
  assert.match(again.content, /already has/);
  // Another supplier over a written name: asked first; "no" keeps the form; replace: true writes it.
  const other = allSuppliers().find((x) => x.supplierName !== s.supplierName && x.contactPerson.trim());
  if (other) {
    const kept = await run(ctxOf({ target }, false), "fetch_supplier_into_open_record", { supplier: other.supplierName });
    assert.equal(header()[link.idField], s.supplierName, "kept on no");
    assert.match(kept.content, /kept|Left as it was/i);
    const replaced = await run(ctx, "fetch_supplier_into_open_record", { supplier: other.supplierName, replace: true });
    assert.equal(replaced.ok, true, replaced.content);
    assert.equal(header()[link.idField], other.supplierName, "replaced on replace: true");
  }
  // Nobody of that name.
  const none = await run(ctx, "fetch_supplier_into_open_record", { supplier: "zqx nobody at all" });
  assert.equal(none.ok, false);
});

test("on a register, one supplier goes on the first blank line and `all` adds every supplier of the list, never one twice", async () => {
  const s = first();
  const { target, rows } = targetOf("pur-approved-suppliers", { ...blank("pur-approved-suppliers"), rows: [] });
  const ctx = ctxOf({ target });
  const one = await run(ctx, "fetch_supplier_into_open_record", { supplier: s.supplierName });
  assert.equal(one.ok, true, one.content);
  assert.equal(rows().length, 1);
  assert.equal(rows()[0].supplierName, s.supplierName);
  const all = await run(ctx, "fetch_supplier_into_open_record", { all: true });
  assert.equal(all.ok, true, all.content);
  assert.equal(rows().length, allSuppliers().length, "every supplier once: the one already there not again");
  const nothing = await run(ctx, "fetch_supplier_into_open_record", { all: true });
  assert.equal(nothing.ok, false);
  assert.match(nothing.content, /already/);
});

test("fill_open_record_from_supplier_form reads the attached form through the server's reader and writes F/PUR/01's blank boxes; offered on F/PUR/01 alone", async () => {
  const attachment: MitraAttachment = { id: "att-form", name: "Ambica registration form.pdf", kind: "pdf", size: 9000, status: "ready", text: "SUPPLIER'S NAME : Shree Ambica Packaging Pvt. Ltd.", characters: 50 };
  const fields = { supplierName: "Shree Ambica Packaging Pvt. Ltd.", contactPerson: "Mr. Hiren Patel", emailAddress: "sales@ambicapack.in", holdsCertification: "Yes", assessmentStatus: "APPROVED" };
  const calls: { url: string; name: string | null; body: string }[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), name: new Headers(init?.headers).get("X-File-Name"), body: String(init?.body) });
    return new Response(JSON.stringify({ fields, fileKind: "text", readBy: "rules", missing: ["TYPE OF CONCERN", "ADDRESS (OFFICE)"], characters: 50 }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const { target, commits, header } = targetOf("pur-supplier-registration", blank("pur-supplier-registration"));
    const ctx = ctxOf({ target, attachments: [attachment] });
    const read = await run(ctx, "fill_open_record_from_supplier_form", {});
    assert.equal(read.ok, true, read.content);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/api\/purchase\/supplier-form\/read$/);
    assert.equal(decodeURIComponent(calls[0].name ?? ""), "Ambica registration form.txt", "the attachment's words sent as text under its name");
    assert.equal(calls[0].body, attachment.text);
    assert.equal(commits.length, 1);
    assert.equal(header().supplierName, fields.supplierName);
    assert.equal(header().contactPerson, fields.contactPerson);
    assert.equal(header().holdsCertification, "Yes");
    assert.equal(header().assessmentStatus ?? "", "", "the office's own box is never written from the supplier's form");
    assert.match(read.content, /TYPE OF CONCERN/, "what the file did not give is said");
    // Not on another Purchase record, nor without an attachment.
    const audit = targetOf("pur-supplier-audit-report", blank("pur-supplier-audit-report")).target;
    assert.ok(!mitraTools(ctxOf({ target: audit, attachments: [attachment] })).some((t) => t.name === "fill_open_record_from_supplier_form"), "F/PUR/02 does not read the form");
    assert.ok(!mitraTools(ctxOf({ target })).some((t) => t.name === "fill_open_record_from_supplier_form"), "nothing attached, nothing to read");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("neither record tool is offered off a Purchase record, and a record not open for writing is refused", async () => {
  const daily = documentRepository.getById("daily-pest-monitoring")!;
  const { target: other } = targetOf("daily-pest-monitoring", createDefaultData(daily, today, masterRepository.get()) as LogSheetData, { documentKind: "daily-pest-monitoring" });
  const names = new Set(mitraTools(ctxOf({ target: other })).map((t) => t.name));
  assert.ok(!names.has("fetch_supplier_into_open_record") && !names.has("fill_open_record_from_supplier_form"));
  assert.ok(names.has("purchase_master_lookup"), "the lookup is offered everywhere the list is held");
  const { target: locked, commits } = targetOf("pur-supplier-registration", blank("pur-supplier-registration"), { editable: false, status: "Verified" });
  const refused = await run(ctxOf({ target: locked }), "fetch_supplier_into_open_record", { supplier: first().supplierName });
  assert.equal(refused.ok, false);
  assert.equal(commits.length, 0);
  assert.ok(purchaseMasterRepository.all().length > 0);
});
