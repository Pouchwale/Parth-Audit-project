// MITRA'S FACE AND ITS MOODS (REQUIREMENTS §122; the owner, 24-Oct-2026: "add more capabilites and emotions like
// mitra is enjoying on every task that user will complete and sad, angry and it should be like fun to complete the
// task ... add cartoon in login when user login and entering his password then that cartoon will closing eye").
// The pure mood rule, the face's drawn states (a server-side render carries them whole), and the stylesheet's part:
// the blink, the pop of joy, the sign-in mascot's size.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server.edge";
import { MitraFace } from "../src/components/common/MitraFace";
import { MOOD_LIFT_MS, moodFor } from "../src/engine/mitraMood";

const css = readFileSync(path.join(process.env.DCRS_REPO_ROOT ?? process.cwd(), "frontend", "src", "styles.css"), "utf8").replace(/\r\n/g, "\n");

test("how Mitra feels: joy on work done, a dip on a send-back, sad then cross as overdue work piles, calm while some is due", () => {
  assert.equal(moodFor({ waiting: 0, overdue: 0 }), "happy");
  assert.equal(moodFor({ waiting: 2, overdue: 0 }), "calm");
  assert.equal(moodFor({ waiting: 2, overdue: 1 }), "sad");
  assert.equal(moodFor({ waiting: 5, overdue: 3 }), "upset");
  // A burst of feeling sits on top of the day's standing, whatever it is.
  assert.equal(moodFor({ waiting: 5, overdue: 3, lift: "joy" }), "joy", "a record just handed in delights Mitra even on a hard day");
  assert.equal(moodFor({ waiting: 0, overdue: 0, lift: "sad" }), "sad", "a send-back dips the face for a moment");
  assert.ok(MOOD_LIFT_MS >= 3000 && MOOD_LIFT_MS <= 10000, "the burst lasts seconds, not the day");
});

test("the face is one bare svg a server-side render carries: its mood and eyes on it as data", () => {
  const html = renderToStaticMarkup(h(MitraFace));
  assert.match(html, /^<svg class="mitra-face" data-mood="happy" data-eyes="open"/, "no wrapper: the chat avatar's own span stays `<span class=\"chat-avatar\"...><svg`");
  assert.match(html, /aria-hidden="true"/);
  assert.equal(html.match(/<ellipse/g)?.length, 2, "two open eyes");
  assert.doesNotMatch(html, /mf-lids/);
  assert.match(html, /class="mf-mouth" d="M11 19\.8/, "the happy smile");
});

test("eyes closed for a password: the lids drawn shut, nothing left to blink", () => {
  const html = renderToStaticMarkup(h(MitraFace, { eyes: "closed", mood: "happy" }));
  assert.match(html, /data-eyes="closed"/);
  assert.doesNotMatch(html, /<ellipse/, "no open eye remains");
  assert.equal(html.match(/<path/g)!.length >= 4, true, "two shut lids, two brows and the mouth are drawn");
  assert.match(html, /class="mf-lids"/);
});

test("each mood is drawn: joy's open smile is filled, upset's mouth is a line, and a glance is clamped to the face", () => {
  assert.match(renderToStaticMarkup(h(MitraFace, { mood: "joy" })), /class="mf-mouth mf-mouth-open" d="M10\.6 19\.4/);
  assert.match(renderToStaticMarkup(h(MitraFace, { mood: "upset" })), /d="M11\.8 21\.9 L20\.2 21\.9"/);
  assert.match(renderToStaticMarkup(h(MitraFace, { mood: "sad" })), /data-mood="sad"/);
  const glance = renderToStaticMarkup(h(MitraFace, { look: { x: 5, y: -5 } }));
  assert.match(glance, /--mf-lx:1/, "a look past the edge is held to it");
  assert.match(glance, /--mf-ly:-1/);
});

test("the stylesheet gives the face its life: the blink, the moods' brows, the pop of joy, the sign-in mascot's size", () => {
  assert.match(css, /\.mitra-face \.mf-eyes \{[^}]*animation: mf-blink [^}]*infinite/, "the blink (named in mitraLook's inventory)");
  assert.match(css, /@keyframes mf-blink/);
  assert.match(css, /\.mitra-face\[data-mood="upset"\] \.mf-brow-l \{ transform: rotate\(13deg\)/, "cross brows");
  assert.match(css, /\.assistant-pill\.is-celebrating \.assistant-pill-face \{ animation: mf-pop 180ms ease; \}/, "the pop of joy, 120-200 ms as the look test holds Mitra to");
  assert.match(css, /\.auth-mascot \.mitra-face \{ width: 68px; height: 68px;/, "the sign-in cartoon is big enough to greet");
  assert.match(css, /\.sound-toggle \.voice-pulse \{[^}]*background: var\(--accent\)/, "the sound button's speaking dot speaks, not alarms");
  // Stillness lives in the stylesheet's FINAL reduced-motion block (it must come last to win the cascade).
  const reduce = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
  assert.match(reduce, /\.mitra-face \.mf-eyes[\s\S]*?animation: none !important/, "the blink stands still for whoever asked for it");
  assert.match(reduce, /\.mitra-face \.mf-brow, \.mitra-face \.mf-eyes ellipse, \.mitra-face \.mf-blush \{ transition: none; \}/);
});
