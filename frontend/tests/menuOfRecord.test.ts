// WHERE AN OPEN RECORD STANDS IN THE MENU (REQUIREMENTS §283).
// Run: npm run test:unit -- menuOfRecord
import test from "node:test";
import assert from "node:assert/strict";
import { RETIRED_DOCUMENT_IDS, SEED_DOCUMENTS } from "../src/data/seed/documentDefinitions";

// (the menu's file reads the address as it loads, so it is loaded once there is one to read)
async function menu() {
  const g = globalThis as unknown as { window?: { location?: unknown; addEventListener?: unknown; removeEventListener?: unknown } };
  const w = (g.window ??= {});
  w.location ??= { hash: "" };
  w.addEventListener ??= () => {};
  w.removeEventListener ??= () => {};
  return import("../src/components/layout/Sidebar");
}

const retired = new Set<string>(RETIRED_DOCUMENT_IDS);
const docs = SEED_DOCUMENTS.filter((d) => !d.isReferenceOnly && !retired.has(d.id));

test("every document that makes records has a link in the menu", async () => {
  const { menuLinkOfDocument } = await menu();
  assert.ok(docs.length > 100);
  assert.deepEqual(docs.filter((d) => !menuLinkOfDocument(d.id, d.module)).map((d) => d.id), []);
});

test("an HR format lights its own page, never the HR overview", async () => {
  const { menuLinkOfDocument } = await menu();
  assert.equal(menuLinkOfDocument("hr-training-calendar", "Human Resources"), "/hr/training-calendar");
  for (const d of docs.filter((x) => x.id.startsWith("hr-"))) assert.notEqual(menuLinkOfDocument(d.id, d.module), "/hr", d.id);
});

test("the two documents kept on another page light that page", async () => {
  const { menuLinkOfDocument } = await menu();
  assert.equal(menuLinkOfDocument("capa-complaint-ack", "CAPA (Corrective & Preventive Action)"), "/gap/internal");
  assert.equal(menuLinkOfDocument("service-agreement", "Human Resources"), "/licence/agreement");
});
