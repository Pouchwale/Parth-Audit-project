// Orchestrates the network-independent Playwright suites (tests/e2e_smoke.py,
// tests/e2e_backlog_regression.py, tests/e2e_voice.py, tests/e2e_realism.py, tests/e2e_editing.py, tests/e2e_files.py,
// tests/e2e_translate.py, tests/e2e_print_and_forms.py, tests/e2e_capa_formats.py,
// tests/e2e_agreement_and_cancel.py, tests/e2e_crud.py,
// tests/e2e_print_all_documents.py, tests/e2e_assistant_fill.py,
// tests/e2e_departments.py, tests/e2e_trend_reports.py, tests/e2e_hr_module.py,
// tests/e2e_hr_cv_import.py, tests/e2e_qc_calibration.py, tests/e2e_qc_formats.py, tests/e2e_format_numbers.py,
// tests/e2e_hr_master_data.py, tests/e2e_downloads_and_print.py, tests/e2e_postgres_storage.py):
// a fresh PostgreSQL for the run, build,
// single-process server (dist/ + auth API) on the port the tests expect,
// wait for it to answer, run each suite in turn against the same server,
// then always tear the server down again -- regardless of pass/fail -- so
// `npm run test:e2e` doesn't leak a background process. (tests/visual_qa.py
// and tests/e2e_assistant_chat.py are NOT run here -- they're slower/make
// real network calls to Groq -- see TESTING.md for running those manually.)
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { pgCtlPath } from "../backend/db.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const TEST_PORT = 8842;
const nodeArgs = ["--no-warnings=ExperimentalWarning"];

