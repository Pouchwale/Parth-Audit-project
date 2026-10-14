// THE SYSTEM SECTION IS THE SUPER ADMIN'S (REQUIREMENTS §116), engine/systemSection.ts:
//   * every page of the sidebar's System group is known by the first segment of its address, deeper addresses and
//     a "#" included, and no other page is;
//   * only the role "admin" may see the section;
//   * every sentence in English, Gujarati and Hindi, none empty, the same {page} to fill, no em dash in Gujarati or
//     Hindi; the page's line and Mitra's line name the page in the language asked.
// Run: npm run test:unit -- systemSection
import test from "node:test";
import assert from "node:assert/strict";
import { SYSTEM_WORDS, maySeeSystemSection, superAdminPageOf, systemPageName, systemRefusalLine, systemRefusalMitra, systemRefusalTitle } from "../src/engine/systemSection";

test("the System section's pages are known by their address, and no other page is", () => {
  assert.equal(superAdminPageOf("/reports"), "reports");
  assert.equal(superAdminPageOf("#/reports/2026/9/summary"), "reports");
  assert.equal(superAdminPageOf("/master-data"), "master-data");
  assert.equal(superAdminPageOf("/activity"), "activity");
  assert.equal(superAdminPageOf("/performance"), "performance");
  assert.equal(superAdminPageOf("/insights"), "insights");
  assert.equal(superAdminPageOf("/demo"), "demo");
  assert.equal(superAdminPageOf("/users"), "users");
  assert.equal(superAdminPageOf("/master-list"), "master-list");
  assert.equal(superAdminPageOf("/access"), "access");
  assert.equal(superAdminPageOf("/database-overview"), "database-overview");
  for (const route of ["/", "/dashboard", "/calendar", "/day/2026-10-14", "/record/abc", "/document/f-qc-30", "/hr/master-data", "/search", "/assistant", "/notifications", "/library", "/qc", "", "#"]) {
    assert.equal(superAdminPageOf(route), null, route);
  }
  // HR's own master data page is HR's, not the System section's.
  assert.equal(superAdminPageOf("/hr/master-data"), null);
});

test("only the super admin may see the section", () => {
  assert.equal(maySeeSystemSection("admin"), true);
  for (const role of ["staff", "", undefined, null, "Admin"]) assert.equal(maySeeSystemSection(role), false, String(role));
});

const names = (s: string): string[] => (s.match(/\{(\w+)\}/g) ?? []).sort();

test("every sentence in English, Gujarati and Hindi, the same {page} to fill, no em dash in Gujarati or Hindi", () => {
  const keys = Object.keys(SYSTEM_WORDS.en);
  assert.ok(keys.length >= 13, `${keys.length} sentences`);
  for (const lang of ["gu", "hi"] as const) {
    assert.deepEqual(Object.keys(SYSTEM_WORDS[lang]).sort(), keys.slice().sort(), lang);
    for (const key of keys) {
      const en = SYSTEM_WORDS.en[key as keyof typeof SYSTEM_WORDS.en];
      const said = SYSTEM_WORDS[lang][key as keyof typeof SYSTEM_WORDS.en];
      assert.ok(said.trim().length > 0, `${lang} ${key}`);
      assert.deepEqual(names(said), names(en), `${lang} ${key}: the same names to fill`);
      assert.ok(!said.includes("—"), `${lang} ${key}: no em dash`);
    }
  }
});

test("the page's line and Mitra's line name the page, in the language asked", () => {
  assert.equal(systemRefusalTitle("en"), "Only the super admin can open this");
  assert.equal(systemRefusalMitra("en", "activity"), "Only the super admin can open the Activity Log.");
  assert.equal(systemRefusalMitra("en", "reports"), "Only the super admin can open Reports.");
  assert.equal(systemRefusalMitra("en", "performance"), "Only the super admin can open the Performance Scorecard.");
  assert.match(systemRefusalLine("en", "performance"), /^The Performance Scorecard is the super admin's\. .*your own Dashboard, documents and records are still yours\.$/);
  assert.match(systemRefusalLine("en", "insights"), /^Insights is the super admin's\./);
  for (const lang of ["gu", "hi"] as const) {
    for (const page of ["reports", "master-data", "activity", "performance", "insights", "demo"] as const) {
      const name = systemPageName(lang, page);
      assert.ok(name.length > 0 && !/[A-Za-z]/.test(name), `${lang} ${page}: ${name}`);
      assert.ok(systemRefusalLine(lang, page).startsWith(name), `${lang} ${page}`);
      assert.ok(systemRefusalMitra(lang, page).startsWith(name), `${lang} ${page}`);
      assert.ok(!systemRefusalLine(lang, page).includes("{page}"));
    }
  }
});
