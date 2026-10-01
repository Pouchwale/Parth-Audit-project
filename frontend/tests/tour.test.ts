// THE GUIDED TOUR OF THE WHOLE SOFTWARE (REQUIREMENTS §85), judged without a
// browser: the steps each person gets (the super admin five more), in two short
// lines each, pointing at parts of the screen that really carry those marks; when
// it starts by itself (once a day, on the first Dashboard visit, until "Don't show
// this again" — never under automation); where the spotlight and the card go; the
// person's own flags, kept in their settings under their own id; and its sheet —
// transforms and opacity only, nothing for less motion or on paper.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { firstName, listInWords, placeCard, spotFor, tourStartsByItself, tourSteps, unionBox, type TourStep } from "../src/components/tour/tourSteps";
import { settingsRepository } from "../src/data/repositories/settingsRepository";

const repoRoot = process.env.DCRS_REPO_ROOT ?? process.cwd();
const src = path.join(repoRoot, "frontend", "src");
const read = (...p: string[]) => readFileSync(path.join(...p), "utf8");
const tourCss = read(repoRoot, "frontend", "public", "styles", "tour.css");
const indexHtml = read(repoRoot, "frontend", "index.html");
const guidedTour = read(src, "components", "tour", "GuidedTour.tsx");
const dashboard = read(src, "pages", "DashboardPage.tsx");
const sidebar = read(src, "components", "layout", "Sidebar.tsx");

const MODULES = ["Human Resources (HR)", "CAPA (Corrective & Preventive Action)", "Quality Control — Inspection Records"];
const staff = tourSteps({ name: "Kapila Barad", admin: false, modules: MODULES });
const admin = tourSteps({ name: "Super Admin", admin: true, modules: MODULES });
const ids = (steps: TourStep[]) => steps.map((s) => s.id);
const ADMIN_ONLY = ["users", "access", "database", "master", "activity"];

test("every person's tour covers the whole software, in the order the owner named it", () => {
  assert.deepEqual(ids(staff), ["welcome", "sidebar", "modules", "day", "search", "calendar", "library", "records", "mitra", "bell", "sound", "reports", "finish"]);
  assert.equal(staff[0].title, "Welcome to DCRS, Kapila", "the welcome names the person");
  for (const id of ADMIN_ONLY) assert.ok(!ids(staff).includes(id), `${id} is the super admin's alone`);
});

test("the super admin's tour adds their own pages: Users & Access, User access, Database overview, Master Data, the Activity Log", () => {
  assert.deepEqual(ids(admin), [...ids(staff).slice(0, -1), ...ADMIN_ONLY, "finish"]);
  const byId = Object.fromEntries(admin.map((s) => [s.id, s]));
  assert.deepEqual(byId.users.target, ["#app-sidebar a[href='#/users']"]);
  assert.deepEqual(byId.access.target, ["#app-sidebar a[href='#/access']"]);
  assert.deepEqual(byId.database.target, ["#app-sidebar a[href='#/database-overview']"]);
  assert.deepEqual(byId.master.target, ["#app-sidebar a[href='#/master-data']"]);
  assert.deepEqual(byId.activity.target, ["#app-sidebar a[href='#/activity']"]);
});

test("the modules as that person sees them — and no modules step for somebody with none", () => {
  const modules = staff.find((s) => s.id === "modules")!;
  assert.equal(modules.title, "Your 3 modules");
  assert.match(modules.text, /^Human Resources \(HR\), CAPA \(Corrective & Preventive Action\) and Quality Control — Inspection Records\./);
  assert.equal(tourSteps({ name: "A", admin: false, modules: ["Store"] }).find((s) => s.id === "modules")!.title, "Your module");
  assert.ok(!ids(tourSteps({ name: "A", admin: false, modules: [] })).includes("modules"));
  assert.equal(listInWords([]), "");
  assert.equal(listInWords(["A"]), "A");
  assert.equal(listInWords(["A", "B"]), "A and B");
  assert.equal(listInWords(["A", "B", "C", "D"]), "A, B, C and D");
  assert.equal(listInWords(["A", "B", "C", "D", "E", "F"]), "A, B, C, D and 2 more");
  assert.equal(firstName("  Parth Raval "), "Parth");
  assert.equal(firstName(""), "");
  assert.equal(tourSteps({ name: "", admin: false, modules: [] })[0].title, "Welcome to DCRS");
});

