// NO "SHOW THE SUPPLIED ORIGINAL" BUTTON (REQUIREMENTS §210; the owner, 15-Nov-2026: "remove this the button called
// supplied pdf"). Read from the source; checked in the browser on every document page.
// Run: npm run test:unit -- noSuppliedOriginal
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.env.DCRS_REPO_ROOT ?? process.cwd();
const src = (...p: string[]) => readFileSync(path.join(root, "frontend", "src", ...p), "utf8");

test("no page offers the supplied original", () => {
  for (const page of ["DocumentRecordsPage.tsx", "PestControlPages.tsx"]) {
    const s = src("pages", page);
    assert.doesNotMatch(s, /show-supplied-original|showOriginal|supplied-original/, page);
  }
  assert.doesNotMatch(src("i18n", "strings.ts"), /"(doc|pest)\.(show|hide)Original"/);
});
