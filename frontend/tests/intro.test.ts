// THE OPENING IN MOTION GRAPHICS AND THE FONTS (REQUIREMENTS §81, §84, §85), judged
// without a browser: where and when the opening plays (EVERY time the sign-in
// screen is shown, holding the form until it is over or skipped; a signed-in
// session's opening once a session, catching nothing), what lifts it (Skip and
// Escape for a person; the first thing typed under automation), that it takes its
// time — about five seconds — and can never stay (its own timer, a hard stop at
// 6 s, its stylesheet, and the sign-in screen's own timer), the calm version for
// somebody who asks for less motion (fades and glows, nothing travelling); the
// site-wide movement of delight.css (screen only, never under reduced motion,
// transforms and opacity only, nothing left moved); and the fonts — self-hosted,
// licensed, light, the Gujarati files fetched only for Gujarati text, and the
// printed forms left in the face they have always had.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import {
  INTRO_CALM_MS,
  INTRO_CALM_TIMELINE,
  INTRO_COMPANY,
  INTRO_HARD_STOP_MS,
  INTRO_MODULE_MARKS,
  INTRO_MS,
  INTRO_PLAIN_MS,
  INTRO_REVEAL_MS,
  INTRO_SEEN_KEY,
  INTRO_SKIP_MS,
  INTRO_STREAKS,
  INTRO_TIMELINE,
  OPENING_WINDOW_MS,
  introHoldsPage,
  introKindFor,
  introLengthFor,
  introLiftEvents,
  introWanted,
  introWantedFor,
  markIntroSeen,
  readIntroEnvironment,
  underAutomation,
} from "../src/components/auth/IntroSplash";
import { INTRO_STRINGS } from "../src/i18n/strings.intro";
import { tr } from "../src/i18n";

const repoRoot = process.env.DCRS_REPO_ROOT ?? process.cwd();
const frontend = path.join(repoRoot, "frontend");
const brandCss = readFileSync(path.join(frontend, "public", "styles", "brand.css"), "utf8");
const delightCss = readFileSync(path.join(frontend, "public", "styles", "delight.css"), "utf8");
const indexHtml = readFileSync(path.join(frontend, "index.html"), "utf8");
const appCss = readFileSync(path.join(frontend, "src", "styles.css"), "utf8");
const authDir = path.join(frontend, "src", "components", "auth");
const screenSrc = readFileSync(path.join(authDir, "AuthScreen.tsx"), "utf8");
const layoutSrc = readFileSync(path.join(authDir, "AuthLayout.tsx"), "utf8");
const splashSrc = readFileSync(path.join(authDir, "IntroSplash.tsx"), "utf8");

/** A stylesheet without its comments. */
const uncommented = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** The top-level blocks of a stylesheet: each block's prelude and its body (braces matched). */
function blocks(css: string): { prelude: string; body: string }[] {
  const out: { prelude: string; body: string }[] = [];
  const src = uncommented(css);
  let depth = 0;
  let start = 0;
  let open = -1;
  for (let i = 0; i < src.length; i++) {
    if (src[i] === "{") {
      if (depth === 0) open = i;
      depth++;
    } else if (src[i] === "}") {
      depth--;
      if (depth === 0) {
        out.push({ prelude: src.slice(start, open).trim(), body: src.slice(open + 1, i) });
        start = i + 1;
      }
    }
  }
  assert.equal(depth, 0, "the braces balance");
  assert.equal(src.slice(start).trim(), "", "nothing is left outside a block");
  return out;
}

/** A block of declarations as [property, value] pairs. */
function declarations(body: string): [string, string][] {
  return body
    .split(";")
    .map((d) => d.trim())
    .filter(Boolean)
    .map((d) => [d.slice(0, d.indexOf(":")).trim(), d.slice(d.indexOf(":") + 1).trim()] as [string, string]);
}

/** Every `animation` shorthand's time values, in ms: [duration, delay]. */
function animationTimes(decl: string): number[] {
  return [...decl.matchAll(/(-?[\d.]+)(ms|s)\b/g)].map((m) => (m[2] === "s" ? parseFloat(m[1]) * 1000 : parseFloat(m[1])));
}