test("each step says what it is for in two short lines, and points somewhere real", () => {
  for (const step of admin) {
    assert.ok(step.title.length > 0 && step.title.length <= 48, `${step.id}: a short title`);
    for (const text of [step.text, step.fallbackText].filter((t): t is string => !!t)) {
      assert.ok(text.length <= 200, `${step.id}: two short lines (${text.length} characters)`);
      assert.doesNotMatch(text, /[{}<>]/, `${step.id}: plain words`);
    }
    if (step.id !== "welcome") assert.ok(step.target && step.target.length > 0, `${step.id} points at a part of the screen`);
    if (step.fallbackText) assert.ok(step.fallback, `${step.id}: fallback words go with a fallback place`);
  }
  // The places carry those marks: a renamed link or attribute must fail here, not in front of the owner.
  const sources: Record<string, string> = {
    "#app-sidebar": sidebar,
    ".app-nav": sidebar,
    ".nav-module-header": sidebar,
    ".nav-module-name": sidebar,
    "[data-section='my-day']": read(src, "components", "common", "MyDayCard.tsx"),
    "[data-tour='today-tiles']": dashboard,
    "[data-tour='records-due']": dashboard,
    "[data-tour='open-calendar']": dashboard,
    "[data-action='take-tour']": dashboard,
    ".assistant-pill": read(src, "components", "common", "DocumentAssistant.tsx"),
    ".assistant-dock-card": read(src, "components", "common", "DocumentAssistant.tsx"),
    "button[aria-label='Reminders']": read(src, "components", "layout", "NotificationBell.tsx"),
    "[data-action='toggle-sound']": read(src, "components", "layout", "SoundToggle.tsx"),
    "[data-action='toggle-sidebar']": read(src, "components", "layout", "Topbar.tsx"),
    ".app-topbar": read(src, "components", "layout", "Topbar.tsx"),
  };
  const mark = (piece: string): string | null => {
    const attr = piece.match(/^\[([\w-]+)='([^']+)'\]$/);
    if (attr) return `${attr[1]}="${attr[2]}"`;
    const cls = piece.match(/^\.([\w-]+)$/);
    if (cls) return cls[1];
    const id = piece.match(/^#([\w-]+)$/);
    if (id) return `id="${id[1]}"`;
    return null;
  };
  for (const step of admin) {
    for (const selector of [...(step.target ?? []), ...(step.fallback ?? [])]) {
      for (const piece of selector.split(/\s+/)) {
        const link = piece.match(/^a\[href='#(\/[\w-]+)'\]$/);
        if (link) {
          assert.match(sidebar, new RegExp(`to: "${link[1]}"`), `${step.id}: the sidebar has a link to ${link[1]}`);
          continue;
        }
        const button = piece.match(/^button\[aria-label='([^']+)'\]$/);
        const source = sources[piece];
        assert.ok(source, `${step.id}: "${piece}" is a mark this test knows where to find`);
        const m = button ? `aria-label="${button[1]}"` : mark(piece);
        assert.ok(m && source.includes(m), `${step.id}: "${piece}" is on the screen's source (${m})`);
      }
    }
  }
});

test("it starts by itself once a day, until the person asks not to see it — never under automation", () => {
  const today = "2026-09-30";
  assert.equal(tourStartsByItself({ off: false, startedOn: null }, today, false), true, "the first Dashboard visit ever");
  assert.equal(tourStartsByItself({ off: false, startedOn: "2026-09-29" }, today, false), true, "the first visit of a new day");
  assert.equal(tourStartsByItself({ off: false, startedOn: today }, today, false), false, "not twice in a day");
  assert.equal(tourStartsByItself({ off: true, startedOn: "2026-09-29" }, today, false), false, "Don't show this again");
  assert.equal(tourStartsByItself({ off: false, startedOn: null }, today, true), false, "never by itself under automation (navigator.webdriver)");
  // The component asks exactly that, and waits for whatever is over the Dashboard.
  assert.match(guidedTour, /const automated = underAutomation\(\);/);
  assert.match(guidedTour, /tourStartsByItself\(settingsRepository\.tourFor\(personId\), today, automated\)/);
  assert.match(guidedTour, /settingsRepository\.markTourStarted\(personId, today\);/);
  assert.match(guidedTour, /TOUR_WAITS_FOR = "\.briefing, \.modal-overlay, \[data-section='intro-splash'\], \[data-section='password-required'\]"/);
  // Not on the page at all when it is not running — it cannot cover a click.
  assert.match(guidedTour, /if \(!steps \|\| steps\.length === 0\) return null;/);
  assert.match(guidedTour, /createPortal\(/);
  // Escape ends it; Next, Back and Skip tour; a counter; "Don't show this again".
  assert.match(guidedTour, /e\.key === "Escape"/);
  for (const action of ["tour-next", "tour-back", "tour-skip"]) assert.match(guidedTour, new RegExp(`data-action="${action}"`));
  assert.match(guidedTour, /Step \{index \+ 1\} of \{steps\.length\}/);
  assert.match(guidedTour, /data-field="tour-dont-show"/);
  // The Dashboard: the button, and the host with the person's own id.
  assert.match(dashboard, /data-action="take-tour" onClick=\{startTour\}/);
  assert.match(dashboard, /<GuidedTour personId=\{user\?\.id \?\? ""\} personName=\{user\?\.name \?\? ""\} admin=\{user\?\.role === "admin"\} \/>/);
});

test("the person's flags live in their own settings, under their own id — never handed on to the next person", () => {
  assert.deepEqual(settingsRepository.tourFor("u-1"), { off: false, startedOn: null });
  settingsRepository.update({ language: "gu" });
  settingsRepository.markTourStarted("u-1", "2026-09-30");
  assert.deepEqual(settingsRepository.tourFor("u-1"), { off: false, startedOn: "2026-09-30" });
  settingsRepository.setTourOff("u-1", true);
  assert.deepEqual(settingsRepository.tourFor("u-1"), { off: true, startedOn: "2026-09-30" });
  assert.equal(settingsRepository.get().language, "gu", "the person's other settings are left as they were");
  // A plant computer hands one person's settings on to the next person who signs in there
  // first (data/serverSync.ts): the next person's tour is still theirs to see.
  assert.deepEqual(settingsRepository.tourFor("u-2"), { off: false, startedOn: null });
  settingsRepository.markTourStarted("u-2", "2026-10-01");
  assert.deepEqual(Object.keys(settingsRepository.get().tour), ["u-2"], "only the signed-in person's own entry is kept");
  settingsRepository.setTourOff("u-2", true);
  settingsRepository.setTourOff("u-2", false);
  assert.deepEqual(settingsRepository.tourFor("u-2"), { off: false, startedOn: "2026-10-01" }, "taken back, it starts by itself again tomorrow");
  // Anything malformed reads as nothing set.
  settingsRepository.update({ tour: { "u-3": "yes" } as never });
  assert.deepEqual(settingsRepository.tourFor("u-3"), { off: false, startedOn: null });
  settingsRepository.update({ tour: [] as never });
  assert.deepEqual(settingsRepository.tourFor("u-3"), { off: false, startedOn: null });
});

test("the spotlight: several parts lit together, grown a little and kept inside the window", () => {
  assert.equal(unionBox([]), null);
  assert.equal(unionBox([{ left: 5, top: 5, width: 0, height: 10 }]), null, "a part drawn at no size is not a part");
  assert.deepEqual(unionBox([{ left: 10, top: 20, width: 30, height: 10 }, { left: 0, top: 50, width: 5, height: 5 }]), { left: 0, top: 20, width: 40, height: 35 });
  const view = { width: 1000, height: 700 };
  assert.deepEqual(spotFor({ left: 100, top: 100, width: 50, height: 20 }, view), { left: 94, top: 94, width: 62, height: 32 });
  assert.deepEqual(spotFor({ left: 0, top: 0, width: 260, height: 2000 }, view), { left: 4, top: 4, width: 262, height: 692 }, "a tall part is cut to the window");
  assert.equal(spotFor({ left: 2000, top: 10, width: 50, height: 20 }, view), null, "off the window: nothing to light");
  assert.equal(spotFor(null, view), null);
});

test("the card goes beside the lit part where there is room, and never outside the window", () => {
  const view = { width: 1366, height: 768 };
  const card = { width: 360, height: 220 };
  const inside = (p: { left: number; top: number }) => p.left >= 12 && p.top >= 12 && p.left + card.width <= view.width - 12 && p.top + card.height <= view.height - 12;
  const cases: [Parameters<typeof placeCard>[0], string][] = [
    [null, "center"],
    [{ left: 4, top: 200, width: 256, height: 40 }, "right"], // a sidebar link
    [{ left: 1100, top: 8, width: 50, height: 40 }, "bottom"], // the bell
    [{ left: 1000, top: 700, width: 150, height: 50 }, "top"], // Mitra's pill
    [{ left: 1000, top: 100, width: 360, height: 600 }, "left"],
    [{ left: 4, top: 4, width: 1358, height: 760 }, "over"],
  ];
  for (const [spot, side] of cases) {
    const p = placeCard(spot, card, view);
    assert.equal(p.side, side, JSON.stringify(spot));
    assert.ok(inside(p), `${side}: inside the window (${p.left}, ${p.top})`);
  }
  const phone = placeCard({ left: 10, top: 10, width: 40, height: 40 }, { width: 366, height: 260 }, { width: 390, height: 844 });
  assert.equal(phone.side, "bottom");
  assert.ok(phone.left >= 12 && phone.left + 366 <= 390 - 12 + 0.001);
});

test("tour.css: over everything but the opening; transforms and opacity only; nothing for less motion, nothing on paper", () => {
  const links = [...indexHtml.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(links.includes("styles/tour.css"), "index.html links it");
  const z = Number(tourCss.match(/\.tour-layer \{[^}]*z-index: (\d+);/)?.[1]);
  assert.ok(z > 130 && z < 1200, `over the briefing, the pop-ups and the celebrations, under the opening (${z})`);
  const plain = tourCss.replace(/\/\*[\s\S]*?\*\//g, "");
  const animated = plain.slice(plain.indexOf("@media screen and (prefers-reduced-motion: no-preference)"), plain.indexOf("@media print"));
  assert.ok(animated.length > 0, "every movement sits inside the no-preference block");
  assert.doesNotMatch(plain.replace(animated, ""), /animation|transition/, "nothing moves outside it");
  assert.doesNotMatch(plain, /infinite/, "nothing runs for ever");
  for (const m of animated.matchAll(/@keyframes\s+([\w-]+)\s*\{([\s\S]*?)\n  \}/g)) {
    const props = [...m[2].matchAll(/([a-z-]+)\s*:/g)].map((p) => p[1]);
    for (const p of props) assert.ok(p === "transform" || p === "opacity", `@keyframes ${m[1]} animates ${p}`);
  }
  assert.match(plain, /@media print \{\s*\.tour-layer \{\s*display: none !important;/);
});
