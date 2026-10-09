// THE MINUS SCORE'S WORDS IN GUJARATI (REQUIREMENTS §92; the review of 8-Oct-2026).
//
// With ગુજરાતી chosen the screens are written in English and Google Translate
// turns the page into Gujarati (i18n/googleTranslate.ts). Google made the minus
// score's "takes 10 off" into "10 runs" (a cricket score) and "each takes a 10
// discount". So the minus score's words are never handed to Google: with
// Gujarati chosen they are the reviewed Gujarati of i18n/strings.score.ts, on an
// element marked translate="no", whether Google is translating the page or
// could not be reached. The figures were kept from Google already. In English
// nothing changes.
//
// Rendered here without a browser (react-dom/server), the way the page stands
// while Google translates it: Gujarati chosen, the screens written in English
// (uiLanguageFor). What Google is handed is every text outside translate="no".
// "Today" is fixed here, never the clock.
import test from "node:test";
import assert from "node:assert/strict";
import { createElement as h, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server.edge";
import type { DocumentDefinition, RecordInstance } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { settingsRepository } from "../src/data/repositories/settingsRepository";
import { departmentOfDocument } from "../src/data/seed/departments";
import { scorecards, type Person, type PersonScore } from "../src/engine/performance";
import { uiLanguageFor } from "../src/i18n/googleTranslate";
import { SCORE_STRINGS } from "../src/i18n/strings.score";

// store/router.tsx reads window.location the moment it loads; the harness stands up none.
if (typeof (globalThis as { location?: unknown }).location === "undefined") {
  Object.defineProperty(globalThis, "location", { value: { hash: "", hostname: "localhost" }, configurable: true, writable: true });
}

ensureDocumentsSeeded();
ensureMasterSeeded();

type Key = keyof typeof SCORE_STRINGS.en;
/** The words of the minus score in one language, as i18n's tr() fills them in. */
const say = (lang: "en" | "gu", key: Key, n?: number, done?: number, due?: number): string =>
  SCORE_STRINGS[lang][key].replace(/\{n\}/g, String(n)).replace(/\{done\}/g, String(done)).replace(/\{due\}/g, String(due));

// ---------------------------------------------------------------------------
// what Google is handed

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const decode = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");

/** The markup's text, split into what Google is handed and what it is told to leave alone (translate="no", or the notranslate class). */
function split(html: string): { handed: string; kept: string } {
  const stack: boolean[] = [];
  let handed = "";
  let kept = "";
  for (const m of html.replace(/<!--[\s\S]*?-->/g, "").matchAll(/<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^'">])*?)(\/?)>|([^<]+)/g)) {
    if (m[5] !== undefined) {
      if (stack[stack.length - 1]) kept += decode(m[5]);
      else handed += decode(m[5]);
      continue;
    }
    if (m[1] === "/") {
      stack.pop();
      continue;
    }
    if (VOID.has(m[2].toLowerCase()) || m[4] === "/") continue;
    const attrs = m[3];
    stack.push(Boolean(stack[stack.length - 1]) || /\stranslate="no"/.test(attrs) || /\sclass="[^"]*\bnotranslate\b[^"]*"/.test(attrs));
  }
  assert.equal(stack.length, 0, "the markup's elements all close");
  return { handed, kept };
}

async function ui(lang: "en" | "gu") {
  settingsRepository.update({ language: lang });
  const [auth, store, router, page] = await Promise.all([
    import("../src/store/AuthContext"),
    import("../src/store/AppStore"),
    import("../src/store/router"),
    import("../src/pages/PerformancePage"),
  ]);
  const render = (el: ReactElement): string => renderToStaticMarkup(h(auth.AuthProvider, null, h(store.AppStoreProvider, null, h(router.RouterProvider, null, el))));
  return {
    page: () => split(render(h(page.PerformancePage))),
    card: (p: PersonScore) => split(render(h(page.PersonCard, { p, lang, scope: null, onOpen: () => undefined }))),
  };
}

// ---------------------------------------------------------------------------
// Jeni's card, judged on Thursday 24-Sep with every day open

const documents: DocumentDefinition[] = documentRepository.getAll();
const qcDaily = documents.find((d) => !d.isReferenceOnly && departmentOfDocument(d.id, d.formatNo) === "QC" && d.schedule.type === "daily");
assert.ok(qcDaily, "the catalogue has a QC document filled in every day");
const JENI: Person = { id: "qc-jeni", name: "Jeni", role: "staff", departments: ["QC"] };
const TODAY = "2026-09-24";
let n = 0;
function rec(dueDate: string): RecordInstance {
  n += 1;
  return {
    id: `words-${n}`,
    documentId: qcDaily!.id,
    periodKey: `${qcDaily!.id}:${dueDate}:${n}`,
    dueDate,
    status: "Due",
    isDemo: false,
    data: {},
    createdAt: `${dueDate}T03:00:00.000Z`,
    updatedAt: `${dueDate}T03:00:00.000Z`,
  } as RecordInstance;
}
/** `missed` records never done (from the 10th on) and `open` still open on their last day, today. */
function jeni(missed: number, open: number): PersonScore {
  const records = [...Array.from({ length: missed }, (_, i) => rec(`2026-09-${String(10 + i).padStart(2, "0")}`)), ...Array.from({ length: open }, () => rec(TODAY))];
  const p = scorecards(records, documents, [JENI], "this-month", TODAY, { isClosedDay: () => false }).byPerson[0];
  // Every record counted is one never done: nothing of them was done.
  assert.deepEqual([p.due, p.overdue, p.minus, p.openToday], [missed, missed, missed ? -100 : 0, open]);
  return p;
}
const CARDS: [missed: number, open: number][] = [
  [2, 3],
  [1, 1],
  [0, 0],
];
const missedWords = (lang: "en" | "gu", missed: number) =>
  missed === 0 ? say(lang, "perf.minus.none") : say(lang, missed === 1 ? "perf.minus.missedOne" : "perf.minus.missed", missed, 0, missed);
const openWords = (lang: "en" | "gu", open: number) => (open === 1 ? say(lang, "perf.minus.openToday.one") : say(lang, "perf.minus.openToday.many", open));
const occurrences = (text: string, part: string) => text.split(part).length - 1;

// ---------------------------------------------------------------------------

test("Gujarati chosen while Google translates the page: the minus score's words are the reviewed Gujarati, and Google is handed none of them", async () => {
  try {
    const at = await ui("gu");
    assert.equal(uiLanguageFor("gu"), "en", "while Google translates, the screens are written in English for it");

    // The page: the rule, the plant's tile and the heading of the three tables.
    const page = at.page();
    assert.ok(page.kept.includes(`${say("gu", "perf.minus.label")}: ${say("gu", "perf.minus.rule")}`), `the rule in the reviewed Gujarati, kept from Google: ${page.kept.slice(0, 400)}`);
    assert.ok(occurrences(page.kept, say("gu", "perf.minus.label")) >= 5, "its name on the rule, the tile and the three tables' heading");
    for (const key of Object.keys(SCORE_STRINGS.en) as Key[]) {
      const english = say("en", key, 2, 8, 10);
      assert.ok(!page.handed.includes(english.slice(0, 24)), `Google is not handed "${english}"`);
    }
    assert.ok(!page.handed.includes("Minus score") && !page.handed.includes("10 off") && !page.handed.includes(say("gu", "perf.minus.label")), page.handed.slice(0, 300));

    // Each card's band and its line of what is still open today.
    for (const [missed, open] of CARDS) {
      const card = at.card(jeni(missed, open));
      assert.ok(card.kept.includes(`${say("gu", "perf.minus.label")} ${missedWords("gu", missed)}`), `${missed} never done, in Gujarati: ${card.kept}`);
      if (open) assert.ok(card.kept.includes(openWords("gu", open)), `${open} still open today, in Gujarati: ${card.kept}`);
      for (const english of [say("en", "perf.minus.label"), missedWords("en", missed), openWords("en", Math.max(open, 1)), "10 off", "still open today"]) {
        assert.ok(!card.handed.includes(english) && !card.kept.includes(english), `"${english}" is not on the card at all: ${card.handed}`);
      }
      for (const gu of [say("gu", "perf.minus.label"), missedWords("gu", missed), openWords("gu", Math.max(open, 1))]) {
        assert.ok(!card.handed.includes(gu), `Google is not handed "${gu}" to translate again`);
      }
      // What Google mistook them for (the review's evidence): never on the page.
      assert.ok(!/રન|ડિસ્કાઉન્ટ/.test(card.kept + card.handed), card.kept);
    }
  } finally {
    settingsRepository.update({ language: "en" });
  }
});

test("English chosen: the minus score's words are the English ones, as they were", async () => {
  const at = await ui("en");
  const page = at.page();
  assert.ok(page.handed.includes(`${say("en", "perf.minus.label")}: ${say("en", "perf.minus.rule")}`), page.handed.slice(0, 300));
  assert.ok(!page.kept.includes(say("en", "perf.minus.label")), "nothing in English is held back: Google is never loaded in English");
  for (const [missed, open] of CARDS) {
    const card = at.card(jeni(missed, open));
    assert.ok(card.handed.includes(`${say("en", "perf.minus.label")} ${missedWords("en", missed)}`), card.handed);
    if (open) assert.ok(card.handed.includes(openWords("en", open)), card.handed);
    assert.ok(!/[\u0A80-\u0AFF]/.test(card.handed + card.kept), "no Gujarati in English");
  }
});
