// Writes the QC documents DCRS holds as JSON (stdout or --out FILE): node --no-warnings=ExperimentalWarning tests/qc_visual/catalog.mjs [--out FILE]
// The frontend is written for a bundler (extensionless imports), so the entry is bundled with esbuild, as
// scripts/unit-tests.ts does, with the unit tests' browser globals injected ahead of the app's modules.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const outFlag = process.argv.indexOf("--out");
const outFile = outFlag > -1 ? process.argv[outFlag + 1] : null;

const dir = mkdtempSync(path.join(os.tmpdir(), "dcrs-qcvis-cat-"));
try {
  await esbuild.build({
    entryPoints: [path.join(here, "catalog_entry.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    outfile: path.join(dir, "catalog.mjs"),
    inject: [path.join(root, "frontend", "tests", "support", "browserGlobals.ts")],
    jsx: "automatic",
    logLevel: "error",
  });
  const run = spawnSync(process.execPath, [path.join(dir, "catalog.mjs")], { cwd: root, encoding: "utf-8", maxBuffer: 64 * 1024 * 1024, env: { ...process.env, DCRS_REPO_ROOT: root } });
  if (run.status !== 0) {
    process.stderr.write(run.stderr || "catalog failed\n");
    process.exit(run.status ?? 1);
  }
  if (outFile) writeFileSync(outFile, run.stdout, "utf-8");
  else process.stdout.write(run.stdout);
} finally {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* a scanner holding the bundle open must not fail the listing */
  }
}
