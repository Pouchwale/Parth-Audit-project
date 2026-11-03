// BACK FROM WHEREVER YOU ARE (REQUIREMENTS §175, the owner, 3-Nov-2026: "add back option in whole project so user can go
// back from wherever he is at the time"): the top bar carries one Back on every page, going where the router's trail says
// (§48) or to the Dashboard, and hidden only on the Dashboard with nothing behind it.
// Run: npm run test:unit -- backEverywhere
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.env.DCRS_REPO_ROOT ?? process.cwd();
const read = (...p: string[]) => readFileSync(path.join(root, ...p), "utf8").replace(/\r\n/g, "\n");

test("the router says whether there is a page behind this one", () => {
  const router = read("frontend", "src", "store", "router.tsx");
  assert.match(router, /canGoBack: boolean;/);
  assert.match(router, /const canGoBack = trail\.length >= 2;/);
  assert.match(router, /value=\{\{ path, segments, navigate, back, backTo, canGoBack \}\}/);
});

test("the top bar's Back: on every page, beside the menu toggle, going back or to the Dashboard; not on the Dashboard with nothing behind it", () => {
  const topbar = read("frontend", "src", "components", "layout", "Topbar.tsx");
  assert.match(topbar, /const \{ navigate, back, canGoBack, path \} = useRouter\(\);/);
  assert.match(topbar, /const onHome = path === "\/" \|\| path === "\/dashboard";\n\s*const showBack = canGoBack \|\| !onHome;/);
  assert.match(topbar, /\{showBack && \(\n\s*<button type="button" className="btn btn-ghost btn-sm topbar-back" data-action="back" onClick=\{\(\) => back\(\)\}/);
  assert.match(topbar, /<FiArrowLeft size=\{14\} \/> <span className="topbar-label">\{t\("common\.back"\)\}<\/span>/, "the word goes on a phone, the arrow stays (styles.css hides .topbar-label)");
  const toggleAt = topbar.indexOf('data-action="toggle-sidebar"');
  const backAt = topbar.indexOf('data-action="back"');
  assert.ok(toggleAt > 0 && backAt > toggleAt, "beside the menu toggle, in the bar's first group");
  assert.ok(topbar.indexOf('className="app-topbar-end') > backAt, "...not in the bar's end group");
});

test("the word, in both languages", () => {
  const strings = read("frontend", "src", "i18n", "strings.ts");
  assert.match(strings, /"common\.back": "Back",/);
  assert.match(strings, /"common\.back": "પાછળ",/);
});
