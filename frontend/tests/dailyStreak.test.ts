// THE DAILY STREAK ON SCREEN (the owner, 25-Oct-2026: "like snapchat"), judged without a browser:
//   * the top bar keeps its first items in their order - connection, clock, language, theme, sound - and the
//     counter comes right after the sound button, before Today's briefing and the bell;
//   * the day card's streak beside the score: the big 🔥 and the count in an element of its own that is never
//     translated, how today stands, fourteen small squares each with its words for a screen reader and a
//     tooltip, the best run and the rule in one line - and every hook the suites read, once;
//   * its stylesheet (public/styles/motivation.css): every animation moves transform or opacity alone, runs
//     once, the flame's within 260 ms and only where no reduced motion is asked for, stilled where it is; no
//     backdrop-filter, and the new rules on the theme's tokens only;
//   * the top bar's room on a laptop (styles.css "THE TOP BAR ON A LAPTOP"; the bar measured in
//     tests/e2e_daily_streak.py at 1280, 1366, 1440 and 1920 px): "Today's briefing" and the speaker's word only
//     from 1700 px, the connection's speed from 1440 px, the clock's seconds from 1366 px, the streak's word from
//     1800 px - each control keeping its icon, its name and its tooltip; the Live / Demo switch keeps its words
//     (e2e_smoke clicks "text=Live Mode") and never wraps.
// Run: npm run test:unit -- dailyStreak
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server.edge";
import type { DocumentDefinition } from "../src/types";
import { computeMotivation, streakCardView } from "../src/engine/motivation";
import { plantClosedDays } from "../src/engine/latenessCore";

// store/router.tsx reads window.location the moment it loads; the harness stands up none.
if (typeof (globalThis as { location?: unknown }).location === "undefined") {
  Object.defineProperty(globalThis, "location", { value: { hash: "", hostname: "localhost" }, configurable: true, writable: true });
}

