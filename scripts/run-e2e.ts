// Orchestrates the network-independent Playwright suites (tests/e2e_smoke.py,
// tests/e2e_backlog_regression.py, tests/e2e_voice.py, tests/e2e_realism.py, tests/e2e_editing.py, tests/e2e_files.py,
// tests/e2e_translate.py, tests/e2e_print_and_forms.py, tests/e2e_capa_formats.py,
// tests/e2e_agreement_and_cancel.py, tests/e2e_crud.py,
// tests/e2e_print_all_documents.py, tests/e2e_assistant_fill.py,
// tests/e2e_departments.py, tests/e2e_trend_reports.py, tests/e2e_hr_module.py,
// tests/e2e_hr_cv_import.py, tests/e2e_qc_calibration.py, tests/e2e_qc_formats.py,
// tests/e2e_purchase_module.py, tests/e2e_store_module.py, tests/e2e_assistant_and_logout.py,
// tests/e2e_maintenance_module.py, tests/e2e_pm_link.py, tests/e2e_sys_module.py, tests/e2e_marketing_module.py, tests/e2e_topbar_status.py, tests/e2e_storage_room.py, tests/e2e_insights.py, tests/e2e_format_numbers.py,
// tests/e2e_hr_master_data.py, tests/e2e_downloads_and_print.py, tests/e2e_postgres_storage.py,
// and last the two of the database DCRS shares with the Audit Assistant (REQUIREMENTS §83):
// tests/e2e_audit_assistant_api.py and tests/e2e_database_overview.py; then REQUIREMENTS §84's
// tests/e2e_find_every_document.py, tests/e2e_user_access.py and tests/e2e_working_hours.py):
// a fresh PostgreSQL for the run, build,
// single-process server (dist/ + auth API) on the port the tests expect,
// wait for it to answer, set up the shared database's overview on it (below),
// run each suite in turn against the same server,
// then always tear the server down again -- regardless of pass/fail -- so
// `npm run test:e2e` doesn't leak a background process. (tests/visual_qa.py
// and tests/e2e_assistant_chat.py are NOT run here -- they're slower/make
// real network calls to Groq -- see docs/TESTING.md for running those manually.)
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
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
// REQUIREMENTS §83: the DCRS API another server (the Audit Assistant) calls as
// the signed-in person, and the super admin's "Database overview" — both with
// the plant's seeded super admin, so on the product server.
const AUDIT_ASSISTANT_API_SUITE = "tests/e2e_audit_assistant_api.py";
const DATABASE_OVERVIEW_SUITE = "tests/e2e_database_overview.py";
// REQUIREMENTS §84, with the plant's seeded accounts on the product server: every document findable by everybody
// (another department's shown as kept by it), the super admin's User access dashboard, and the plant's working hours.
const FIND_EVERY_DOCUMENT_SUITE = "tests/e2e_find_every_document.py";
const USER_ACCESS_SUITE = "tests/e2e_user_access.py";
// REQUIREMENTS §96 and §97, with the plant's twelve seeded people: each sees and may do what the owner's table says,
// the super admin's Users & Access (levels by module and by document), and the bell and the Notifications page.
const ACCESS_LEVELS_SUITE = "tests/e2e_access_levels.py";
const WORKING_HOURS_SUITE = "tests/e2e_working_hours.py";
// REQUIREMENTS §85: the Mitra mobile app does what Mitra does, through DCRS's own engine on the server (product server).
const MOBILE_MITRA_API_SUITE = "tests/e2e_mobile_mitra_api.py";
// REQUIREMENTS §85: the guided tour on the Dashboard, for staff and the super admin (product server).
const TOUR_SUITE = "tests/e2e_tour.py";
// REQUIREMENTS §93: every record starts on its own page and stays, for the super admin and for each department's own
// account, on a system live since the first of last month (product server; it adds the departments' accounts, so it
// runs last).
const EVERY_RECORD_STARTS_SUITE = "tests/e2e_every_record_starts.py";
const PRODUCT_SUITES = [
  PRODUCT_SUITE,
  LOGIN_ONLY_SUITE,
  ESCALATION_SUITE,
  AUDIT_ASSISTANT_API_SUITE,
  DATABASE_OVERVIEW_SUITE,
  FIND_EVERY_DOCUMENT_SUITE,
  USER_ACCESS_SUITE,
  ACCESS_LEVELS_SUITE,
  WORKING_HOURS_SUITE,
  MOBILE_MITRA_API_SUITE,
  TOUR_SUITE,
  EVERY_RECORD_STARTS_SUITE,
];
// THE SHARED DATABASE'S OVERVIEW (REQUIREMENTS §83), set up on this run's
// database exactly as a DBA sets it up on the plant's: its two new schemas and
// roles (part 1) and the plain-English views over DCRS's data (part 2), applied
// as the superuser once DCRS has made its own tables — nothing of DCRS's is
// changed by them, which every suite of this run then proves again. Both servers
// read the views as the role overview_viewer, whose password is set here.
const SHARED_DATABASE_PARTS = ["01-schemas-and-roles.sql", "02-overview-dcrs.sql"];
const OVERVIEW_VIEWER_PASSWORD = "e2e-viewer";
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
  // E2E_SKIP_UNIT=1 leaves them out, for a run that proves one suite while somebody else's unit test is being mended
  // (the unit tests are then run on their own, and said to be).
  if (process.env.E2E_SKIP_UNIT === "1") console.log("Unit tests skipped (E2E_SKIP_UNIT=1): run npm run test:unit on its own.");
  else {
    console.log("Unit tests...");
    run(process.execPath, [...nodeArgs, "scripts/unit-tests.ts"]);
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
  // Nothing connects with it until a suite opens the Database overview, by which
  // time the role and its password are there (set up below, once :8842 has made DCRS's tables).
  const OVERVIEW_DATABASE_URL = `postgres://overview_viewer:${OVERVIEW_VIEWER_PASSWORD}@127.0.0.1:${pgPort}/dcrs_e2e`;

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
        // by tests/e2e_assistant_chat.py, which is run on its own (docs/TESTING.md).
        GROQ_API_KEY: "",
        DATABASE_URL,
        // The Database overview's own read-only connection (backend/overviewRoutes.ts), on this run's database.
        OVERVIEW_DATABASE_URL,
        // The plant's opening hours (REQUIREMENTS §84) are not enforced on the test servers: the suites run at any
        // hour of any day. The gate itself is proved by its own tests, with a clock the test sets.
        DCRS_WORKING_HOURS: "off",
        SQLITE_IMPORT: "0",
        SEED_ACCOUNTS: product ? "1" : "0",
        SEED_ACCOUNT_PASSWORD: PRODUCT_SEED_PASSWORD,
        DEMO_MODE: product ? "0" : "1",
        ALLOW_SIGNUP: product ? "0" : "1",
        // SAMPLE DATA IN A LIVE RECORD (REQUIREMENTS §98): never in the plant, where it is Demo Mode's alone;
        // on both test servers, because the suites fill the records they check with Mitra's sample data.
        ALLOW_SAMPLE_FILL: "1",
        // NO SCHEDULED JOBS (REQUIREMENTS §75, backend/jobs.ts). The suites run on
        // the real clock and count activity-log lines: an escalation or a weekly
        // digest that ran by itself at 10:00 in the middle of a suite would add
        // lines and bell items nobody asked for. A suite that needs one runs it
        // by hand, as the super admin, with POST /api/jobs/run.
        JOBS: "0",
        // NO PUSH TO A REAL PHONE SERVICE (REQUIREMENTS §97, backend/push.ts). The suites run notify by hand; a suite that
        // registered a phone would otherwise have its pushes sent to Expo's real service. Off here, and said: the
        // sender is proved against a stand-in (backend/tests/push.test.ts) and, by a reviewer, against Expo's own
        // endpoint with a fake token.
        PUSH_ENABLED: "0",
      },
    });
  console.log(`Starting server on :${TEST_PORT}...`);
  const server = startServer(TEST_PORT, false);
  let productServer: ReturnType<typeof startServer> | null = null;
  const sql = new pg.Client({ connectionString: DATABASE_URL });

  let exitCode = 1;
  try {
    // A minute, not fifteen seconds: on a busy machine the server's first start
    // against a fresh database took 20 s (26-Sep-2026) and the run died before
    // a single suite ran. The wait ends the moment the server answers.
    const ready = await waitForServer(`http://localhost:${TEST_PORT}/api/auth/me`, 60000);
    if (!ready) throw new Error(`Server did not come up on :${TEST_PORT} in time.`);

    // The server has made DCRS's tables by now (it answers only once its schema
    // is in place), so the overview can be laid over them. Each part is safe to
    // run again; the server needs no restart, as it connects for the overview
    // only when a page asks.
    await sql.connect();
    console.log("Setting up the shared database's overview (database/sql)...");
    for (const part of SHARED_DATABASE_PARTS) await sql.query(readFileSync(path.join(root, "database", "sql", part), "utf-8"));
    await sql.query(`ALTER ROLE overview_viewer PASSWORD ${sql.escapeLiteral(OVERVIEW_VIEWER_PASSWORD)}`);

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
      // REQUIREMENTS §82: F/MNT/03 follows F/MNT/02 — the schedule's Actuals read, never
      // typed, from the machines' PM sheets, and the sample year of PM dates.
      "tests/e2e_pm_link.py",
      // REQUIREMENTS §76: the System / Management module — the PSTL's eighteen
      // F/SYS formats, their supplied pages on file, Edit on a verified record,
      // F/SYS/07's worked-out audit frequency and judgements made afresh.
      "tests/e2e_sys_module.py",
      // REQUIREMENTS §77: the Marketing module — the customer's feedback, its
      // worked-out analysis, the complaint trend with its charts — and the
      // header block of every format designed in place.
      "tests/e2e_marketing_module.py",
      // REQUIREMENTS §78: the top bar's connection badge and clock.
      "tests/e2e_topbar_status.py",
      // REQUIREMENTS §79: the browser nearly full — named, cleared in a click; Demo Mode stops short.
      "tests/e2e_storage_room.py",
  "tests/e2e_mitra_agent.py",
  // REQUIREMENTS §81: the 3D introduction and the fonts; sound and Mitra's voice; celebrations in every module;
  // and every document's Word/Excel downloaded, edited and uploaded back.
  "tests/e2e_intro_and_fonts.py",
  "tests/e2e_voice_and_sounds.py",
  "tests/e2e_celebrations.py",
  "tests/e2e_upload_changes.py",
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
  // REQUIREMENTS §85: Copy and Edit in Mitra's chat, on the page and in the dock (sign-up, :8842).
  "tests/e2e_mitra_copy_edit.py",
  // REQUIREMENTS §86: the header block typed over where it stands, on every document (the fill suite's account, :8842).
  "tests/e2e_header_editing.py",
  // REQUIREMENTS §89: Mitra in English, Hindi and Gujarati - the voice card's three languages, the Hindi line, each
  // sentence in its own voice, the hint where Chrome has no Gujarati voice (sign-up, :8842).
  "tests/e2e_voice_languages.py",
  // REQUIREMENTS §90: light, dark or the same as the computer: the switch, the choice kept for the person, no flash,
  // the paper white in dark, print the same in either theme, every page in dark (one sign-up, :8842).
  "tests/e2e_theme.py",
  // Last of the suites on :8842, because of its signups.
  "tests/e2e_performance.py",
  // REQUIREMENTS §83, the database DCRS shares with the Audit Assistant — the product server, the plant's seeded super admin:
  // the API another server calls as the signed-in person ("Through Audit Assistant" in the record's history and the log),
  AUDIT_ASSISTANT_API_SUITE,
  // and the super admin's read-only Database overview of the shared database's views.
  DATABASE_OVERVIEW_SUITE,
  // REQUIREMENTS §84 — every document findable, the super admin's User access, the plant's working hours.
  FIND_EVERY_DOCUMENT_SUITE,
  USER_ACCESS_SUITE,
  // REQUIREMENTS §96 and §97 — who may do what, set by the super admin, and the notifications in the website.
  ACCESS_LEVELS_SUITE,
  WORKING_HOURS_SUITE,
  // REQUIREMENTS §85 — the mobile app's API, DCRS's engine on the server.
  MOBILE_MITRA_API_SUITE,
  TOUR_SUITE,
  // REQUIREMENTS §93 — every record starts and stays; last, because it adds the departments' accounts.
  EVERY_RECORD_STARTS_SUITE,
    ];
    // `npm run test:e2e -- tests/e2e_postgres_storage.py ...` runs just those suites.
    const only = process.argv.slice(2).map((a) => a.split("\\").join("/")).filter((a) => a.endsWith(".py"));
    const unknown = only.filter((a) => !suites.includes(a));
    if (unknown.length) throw new Error(`Not suites of this run: ${unknown.join(", ")}`);
    exitCode = 0;
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
        if (!(await waitForServer(`http://localhost:${PRODUCT_PORT}/api/auth/me`, 60000))) throw new Error(`Server did not come up on :${PRODUCT_PORT} in time.`);
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
