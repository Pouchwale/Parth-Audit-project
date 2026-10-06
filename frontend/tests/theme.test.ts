// THE THEMES (REQUIREMENTS §90, 3-Oct-2026): light, dark, or the same as the computer,
// judged without a browser.
//   * styles.css: the tokens on :root (light, the default), the app's own names pointed
//     at them, the dark block and the computer's block inside @media screen, the paper
//     scope at TODAY's values (four inks lifted), print at TODAY's values, no !important
//     added, no backdrop-filter, no colour that moves, the six area sections in order and
//     the reduced-motion block still the stylesheet's last word, stilling the two lifts;
//   * index.html: the choice painted before the stylesheet is read, one theme colour;
//   * the store: light until somebody chooses; a choice kept with the person's settings
//     and mirrored outside the synced items; the sign-in screen's kept in this browser and
//     carried into the settings of whoever signs in next; another computer's followed;
//   * the switch: an icon button with no word of its own, after the language control in
//     the top bar and at the foot of the sign-in card; the bell's count on a fill.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server.edge";

const repoRoot = process.env.DCRS_REPO_ROOT ?? process.cwd();
const read = (...p: string[]) => readFileSync(path.join(repoRoot, ...p), "utf8");
const appCss = read("frontend", "src", "styles.css").replace(/\r\n/g, "\n");
const indexHtml = read("frontend", "index.html");
const topbarSrc = read("frontend", "src", "components", "layout", "Topbar.tsx");
const authLayoutSrc = read("frontend", "src", "components", "auth", "AuthLayout.tsx");
const bellSrc = read("frontend", "src", "components", "layout", "NotificationBell.tsx");

// ---- a small reader for the stylesheet -------------------------------------------------

const css = appCss.replace(/\/\*[\s\S]*?\*\//g, "");

function blocks(text: string): { prelude: string; body: string }[] {
  const out: { prelude: string; body: string }[] = [];
  let depth = 0;
  let start = 0;
  let open = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{") {
      if (depth === 0) open = i;
      depth++;
    } else if (text[i] === "}") {
      depth--;
      if (depth === 0) {
        out.push({ prelude: text.slice(start, open).trim(), body: text.slice(open + 1, i) });
        start = i + 1;
      }
    }
  }
  assert.equal(depth, 0, "the braces balance");
  return out;
}

function declarations(body: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const d of body.split(";")) {
    const at = d.indexOf(":");
    if (at > 0) out.set(d.slice(0, at).trim(), d.slice(at + 1).trim());
  }
  return out;
}

interface Rule {
  media: string[];
  selector: string;
  decls: Map<string, string>;
}

function rulesOf(text: string, media: string[] = []): Rule[] {
  const out: Rule[] = [];
  for (const b of blocks(text)) {
    if (/^@(media|supports)/.test(b.prelude)) out.push(...rulesOf(b.body, [...media, b.prelude]));
    else if (b.prelude.startsWith("@")) continue;
    else out.push({ media, selector: b.prelude.replace(/\s+/g, " "), decls: declarations(b.body) });
  }
  return out;
}

const RULES = rulesOf(css);
const ruleFor = (selector: string, media: string[]) =>
  RULES.filter((r) => r.selector === selector && r.media.length === media.length && r.media.every((m, i) => m === media[i]));