/** The brand.css section of the opening, up to its reduced-motion block. */
const openingCss = (() => {
  const from = brandCss.indexOf("---- 3b.");
  const to = brandCss.lastIndexOf("@media (prefers-reduced-motion: reduce)");
  assert.ok(from > 0 && to > from, "brand.css has the opening's section, then its reduced-motion block");
  return uncommented(brandCss.slice(from, to));
})();

/** delight.css in two: the site-wide movement (sections 1-5), and what §85 added to the opening (section 6). */
const SECTION_6 = "---- 6. The opening";
const [siteCss, openingPlusCss] = (() => {
  const at = delightCss.indexOf(SECTION_6);
  assert.ok(at > 0, "delight.css has the opening's own section, after the site-wide movement");
  // The section's heading comment starts a few characters before its title.
  const cut = delightCss.lastIndexOf("/*", at);
  return [delightCss.slice(0, cut), delightCss.slice(cut)];
})();

const OLD_STACK = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

/** The @font-face blocks of brand.css, each as its descriptors. */
function fontFaces(): Record<string, string>[] {
  return [...brandCss.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => {
    const out: Record<string, string> = {};
    for (const decl of m[1].split(";")) {
      const i = decl.indexOf(":");
      if (i > 0) out[decl.slice(0, i).trim()] = decl.slice(i + 1).trim();
    }
    return out;
  });
}

/** Whether a CSS unicode-range covers a code point. */
function covers(range: string, cp: number): boolean {
  return range.split(",").some((part) => {
    const [a, b] = part.trim().replace(/^U\+/i, "").split("-");
    const lo = parseInt(a, 16);
    const hi = b === undefined ? lo : parseInt(b, 16);
    return cp >= lo && cp <= hi;
  });
}

