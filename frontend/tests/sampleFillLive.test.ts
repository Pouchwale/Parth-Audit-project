// SAMPLE DATA IS FOR PRACTICE (REQUIREMENTS §98, 8-Oct-2026).
//
// The simulation that writes plausible readings (engine/autoFill.ts with engine/plantSimulation.ts and the
// pest patterns) is Demo Mode's. "Fill it with sample data" fills a Demo Mode record anywhere, and a Live
// record only on a test server (ALLOW_SAMPLE_FILL=1, which the test runners set; off by default). Anywhere
// else every way of asking declines in plain words in the person's language: Mitra's tool (which the phone's
// /api/v1 sample-fill runs too), the stored fill of the full-page assistant, and the guided interview's
// "Fill typical readings for me".
//
// Run: npm run test:unit -- sampleFillLive
import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import type { AssistantTarget } from "../src/store/AssistantContext";
import type { MitraToolContext } from "../src/engine/mitraTypes";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded, masterRepository } from "../src/data/repositories/masterRepository";
import { ensureSeeded as ensureHrMasterSeeded } from "../src/data/repositories/hrMasterRepository";
import { recordRepository } from "../src/data/repositories/recordRepository";
import { createRecordForDocument } from "../src/engine/recordCrud";
import { setFeatures } from "../src/engine/features";
import { interviewPlan } from "../src/engine/guidedRecord";
import { mitraTools, runTool } from "../src/engine/mitraTools";
import { SAMPLE_FILL_LIVE_DECLINED, SAMPLE_FILL_NOTE, sampleFillAllowedFor, sampleFillDeclined, sampleFillStoredRecord } from "../src/engine/sampleFill";
import { answerIn } from "../src/i18n";
import { LIZARD_NOT_REPORTED_SOURCE, LIZARD_PATTERN_SOURCE, lizardTrendRows } from "../src/data/selectors";
import { todayISO } from "../src/utils/date";

ensureDocumentsSeeded();
ensureMasterSeeded();
ensureHrMasterSeeded();

if (typeof (globalThis as { location?: unknown }).location === "undefined") {
  Object.defineProperty(globalThis, "location", { value: { hash: "" }, configurable: true, writable: true });
}

const today = todayISO();
const env = (globalThis as { process: { env: Record<string, string | undefined> } }).process.env;

// The plant: no Demo Mode, no switch. Every test starts there.
afterEach(() => {
  setFeatures({ demoMode: false, signup: false, assistant: false });
  delete env.ALLOW_SAMPLE_FILL;
});
setFeatures({ demoMode: false, signup: false, assistant: false });
delete env.ALLOW_SAMPLE_FILL;

function ctxWith(target: AssistantTarget, isDemo: boolean, userWords = "fill it with sample data"): MitraToolContext {
  return {
    today,
    isDemo,
    language: "en",
    userName: "Unit Test",
    currentRoute: `/record/${target.recordId}`,
    navigate: () => {},
    target,
    bump: () => {},
    attachments: [],
    confirm: async () => true,
    userWords,
  };
}

function openRecord(documentId: string, isDemo: boolean) {
  const doc = documentRepository.getById(documentId)!;
  const { record } = createRecordForDocument(doc, { dateISO: today, isDemo });
  let current = record.data;
  const commits: { data: unknown; note: string }[] = [];
  const target: AssistantTarget = {
    documentKind: doc.kind,
    documentId,
    recordId: record.id,
    status: "In Progress",
    editable: true,
    currentData: record.data,
    getData: () => current,
    commit: (next, note) => {
      commits.push({ data: next, note });
      current = next;
    },
    title: doc.name,
  };
  return { doc, record, target, commits };
}

async function askForSample(target: AssistantTarget, isDemo: boolean, words?: string) {
  const ctx = ctxWith(target, isDemo, words);
  const tool = mitraTools(ctx).find((x) => x.name === "fill_open_record_with_sample_data")!;
  return runTool(tool, "{}", ctx);
}

test("Mitra declines sample data for a live record, in plain words, and changes nothing", async () => {
  const { target, commits } = openRecord("qc-viscosity", false);
  const r = await askForSample(target, false);
  assert.equal(r.ok, false);
  assert.equal(commits.length, 0, "nothing was written");
  assert.match(JSON.stringify(r.result), /Sample data is for practice in Demo Mode\. In a live record, enter what you saw/);
});