const TOKENS = [
  "canvas", "surface", "surface-sunken", "surface-raised", "shell", "hairline", "hairline-strong", "nav-hover", "row-hover", "overlay", "scrollbar",
  "ink", "ink-2", "ink-3", "accent", "accent-hover", "accent-pressed", "accent-text", "accent-strong-text", "accent-soft", "accent-soft-hover", "accent-wash",
  "accent-wave", "on-accent", "focus-ring", "brand", "on-brand", "field-bg", "success", "success-soft", "success-fill", "success-fill-hover", "success-ring",
  "warning", "warning-soft", "warning-fill", "poor", "poor-soft", "danger", "danger-soft", "danger-fill", "danger-fill-hover", "info", "info-soft", "submitted",
  "submitted-soft", "neutral", "neutral-soft", "neutral-fill", "demo", "demo-soft", "demo-band", "demo-band-2", "paper", "paper-ink", "paper-rule", "paper-shadow",
  "chart-1", "chart-2", "chart-3", "chart-4", "chart-5", "chart-grid", "shadow-sm", "shadow-md", "shadow-lg", "dock-shadow", "mitra-face", "auth-wash",
  "auth-title-1", "auth-title-2", "auth-title-3", "auth-depth-1", "auth-depth-2", "auth-depth-3", "auth-depth-shadow",
].map((t) => `--${t}`);
const SCALES = ["--radius-sm", "--radius-md", "--radius-lg", "--radius-pill", "--space-1", "--space-8", "--duration-fast", "--duration-base", "--duration-slow", "--ease-standard", "--ease-press"];

// The app's own names before the themes: what every printout reads, and the paper on screen.
const TODAY: Record<string, string> = {
  "--color-bg": "#f4f6f8", "--color-surface": "#ffffff", "--color-surface-alt": "#f8fafc", "--color-border": "#d9e0e7", "--color-border-strong": "#b7c2cc",
  "--color-text": "#1c2733", "--color-text-muted": "#5b6b7a", "--color-text-faint": "#8695a3",
  "--color-primary": "#0f5c7a", "--color-primary-dark": "#0a4258", "--color-primary-light": "#e4f0f5", "--color-accent": "#1f8a70",
  "--color-success": "#1b8a5a", "--color-success-bg": "#e4f6ec", "--color-warning": "#b8860b", "--color-warning-bg": "#fdf3d9",
  "--color-danger": "#c23a3a", "--color-danger-bg": "#fbe6e6", "--color-info": "#2464b0", "--color-info-bg": "#e5eefb",
  "--color-neutral": "#5b6b7a", "--color-neutral-bg": "#eaeef1", "--color-demo": "#7a3fb8", "--color-demo-bg": "#f2e9fb",
  "--radius-sm": "4px", "--radius-md": "8px", "--radius-lg": "14px",
  "--shadow-sm": "0 1px 2px rgba(15, 30, 45, 0.06)", "--shadow-md": "0 4px 14px rgba(15, 30, 45, 0.09)", "--shadow-lg": "0 10px 30px rgba(15, 30, 45, 0.14)",
};
// On screen the paper lifts four inks one step (and faint) so they read at AA; print does not.
const LIFTED: Record<string, string> = {
  "--color-text-faint": "#647280", "--color-warning": "#7A5700", "--color-danger": "#A6231C", "--color-success": "#236B43", "--color-info": "#2F5F9E",
};
const PAPER_SCOPE = '[data-print-doc]:not([data-print-doc="ui"]), .doc-header, .register-page, .caf-page, .trend-head, .trend-chart, .designer-sheet';
const lower = (v: string | undefined) => (v ?? "").toLowerCase();

// ---- the stylesheet ------------------------------------------------------------------

test("light is :root: every token, the scales, the app's names pointed at the tokens, the old font stack", () => {
  const root = ruleFor(":root", []);
  assert.ok(root.length >= 1, "a :root block outside any media query");
  const decls = new Map(root.flatMap((r) => [...r.decls]));
  for (const t of [...TOKENS, ...SCALES]) assert.ok(decls.has(t), `${t} on :root`);
  assert.equal(decls.get("color-scheme"), "light");
  assert.equal(decls.get("--canvas"), "#FAF9F5");
  assert.equal(decls.get("--accent"), "#7E3C40", "the company's burgundy is the one accent");
  assert.equal(decls.get("--success-soft"), "#E3F5E8", "the good connection badge stays rgb(227, 245, 232) (e2e_topbar_status)");
  // The names every rule and every inline style={{ ... var(--color-...) }} uses follow the tokens.
  assert.equal(decls.get("--color-primary"), "var(--accent-text)", "the accent as TEXT");
  assert.equal(decls.get("--color-accent"), "var(--accent)", "the accent as a FILL");
  assert.equal(decls.get("--color-bg"), "var(--canvas)");
  assert.equal(decls.get("--color-text-faint"), "var(--ink-3)");
  assert.equal(decls.get("--mitra-surface"), "var(--surface-sunken)");
  for (const name of Object.keys(TODAY)) assert.ok(decls.has(name), `${name} still defined`);
  assert.equal(decls.get("--sidebar-w"), "264px");
  assert.equal(decls.get("--font-sans"), '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif');
  // Nothing redefines Mitra's look on a later :root (it would undo the theme in light).
  for (const r of ruleFor(":root", []).slice(1)) assert.ok(![...r.decls.keys()].some((k) => k.startsWith("--mitra-") || k.startsWith("--color-")), "no later :root re-declares the theme's names");
});

