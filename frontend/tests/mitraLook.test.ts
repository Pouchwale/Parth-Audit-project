// MITRA'S LOOK (2-Oct-2026): the Ask Mitra page, the dock's launcher and the
// chat's stylesheet, judged without a browser.
//   * the page keeps every hook the suites drive: at least four suggestion
//     cards and no message in the welcome, one box to type in, one Send /
//     attach / microphone, New chat first in the conversations' head, the
//     status label; the suggestions carry a picture each; the phone card is
//     there, folded, and screen only;
//   * the launcher still says "Ask Mitra", is the only button that does, wears
//     Mitra's face, and leaves its shape to the stylesheet;
//   * the stylesheet moves only transforms and opacity (no box-shadow pulse on
//     Mitra's face any more), each chat movement in 120-200 ms, no new endless
//     animation, no backdrop-filter, no text-transform on the chat, nothing a
//     suite reads hidden (Send only while Stop stands in its place), the dock's
//     geometry as the suites measure it, and the reduced-motion block last,
//     switching every one of Mitra's movements off.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement as h, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server.edge";

// store/router.tsx reads window.location the moment it loads; the harness stands up none.
if (typeof (globalThis as { location?: unknown }).location === "undefined") {
  Object.defineProperty(globalThis, "location", { value: { hash: "", hostname: "localhost" }, configurable: true, writable: true });
}

const repoRoot = process.env.DCRS_REPO_ROOT ?? process.cwd();
const appCss = readFileSync(path.join(repoRoot, "frontend", "src", "styles.css"), "utf8");

// ---------------------------------------------------------------------------
// a small reader for the stylesheet

const uncommented = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

function blocks(css: string): { prelude: string; body: string }[] {
  const out: { prelude: string; body: string }[] = [];
  let depth = 0;
  let start = 0;
  let open = -1;
  for (let i = 0; i < css.length; i++) {
    if (css[i] === "{") {
      if (depth === 0) open = i;
      depth++;
    } else if (css[i] === "}") {
      depth--;
      if (depth === 0) {
        out.push({ prelude: css.slice(start, open).trim(), body: css.slice(open + 1, i) });
        start = i + 1;
      }
    }
  }
  assert.equal(depth, 0, "the braces balance");
  return out;
}

function declarations(body: string): [string, string][] {
  return body
    .split(";")
    .map((d) => d.trim())
    .filter((d) => d.includes(":"))
    .map((d) => [d.slice(0, d.indexOf(":")).trim(), d.slice(d.indexOf(":") + 1).trim()] as [string, string]);
}

interface Rule {
  media: string;
  selectors: string[];
  decls: [string, string][];
}

function rulesOf(css: string, media = ""): Rule[] {
  const out: Rule[] = [];
  for (const b of blocks(css)) {
    if (/^@(media|supports)/.test(b.prelude)) out.push(...rulesOf(b.body, b.prelude));
    else if (b.prelude.startsWith("@")) continue;
    else out.push({ media, selectors: b.prelude.split(",").map((s) => s.trim()), decls: declarations(b.body) });
  }
  return out;
}

const css = uncommented(appCss);
const RULES = rulesOf(css);
const MITRA = /chat-|mitra-|assistant-|voice-pulse/;
const REDUCE = "@media (prefers-reduced-motion: reduce)";
const ms = (value: string): number[] => [...value.matchAll(/(-?[\d.]+)(ms|s)\b/g)].map((m) => (m[2] === "s" ? parseFloat(m[1]) * 1000 : parseFloat(m[1])));

// ---------------------------------------------------------------------------
// the page and the launcher

async function providers() {
  const [auth, store, router, assistant] = await Promise.all([
    import("../src/store/AuthContext"),
    import("../src/store/AppStore"),
    import("../src/store/router"),
    import("../src/store/AssistantContext"),
  ]);
  return (el: ReactElement): string =>
    renderToStaticMarkup(h(auth.AuthProvider, null, h(store.AppStoreProvider, null, h(router.RouterProvider, null, h(assistant.AssistantProvider, null, el)))));
}

const count = (html: string, what: RegExp): number => html.match(new RegExp(what.source, "g"))?.length ?? 0;

