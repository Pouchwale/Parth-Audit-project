// Runs the unit tests (frontend/tests/*.test.ts and backend/tests/*.test.ts)
// in a few seconds: `npm run test:unit`, or `npm run test:unit -- formats` for
// the files whose name contains "formats".
//
// WHY THERE IS A SECOND KIND OF TEST. The Playwright run (scripts/run-e2e.ts)
// takes an hour and a half and stops at its first failure, and most of what
// breaks when a supplied format is wired in (REQUIREMENTS §74's eight
// Maintenance formats, and every module before them) is not a browser matter
// at all: a required box nothing fills, a format number search cannot parse, a
// module with no name in Gujarati, a picture of the original that is not on
// disk. e2e_assistant_fill.py finds the first of those forty minutes in. These
// tests find all of them before the build starts, by calling the same engine
// the pages call.
//
// HOW. The frontend is written for a bundler (extensionless imports, a type
// imported without `import type`), so Node cannot load it as it stands. Each
// test file is bundled with esbuild — already the frontend's own build tool,
// so nothing new is installed — into one self-contained .mjs in the system's
// temp folder, with frontend/tests/support/browserGlobals.ts injected ahead of
// the app's modules so a window and an in-memory localStorage exist before
// data/storageAdapter.ts looks for them. Node's own test runner then runs the
// bundles, each in a process of its own, and this script exits with its code.
// The temp folder is removed afterwards; nothing is written into the project.
//
// The backend's tests (backend/tests/*.test.ts) need no bundling: the server
// is written for Node itself (imports with .ts extensions), which runs them as
// they are, after the frontend's. The exit code is the worse of the two.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const testsDir = path.join(root, "frontend", "tests");
const backendTestsDir = path.join(root, "backend", "tests");
const browserGlobals = path.join(testsDir, "support", "browserGlobals.ts");

function testFiles(dir: string, filters: string[]): string[] {
  let all: string[] = [];
  try {
    all = readdirSync(dir)
      .filter((f) => f.endsWith(".test.ts"))
      .sort();
  } catch {
    return [];
  }
  return filters.length ? all.filter((f) => filters.some((w) => f.includes(w))) : all;
}

async function runFrontend(chosen: string[]): Promise<number> {
  const outdir = mkdtempSync(path.join(os.tmpdir(), "dcrs-unit-"));
  try {
    const started = Date.now();
    // One build for every file: esbuild parses the app's modules once and
    // writes one bundle per test file.
    await esbuild.build({
      entryPoints: chosen.map((f) => path.join(testsDir, f)),
      bundle: true,
      platform: "node",
      format: "esm",
      target: "node22",
      outdir,
      // .mjs, because the temp folder has no package.json to say the files are modules.
      outExtension: { ".js": ".mjs" },
      inject: [browserGlobals],
      jsx: "automatic",
      // Stack traces of a failing assertion then point at the .ts line, not the bundle's.
      sourcemap: "inline",
      logLevel: "warning",
    });
    const bundles = chosen.map((f) => path.join(outdir, f.replace(/\.ts$/, ".mjs")));
    console.log(`Bundled ${chosen.length} test file${chosen.length === 1 ? "" : "s"} in ${Date.now() - started} ms.`);

    const result = spawnSync(process.execPath, ["--enable-source-maps", "--test", "--test-reporter=spec", ...bundles], {
      cwd: root,
      stdio: "inherit",
      // The tests look for files the app serves (frontend/public) from here,
      // since a bundle in the temp folder cannot find the project from where it is.
      env: { ...process.env, DCRS_REPO_ROOT: root },
    });
    if (result.error) {
      console.error(result.error);
      return 1;
    }
    return result.status ?? 1;
  } finally {
    try {
      rmSync(outdir, { recursive: true, force: true });
    } catch {
      /* a virus scanner holding a bundle open must not turn a pass into a failure */
    }
  }
}

function runBackend(chosen: string[]): number {
  console.log(`Running ${chosen.length} backend test file${chosen.length === 1 ? "" : "s"}.`);
  const result = spawnSync(
    process.execPath,
    ["--no-warnings=ExperimentalWarning", "--test", "--test-reporter=spec", ...chosen.map((f) => path.join(backendTestsDir, f))],
    {
      cwd: root,
      stdio: "inherit",
      // No OCR engine and no model in a unit test — the tests stand in for both. Sample data may go into a
      // Live record here, as on any test server (REQUIREMENTS §98): the engine host's tests fill with it.
      env: { ...process.env, MITRA_OCR: process.env.MITRA_OCR ?? "0", ALLOW_SAMPLE_FILL: process.env.ALLOW_SAMPLE_FILL ?? "1" },
    }
  );
  if (result.error) {
    console.error(result.error);
    return 1;
  }
  return result.status ?? 1;
}

async function main(): Promise<number> {
  const filters = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const frontend = testFiles(testsDir, filters);
  const backend = testFiles(backendTestsDir, filters);
  if (frontend.length === 0 && backend.length === 0) {
    console.error(filters.length ? `No test file in frontend/tests or backend/tests matches ${filters.join(", ")}.` : "No test files in frontend/tests or backend/tests.");
    return 1;
  }

  let code = 0;
  if (frontend.length > 0) code = await runFrontend(frontend);
  if (backend.length > 0) code = Math.max(code, runBackend(backend));
  return code;
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err);
    process.exit(1);
  }
);
