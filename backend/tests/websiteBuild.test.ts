// THE WEBSITE THE SERVER SERVES IS THE CODE AS IT IS NOW (backend/websiteBuild.ts, REQUIREMENTS §102).
//
// On 9-Oct-2026 the owner still saw a fixed page as it was: the server on port 4000 served
// the build of 7-Oct, and nothing builds it again. These hold the rule, on folders made here:
//   * a built website as new as its code is served as it is;
//   * one older than any file it is built from is built again before the server answers;
//   * none at all is built;
//   * under npm run dev, in a test run, or with DCRS_AUTO_BUILD=0, nothing is built;
//   * a build that fails leaves the old copy, and says so.
// Run: npm run test:unit -- websiteBuild
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ensureWebsiteBuilt, websiteFreshness } from "../websiteBuild.ts";

const HOUR = 3600;

/** A frontend folder: its code at `codeAt`, and a built copy at `builtAt` (none when null), in seconds since 1970. */
function frontend(codeAt: number, builtAt: number | null): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "dcrs-website-"));
  mkdirSync(path.join(dir, "src", "components"), { recursive: true });
  mkdirSync(path.join(dir, "scripts"), { recursive: true });
  for (const file of ["src/main.tsx", "src/components/Sheet.tsx", "index.html", "scripts/build.ts"]) {
    writeFileSync(path.join(dir, file), "x");
    utimesSync(path.join(dir, file), codeAt - HOUR, codeAt - HOUR);
  }
  utimesSync(path.join(dir, "src/components/Sheet.tsx"), codeAt, codeAt);
  if (builtAt !== null) {
    mkdirSync(path.join(dir, "dist", "assets"), { recursive: true });
    writeFileSync(path.join(dir, "dist", "index.html"), "<!doctype html>");
    writeFileSync(path.join(dir, "dist", "assets", "app.js"), "app");
    utimesSync(path.join(dir, "dist", "assets", "app.js"), builtAt, builtAt);
  }
  return dir;
}

const NOW = Math.floor(Date.now() / 1000);
const PLANT = {} as NodeJS.ProcessEnv; // the plant's server: no dev, no test, no switch
const run = (dir: string, env: NodeJS.ProcessEnv, buildWorks = true) => {
  const said: string[] = [];
  let builds = 0;
  const outcome = ensureWebsiteBuilt(dir, env, (line) => said.push(line), () => {
    builds += 1;
    return buildWorks;
  });
  return { outcome, said, builds };
};

test("a built website as new as its code is served as it is", () => {
  const dir = frontend(NOW - 2 * HOUR, NOW - HOUR);
  try {
    assert.equal(websiteFreshness(dir).current, true);
    assert.deepEqual(run(dir, PLANT), { outcome: "current", said: [], builds: 0 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a website older than its code is built again before the server answers, naming what changed", () => {
  const dir = frontend(NOW - HOUR, NOW - 2 * HOUR);
  try {
    const fresh = websiteFreshness(dir);
    assert.equal(fresh.current, false);
    assert.match(String(fresh.newestFile), /Sheet\.tsx$/);
    const r = run(dir, PLANT);
    assert.equal(r.outcome, "built");
    assert.equal(r.builds, 1);
    assert.match(r.said[0], /older than its code \(frontend\/src\/components\/Sheet\.tsx changed since\): building it again/);
    assert.match(r.said[1], /^Website built in \d+\.\d s\.$/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a website never built is built", () => {
  const dir = frontend(NOW - HOUR, null);
  try {
    const r = run(dir, PLANT);
    assert.equal(r.outcome, "built");
    assert.match(r.said[0], /for the first time/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("under npm run dev, in a test run or with DCRS_AUTO_BUILD=0 nothing is built", () => {
  const dir = frontend(NOW - HOUR, NOW - 2 * HOUR);
  try {
    assert.deepEqual(run(dir, { DCRS_DEV: "1" }), { outcome: "old", said: [], builds: 0 }, "npm run dev: the dev server serves the website");
    assert.deepEqual(run(dir, { NODE_TEST_CONTEXT: "child-v8" }), { outcome: "old", said: [], builds: 0 }, "a test run");
    const off = run(dir, { DCRS_AUTO_BUILD: "0" });
    assert.equal(off.outcome, "old");
    assert.equal(off.builds, 0);
    assert.match(off.said[0], /older than its code .*run npm run build/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a build that fails keeps the old copy, and says so", () => {
  const dir = frontend(NOW - HOUR, NOW - 2 * HOUR);
  try {
    const r = run(dir, PLANT, false);
    assert.equal(r.outcome, "failed");
    assert.match(r.said[r.said.length - 1], /could not be built .* keeps the copy it has/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