test("the Ask Mitra page keeps every hook the suites drive, with a picture on each suggestion and the phone card folded", async () => {
  const render = await providers();
  const { AssistantPage } = await import("../src/pages/AssistantPage");
  const html = render(h(AssistantPage));
  const welcome = html.slice(html.indexOf('class="assistant-welcome"'), html.indexOf('class="mitra-composer-area'));
  assert.ok(welcome.length > 0, "an empty conversation shows the welcome");
  assert.ok(count(html, /class="assistant-suggestion"/) >= 4, "at least four suggestions (e2e_smoke, visual_qa)");
  assert.equal(count(html, /class="assistant-suggestion"/), count(html, /class="assistant-suggestion-icon" aria-hidden="true"><svg/), "each with its picture");
  assert.doesNotMatch(welcome, /chat-msg/, "no message in the welcome (a suite counts four after two exchanges)");
  assert.match(welcome, /<button type="button" class="chat-chip primary" data-action="guide-home" data-chip="guide">Where would you like to go\?<\/button>/);
  assert.equal(count(html, /<textarea/), 1, "one box to type in");
  assert.match(html, /<textarea[^>]*class="input assistant-input mitra-input"/);
  for (const action of ["send", "attach", "voice"]) assert.equal(count(html, new RegExp(`data-action="${action}"`)), 1, `one ${action}`);
  assert.match(html, /<div class="assistant-side-head"><span class="assistant-side-title">Conversations<\/span><button class="btn btn-primary btn-sm" aria-label="New chat">/, "New chat is the first button in the conversations' head");
  assert.match(html, /class="mitra-status" data-state="(ready|offline)"/);
  assert.match(html, /<span class="chat-avatar" aria-hidden="true"><svg/, "Mitra's face in the head, sized by the stylesheet");
  assert.match(html, /class="assistant-side-empty"[\s\S]*No chats yet[\s\S]*Your chats with Mitra will be listed here\./, "a kind empty list");
  assert.match(html, /<section class="mitra-phone no-print" data-section="mitra-phone"/, "the phone card, screen only");
  assert.doesNotMatch(html, /<svg class="mitra-qr"/, "its code drawn only when it is opened");
  assert.doesNotMatch(html, /<button[^>]*>(?:(?!<\/button>)[\s\S])*Ask Mitra(?:(?!<\/button>)[\s\S])*<\/button>/, "no button on the page says Ask Mitra");
  assert.match(html, /<div class="mitra-footer"><svg[^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/svg><span>The assistant never submits or verifies anything by itself\.<\/span><\/div>/);
});

test("the launcher says Ask Mitra, alone, wears Mitra's face, and leaves its shape to the stylesheet", async () => {
  const render = await providers();
  const { DocumentAssistant } = await import("../src/components/common/DocumentAssistant");
  const html = render(h(DocumentAssistant));
  assert.match(html, /^<div class="no-print" data-assistant="closed" style="position:fixed;right:20px;bottom:20px;z-index:50">/, "closed, fixed bottom right as before");
  const buttons = [...html.matchAll(/<button[\s\S]*?<\/button>/g)].map((m) => m[0]);
  const asking = buttons.filter((b) => b.replace(/<[^>]+>/g, "").includes("Ask Mitra"));
  assert.equal(asking.length, 1, "exactly one button says Ask Mitra");
  const pill = asking[0];
  assert.match(pill, /^<button class="btn btn-primary assistant-pill" title="[^"]*"/, "the class the tour and the suites look for");
  assert.doesNotMatch(pill, /style=/, "its radius, shadow and grab cursor come from styles.css now");
  assert.match(pill, /<span class="assistant-pill-face" aria-hidden="true"><svg[\s\S]*?<\/svg><\/span>Ask Mitra<\/button>$/, "the face, then the words, exactly");
});

test("the agent's own parts keep their hooks: steps, the thinking line, options, cites, who answered, Copy", async () => {
  // Only the agent path (a model) draws these, so the suites' e2e_mitra_agent mocks one; here the
  // component itself is drawn with each part, as the agent and the fallback give them.
  const render = await providers();
  const { MitraMessage } = await import("../src/components/mitra/MitraMessage");
  const noop = () => {};
  const html = render(
    h(MitraMessage, {
      message: {
        id: "b1",
        role: "bot",
        text: "**Done.** Opened Insights.",
        steps: [
          { id: "s1", tool: "navigate", label: "Opened Insights", status: "done" },
          { id: "s2", tool: "edit_open_record", label: "Filled 4 boxes", status: "running" },
          { id: "s3", tool: "search_records", label: "Searched", status: "failed" },
        ],
        options: ["Yes", "No"],
        cites: [{ recordId: "seed-mnt-lux-2025", label: "F/QC/11 — 12-Aug-2025", route: "/record/seed-mnt-lux-2025" }],
        offline: "not-configured",
        chips: [{ label: "Open it again", action: { type: "navigate", route: "/insights" } }],
      },
      onChip: noop,
      onOption: noop,
      onCite: noop,
    })
  );
  assert.match(html, /^<div class="mitra-turn bot" data-message="b1"><span class="chat-avatar" aria-hidden="true"><svg/, "Mitra's turn, with its face");
  for (const [tool, status] of [["navigate", "done"], ["edit_open_record", "running"], ["search_records", "failed"]]) {
    assert.match(html, new RegExp(`class="mitra-step" data-tool="${tool}" data-status="${status}"`), `${tool} ${status}`);
  }
  assert.match(html, /<div class="chat-msg bot mitra-md"[^>]*><p><strong>Done\.<\/strong> Opened Insights\.<\/p><\/div>/, "the words, with strong inside .chat-msg.bot");
  assert.match(html, /<div class="chat-aside" data-offline="not-configured">/, "who answered");
  assert.match(html, /<div class="chat-chips" data-section="cites"><button type="button" class="chat-chip mitra-cite" data-cite="seed-mnt-lux-2025">/);
  assert.match(html, /<div class="mitra-options"><button type="button" class="chat-chip" data-option="Yes">Yes<\/button><button type="button" class="chat-chip" data-option="No">No<\/button>/);
  assert.match(html, /<div class="chat-chips"><button type="button" class="chat-chip " data-chip="navigate">Open it again<\/button><\/div>/, "a chip's words exactly, nothing added");
  assert.match(html, /data-action="copy-message"[^>]*aria-label="Copy message"/);
  const pending = render(h(MitraMessage, { message: { id: "b2", role: "bot", text: "", pending: true }, onChip: noop, onOption: noop, onCite: noop }));
  assert.match(pending, /<span class="chat-avatar is-thinking" aria-hidden="true">/, "the face says it is answering");
  assert.match(pending, /<div class="mitra-thinking" role="status" aria-live="polite">Mitra is thinking…<\/div>/);
  assert.doesNotMatch(pending, /copy-message/, "no Copy while the words are still coming");
});

// ---------------------------------------------------------------------------
// the stylesheet

test("every animation in styles.css moves transform or opacity alone; Mitra's face no longer pulses a shadow", () => {
  for (const m of css.matchAll(/@keyframes\s+([\w-]+)\s*\{/g)) {
    // The frames of this @keyframes: the block that opens at the brace just matched.
    const at = m.index! + m[0].length - 1;
    let depth = 0;
    let end = at;
    for (let i = at; i < css.length; i++) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}" && --depth === 0) {
        end = i;
        break;
      }
    }
    const frames = css.slice(at + 1, end);
    for (const [prop] of declarations(frames.replace(/[^{}]*\{([^}]*)\}/g, "$1;"))) {
      assert.ok(prop === "transform" || prop === "opacity" || prop === "animation-timing-function", `@keyframes ${m[1]} animates ${prop}`);
    }
  }
  assert.doesNotMatch(css, /backdrop-filter/, "nothing blurs what lies behind it (a repaint on every scroll on the plant's laptops)");
  const thinking = RULES.filter((r) => r.selectors.includes(".chat-avatar.is-thinking"));
  for (const r of thinking) {
    assert.ok(!r.decls.some(([p, v]) => p === "animation" && !/^none/.test(v)), "the face itself does not animate");
    assert.ok(!r.decls.some(([p]) => p === "box-shadow"), "nor wear a ring of shadow");
  }
  assert.ok(RULES.some((r) => r.selectors.includes(".chat-avatar.is-thinking::after") && r.decls.some(([p, v]) => p === "animation" && /chat-avatar-thinking/.test(v))), "the ring is its own element");
});

