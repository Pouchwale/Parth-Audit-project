// Orchestrates the network-independent Playwright suites (tests/e2e_smoke.py,
// tests/e2e_backlog_regression.py, tests/e2e_voice.py, tests/e2e_realism.py, tests/e2e_editing.py, tests/e2e_files.py,
// tests/e2e_translate.py, tests/e2e_print_and_forms.py, tests/e2e_capa_formats.py,
// tests/e2e_agreement_and_cancel.py, tests/e2e_crud.py,
// tests/e2e_print_all_documents.py, tests/e2e_assistant_fill.py,
// tests/e2e_departments.py, tests/e2e_trend_reports.py, tests/e2e_hr_module.py,
// tests/e2e_hr_cv_import.py, tests/e2e_qc_calibration.py, tests/e2e_qc_formats.py,
// tests/e2e_purchase_module.py, tests/e2e_store_module.py, tests/e2e_assistant_and_logout.py,
// tests/e2e_maintenance_module.py, tests/e2e_insights.py, tests/e2e_format_numbers.py,
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
// DEMO MODE IS NOT PART OF THE PRODUCT (REQUIREMENTS §65): the server has it only
// when started with DEMO_MODE=1. The suites stand on the year of synthetic
// records it makes, so the server they run against is started with it — and
// tests/e2e_no_demo_mode.py, which proves the product has none, gets a second
// server of its own for as long as it runs: this port, the same database, the
// same build, Demo Mode off.
const PRODUCT_PORT = 8843;
// THE PRODUCT AS A PLANT INSTALLS IT — no Demo Mode (§65) and no way to create
// your own account (§66). Both are proved against a server of their own on this
// port, started for each of these suites and stopped after it. It also has the
// plant's named accounts, on a password only the suites know: with sign-up
// closed there has to be somebody to sign in as.
const PRODUCT_SUITE = "tests/e2e_no_demo_mode.py";
const LOGIN_ONLY_SUITE = "tests/e2e_login_only.py";
// REQUIREMENTS §75: escalation to the super admin and the weekly digest, worked
// out on the server — with the plant's seeded accounts, so on the product server.
const ESCALATION_SUITE = "tests/e2e_escalation.py";
const PRODUCT_SUITES = [PRODUCT_SUITE, LOGIN_ONLY_SUITE, ESCALATION_SUITE];
/** The first password of the named accounts on the product server, which tests/e2e_login_only.py signs in with. */
export const PRODUCT_SEED_PASSWORD = "SeedQA@2026";
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
  // The same for the second server's port, asked NOW and not only when its suite
  // comes up, last but one: a run must not get that far before it is refused.
  const asked = process.argv.slice(2).filter((a) => a.endsWith(".py"));
  if ((!asked.length || asked.some((a) => PRODUCT_SUITES.includes(a.split("\\").join("/")))) && (await answers(`http://localhost:${PRODUCT_PORT}/api/auth/me`))) {
    console.error(`Something is already listening on :${PRODUCT_PORT} — stop it first, so ${PRODUCT_SUITE} runs against this build.`);
    process.exit(1);
  }

  // THE CATALOGUE CHECKS FIRST, IN A SECOND (npm run test:unit): every document's
  // sample fill against the submit rules, every format number, layout and
  // module string. A document that cannot be filled used to be found by
  // tests/e2e_assistant_fill.py forty minutes into this run; now the run stops
  // before it builds.
  console.log("Unit tests...");
  run(process.execPath, [...nodeArgs, "scripts/unit-tests.ts"]);

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

  // product = the server a plant runs: no Demo Mode, no self-registration, and
  // the named accounts seeded so there is somebody to sign in as. Otherwise the
  // server the suites use: Demo Mode on, sign-up open (every suite's first act
  // is to sign itself up) and no seeded accounts, because that first signup has
  // to become the administrator.
  const startServer = (port: number, product: boolean) =>
    spawn(process.execPath, [...nodeArgs, "backend/index.ts"], {
      cwd: root,
      stdio: "inherit",
      // CVs are read by the text rules alone here, so the suites stay network-independent (backend/cvExtract.ts).
      // Every flag is always said, "0" included: one left in the shell or in backend/.env must not reach either server.
      env: {
        ...process.env,
        API_PORT: String(port),
        CV_READ_WITH_ASSISTANT: "0",
        // NO MODEL FOR THESE SUITES (REQUIREMENTS §72). Mitra now asks Groq
        // first and only answers from the app's own tables when it cannot —
        // which is the point: a person must be able to tell which of the two
        // replied. But these suites are network-independent by design, and
        // backend/.env's real GROQ_API_KEY reaches this server through
        // process.env above, so without this line every chat message in every
        // suite would become a live, paid, flaky API call. Blanked here, the
        // server reports the assistant as not configured and the suites get
        // the app's own answers, labelled as such. The REAL API is exercised
        // by tests/e2e_assistant_chat.py, which is run on its own (TESTING.md).
        GROQ_API_KEY: "",
        DATABASE_URL,
        SQLITE_IMPORT: "0",
        SEED_ACCOUNTS: product ? "1" : "0",
        SEED_ACCOUNT_PASSWORD: PRODUCT_SEED_PASSWORD,
        DEMO_MODE: product ? "0" : "1",
        ALLOW_SIGNUP: product ? "0" : "1",
        // NO SCHEDULED JOBS (REQUIREMENTS §75, backend/jobs.ts). The suites run on
        // the real clock and count activity-log lines: an escalation or a weekly
        // digest that ran by itself at 10:00 in the middle of a suite would add
        // lines and bell items nobody asked for. A suite that needs one runs it
        // by hand, as the super admin, with POST /api/jobs/run.
        JOBS: "0",
      },
    });
  console.log(`Starting server on :${TEST_PORT}...`);
  const server = startServer(TEST_PORT, false);
  let productServer: ReturnType<typeof startServer> | null = null;
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
      // REQUIREMENTS §68: the Purchase module and the company's five F/PUR formats — beside the QC one, which is the same kind of check.
      "tests/e2e_purchase_module.py",
      // REQUIREMENTS §71: the Store module, its two F/STR formats, and the
      // rubber stamp shown exactly as the plant supplied it.
      "tests/e2e_store_module.py",
      // REQUIREMENTS §72: Mitra asks the model and says when it could not, and
      // every log-out asks about the day's work first.
      "tests/e2e_assistant_and_logout.py",
      // REQUIREMENTS §70: the Dispatch module, and its Gujarati container check.
      "tests/e2e_dispatch_module.py",
      // REQUIREMENTS §74: the Maintenance module — the equipment master, the Hindi and
      // Gujarati health sheet, the worked-out breakdown minutes, and a record read
      // under the revision it was made on.
      "tests/e2e_maintenance_module.py",
      // REQUIREMENTS §75: Insights — what the records show when read together, the
      // Dashboard's three, a CAPA raised from one on a click, and each account's own.
      "tests/e2e_insights.py",
      "tests/e2e_format_numbers.py",
      "tests/e2e_hr_master_data.py",
      "tests/e2e_downloads_and_print.py",
      "tests/e2e_postgres_storage.py",
  // The portal's own controls (REQUIREMENTS §62): reviewed before submitted, formats revised on record, the activity log.
  "tests/e2e_portal_controls.py",
  // REQUIREMENTS §64: a format designed on the sheet, told to Mitra in words, and the scorecard.
  "tests/e2e_sheet_designer.py",
  "tests/e2e_mitra_format.py",
  // REQUIREMENTS §65: the product has no Demo Mode — run against a second server started without it (below).
  PRODUCT_SUITE,
  // REQUIREMENTS §66: nobody creates their own account — the same second server.
  LOGIN_ONLY_SUITE,
  // REQUIREMENTS §75: lateness escalated to the super admin, and the weekly digest — the same second server.
  ESCALATION_SUITE,
  // Last, because of its signups.
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
      if (PRODUCT_SUITES.includes(suite)) {
        // The product as it is installed: started, waited for and stopped like the first server, for this suite alone.
        if (await answers(`http://localhost:${PRODUCT_PORT}/api/auth/me`)) throw new Error(`Something is already listening on :${PRODUCT_PORT} — stop it first, so ${suite} runs against this build.`);
        console.log(`Starting the product's own server (no Demo Mode, no sign-up) on :${PRODUCT_PORT}...`);
        productServer = startServer(PRODUCT_PORT, true);
        if (!(await waitForServer(`http://localhost:${PRODUCT_PORT}/api/auth/me`, 15000))) throw new Error(`Server did not come up on :${PRODUCT_PORT} in time.`);
      }
      console.log(`Running ${suite}...`);
      const test = spawnSync(python, [suite], { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
      if (productServer) {
        productServer.kill();
        productServer = null;
      }
      const suiteExit = test.status ?? 1;
      if (suiteExit !== 0) {
        exitCode = suiteExit;
        break; // don't run later suites against a server whose earlier suite already failed/left it in an odd state
      }
    }
  } finally {
    productServer?.kill();
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