test("the sign-in screen plays the opening EVERY time it is shown; a session's app, once a session", () => {
  // REQUIREMENTS §85: the owner never saw it — it played once a tab, in the first seconds, and a
  // reload, a sign-out or the next morning found it already seen. The sign-in screen asks nothing now:
  // it draws the opening each time it is drawn itself.
  assert.match(screenSrc, /<IntroSplash place="signin" onRelease=\{release\} \/>/, "drawn unconditionally, as the sign-in screen's own");
  assert.doesNotMatch(screenSrc, /introWanted|\{intro &&/, "no 'once a session' question on the sign-in screen");
  // A signed-in session's opening (SessionIntro) keeps its rule from §81/§84.
  const fresh = { reducedMotion: false, seenThisSession: false, msSinceOpen: 400 };
  assert.equal(introWantedFor(fresh), true);
  assert.equal(introWantedFor({ ...fresh, seenThisSession: true }), false, "already played in this browser session");
  assert.equal(introWantedFor({ ...fresh, msSinceOpen: OPENING_WINDOW_MS + 1 }), false, "a session's app reached long after the page opened");
  assert.equal(introWantedFor({ ...fresh, msSinceOpen: OPENING_WINDOW_MS }), true);
  assert.match(splashSrc, /export function SessionIntro\(\) \{\s*const \[intro\] = useState\(introWanted\);\s*return intro \? <IntroSplash place="session" \/> : null;/);
  // The kinds: the full sequence; with less motion, the calm version on the sign-in screen, the plain fade over the app.
  assert.equal(introKindFor({ reducedMotion: false }, "signin"), "motion");
  assert.equal(introKindFor({ reducedMotion: false }, "session"), "motion");
  assert.equal(introKindFor({ reducedMotion: true }, "signin"), "calm", "less motion on the sign-in screen: still motion graphics, gently");
  assert.equal(introKindFor({ reducedMotion: true }, "session"), "plain", "a session's opening: the plain fade, as before");
  assert.equal(introKindFor({ reducedMotion: true }), "plain", "a session's opening is the default place");
});

test("before the form can be used: it holds the page for a person, lifts only on Skip or Escape — and yields to automation", () => {
  assert.equal(introHoldsPage("signin", false), true, "a person: the form waits for the opening");
  assert.equal(introHoldsPage("signin", true), false, "automation (navigator.webdriver): the form is never held");
  assert.equal(introHoldsPage("session", false), false, "a session's opening holds nothing");
  assert.deepEqual([...introLiftEvents("signin", false)], [], "a person: no stray click or key lifts it (only Skip and Escape)");
  assert.deepEqual([...introLiftEvents("signin", true)].sort(), ["focusin", "keydown", "pointerdown", "touchstart", "wheel"], "automation: the first thing typed, clicked or focused");
  assert.deepEqual([...introLiftEvents("session", false)].sort(), ["keydown", "pointerdown", "touchstart", "wheel"], "a session's opening: as before");
  // The sign-in screen: the form inert while held, and let go by a timer of its own at the hard stop.
  assert.match(screenSrc, /inert=\{holding\}/);
  assert.match(screenSrc, /style=\{\{ display: "contents" \}\}/, "the holding wrapper has no box of its own: the layout is unchanged");
  assert.match(screenSrc, /setTimeout\(release, INTRO_HARD_STOP_MS \+ \d+\)/);
  assert.match(screenSrc, /useState\(\(\) => introHoldsPage\("signin", underAutomation\(\)\)\)/);
  // The opening: a Skip button, Escape, the catch for a stray click (a person only), release on every way out.
  assert.match(splashSrc, /data-action="intro-skip"/);
  assert.match(splashSrc, /e\.key === "Escape"/);
  assert.match(splashSrc, /\{holds && phase === "playing" && <div className="intro-catch"/);
  assert.match(splashSrc, /componentDidCatch\(\): void \{[\s\S]*?this\.props\.onRelease\?\.\(\)/, "a failure inside it still lets go of the form");
  // Its listeners only listen: the key or the click still reaches the page (under automation, the suites' typing).
  assert.doesNotMatch(splashSrc, /preventDefault|stopPropagation|stopImmediatePropagation/);
  assert.match(splashSrc, /passive: true/);
});

test("under automation — navigator.webdriver — and only then", () => {
  const nav = globalThis.navigator as unknown as Record<string, unknown>;
  assert.equal(underAutomation(), false, "a browser that does not say so is a person's");
  try {
    Object.defineProperty(nav, "webdriver", { value: true, configurable: true });
    assert.equal(underAutomation(), true);
    Object.defineProperty(nav, "webdriver", { value: false, configurable: true });
    assert.equal(underAutomation(), false);
  } finally {
    delete nav.webdriver;
  }
});

test("it takes its time — about five seconds — then opens, and it can never stay", () => {
  assert.ok(INTRO_MS >= 4000 && INTRO_MS <= 5500, `the sequence lasts ${INTRO_MS} ms`);
  assert.ok(INTRO_CALM_MS >= 3500 && INTRO_CALM_MS <= INTRO_MS, `the calm version lasts ${INTRO_CALM_MS} ms`);
  assert.ok(INTRO_REVEAL_MS >= 3500 && INTRO_REVEAL_MS < INTRO_MS && INTRO_MS - INTRO_REVEAL_MS <= 800, "the veil opens at the end, not before");
  assert.equal(INTRO_HARD_STOP_MS, 6000, "a hard stop at 6 s, whatever happens");
  assert.equal(introLengthFor("motion"), INTRO_MS);
  assert.equal(introLengthFor("calm"), INTRO_CALM_MS);
  assert.ok(introLengthFor("plain") === INTRO_PLAIN_MS && INTRO_PLAIN_MS <= 1000, "a session's opening with less motion: a short plain fade");
  assert.ok(INTRO_SKIP_MS <= 400, "Skip or Escape lifts it at once");
  // Every piece drawn has arrived before the veil opens.
  const T = INTRO_TIMELINE;
  const nameWords = Math.max(...[tr("en", "intro.name"), tr("gu", "intro.name")].map((n) => n.split(/\s+/).length));
  const companyLetters = INTRO_COMPANY.replace(/\s/g, "").length;
  assert.ok(T.nameAt + (nameWords - 1) * T.nameWordStep + T.nameTakes <= INTRO_REVEAL_MS, "the system's name, word by word, in either language");
  assert.ok(T.companyAt + (companyLetters - 1) * T.companyStep + T.companyTakes <= INTRO_REVEAL_MS, "the company's name");
  assert.ok(T.marksAt + (INTRO_MODULE_MARKS.length - 1) * T.marksStep + T.marksTake <= INTRO_REVEAL_MS, "the modules' marks");
  assert.equal(INTRO_MODULE_MARKS.length, 12, "a mark for each of the sidebar's twelve modules");
  for (const s of INTRO_STREAKS) assert.ok(s.delay + s.takes <= INTRO_REVEAL_MS, `a streak of light is gone before the veil opens (${s.delay} + ${s.takes})`);
  // The calm version: every piece has faded in before the whole begins to fade.
  const C = INTRO_CALM_TIMELINE;
  assert.equal(C.fadeAt, Math.round(INTRO_CALM_MS * 0.86));
  assert.ok(C.logoAt + C.logoTakes <= C.fadeAt);
  assert.ok(C.lettersAt + 3 * C.letterStep + C.letterTakes <= C.fadeAt, "DCRS");
  assert.ok(C.nameAt + (nameWords - 1) * C.nameWordStep + C.nameTakes <= C.fadeAt, "the system's name");
  assert.ok(C.companyAt + (companyLetters - 1) * C.companyStep + C.companyTakes <= C.fadeAt, "the company's name");
  assert.ok(C.marksAt + (INTRO_MODULE_MARKS.length - 1) * C.marksStep + C.marksTake <= C.fadeAt, "the modules' marks");
  // delight.css agrees: the calm letters' start and step, and the whole's fade at 86%.
  assert.match(openingPlusCss, new RegExp(`\\.intro-letter \\{\\s*animation: intro-calm-in ${C.letterTakes}ms ease-out calc\\(${C.lettersAt}ms \\+ var\\(--i, 0\\) \\* ${C.letterStep}ms\\) both !important;`));
  assert.match(openingPlusCss, /@keyframes intro-calm \{\s*0%,\s*86% \{\s*opacity: 1;/);
  assert.match(openingPlusCss, new RegExp(`\\.intro-splash\\.is-calm \\{\\s*animation: intro-calm ${INTRO_CALM_MS}ms `));

  // The stylesheet agrees with the component: the whole in INTRO_MS, the plain fade,
  // the lifted veil, and nothing in the sequence running past its end.
  const decl = (selector: string) => {
    const m = openingCss.match(new RegExp(`\\n${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`));
    assert.ok(m, `${selector} has a rule`);
    return m![1].match(/animation:\s*([^;]+);/)?.[1] ?? "";
  };
  assert.match(decl(".intro-splash"), new RegExp(`^intro-failsafe ${INTRO_MS}ms `));
  assert.match(decl(".intro-splash.is-plain"), new RegExp(`^intro-plain ${INTRO_PLAIN_MS}ms `));
  assert.match(decl(".intro-splash.is-leaving"), new RegExp(`^intro-leave ${INTRO_SKIP_MS}ms `));
  let pieces = 0;
  for (const m of openingCss.matchAll(/animation:\s*([^;]+);/g)) {
    const [duration, delay = 0] = animationTimes(m[1]);
    assert.ok(duration + delay <= INTRO_MS, `"${m[1]}" ends by ${INTRO_MS} ms`);
    pieces++;
  }
  assert.ok(pieces >= 20, `every moving piece was read (${pieces})`);
  // What §85 added: everything over by the end of its kind, the catch at the hard stop exactly.
  let added = 0;
  for (const m of uncommented(openingPlusCss).matchAll(/animation:\s*([^;]+);/g)) {
    if (/^none/.test(m[1])) continue;
    const [duration, delay = 0] = animationTimes(m[1].replace(/calc\([^)]*\)/, "0ms"));
    if (m[1].startsWith("intro-catch-free")) assert.equal(duration + delay, INTRO_HARD_STOP_MS, "the catch steps off the screen at the hard stop");
    else assert.ok(duration + delay <= INTRO_MS, `"${m[1]}" ends by ${INTRO_MS} ms`);
    added++;
  }
  assert.ok(added >= 15, `every piece §85 added was read (${added})`);
  assert.match(openingPlusCss, /\.intro-catch \{[^}]*animation: intro-catch-free 6000ms step-end both;/);
  // The veil's halves hold until INTRO_REVEAL_MS, then open.
  const doors = openingCss.match(/@keyframes intro-door-top\s*\{\s*0%,\s*([\d.]+)%/);
  assert.ok(doors && Math.abs((Number(doors[1]) / 100) * INTRO_MS - INTRO_REVEAL_MS) <= 60, "the doors open at INTRO_REVEAL_MS");
  // The sign-in title stands up as the veil opens, and is up when it has gone.
  const wait = brandCss.match(/:root\[data-intro-playing\] \.auth-brand \.title\s*\{\s*animation-delay:\s*(\d+)ms/);
  assert.ok(wait && Number(wait[1]) >= INTRO_REVEAL_MS && Number(wait[1]) + 560 <= INTRO_MS + 60, "the title waits for the veil to open");
});

test("what the browser says decides the kind, and anything it cannot say counts against moving", () => {
  const w = globalThis as unknown as { matchMedia?: (q: string) => { matches: boolean } };
  const before = w.matchMedia;
  try {
    sessionStorage.removeItem(INTRO_SEEN_KEY);
    delete w.matchMedia;
    assert.equal(readIntroEnvironment().reducedMotion, true, "no matchMedia: treated as less motion");
    assert.equal(introKindFor(readIntroEnvironment(), "signin"), "calm");
    assert.equal(introKindFor(readIntroEnvironment(), "session"), "plain");
    assert.equal(introWanted(), true, "…a session's opening, once");

    w.matchMedia = (q: string) => ({ matches: q.includes("reduce") && false });
    assert.equal(readIntroEnvironment().seenThisSession, false);
    assert.equal(introWanted(), true, "motion allowed, not seen, just opened");
    assert.equal(introKindFor(readIntroEnvironment(), "signin"), "motion");
    markIntroSeen();
    assert.equal(sessionStorage.getItem(INTRO_SEEN_KEY), "1");
    assert.equal(introWanted(), false, "a session's second opening: nothing plays (the sign-in screen does not ask)");

    sessionStorage.removeItem(INTRO_SEEN_KEY);
    w.matchMedia = (q: string) => ({ matches: q.includes("prefers-reduced-motion: reduce") });
    assert.equal(introKindFor(readIntroEnvironment(), "signin"), "calm", "asked for less motion");

    w.matchMedia = () => {
      throw new Error("no media queries here");
    };
    assert.equal(introKindFor(readIntroEnvironment(), "signin"), "calm", "a browser that throws is not animated at");
  } finally {
    if (before) w.matchMedia = before;
    else delete w.matchMedia;
    sessionStorage.removeItem(INTRO_SEEN_KEY);
  }
});

test("the introduction lives on the sign-in screen and over a session's app, never in the layout the password step shares", () => {
  assert.doesNotMatch(layoutSrc, /import[^;]*IntroSplash|<IntroSplash/);
  assert.match(splashSrc, /aria-hidden=\{place === "session" \? "true" : undefined\}/, "over the app: hidden from screen readers, as before");
  assert.match(splashSrc, /className="intro-stage" aria-hidden="true"/, "on the sign-in screen: its art hidden, its Skip button not");
  assert.match(splashSrc, /no-print/);
  assert.match(splashSrc, /pointerEvents: "none"/, "the layer itself catches nothing — only its catch and its Skip button do");
  assert.doesNotMatch(splashSrc, /role="dialog"|modal-(box|overlay)|Got it/);
  assert.ok((splashSrc.match(/<canvas/g) ?? []).length <= 1, "one small canvas at most");
  assert.doesNotMatch(splashSrc, /getContext\(|from "three"|requestAnimationFrame\(/, "CSS transforms and opacity, no drawing loop");
  // The suites look for these words on the sign-in screen and require none.
  const words = [...Object.values(INTRO_STRINGS.en), ...Object.values(INTRO_STRINGS.gu), "DCRS", INTRO_COMPANY, "Skip", "Esc", "Skip the opening (Escape)"];
  for (const w of words) assert.doesNotMatch(w.toLowerCase(), /sign\s*up|demo|log\s*in/, w);
  assert.equal(INTRO_COMPANY, "Gujarat Print Pack Publication", "the company's name as the owner writes it");
});

test("the introduction's words, in English and in Gujarati script", () => {
  assert.equal(tr("en", "intro.name"), "Digital Controlled Record System");
  for (const [key, value] of Object.entries(INTRO_STRINGS.gu)) {
    assert.match(value, /[\u0A80-\u0AFF]/, `${key} is written in Gujarati`);
    assert.doesNotMatch(value, /[A-Za-z]/, `${key} has no English left in it`);
  }
});

test("the overlay moves nothing but transforms and opacity; only its catch and its Skip take a click", () => {
  const rule = (selector: string) => {
    const m = brandCss.match(new RegExp(`(^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`));
    assert.ok(m, `${selector} has a rule`);
    return m![2];
  };
  const splash = rule(".intro-splash");
  assert.match(splash, /pointer-events:\s*none/);
  assert.match(splash, /position:\s*fixed/);
  assert.match(splash, /overflow:\s*hidden/);
  assert.doesNotMatch(brandCss, /pointer-events:\s*(auto|all)/, "nothing in brand.css takes a click back");
  for (const css of [brandCss, openingPlusCss]) assert.doesNotMatch(css, /animation[^;]*infinite/, "no animation runs for ever");
  // Every keyframe changes transform or opacity alone — brand.css's and §85's.
  for (const css of [brandCss, openingPlusCss]) {
    for (const m of css.matchAll(/@keyframes\s+([\w-]+)\s*\{([\s\S]*?)\n\}/g)) {
      const props = [...m[2].matchAll(/([a-z-]+)\s*:/g)].map((p) => p[1]).filter((p) => p !== "animation-timing-function");
      for (const p of props) assert.ok(p === "transform" || p === "opacity", `@keyframes ${m[1]} animates ${p}`);
    }
  }
  // The calm version: nothing travels, turns or flies — its own keyframes change opacity alone.
  for (const m of openingPlusCss.matchAll(/@keyframes\s+(intro-calm[\w-]*)\s*\{([\s\S]*?)\n\}/g)) {
    assert.doesNotMatch(m[2], /transform/, `@keyframes ${m[1]} is a fade or a glow`);
  }
  assert.match(openingPlusCss, /\.intro-splash\.is-calm :is\(\.intro-door, \.intro-stage, \.intro-rig\) \{\s*animation: none !important;/, "the veil stays shut and the rig still");
  // In the calm version, the rules outrank brand.css's reduced-motion block (.intro-splash * { animation: none !important }).
  for (const m of uncommented(openingPlusCss).matchAll(/([^{}]+)\{([^{}]*animation:[^;]*!important;[^{}]*)\}/g)) {
    const selector = m[1].trim();
    assert.match(selector, /^\.intro-splash(\.is-calm)? /, `${selector}: more particular than ".intro-splash *"`);
  }
  // Only two things take a click: the catch that holds a person's stray one, and Skip.
  const catching = [...uncommented(openingPlusCss).matchAll(/([^{}]+)\{[^{}]*pointer-events:\s*auto[^{}]*\}/g)].map((m) => m[1].trim()).sort();
  assert.deepEqual(catching, [".intro-catch", ".intro-skip"]);
  // Opaque while it plays: the veil's halves are a sky of solid colours, and nothing
  // fades the whole before its end but Skip, Escape or (a session's opening) a key or a click.
  const door = rule(".intro-door");
  const stops = door.match(/background:\s*([^;]+);/)?.[1] ?? "";
  assert.ok(/radial-gradient|linear-gradient/.test(stops) && !/rgba|transparent|hsla/.test(stops), `the veil is opaque: ${stops}`);
  assert.match(openingCss, /@keyframes intro-failsafe\s*\{\s*0%,\s*99%\s*\{\s*opacity:\s*1;/, "the whole stays opaque until its very end");
  // A session's opening with less motion: the plain fade, every piece of the sequence still.
  const reduced = brandCss.slice(brandCss.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
  assert.match(reduced, /\.intro-splash,\s*\.intro-splash\.is-leaving\s*\{\s*animation:\s*intro-plain 900ms/);
  assert.match(reduced, /\.intro-splash \*\s*\{\s*animation:\s*none !important;/);
  assert.match(reduced, /\.auth-brand \.title\s*\{\s*animation:\s*none/);
  // Never on paper.
  const print = brandCss.match(/@media print\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(print, /\.intro-splash\s*\{\s*display:\s*none !important;/);
});

test("delight.css: small movement across the site — screen only, never under reduced motion, nothing left moved", () => {
  // Linked like the other feature sheets, and last, so it is read after every rule it adds to.
  const links = [...indexHtml.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(links.at(-1), "styles/delight.css", `index.html links it last: ${links.join(", ")}`);
  assert.ok(links.indexOf("assets/styles.css") >= 0 && links.indexOf("styles/brand.css") < links.indexOf("styles/delight.css"));

  const ALLOWED = new Set(["animation", "transition", "transition-duration", "transform", "box-shadow"]);
  const seen = new Set<string>();
  for (const media of blocks(siteCss)) {
    // Every rule sits in a block for the screen of somebody who does not ask for less motion.
    assert.match(media.prelude, /^@media screen and \(prefers-reduced-motion: no-preference\)/, media.prelude);
    for (const rule of blocks(media.body)) {
      if (rule.prelude.startsWith("@keyframes")) {
        for (const frame of blocks(rule.body)) {
          assert.match(frame.prelude, /^(from|to|\d+%)/, `${rule.prelude}: ${frame.prelude}`);
          for (const [prop] of declarations(frame.body)) assert.ok(prop === "transform" || prop === "opacity", `${rule.prelude} animates ${prop}`);
        }
        // Each arrival is FROM a start TO the element's own state, so nothing stays moved.
        assert.doesNotMatch(rule.body, /\bto\s*\{|100%/, `${rule.prelude} ends on the element's own state`);
        continue;
      }
      seen.add(rule.prelude);
      // Nothing that is a working surface or the sign-in screen, nothing on the printed forms.
      assert.doesNotMatch(rule.prelude, /\.card(?![-\w])|auth-|data-print-doc|doc-table|log-sheet|register-|doc-header|caf-|intro-/, rule.prelude);
      for (const [prop, value] of declarations(rule.body)) {
        assert.ok(ALLOWED.has(prop), `${rule.prelude} sets ${prop} — only transforms, opacity, their timing and a shadow`);
        if (prop === "animation") {
          assert.match(value, /\bbackwards$/, `${rule.prelude}: an arrival leaves nothing behind (fill-mode backwards)`);
          assert.doesNotMatch(value, /infinite|forwards|both/, rule.prelude);
        }
        if (prop === "animation" || prop === "transition" || prop === "transition-duration") {
          for (const ms of animationTimes(value)) assert.ok(ms <= 260, `${rule.prelude}: ${value}`);
        }
        if (prop === "transform") assert.match(value, /^(translate[XY]?\(-?\d+px\)|scale\(0\.9\d\))$/, `${rule.prelude}: a pixel or two, a slight give`);
      }
    }
  }
  // The four the owner's request names are all there.
  const all = [...seen].join("\n");
  assert.match(all, /\.app-content > \*/, "a page arriving");
  assert.match(all, /\.btn[^\n]*:active/, "a press");
  assert.match(all, /\.stat-tile:hover/, "a tile lifting");
  assert.match(all, /\.app-nav a\.active::before/, "the sidebar's active item gliding");
  const pageIn = siteCss.match(/\.app-content > \*\s*\{\s*animation:\s*([^;]+);/)?.[1] ?? "";
  assert.ok(animationTimes(pageIn)[0] <= 200, `a page arrives within 200 ms: ${pageIn}`);
  assert.doesNotMatch(siteCss, /pointer-events/, "nothing site-wide changes what takes a click");
  // Section 6 is the opening's alone.
  for (const b of blocks(openingPlusCss)) {
    if (b.prelude.startsWith("@keyframes")) continue;
    assert.match(b.prelude, /intro-/, `section 6 is about the opening: ${b.prelude}`);
  }
});

test("the fonts are self-hosted woff2 files with their licences beside them, and light", () => {
  assert.doesNotMatch(brandCss, /url\(\s*["']?(https?:)?\/\//, "nothing fetched from another site");
  assert.doesNotMatch(brandCss, /@import/);
  const faces = fontFaces();
  assert.ok(faces.length >= 4, "Latin and Gujarati faces for the display and text families");
  let bytes = 0;
  const families = new Set<string>();
  for (const face of faces) {
    const url = face.src.match(/url\("?([^")]+)"?\)/)?.[1] ?? "";
    assert.match(face.src, /format\("woff2"\)/);
    assert.equal(face["font-display"], "swap", `${url} swaps in`);
    assert.ok(face["unicode-range"], `${url} says which letters it has`);
    const file = path.join(frontend, "public", "styles", url);
    assert.ok(existsSync(file), `${url} is in frontend/public`);
    assert.equal(readFileSync(file).subarray(0, 4).toString("latin1"), "wOF2", `${url} is a woff2 file`);
    assert.ok(existsSync(path.join(path.dirname(file), "OFL.txt")), `the licence sits beside ${url}`);
    assert.match(readFileSync(path.join(path.dirname(file), "OFL.txt"), "utf8"), /SIL Open Font License/);
    bytes += statSync(file).size;
    families.add(face["font-family"].replace(/"/g, ""));
  }
  assert.deepEqual([...families].sort(), ["Baloo Bhai 2", "Noto Sans Gujarati", "Plus Jakarta Sans"]);
  assert.ok(bytes <= 350 * 1024, `all the fonts together: ${bytes} bytes`);
});

test("a Gujarati file is fetched only for Gujarati text, and the Latin ones never for it", () => {
  const A = "A".codePointAt(0)!;
  const GA = "ગ".codePointAt(0)!;
  const RUPEE = 0x20b9;
  for (const face of fontFaces()) {
    const range = face["unicode-range"];
    const gujarati = /gujarati/.test(face.src);
    if (gujarati) {
      assert.equal(covers(range, GA), true, face.src);
      assert.equal(covers(range, A), false, `${face.src} is not fetched for English`);
      assert.equal(covers(range, RUPEE), false, `${face.src} is not fetched for a ₹ in English text`);
    } else {
      assert.equal(covers(range, A), true, face.src);
      assert.equal(covers(range, GA), false, face.src);
    }
  }
});

test("the app's text in the new faces; the printed forms in the stack they always had, on screen and on paper", () => {
  const oldSans = appCss.match(/--font-sans:\s*([^;]+);/)?.[1].trim();
  assert.equal(oldSans, OLD_STACK, "styles.css --font-sans is the stack the forms were drawn in");
  assert.equal(brandCss.match(/--font-doc:\s*([^;]+);/)?.[1].trim(), OLD_STACK, "--font-doc is that stack, copied exactly");
  assert.match(brandCss, /--font-app:\s*"Plus Jakarta Sans", "Noto Sans Gujarati", var\(--font-sans\);/);
  assert.match(brandCss, /--font-display:\s*"Baloo Bhai 2", var\(--font-app\);/);
  assert.match(brandCss, /\nbody\s*\{[^}]*font-family:\s*var\(--font-app\)/);
  const docs = brandCss.match(/\n(\[data-print-doc\],[\s\S]*?)\{([^}]*)\}/);
  assert.ok(docs, "the printed forms have their own rule");
  for (const sel of ["[data-print-doc]", ".doc-table", "table.log-sheet", ".register-grid", ".register-page", ".doc-header", ".caf-sheet", ".caf-page"]) {
    assert.ok(docs![1].split(",").map((s) => s.trim()).includes(sel), `${sel} keeps the form's face`);
  }
  assert.match(docs![2], /font-family:\s*var\(--font-doc\)/);
  const print = brandCss.match(/@media print\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(print, /--font-app:\s*var\(--font-doc\)/, "on paper everything is in the old stack");
  assert.match(print, /--font-display:\s*var\(--font-doc\)/);
});