test("no new endless animation, and each of Mitra's movements takes 120-200 ms", () => {
  const endless = RULES.filter((r) => !r.media.includes("reduce") && r.decls.some(([p, v]) => p === "animation" && /infinite/.test(v))).flatMap((r) => r.selectors);
  assert.deepEqual(
    [...new Set(endless)].sort(),
    [".chat-avatar.is-thinking::after", ".chat-typing span", ".conn-spin", ".mitra-recording::before", ".mitra-spin", ".mitra-thinking", ".voice-pulse"].sort(),
    "only the live signs that were there before: typing dots, the thinking line and ring, spinners, the recording dot"
  );
  for (const r of RULES) {
    if (r.media.includes("reduce") || !r.selectors.some((s) => MITRA.test(s))) continue;
    for (const [p, v] of r.decls) {
      // The launcher's wave (three slow waves on arrival) and the reaction toast are not the chat's own movement.
      if (p !== "animation" || v === "none" || /infinite/.test(v) || /assistant-pill-wave|mitra-reaction-in/.test(v)) continue;
      const [duration] = ms(v);
      assert.ok(duration >= 120 && duration <= 200, `${r.selectors.join(", ")}: ${v}`);
    }
  }
});

test("transitions on the chat move transform or opacity only; no text is transformed; nothing a suite reads is hidden", () => {
  for (const r of RULES) {
    if (!r.selectors.some((s) => MITRA.test(s))) continue;
    for (const [p, v] of r.decls) {
      if (p === "transition" && v !== "none") {
        // Split on the commas between transitions, not those inside a cubic-bezier( … ).
        for (const part of v.split(/,(?![^(]*\))/)) assert.match(part.trim(), /^(transform|opacity)\s/, `${r.selectors.join(", ")}: transition ${v}`);
      }
      assert.notEqual(p, "text-transform", `${r.selectors.join(", ")}: inner_text reads the stylesheet, so no text is transformed`);
    }
  }
  // Hidden, and allowed to be: none of these is anything a suite reads or clicks.
  const allowed = new Set([
    ".assistant-side.is-collapsed",
    ".is-compact .mitra-turn > .chat-avatar",
    ".mitra-composer.is-stoppable > .mitra-send",
    ".assistant-suggestion-ask",
  ]);
  const hooks = /mitra-send|mitra-stop|mitra-msg-action|mitra-attach\b|mitra-mic|chat-msg|chat-chip|assistant-suggestion\b|assistant-pill|assistant-input|mitra-input|assistant-voice-note|mitra-attachment\b|mitra-step\b|mitra-thinking|chat-typing/;
  for (const r of RULES) {
    if (!r.decls.some(([p, v]) => (p === "display" && v.startsWith("none")) || (p === "visibility" && v.startsWith("hidden")))) continue;
    for (const s of r.selectors) {
      if (!MITRA.test(s)) continue;
      assert.ok(allowed.has(s) || !hooks.test(s), `${s} is hidden by ${r.media || "the stylesheet"}`);
    }
  }
  assert.ok(RULES.some((r) => r.selectors.includes(".mitra-composer.is-stoppable > .mitra-send") && r.decls.some(([p, v]) => p === "display" && v === "none")), "Send gives way to Stop only while an answer can be stopped");
  // Copy and Edit fade (opacity) and are never taken away: always there for a pointer and for a suite.
  const actions = RULES.filter((r) => r.selectors.some((s) => /mitra-msg-actions?\b/.test(s)));
  assert.ok(actions.length > 0);
  for (const r of actions) for (const [p, v] of r.decls) assert.ok(!(p === "display" && v.startsWith("none")) && !(p === "visibility" && v.startsWith("hidden")), `${r.selectors.join(", ")}: ${p}: ${v}`);
});

