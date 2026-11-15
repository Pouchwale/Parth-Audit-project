// NO TEST ACCOUNT IN THE PLANT'S DATABASE (REQUIREMENTS §141, the owner, 29-Oct-2026): which sign-ins are a test's, and
// that the plant's server deletes them at start-up while a test server keeps its own.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { isTestSignIn } from "../db.ts";

test("a test's sign-in is name@example.com (a sign-in given up to another too); the plant's people are not", () => {
  for (const e of ["e2e-1730000000@example.com", "Playwright.QA@Example.com", "qa@example.com#removed-abc123", " editing@example.com "]) assert.ok(isTestSignIn(e), e);
  for (const e of ["kapila.barad@gpp.local", "admin@gpp.local", "parth@example.com.in", "someone@myexample.com", "ai@pouchwale.com", ""]) assert.ok(!isTestSignIn(e), e);
});

test("the plant's server deletes them at start-up, before the seeding; a test server (ALLOW_SAMPLE_FILL=1) keeps its own", () => {
  const src = readFileSync(path.join(import.meta.dirname, "..", "index.ts"), "utf8");
  const at = src.indexOf("const gone = await deleteTestAccounts();");
  assert.ok(at > 0 && at < src.indexOf("seedAccountsToAdd(await listAllUsers())"), "before the seeding");
  assert.match(src.slice(at - 200, at), /if \(!TEST_SERVER\) \{\s*$/);
  assert.match(src, /const TEST_SERVER = process\.env\.ALLOW_SAMPLE_FILL === "1";/);
  assert.match(readFileSync(path.join(import.meta.dirname, "..", "..", "scripts", "run-e2e.ts"), "utf8"), /ALLOW_SAMPLE_FILL: "1"/, "both test servers say so");
});

// NEVER MADE ON THE PLANT, AND DELETED WHEN THE CHECK IS DONE (REQUIREMENTS §206; the owner, 15-Nov-2026: "everytime you
// should create a testing id ... after checking it should delete ... i don't want to see those id's in production").
test("the plant refuses to make a test account (by the super admin or by sign-up); a test copy makes one, and deletes it after", () => {
  const src = readFileSync(path.join(import.meta.dirname, "..", "index.ts"), "utf8");
  const create = src.slice(src.indexOf('app.post("/api/users", requireAdmin'), src.indexOf("const row = await createStaffUser("));
  assert.match(create, /if \(isTestSignIn\(normalizedEmail\) && !TEST_SERVER\) \{\s+res\.status\(403\)/);
  const signup = src.slice(src.indexOf('app.post("/api/auth/signup"'), src.indexOf("if (isSignupThrottled("));
  assert.match(signup, /isTestSignIn\(String\(req\.body\.email\)\) && !TEST_SERVER\) \{\s+res\.status\(403\)/);
  const del = src.slice(src.indexOf('app.post("/api/users/:id/delete-test-account", requireAdmin'));
  assert.match(del, /const outcome = await deleteTestAccount\(String\(req\.params\.id \?\? ""\)\);/);
  const db = readFileSync(path.join(import.meta.dirname, "..", "db.ts"), "utf8");
  const one = db.slice(db.indexOf("export async function deleteTestAccount("));
  assert.match(one.slice(0, 900), /!isTestSignIn\(row\.email\) \? "not-a-test-account"/, "only a test sign-in");
  assert.match(one.slice(0, 900), /!\(await anotherSuperAdmin\(client, \[id\]\)\) \? "last-super-admin"/, "never the last super admin");
  const script = readFileSync(path.join(import.meta.dirname, "..", "..", "tests", "verify_with_test_account.py"), "utf8");
  assert.match(script, /urlparse\(cad\.BASE\)\.hostname not in ALLOWED_HOSTS or urlparse\(cad\.BASE\)\.port == 4100/, "the check runs on the local test copy alone");
  assert.match(script, /finally:\s+gone = admin\.request\.post\(f"\{cad\.BASE\}\/api\/users\/\{account_id\}\/delete-test-account"\)/, "deleted even when a check fails");
});

