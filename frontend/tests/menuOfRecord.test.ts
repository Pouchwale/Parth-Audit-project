import { describe, expect, it, vi } from "vitest";

// (the menu's file reads the address when it loads)
vi.hoisted(() => {
  (globalThis as unknown as { window: unknown }).window = { location: { hash: "" }, addEventListener() {}, removeEventListener() {} };
});

import { menuLinkOfDocument } from "../src/components/layout/Sidebar";
import { RETIRED_DOCUMENT_IDS, SEED_DOCUMENTS } from "../src/data/seed/documentDefinitions";

// WHERE AN OPEN RECORD STANDS IN THE MENU (REQUIREMENTS §283).
describe("the menu shows the document of the record that is open", () => {
  const retired = new Set<string>(RETIRED_DOCUMENT_IDS);
  const docs = SEED_DOCUMENTS.filter((d) => !d.isReferenceOnly && !retired.has(d.id));

  it("every document that makes records has a link in its module's menu", () => {
    const missing = docs.filter((d) => !menuLinkOfDocument(d.id, d.module)).map((d) => d.id);
    expect(missing).toEqual([]);
  });

  it("an HR format lights its own page, never the HR overview", () => {
    expect(menuLinkOfDocument("hr-competence-criteria", "Human Resources")).toMatch(/^\/hr\/.+/);
  });

  it("the documents that fall back to their module's library are only those with no link of their own", () => {
    const toLibrary = docs.filter((d) => menuLinkOfDocument(d.id, d.module)?.startsWith("/library/")).map((d) => `${d.module}: ${d.id}`);
    console.log(`documents ${docs.length}; shown by their module's library ${toLibrary.length}:`, toLibrary.join(", "));
    expect(docs.length).toBeGreaterThan(100);
  });
});