test("the dock keeps the geometry the suites measure, and the reduced-motion block comes last and stills every movement", () => {
  assert.match(css, /--assistant-dock-width:\s*380px;/);
  assert.ok(RULES.some((r) => r.selectors.includes(".assistant-dock") && ["position:fixed", "top:0", "right:0", "bottom:0", "width:var(--assistant-dock-width)"].every((d) => r.decls.some(([p, v]) => `${p}:${v}` === d))), "flush right, top 0, its own width");
  assert.ok(RULES.some((r) => r.selectors.includes("html.assistant-docked .app-main") && r.decls.some(([p, v]) => p === "margin-right" && v === "var(--assistant-dock-width)") && r.media === ""), "the page makes room, in one step");
  const top = blocks(css);
  const last = top[top.length - 1];
  assert.equal(last.prelude, REDUCE, "the reduced-motion block is the stylesheet's last word");
  const stilled = new Set(
    rulesOf(last.body)
      .filter((r) => r.decls.some(([p, v]) => p === "animation" && /^none/.test(v)))
      .flatMap((r) => r.selectors)
  );
  for (const r of RULES) {
    if (r.media.includes("reduce")) continue;
    for (const [p, v] of r.decls) {
      if (p !== "animation" || v === "none") continue;
      for (const s of r.selectors) if (MITRA.test(s)) assert.ok(stilled.has(s), `${s} (${v}) stands still under reduced motion`);
    }
  }
  const unmoved = new Set(rulesOf(last.body).filter((r) => r.decls.some(([p, v]) => p === "transition" && v === "none")).flatMap((r) => r.selectors));
  for (const s of [".chat-chip", ".assistant-pill", ".assistant-suggestion"]) assert.ok(unmoved.has(s), `${s}: no transition under reduced motion`);
});
