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
  assert.match(src.slice(at - 200, at), /if \(process\.env\.ALLOW_SAMPLE_FILL !== "1"\) \{\s*$/);
  assert.match(readFileSync(path.join(import.meta.dirname, "..", "..", "scripts", "run-e2e.ts"), "utf8"), /ALLOW_SAMPLE_FILL: "1"/, "both test servers say so");
});