function run(cmd: string, args: string[]): void {
  const result = spawnSync(cmd, args, { cwd: root, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// `python3` is the norm on macOS/Linux; plain `python` is what Windows
// installs actually provide (`python3` typically doesn't exist there).
function findPython(): string {
  for (const candidate of ["python3", "python"]) {
    const probe = spawnSync(candidate, ["--version"], { stdio: "ignore", shell: process.platform === "win32" });
    if (probe.status === 0) return candidate;
  }
  throw new Error("No Python interpreter found (tried python3, python).");
}

async function answers(url: string): Promise<boolean> {
  try {
    const res = await fetch(url);
    return !!res.status;
  } catch {
    return false;
  }
}

async function waitForServer(url: string, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await answers(url)) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

/** A port nothing is listening on. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.close(() => (address && typeof address === "object" ? resolve(address.port) : reject(new Error("no port"))));
    });
  });
}

async function main(): Promise<void> {
  // A server left over from an earlier run would answer the readiness probe
  // while the fresh one dies on EADDRINUSE — and every suite would then pass
  // or fail against the old build without saying so.
  if (await answers(`http://localhost:${TEST_PORT}/api/auth/me`)) {
    console.error(`Something is already listening on :${TEST_PORT} — stop it first, so the tests run against this build.`);
    process.exit(1);
  }

  console.log("Building frontend...");
  run(process.execPath, [...nodeArgs, "frontend/scripts/build.ts"]);

  // The database is PostgreSQL (backend/db.ts, REQUIREMENTS §55). The suites
  // get one of their own, made fresh for the run and thrown away after it —
  // never the database on this machine that holds real work.
  console.log("Starting a fresh PostgreSQL for the run...");
  const pgPort = await freePort();
  const databaseDir = mkdtempSync(path.join(os.tmpdir(), "dcrs-e2e-pg-"));
  const pgLog: string[] = [];
  const database = new EmbeddedPostgres({
    databaseDir,
    user: "postgres",
    password: "e2e",
    port: pgPort,
    persistent: false,
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    onLog: (message: unknown) => {
      pgLog.push(String(message));
      if (pgLog.length > 40) pgLog.shift();
    },
    onError: (message: unknown) => console.error("[postgres]", String(message)),
  });
  const pgCtl = await pgCtlPath();
  // Stopped with pg_ctl's fast shutdown — not the library's forced kill of the
  // process tree, which on Windows can leave a postgres child behind — and the
  // cluster's directory removed. Runs whether the run passed, failed or was
  // interrupted, and whether or not the database got as far as starting.
  let stopped = false;
  const stopDatabase = async (): Promise<void> => {
    if (stopped) return;
    stopped = true;
    spawnSync(pgCtl, ["stop", "-D", databaseDir, "-m", "fast", "-w", "-t", "60"], { stdio: "ignore", windowsHide: true });
    (database as unknown as { process?: unknown }).process = undefined;
    for (let i = 0; i < 10; i++) {
      try {
        rmSync(databaseDir, { recursive: true, force: true });
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  };
  process.once("SIGINT", () => void stopDatabase().finally(() => process.exit(130)));
  try {
    await database.initialise();
    await database.start();
    await database.createDatabase("dcrs_e2e");
  } catch (err) {
    await stopDatabase();
    throw new Error(
      `PostgreSQL for the run did not start on :${pgPort}: ${err instanceof Error ? err.message : "postgres exited while starting"}` +
        (pgLog.length ? `\n${pgLog.join("").trim().split(/\r?\n/).slice(-15).join("\n")}` : "")
    );
  }
  const DATABASE_URL = `postgres://postgres:e2e@127.0.0.1:${pgPort}/dcrs_e2e`;

  console.log(`Starting server on :${TEST_PORT}...`);
  const server = spawn(process.execPath, [...nodeArgs, "backend/index.ts"], {
    cwd: root,
    stdio: "inherit",
    // CVs are read by the text rules alone here, so the suites stay network-independent (backend/cvExtract.ts).
    // SEED_ACCOUNTS=0: the suites rely on their first signup being the administrator.
    env: { ...process.env, API_PORT: String(TEST_PORT), CV_READ_WITH_ASSISTANT: "0", DATABASE_URL, SQLITE_IMPORT: "0", SEED_ACCOUNTS: "0" },
  });
  const sql = new pg.Client({ connectionString: DATABASE_URL });

  let exitCode = 1;
  try {
    const ready = await waitForServer(`http://localhost:${TEST_PORT}/api/auth/me`, 15000);
    if (!ready) throw new Error(`Server did not come up on :${TEST_PORT} in time.`);

    const python = findPython();
    const suites = [
      "tests/e2e_smoke.py",
      "tests/e2e_backlog_regression.py",
      "tests/e2e_voice.py",
      "tests/e2e_realism.py",
      "tests/e2e_editing.py",
      "tests/e2e_files.py",
      "tests/e2e_translate.py",
      "tests/e2e_print_and_forms.py",
      "tests/e2e_capa_formats.py",
      "tests/e2e_agreement_and_cancel.py",
      "tests/e2e_crud.py",
      "tests/e2e_print_all_documents.py",
      "tests/e2e_assistant_fill.py",
      "tests/e2e_departments.py",
      "tests/e2e_trend_reports.py",
      "tests/e2e_hr_module.py",
      "tests/e2e_hr_cv_import.py",
      "tests/e2e_qc_calibration.py",
      "tests/e2e_qc_formats.py",
      "tests/e2e_format_numbers.py",
      "tests/e2e_hr_master_data.py",
      "tests/e2e_downloads_and_print.py",
      "tests/e2e_postgres_storage.py",
  // The portal's own controls (REQUIREMENTS §62): reviewed before submitted, formats revised on record, the activity log.
  "tests/e2e_portal_controls.py",
  // REQUIREMENTS §64: a format designed on the sheet, told to Mitra in words, and the scorecard.
  "tests/e2e_sheet_designer.py",
  "tests/e2e_mitra_format.py",
  "tests/e2e_performance.py",
    ];
    // `npm run test:e2e -- tests/e2e_postgres_storage.py ...` runs just those suites.
    const only = process.argv.slice(2).map((a) => a.split("\\").join("/")).filter((a) => a.endsWith(".py"));
    const unknown = only.filter((a) => !suites.includes(a));
    if (unknown.length) throw new Error(`Not suites of this run: ${unknown.join(", ")}`);
    exitCode = 0;
    await sql.connect();
    for (const suite of only.length ? suites.filter((s) => only.includes(s)) : suites) {
      // Each suite starts from an empty store, as each used to start from a
      // fresh browser: the app seeds it again on the first sign-in. The
      // accounts stay, as they did in the one account database.
      await sql.query("TRUNCATE app_storage");
      console.log(`Running ${suite}...`);
      const test = spawnSync(python, [suite], { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
      const suiteExit = test.status ?? 1;
      if (suiteExit !== 0) {
        exitCode = suiteExit;
        break; // don't run later suites against a server whose earlier suite already failed/left it in an odd state
      }
    }
  } finally {
    server.kill();
    await sql.end().catch(() => undefined);
    await stopDatabase();
  }

  process.exit(exitCode);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