test("the refusal is in the person's language: English, Gujarati, Hindi", () => {
  assert.equal(sampleFillDeclined(), SAMPLE_FILL_LIVE_DECLINED);
  assert.match(answerIn("gu", () => sampleFillDeclined()), /ડેમો મોડ/);
  assert.match(sampleFillDeclined("इसे नमूना डेटा से भर दो"), /डेमो मोड/);
  for (const words of [sampleFillDeclined(), answerIn("gu", () => sampleFillDeclined()), sampleFillDeclined("नमूना")]) assert.doesNotMatch(words, /\b(he|she|him|her|his)\b/i);
});

test("a Demo Mode record is filled with sample data, marked as made up", async () => {
  const { target, commits } = openRecord("qc-viscosity", true);
  const r = await askForSample(target, true);
  assert.equal(r.ok, true, r.content);
  assert.equal(commits.length, 1);
  assert.equal(commits[0].note, SAMPLE_FILL_NOTE);
});

test("a test server switches it on for a live record: the server's word, or its own ALLOW_SAMPLE_FILL", async () => {
  const live = { isDemo: false };
  assert.equal(sampleFillAllowedFor(live), false, "off by default");
  setFeatures({ demoMode: false, sampleFill: true });
  assert.equal(sampleFillAllowedFor(live), true, "features.sampleFill from the server");
  setFeatures({ demoMode: true, sampleFill: false });
  assert.equal(sampleFillAllowedFor(live), false, "the server's explicit word wins over its Demo Mode");
  setFeatures({ demoMode: true });
  assert.equal(sampleFillAllowedFor(live), true, "a server that says nothing yet is taken at its Demo Mode word");
  setFeatures({ demoMode: false });
  env.ALLOW_SAMPLE_FILL = "1";
  assert.equal(sampleFillAllowedFor(live), true, "the engine host reads the server's ALLOW_SAMPLE_FILL");
  const { target, commits } = openRecord("daily-pest-monitoring", false);
  const r = await askForSample(target, false);
  assert.equal(r.ok, true, r.content);
  assert.equal(commits.length, 1);
});

test("the full-page assistant's stored fill leaves a live record as it was", () => {
  const { record } = openRecord("fly-catcher", false);
  const before = JSON.stringify(recordRepository.getById(record.id)?.data);
  assert.equal(sampleFillStoredRecord(record.id, "Unit Test"), undefined);
  assert.equal(JSON.stringify(recordRepository.getById(record.id)?.data), before);
});

test("the guided interview offers no made-up 'typical readings' for a live record, and copies no signature in", () => {
  const master = masterRepository.get();
  const live = openRecord("qc-viscosity", false);
  const plan = interviewPlan(live.doc, live.record, live.record.data, master, today, "en")!;
  const rows = plan.questions.find((q) => q.id === "rows")!;
  assert.ok(!(rows.suggestions ?? []).some((s) => s.value === "__typical__"), "no typical readings offered");
  const typed = rows.apply(live.record.data, "09:00 20.1");
  const nine = (typed as { rows: Record<string, unknown>[] }).rows.find((r) => r.time === "09:00")!;
  assert.equal(nine.viscosity, 20.1, "what the person typed is written");
  assert.equal(nine.testedBy, "", "and nobody's name beside it");
  const demo = openRecord("qc-viscosity", true);
  const demoPlan = interviewPlan(demo.doc, demo.record, demo.record.data, master, today, "en")!;
  assert.ok((demoPlan.questions.find((q) => q.id === "rows")!.suggestions ?? []).some((s) => s.value === "__typical__"), "Demo Mode keeps them");
});

test("the Live lizard report invents no catch for a year the provider has not reported; Demo Mode keeps its season", () => {
  const year = Number(today.slice(0, 4));
  const live = lizardTrendRows(false, today).find((r) => r.year === year);
  assert.ok(live, "this year's row is there");
  assert.equal(live!.source, LIZARD_NOT_REPORTED_SOURCE);
  assert.ok(live!.months.every((m) => m === null), `no month holds a number: ${JSON.stringify(live!.months)}`);
  const demo = lizardTrendRows(true, today).find((r) => r.year === year);
  assert.equal(demo!.source, LIZARD_PATTERN_SOURCE);
  assert.ok(demo!.months.slice(0, Number(today.slice(5, 7))).every((m) => typeof m === "number"));
});