const repoRoot = process.env.DCRS_REPO_ROOT ?? process.cwd();
const read = (...p: string[]) => readFileSync(path.join(repoRoot, ...p), "utf8").replace(/\r\n/g, "\n");
const topbarSrc = read("frontend", "src", "components", "layout", "Topbar.tsx");
const statusSrc = read("frontend", "src", "components", "layout", "TopbarStatus.tsx");
const motivationCss = read("frontend", "public", "styles", "motivation.css").replace(/\/\*[\s\S]*?\*\//g, "");
const appCss = read("frontend", "src", "styles.css").replace(/\/\*[\s\S]*?\*\//g, "");

test("the top bar: connection, clock, language, theme, sound, then the streak — before Today's briefing and the bell", () => {
  const at = (tag: string) => topbarSrc.indexOf(tag);
  const order = ["<ConnectionStatus />", "<Clock />", "<LanguageSwitcher />", "<ThemeSwitch />", "<SoundToggle />", "<StreakCounter />", "onClick={openBriefing}", "<NotificationBell />"].map(at);
  assert.ok(order.every((i) => i > 0), `every item is in the bar: ${order.join(", ")}`);
  assert.deepEqual([...order].sort((a, b) => a - b), order, "in this order");
  assert.equal(topbarSrc.split("<StreakCounter />").length, 2, "once");
});

const doc = { id: "a", kind: "log-sheet", name: "Sheet A", formatNo: "F/T/A", module: "Alpha", schedule: { type: "daily" } } as unknown as DocumentDefinition;

test("the day card's streak box: the flame and the count, fourteen squares in words, today and the best run", async () => {
  const { StreakBox } = await import("../src/components/common/MyDayCard");
  const stats = computeMotivation({
    docs: [doc],
    records: [],
    today: "2026-10-26",
    calendar: { isClosedDay: plantClosedDays({ adjustmentDays: [{ date: "2026-10-22" }] }), countedFrom: "2026-10-01" },
    signIns: { days: ["2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"], firstDay: "2026-10-21" },
    signedInNow: true,
  });
  const view = streakCardView(stats, 10 * 60, "en")!;
  const html = renderToStaticMarkup(h(StreakBox, { view, lang: "en" }));
  const count = (re: RegExp) => html.match(new RegExp(re.source, "g"))?.length ?? 0;
  assert.match(html, /^<div class="my-day-streak" data-field="my-day-streak" data-tone="lit" data-days="6">/, "one box, its tone and its count");
  assert.match(html, /<div class="my-day-streak-label">Daily streak<\/div>/);
  assert.match(html, /<span class="my-day-streak-flame" aria-hidden="true">🔥<\/span><span class="my-day-streak-num notranslate" translate="no" data-field="my-day-streak-days">6<\/span><span class="my-day-streak-unit">days in a row<\/span>/);
  assert.match(html, /<ol class="streak-strip" data-field="my-day-strip" aria-label="The last 14 days: 6 kept, 0 missed\.">/);
  assert.match(html, /<\/ol><div class="my-day-streak-row"><span class="my-day-streak-today" data-field="my-day-streak-today">Today is kept ✓<\/span><span class="my-day-streak-best" data-field="my-day-streak-best">🏆 Your best yet<\/span><\/div>/, "today and the best run on one line, under the strip");
  assert.equal(count(/<li /), 14, "fourteen days");
  assert.equal(count(/<span class="sr-only">/), 14, "each in words for a screen reader");
  assert.match(html, /<li class="streak-day is-kept" data-state="kept" data-date="2026-10-26" title="26-10-26: kept"><span class="sr-only">26-10-26: kept<\/span><\/li><\/ol>/, "today last");
  assert.match(html, /<li class="streak-day is-closed" data-state="closed" data-date="2026-10-15" title="15-10-26: closed">/, "the Thursday weekly off");
  assert.match(html, /<li class="streak-day is-kept" data-state="kept" data-date="2026-10-22" title="22-10-26: kept">/, "the adjustment Thursday, worked and kept");
  assert.doesNotMatch(html, /my-day-streak-rule/, "the rule's line is the card's, in its main column, not the box's");
  assert.doesNotMatch(html, /my-day-score/, "nothing of the score's own: beside it, never inside it");
  // No streak yet: the grey flame, no best line.
  const none = streakCardView(computeMotivation({ docs: [doc], records: [], today: "2026-10-26", calendar: { isClosedDay: plantClosedDays({}), countedFrom: "2026-10-26" } }), 600, "en")!;
  const grey = renderToStaticMarkup(h(StreakBox, { view: none, lang: "en" }));
  assert.match(grey, /data-tone="none" data-days="0"/);
  assert.doesNotMatch(grey, /my-day-streak-best/);
});

test("the top bar on a laptop: the least needed words give way below 1700 / 1440 / 1366 / 1800 px, each control keeping its icon, name and tooltip", () => {
  // The Live / Demo switch keeps its words, on screen: e2e_smoke clicks "text=Live Mode".
  assert.match(topbarSrc, /<FiCheckCircle size=\{13\} style=\{\{ marginRight: 5, verticalAlign: -2 \}\} \/>\s*\{t\("top\.liveMode"\)\}/);
  assert.doesNotMatch(appCss, /\.pill-tab\s*\{[^}]*display:\s*none/, "no rule hides a pill, words and all");
  // Today's briefing: an icon with a name and a tooltip; its words may go.
  assert.match(topbarSrc, /title=\{t\("top\.briefingTitle"\)\} aria-label=\{t\("top\.todaysBriefing"\)\}>\s*<FiZap size=\{13\} \/> <span className="topbar-label topbar-wide-label">/);
  // The connection: its state's word always; the speed in its tooltip and its name as well as beside it.
  assert.match(statusSrc, /title=\{detail\}/);
  assert.match(statusSrc, /aria-label=\{`\$\{t\(LABEL_KEYS\[state\]\)\}\$\{speed \? ` — \$\{speed\}` : ""\}`\}/);
  const media = (query: string) => {
    const at = appCss.indexOf(`@media ${query} {`);
    assert.ok(at >= 0, `styles.css has @media ${query}`);
    return appCss.slice(at, appCss.indexOf("}\n}", at) + 3);
  };
  const wide = media("(max-width: 1699px)");
  assert.match(wide, /\.app-topbar \.topbar-wide-label, \.app-topbar \.sound-toggle-label \{ display: none; \}/);
  assert.match(appCss, /\n\.app-topbar \.pill-tab \{ white-space: nowrap; \}/, "the Live / Demo words never on two lines, at any width");
  assert.match(wide, /\.app-topbar \.pill-tab > svg \{ display: none; \}/, "only the pills' icons give way, never their words");
  assert.match(media("(min-width: 761px) and (max-width: 1365px)"), /\.app-topbar \.topbar-clock-sec \{ display: none; \}/);
  // The clock's text stays whole: the seconds in a span of their own (e2e_topbar_status reads them at 1400 px).
  assert.match(statusSrc, /\{time\.slice\(0, 5\)\}\s*<span className="topbar-clock-sec">\{time\.slice\(5, 8\)\}<\/span>\s*\{time\.slice\(8\)\}/);
  assert.equal((topbarSrc.match(/className="topbar-name text-sm font-semibold notranslate" translate="no" title=\{user\?\.name\}/g) ?? []).length, 2, "a name cut short keeps the whole of it in its tooltip");
  assert.match(media("(min-width: 761px) and (max-width: 1439px)"), /\.app-topbar \.conn-badge \.conn-speed \{ display: none; \}/);
  assert.match(motivationCss, /@media \(max-width: 1799px\) \{\s*\.app-topbar \.streak-counter-label \{ display: none; \}/);
  // Never hidden: the sign-out, the bell, the connection's state.
  for (const hook of ["data-action=\"logout\"", "<NotificationBell />", "<ConnectionStatus />"]) assert.ok(topbarSrc.includes(hook), hook);
  assert.doesNotMatch(appCss, /\.conn-badge \.topbar-label \{ display: none/, "the connection's word is never hidden on a laptop");
});

// ---- the stylesheet ----------------------------------------------------------------------------

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

interface Rule {
  media: string;
  selectors: string[];
  decls: [string, string][];
}

function rulesOf(css: string, media = ""): Rule[] {
  const out: Rule[] = [];
  for (const b of blocks(css)) {
    if (/^@media/.test(b.prelude)) out.push(...rulesOf(b.body, b.prelude));
    else if (b.prelude.startsWith("@")) continue;
    else
      out.push({
        media,
        selectors: b.prelude.split(",").map((s) => s.trim()),
        decls: b.body
          .split(";")
          .map((d) => d.trim())
          .filter((d) => d.includes(":"))
          .map((d) => [d.slice(0, d.indexOf(":")).trim(), d.slice(d.indexOf(":") + 1).trim()] as [string, string]),
      });
  }
  return out;
}

const RULES = rulesOf(motivationCss);
const STREAK = /streak/;

test("motivation.css: every animation moves transform or opacity alone and runs once; the flame's is short and only without reduced motion", () => {
  for (const m of motivationCss.matchAll(/@keyframes\s+([\w-]+)\s*\{([\s\S]*?\})\s*\}/g)) {
    for (const prop of [...m[2].matchAll(/([\w-]+)\s*:/g)].map((x) => x[1])) {
      assert.ok(prop === "transform" || prop === "opacity", `@keyframes ${m[1]} animates ${prop}`);
    }
  }
  assert.doesNotMatch(motivationCss, /infinite/, "nothing runs for ever");
  assert.doesNotMatch(motivationCss, /backdrop-filter/);
  const lit = RULES.filter((r) => r.decls.some(([p, v]) => p === "animation" && /streak-flame-lit/.test(v)));
  assert.equal(lit.length, 1, "the flame's one animation");
  assert.equal(lit[0].media, "@media (prefers-reduced-motion: no-preference)", "only where no reduced motion is asked for");
  const [, value] = lit[0].decls.find(([p]) => p === "animation")!;
  const seconds = Number(/([\d.]+)s/.exec(value)?.[1]);
  assert.ok(seconds * 1000 <= 260, `the flame lights in 260 ms at most: ${value}`);
  assert.match(value, /\b1\b/, "once");
  const reduce = RULES.filter((r) => r.media === "@media (prefers-reduced-motion: reduce)" && r.decls.some(([p, v]) => p === "animation" && v === "none")).flatMap((r) => r.selectors);
  assert.ok(reduce.includes(".streak-counter-icon"), "stilled under reduced motion");
});

test("motivation.css: the streak's rules are on the theme's tokens — no colour of their own — and never printed", () => {
  for (const r of RULES) {
    if (!r.selectors.some((s) => STREAK.test(s))) continue;
    for (const [p, v] of r.decls) {
      if (!/color|background|border|shadow|fill|stroke/.test(p)) continue;
      assert.doesNotMatch(v, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i, `${r.selectors.join(", ")}: ${p}: ${v}`);
    }
  }
  // The day card, the streak box with it, is never printed; the top bar is .no-print (Topbar.tsx).
  assert.ok(RULES.some((r) => r.media === "@media print" && r.selectors.includes(".my-day")));
  assert.match(topbarSrc, /className="app-topbar no-print"/);
});
