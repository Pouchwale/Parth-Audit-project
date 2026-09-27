// THE 3D INTRODUCTION AND THE FONTS (REQUIREMENTS §81), judged without a browser:
// when the introduction plays (once a session, on the sign-in screen's opening,
// never for somebody who asks for less motion), and the fonts — self-hosted,
// licensed, light, the Gujarati files fetched only for Gujarati text, and the
// printed forms left in the face they have always had.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import {
  INTRO_MS,
  INTRO_SEEN_KEY,
  OPENING_WINDOW_MS,
  introWanted,
  introWantedFor,
  markIntroSeen,
  readIntroEnvironment,
} from "../src/components/auth/IntroSplash";
import { INTRO_STRINGS } from "../src/i18n/strings.intro";
import { tr } from "../src/i18n";

const repoRoot = process.env.DCRS_REPO_ROOT ?? process.cwd();
const frontend = path.join(repoRoot, "frontend");
const brandCss = readFileSync(path.join(frontend, "public", "styles", "brand.css"), "utf8");
const appCss = readFileSync(path.join(frontend, "src", "styles.css"), "utf8");
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

test("the introduction plays at the sign-in screen's opening, once a session, and never for less motion", () => {
  const fresh = { reducedMotion: false, seenThisSession: false, msSinceOpen: 400 };
  assert.equal(introWantedFor(fresh), true);
  assert.equal(introWantedFor({ ...fresh, reducedMotion: true }), false, "prefers-reduced-motion: nothing plays");
  assert.equal(introWantedFor({ ...fresh, seenThisSession: true }), false, "already played in this browser session");
  assert.equal(introWantedFor({ ...fresh, msSinceOpen: OPENING_WINDOW_MS + 1 }), false, "a sign-out long after the page opened is not the opening");
  assert.equal(introWantedFor({ ...fresh, msSinceOpen: OPENING_WINDOW_MS }), true);
  assert.ok(INTRO_MS <= 1600, "the whole introduction lasts 1.6 s at most");
});

test("what the browser says decides it, and anything it cannot say counts against playing", () => {
  const w = globalThis as unknown as { matchMedia?: (q: string) => { matches: boolean } };
  const before = w.matchMedia;
  try {
    delete w.matchMedia;
    assert.equal(readIntroEnvironment().reducedMotion, true, "no matchMedia: treated as less motion");
    assert.equal(introWanted(), false);

    w.matchMedia = (q: string) => ({ matches: q.includes("reduce") && false });
    sessionStorage.removeItem(INTRO_SEEN_KEY);
    assert.equal(readIntroEnvironment().seenThisSession, false);
    assert.equal(introWanted(), true, "motion allowed, not seen, just opened");
    markIntroSeen();
    assert.equal(sessionStorage.getItem(INTRO_SEEN_KEY), "1");
    assert.equal(introWanted(), false, "a second sign-in screen in the same session: nothing plays");

    sessionStorage.removeItem(INTRO_SEEN_KEY);
    w.matchMedia = (q: string) => ({ matches: q.includes("prefers-reduced-motion: reduce") });
    assert.equal(introWanted(), false, "asked for less motion");

    w.matchMedia = () => {
      throw new Error("no media queries here");
    };
    assert.equal(introWanted(), false, "a browser that throws is not animated at");
  } finally {
    if (before) w.matchMedia = before;
    else delete w.matchMedia;
    sessionStorage.removeItem(INTRO_SEEN_KEY);
  }
});

test("the introduction lives on the sign-in screen alone, never in the layout the password step after sign-in shares", () => {
  const screen = readFileSync(path.join(frontend, "src", "components", "auth", "AuthScreen.tsx"), "utf8");
  const layout = readFileSync(path.join(frontend, "src", "components", "auth", "AuthLayout.tsx"), "utf8");
  const splash = readFileSync(path.join(frontend, "src", "components", "auth", "IntroSplash.tsx"), "utf8");
  assert.match(screen, /<IntroSplash\s*\/>/);
  assert.doesNotMatch(layout, /import[^;]*IntroSplash|<IntroSplash/);
  assert.match(splash, /aria-hidden="true"/);
  assert.match(splash, /no-print/);
  assert.doesNotMatch(splash, /role="dialog"|modal-(box|overlay)|Got it/);
  assert.doesNotMatch(splash, /<canvas|getContext\(|three\.js/i, "CSS 3D only");
  // The suites look for these words on the sign-in screen and require none.
  const words = [...Object.values(INTRO_STRINGS.en), ...Object.values(INTRO_STRINGS.gu), "DCRS", "Gujarat Printpack Publication Pvt. Ltd."];
  for (const w of words) assert.doesNotMatch(w.toLowerCase(), /sign\s*up|demo/, w);
});

test("the introduction's words, in English and in Gujarati script", () => {
  assert.equal(tr("en", "intro.name"), "Digital Controlled Record System");
  for (const [key, value] of Object.entries(INTRO_STRINGS.gu)) {
    assert.match(value, /[\u0A80-\u0AFF]/, `${key} is written in Gujarati`);
    assert.doesNotMatch(value, /[A-Za-z]/, `${key} has no English left in it`);
  }
});

test("the overlay catches nothing and moves nothing but transforms and opacity", () => {
  const rule = (selector: string) => {
    const m = brandCss.match(new RegExp(`(^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`));
    assert.ok(m, `${selector} has a rule`);
    return m![2];
  };
  const splash = rule(".intro-splash");
  assert.match(splash, /pointer-events:\s*none/);
  assert.match(splash, /position:\s*fixed/);
  assert.match(splash, /overflow:\s*hidden/);
  assert.doesNotMatch(brandCss, /pointer-events:\s*(auto|all)/, "nothing inside takes a click back");
  assert.doesNotMatch(brandCss, /animation[^;]*infinite/, "no animation runs for ever");
  // Every keyframe changes transform or opacity alone.
  for (const m of brandCss.matchAll(/@keyframes\s+([\w-]+)\s*\{([\s\S]*?)\n\}/g)) {
    const props = [...m[2].matchAll(/([a-z-]+)\s*:/g)].map((p) => p[1]).filter((p) => p !== "animation-timing-function");
    for (const p of props) assert.ok(p === "transform" || p === "opacity", `@keyframes ${m[1]} animates ${p}`);
  }
  const reduced = brandCss.slice(brandCss.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
  assert.match(reduced, /\.intro-splash\s*\{\s*display:\s*none/);
  assert.match(reduced, /\.auth-brand \.title\s*\{\s*animation:\s*none/);
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