test("dark and the computer's dark are screen only, and re-declare every colour token", () => {
  const dark = ruleFor(':root[data-theme="dark"]', ["@media screen"]);
  const system = ruleFor(':root[data-theme="system"]', ["@media screen", "@media (prefers-color-scheme: dark)"]);
  assert.equal(dark.length, 1, "one dark block, inside @media screen");
  assert.equal(system.length, 1, "one block for the computer's dark, inside @media screen and prefers-color-scheme: dark");
  assert.ok(!RULES.some((r) => /data-theme/.test(r.selector) && !r.media.includes("@media screen") && !/theme-choice|data-theme-choice/.test(r.selector)), "nothing keyed on the theme reaches print");
  for (const block of [dark[0], system[0]]) {
    assert.equal(block.decls.get("color-scheme"), "dark");
    for (const t of TOKENS) assert.ok(block.decls.has(t), `${t} in ${block.selector}`);
    for (const k of block.decls.keys()) assert.ok(k === "color-scheme" || TOKENS.includes(k), `${k}: the dark blocks hold tokens only (the app's names follow them)`);
  }
  assert.deepEqual([...dark[0].decls], [...system[0].decls], "the computer's dark is the chosen dark");
  assert.equal(dark[0].decls.get("--canvas"), "#262624");
  assert.equal(dark[0].decls.get("--paper"), "#FFFFFF", "the paper is white in dark too");
});

test("the paper is a scope of its own on screen: TODAY's values, four inks lifted, always light", () => {
  const scope = ruleFor(PAPER_SCOPE, ["@media screen"]);
  assert.equal(scope.length, 1, "the paper scope, inside @media screen");
  const d = scope[0].decls;
  assert.equal(d.get("color-scheme"), "light");
  for (const [name, value] of Object.entries(TODAY)) {
    const want = LIFTED[name] ?? value;
    assert.equal(lower(d.get(name)), want.toLowerCase(), `${name} on the paper`);
  }
  assert.equal(lower(d.get("--surface")), "#ffffff");
  assert.equal(lower(d.get("--hairline")), "#d9e0e7");
  assert.equal(lower(d.get("--ink")), "#1c2733");
  assert.ok(!d.has("--paper-shadow"), "the sheet's own shadow is the theme's");
  // The sheet on its canvas, screen only; a register's holder goes clear.
  const frame = ruleFor('[data-print-doc]:not([data-print-doc="ui"])', ["@media screen"]);
  assert.ok(frame.some((r) => r.decls.get("background") === "var(--paper)" && r.decls.get("box-shadow") === "var(--paper-shadow)"), "a white sheet with the paper's shadow");
  assert.ok(ruleFor('[data-print-doc]:not([data-print-doc="ui"]):has(.register-page, .caf-page)', ["@media screen"]).length === 1);
  assert.ok(!RULES.some((r) => /data-print-doc="ui"/.test(r.selector) && r.media.some((m) => /print/.test(m))), "nothing of it in print");
});

test("print reads TODAY's values, whatever the theme", () => {
  const print = ruleFor(":root", ["@media print"]);
  assert.equal(print.length, 1, "one :root block for print");
  const d = print[0].decls;
  for (const [name, value] of Object.entries(TODAY)) assert.equal(lower(d.get(name)), value.toLowerCase(), `${name} in print`);
  for (const t of TOKENS) assert.ok(d.has(t), `${t} in print`);
  assert.equal(lower(d.get("--accent")), "#0f5c7a", "a token paints in print what its rule painted before");
  assert.equal(lower(d.get("--surface-sunken")), "#f8fafc");
  assert.equal(d.get("color-scheme"), "normal");
});

