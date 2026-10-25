// A PAGE OF PEOPLE AT A TIME (engine/paging.ts; the owner, 25-Oct-2026: "use pagination in user access because there
// are many id's we have created currently and so low ending devices take time to load that page"): which rows a page
// holds, the page numbers a pager offers, and Find a person; and that the account lists of Users & Access and User
// access are drawn through it.
// Run: npm run test:unit -- paging
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PAGE_SIZE, findsPerson, pageNumbers, pageOf } from "../src/engine/paging";

test("25 people to a page; the pages cover the list once, the last one shorter", () => {
  assert.equal(PAGE_SIZE, 25);
  assert.deepEqual(pageOf(312, 0), { page: 0, pages: 13, from: 0, to: 25, total: 312 });
  assert.deepEqual(pageOf(312, 1), { page: 1, pages: 13, from: 25, to: 50, total: 312 });
  assert.deepEqual(pageOf(312, 12), { page: 12, pages: 13, from: 300, to: 312, total: 312 });
  assert.deepEqual(pageOf(25, 0), { page: 0, pages: 1, from: 0, to: 25, total: 25 });
  assert.deepEqual(pageOf(26, 1), { page: 1, pages: 2, from: 25, to: 26, total: 26 });
});

test("a page past the end is the last there is; an empty list is one empty page; nonsense is page 1", () => {
  assert.deepEqual(pageOf(30, 5), { page: 1, pages: 2, from: 25, to: 30, total: 30 }, "the list grew shorter: an account removed, a search typed");
  assert.deepEqual(pageOf(0, 3), { page: 0, pages: 1, from: 0, to: 0, total: 0 });
  assert.deepEqual(pageOf(40, -2), { page: 0, pages: 2, from: 0, to: 25, total: 40 });
  assert.deepEqual(pageOf(40, Number.NaN), { page: 0, pages: 2, from: 0, to: 25, total: 40 });
  assert.deepEqual(pageOf(40, 1, 10), { page: 1, pages: 4, from: 10, to: 20, total: 40 }, "a size of its own");
});

test("the pager's numbers: the first, the last, the current one and one each side; a gap of one page is that page", () => {
  assert.deepEqual(pageNumbers(0, 1), [0]);
  assert.deepEqual(pageNumbers(0, 2), [0, 1]);
  assert.deepEqual(pageNumbers(0, 13), [0, 1, null, 12]);
  assert.deepEqual(pageNumbers(3, 13), [0, 1, 2, 3, 4, null, 12], "1 and 3 shown, so 2 is shown, not a gap");
  assert.deepEqual(pageNumbers(6, 13), [0, null, 5, 6, 7, null, 12]);
  assert.deepEqual(pageNumbers(12, 13), [0, null, 11, 12]);
  assert.deepEqual(pageNumbers(2, 5), [0, 1, 2, 3, 4]);
});

test("Find a person: every word typed, in the name or the sign-in, in any case", () => {
  const kapila = { name: "Kapila Barad", email: "kapila.barad@gpp.local" };
  assert.equal(findsPerson(kapila, ""), true, "nothing typed finds everybody");
  assert.equal(findsPerson(kapila, "kapila"), true);
  assert.equal(findsPerson(kapila, "BARAD"), true);
  assert.equal(findsPerson(kapila, "barad kap"), true, "words in any order");
  assert.equal(findsPerson(kapila, "gpp.local"), true, "the sign-in too");
  assert.equal(findsPerson(kapila, "kapila vinay"), false, "every word must be found");
  assert.equal(findsPerson({ name: null, email: null }, "x"), false);
});

test("Users & Access and User access draw their account lists a page at a time", () => {
  const root = process.env.DCRS_REPO_ROOT ?? process.cwd();
  const read = (...p: string[]) => readFileSync(path.join(root, ...p), "utf8").replace(/\r\n/g, "\n");
  const users = read("frontend", "src", "pages", "UsersPage.tsx");
  assert.match(users, /<Pager paged=\{usersPaged\} list="users" noun="accounts" \/>/);
  assert.match(users, /\{usersPaged\.shown\.map\(\(u\) => \{/);
  assert.match(users, /\{removedPaged\.shown\.map\(\(u\) => \{/);
  const grid = read("frontend", "src", "components", "access", "AccessSection.tsx");
  assert.match(grid, /\{staffPaged\.shown\.map\(\(u\) => \{/);
  assert.match(grid, /new Map\(\s*staffPaged\.shown\.map\(\(u\) => \{/, "the defaults for the page's people alone");
  assert.match(grid, /own && Object\.keys\(own\)\.length > 0 \? moduleDefaults\(rules, docs, u\) : Object\.fromEntries\(ACCESS_MODULES\.map\(\(m\) => \[m, access\.moduleLevel\(accountOf\(u\), m\)\]\)\)/, "rebuilt only for a person with module settings of their own");
  assert.match(grid, /flagged\.slice\(0, PAGE_SIZE\)\.map/, "the card of accounts nobody described names a page of them at most");
  const access = read("frontend", "src", "pages", "AccessDashboardPage.tsx");
  assert.equal((access.match(/\{paged\.shown\.map\(\(p\) => \(/g) ?? []).length, 2, "Today and Who may use which module");
  assert.doesNotMatch(access, /people\.slice\(0, count\)/);
});
