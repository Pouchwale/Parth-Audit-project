// Runs the indexing module's tests the way scripts/unit-tests.ts runs the app's: one esbuild bundle with the browser's
// globals stood in, then node --test.   node --no-warnings=ExperimentalWarning indexing/tests/run.ts
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
// indexingStorage.test.ts is a server test: Node runs it as it is, beside the bundled browser tests.
const SERVER_TESTS = ["indexingStorage.test.ts"];
const files = readdirSync(here).filter((f) => f.endsWith(".test.ts") && !SERVER_TESTS.includes(f));
const outdir = mkdtempSync(path.join(os.tmpdir(), "dcrs-indexing-"));
try {
  await esbuild.build({
    entryPoints: files.map((f) => path.join(here, f)),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    outdir,
    outExtension: { ".js": ".mjs" },
    inject: [path.join(root, "frontend", "tests", "support", "browserGlobals.ts")],
    jsx: "automatic",
    sourcemap: "inline",
    logLevel: "warning",
  });
  const result = spawnSync(process.execPath, ["--enable-source-maps", "--test", "--test-reporter=spec", ...files.map((f) => path.join(outdir, f.replace(/\.ts$/, ".mjs")))], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, DCRS_REPO_ROOT: root },
  });
  const server = spawnSync(process.execPath, ["--no-warnings=ExperimentalWarning", "--test", "--test-reporter=spec", ...SERVER_TESTS.map((f) => path.join(here, f))], { cwd: root, stdio: "inherit" });
  process.exitCode = (result.status ?? 1) || (server.status ?? 1);
} finally {
  rmSync(outdir, { recursive: true, force: true });
}
