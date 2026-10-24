// MITRA FOLLOWS WHAT IS OPEN, AND OPENS WHEN ASKED (REQUIREMENTS §123, amending §60). The owner, 24-Oct-2026: "bot
// will see where i am going and what i am doing like and whenever i open any record bot will open in side as it
// opening right now but when user will click on it then only otherwise not".
//   * on a format's own page the launcher stays the launcher — shut, the same pill the suites and the tour look for —
//     and its title names the format in the words Mitra's greeting uses, with Mitra's face glancing at the page;
//   * where nothing is open, the title says what is waiting, as before, and the face looks straight out.
// That the panel stays shut when a document is opened, docks on a click and greets the document then, is the
// browser's to prove: tests/e2e_qc_formats.py, "MITRA FOLLOWS THE DOCUMENT, AND OPENS WHEN ASKED".
// Run: npm run test:unit -- mitraFollows
import test from "node:test";
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server.edge";

// store/router.tsx reads window.location as it draws: the address is set before each render.
const address = { hash: "", hostname: "localhost" };
Object.defineProperty(globalThis, "location", { value: address, configurable: true, writable: true });

async function widgetAt(hash: string): Promise<string> {
  address.hash = hash;
  const [auth, store, router, assistant, documents, widget] = await Promise.all([
    import("../src/store/AuthContext"),
    import("../src/store/AppStore"),
    import("../src/store/router"),
    import("../src/store/AssistantContext"),
    import("../src/data/repositories/documentRepository"),
    import("../src/components/common/DocumentAssistant"),
  ]);
  documents.ensureSeeded();
  return renderToStaticMarkup(
    h(auth.AuthProvider, null, h(store.AppStoreProvider, null, h(router.RouterProvider, null, h(assistant.AssistantProvider, null, h(widget.DocumentAssistant)))))
  );
}

const pillIn = (html: string): string => html.match(/<button class="btn btn-primary assistant-pill[\s\S]*?<\/button>/)?.[0] ?? "";
const titleOf = (pill: string): string => pill.match(/ title="([^"]*)"/)?.[1] ?? "";

test("on a format's own page Mitra stays shut, its pill naming the format as the greeting does, its eyes on the page", async () => {
  const html = await widgetAt("#/document/qc-pvc-pet-film");
  assert.match(html, /^<div class="no-print" data-assistant="closed"/, "shut: no panel nobody asked for");
  const pill = pillIn(html);
  assert.equal(titleOf(pill), "Ask Mitra about F/QC/05 Inspection Record - PVC / PET Film");
  assert.match(pill, /<span class="assistant-pill-face" aria-hidden="true"><svg[^>]*style="--mf-lx:-0.6;--mf-ly:0"/, "the face glances at the page");
  assert.match(pill, /<\/svg><\/span>Ask Mitra<\/button>$/, "and is otherwise the same launcher");
});

test("where nothing is open, the pill says what is waiting, as before, and Mitra looks straight out", async () => {
  const pill = pillIn(await widgetAt("#/dashboard"));
  assert.ok(pill, "the launcher is drawn");
  assert.doesNotMatch(titleOf(pill), /^Ask Mitra about/);
  assert.doesNotMatch(pill, /--mf-lx/);
});