test("the shared components are on the tokens: a primary is a fill with its label, focus is the ring", () => {
  const one = (selector: string, prop: string) => RULES.filter((r) => r.selector === selector && r.media.length === 0).map((r) => r.decls.get(prop)).filter(Boolean).pop();
  assert.equal(one(".btn-primary", "background"), "var(--accent)");
  assert.equal(one(".btn-primary", "color"), "var(--on-accent)");
  assert.equal(one(".btn-danger", "background"), "var(--danger-fill)");
  assert.equal(one(".btn-success", "background"), "var(--success-fill)");
  assert.equal(one(".btn:focus-visible", "outline"), "2px solid var(--focus-ring)");
  assert.equal(one(".modal-box", "background"), "var(--surface-raised)");
  assert.equal(one(".modal-overlay", "background"), "var(--overlay)");
  assert.equal(one(".conn-badge.conn-good", "background"), "var(--success-soft)");
  assert.equal(one(".bell-count", "background"), "var(--danger-fill)");
  // No colour of the shell or the shared components is hard-coded any more.
  for (const sel of [".app-sidebar", ".app-sidebar-brand", ".app-topbar", ".topbar-clock", ".modal-box", ".btn-primary", ".btn-success", ".btn-danger", ".badge-Submitted", ".calendar-cell"]) {
    for (const r of RULES.filter((x) => x.selector === sel)) for (const [p, v] of r.decls) assert.doesNotMatch(v, /#[0-9a-f]{3,8}\b|rgba?\(/i, `${sel} ${p}: ${v}`);
  }
});

test("the hard rules: no !important added, no backdrop-filter, no colour that moves, the lifts transform-only", () => {
  assert.ok((appCss.match(/!important/g) ?? []).length <= 46, "no !important beyond the 46 the stylesheet had (print and Google Translate)");
  assert.doesNotMatch(css, /backdrop-filter/);
  for (const r of RULES) {
    const t = r.decls.get("transition");
    if (!t || t === "none") continue;
    for (const part of t.split(/,(?![^(]*\))/)) {
      const prop = part.trim().split(/\s+/)[0];
      assert.ok(["transform", "opacity", "visibility", "width"].includes(prop), `${r.selector}: transition ${t} moves ${prop}`);
    }
  }
  assert.equal(ruleFor(".card-clickable", []).map((r) => r.decls.get("transition")).filter(Boolean).pop(), "transform 120ms var(--ease-standard)");
  assert.equal(ruleFor(".calendar-cell", []).map((r) => r.decls.get("transition")).filter(Boolean).pop(), "transform 120ms var(--ease-standard)");
  // No text is transformed that was not before (the suites read the words as the stylesheet prints them).
  assert.ok((css.match(/text-transform:\s*(uppercase|capitalize)/g) ?? []).length <= 8, "no new capitals (the stylesheet had 8)");
});

test("the six areas each have a section of their own, in order, and the reduced-motion block is still the last, stilling the lifts", () => {
  const names = ["AREA 1: Paper and records", "AREA 2: Mitra", "AREA 3: Dashboard, calendar, reports, insights", "AREA 4: Library, files, search, modules", "AREA 5: Admin, settings, tour", "AREA 6: Sign-in and the opening"];
  let at = appCss.indexOf("==== FOUNDATION");
  assert.ok(at > 0, "the foundation's own section");
  for (const name of names) {
    const start = appCss.indexOf(`/* ==== ${name} ==== */`);
    const end = appCss.indexOf(`/* ==== end of ${name.split(":")[0]} ==== */`);
    assert.ok(start > at && end > start, `${name}: its section, after the one before`);
    at = end;
  }
  const top = blocks(css);
  const last = top[top.length - 1];
  assert.equal(last.prelude, "@media (prefers-reduced-motion: reduce)", "the reduced-motion block is the stylesheet's last word");
  assert.ok(appCss.lastIndexOf("@media (prefers-reduced-motion: reduce)") > at, "after every area");
  assert.ok(rulesOf(last.body).some((r) => r.selector === ".card-clickable, .calendar-cell" && r.decls.get("transition") === "none"), "the two lifts stand still");
});

test("the paper guard keeps the screen's type off the sheet", () => {
  const guard = ':where(:not([data-print-doc]:not([data-print-doc="ui"]) *))';
  for (const sel of [".text-sm", ".text-xs", ".badge", ".btn-sm", ".input-sm", ".card-pad", ".card-header", ".doc-table th", ".doc-table td"]) {
    const guarded = RULES.filter((r) => r.selector === `${sel}${guard}`);
    assert.ok(guarded.length > 0 && guarded.every((r) => r.media.some((m) => m.startsWith("@media screen"))), `${sel}: its new size is screen only, and off the paper`);
  }
});

// ---- index.html ----------------------------------------------------------------------

test("index.html paints the choice before the stylesheet is read; one theme colour; no colour-scheme meta", () => {
  const script = indexHtml.indexOf('localStorage.getItem("dcrs:theme")');
  const sheet = indexHtml.indexOf('<link rel="stylesheet" href="assets/styles.css" />');
  assert.ok(script > 0 && sheet > script, "the theme is on <html> before the first stylesheet");
  assert.match(indexHtml, /if\(t==="light"\|\|t==="dark"\|\|t==="system"\)\{document\.documentElement\.setAttribute\("data-theme",t\);\}/, "only the three choices are painted");
  assert.match(indexHtml, /try\{[\s\S]*\}catch\(e\)\{\}/, "storage blocked: the page still opens, light");
  assert.equal((indexHtml.match(/name="theme-color"/g) ?? []).length, 1);
  assert.match(indexHtml, /<meta name="theme-color" content="#7e3c40" \/>/, "the company's burgundy in every theme");
  assert.doesNotMatch(indexHtml, /name="color-scheme"/);
});

// ---- the store -----------------------------------------------------------------------

const attrs = new Map<string, string>();
Object.defineProperty(globalThis, "document", {
  value: { documentElement: { getAttribute: (n: string) => attrs.get(n) ?? null, setAttribute: (n: string, v: string) => attrs.set(n, String(v)), removeAttribute: (n: string) => attrs.delete(n) } },
  configurable: true,
  writable: true,
});

test("light until somebody chooses; a choice is kept with the person's settings and mirrored outside the synced items", async () => {
  const { settingsRepository } = await import("../src/data/repositories/settingsRepository");
  const theme = await import("../src/store/theme");
  assert.equal(theme.DEFAULT_THEME, "light");
  assert.equal(settingsRepository.get().theme, "light", "the default");
  assert.deepEqual([...theme.THEME_CHOICES], ["light", "dark", "system"]);
  assert.ok(!theme.THEME_MIRROR_KEY.startsWith("dcrs:v1:"), "this browser's copy is never synced");
  localStorage.setItem("dcrs:v1:settings", JSON.stringify({ theme: "purple" }));
  assert.equal(settingsRepository.get().theme, "light", "a theme that is not one of the three reads as light");

  let heard = 0;
  window.addEventListener(theme.THEME_EVENT, () => heard++);
  theme.setThemeChoice("dark");
  assert.equal(JSON.parse(localStorage.getItem("dcrs:v1:settings")!).theme, "dark", "kept with the person's settings (the database)");
  assert.equal(localStorage.getItem(theme.THEME_MIRROR_KEY), "dark", "mirrored for the first paint");
  assert.equal(attrs.get("data-theme"), "dark", "painted");
  assert.ok(heard >= 1, "the switches hear of it");
  assert.equal(theme.paintedTheme(), "dark");
  assert.equal(theme.effectiveTheme("system"), "light", "no computer preference known: light");
});

test("the sign-in screen's choice is this browser's alone, and the next person to sign in here takes it on", async () => {
  const { settingsRepository } = await import("../src/data/repositories/settingsRepository");
  const theme = await import("../src/store/theme");
  settingsRepository.update({ theme: "light" });
  theme.setThemeChoice("system", { beforeSignIn: true });
  assert.equal(settingsRepository.get().theme, "light", "nobody's settings are touched before sign-in");
  assert.equal(localStorage.getItem(theme.THEME_MIRROR_KEY), "system");
  assert.equal(attrs.get("data-theme"), "system");
  assert.equal(theme.adoptPersonTheme(), "system", "picked just before signing in: kept");
  assert.equal(settingsRepository.get().theme, "system", "...and saved with their settings");
  // Their own choice wins over this computer's last one, when nothing was picked at sign-in.
  settingsRepository.update({ theme: "dark" });
  localStorage.setItem(theme.THEME_MIRROR_KEY, "light");
  assert.equal(theme.adoptPersonTheme(), "dark");
  assert.equal(attrs.get("data-theme"), "dark");
  // Changed on another computer: painted again here.
  localStorage.setItem("dcrs:v1:settings", JSON.stringify({ ...JSON.parse(localStorage.getItem("dcrs:v1:settings")!), theme: "light" }));
  theme.reapplyPersonTheme();
  assert.equal(attrs.get("data-theme"), "light");
});

// ---- the switch, the top bar, the sign-in card, the bell -------------------------------

test("the switch is an icon button with no word of its own, a menu button by its attributes", async () => {
  attrs.set("data-theme", "dark");
  const { ThemeSwitch } = await import("../src/components/layout/ThemeSwitch");
  const html = renderToStaticMarkup(h(ThemeSwitch));
  assert.match(html, /^<div class="theme-switch" data-theme-switch="true"><button type="button" class="btn btn-ghost btn-sm" data-action="theme-menu" aria-label="Theme" aria-haspopup="menu" aria-expanded="false" title="Theme: Light"><svg[\s\S]*<\/svg><\/button><\/div>$/);
  assert.doesNotMatch(html.replace(/<svg[\s\S]*?<\/svg>/g, ""), />[^<]+</, "no visible word: no suite that finds a button by its words lands on it");
  assert.doesNotMatch(html, /role="menu"/, "the three choices are on the page only while the menu is open");
});

test("the top bar: connection, clock, language, then the theme; the sign-in card's foot; the bell's count on a fill", () => {
  const order = ["<ConnectionStatus />", "<Clock />", "<LanguageSwitcher />", "<ThemeSwitch />", "<SoundToggle />", "<NotificationBell />"].map((tag) => topbarSrc.indexOf(tag));
  assert.ok(order.every((at, i) => at > 0 && (i === 0 || at > order[i - 1])), `the order in Topbar.tsx: ${order}`);
  assert.match(authLayoutSrc, /\{children\}\s*\{\/\*[\s\S]*?\*\/\}\s*<div className="auth-theme">\s*<ThemeSwitch mirrorOnly \/>\s*<\/div>\s*<\/div>\s*<\/div>/, "the last thing in the card");
  assert.match(bellSrc, /className="bell-count" data-field="bell-count" data-level=\{/);
  assert.doesNotMatch(bellSrc, /color: "#fff"/);
});

test("the switch's words, in English and Gujarati, with no em dash", async () => {
  const { STRINGS } = await import("../src/i18n/strings");
  const keys = ["theme.label", "theme.title", "theme.light", "theme.dark", "theme.system", "theme.now.light", "theme.now.dark", "theme.computerNow", "theme.lead", "theme.printNote"] as const;
  for (const k of keys) {
    for (const lang of ["en", "gu"] as const) {
      const v = (STRINGS[lang] as Record<string, string>)[k];
      assert.ok(v && v.trim(), `${lang} ${k}`);
      assert.doesNotMatch(v, /—/, `${lang} ${k}: no em dash`);
    }
  }
  assert.equal(STRINGS.en["theme.system"], "Same as my computer");
  assert.equal(STRINGS.gu["theme.light"], "આછી");
});
