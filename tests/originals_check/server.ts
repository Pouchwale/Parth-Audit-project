// THE CHECK'S PRIVATE DCRS (tests/originals_check/README.md). Not the owner's database and not any port the owner uses: a
// temporary embedded PostgreSQL, port 4300 (or --port), the CURRENT worktree's code, the seeded super admin on the password the
// parent gives it in its environment (the check makes a random one per run, in memory, and never writes it anywhere), sign-up
// off, working hours off, scheduled jobs off, no AI key of any name, no push, and the sample fill switched on as on every test
// server (ALLOW_SAMPLE_FILL=1: Mitra's "fill it with sample data", plainly test data). The pattern of tests/qc_visual/server.ts
// (C:/Users/parth/Desktop/dcrs-qcvis-wt) and DCRS-handoff/tools/live-dcrs.ts.
//
//   ORIGCHECK_PASSWORD=... node --no-warnings=ExperimentalWarning tests/originals_check/server.ts [--port N] [--build]
//
// It prints "READY http://127.0.0.1:PORT" when the server answers, and stops (server, database, folder) when its parent writes
// "stop" on stdin or closes it - so a crashed parent never leaves a database behind.
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import EmbeddedPostgres from "embedded-postgres";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CODE = path.resolve(HERE, "..", ".."); // the worktree this file is in: the current code
// The owner's phone test, the e2e suites, the QC visual workflow, the usual dev servers and the owner's databases.
const FORBIDDEN = new Set([3000, 4000, 4100, 4200, 4201, 4202, 8081, 8090, 8842, 8843, 8851, 5432, 5433]);
const PASSWORD = process.env.ORIGCHECK_PASSWORD;
if (!PASSWORD) throw new Error("ORIGCHECK_PASSWORD is not set (the check's orchestrator sets it).");

const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = argv.indexOf(name);
  return i > -1 ? argv[i + 1] : undefined;
};

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const port = (srv.address() as net.AddressInfo).port;
      srv.close(() => resolve(port));
    });
  });

const port = Number(flag("--port") ?? 4300);
if (FORBIDDEN.has(port)) throw new Error(`Port ${port} is one the check never uses.`);
let pgPort = await freePort();
while (FORBIDDEN.has(pgPort)) pgPort = await freePort();

if (argv.includes("--build")) {
  console.log("[originals-check] building the frontend of this worktree...");
  const built = spawnSync(process.execPath, ["--no-warnings=ExperimentalWarning", "frontend/scripts/build.ts"], { cwd: CODE, stdio: "inherit" });
  if (built.status !== 0) throw new Error("The frontend did not build.");
}

const { pgCtlPath } = await import(pathToFileURL(path.join(CODE, "backend/db.ts")).href);
const databaseDir = mkdtempSync(path.join(os.tmpdir(), "dcrs-origcheck-pg-"));
const database = new EmbeddedPostgres({
  databaseDir,
  user: "postgres",
  password: "origcheck",
  port: pgPort,
  persistent: false,
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  onLog: () => {},
  onError: () => {},
});
const pgCtl = await pgCtlPath();
let stopped = false;
let server: ReturnType<typeof spawn> | null = null;
const stopAll = async (): Promise<void> => {
  if (stopped) return;
  stopped = true;
  try {
    server?.kill();
  } catch {
    /* already gone */
  }
  spawnSync(pgCtl, ["stop", "-D", databaseDir, "-m", "fast", "-w", "-t", "60"], { stdio: "ignore", windowsHide: true });
  for (let i = 0; i < 10; i++) {
    try {
      rmSync(databaseDir, { recursive: true, force: true });
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  console.log("[originals-check] stopped and cleaned up");
};

try {
  await database.initialise();
  await database.start();
  await database.createDatabase("dcrs_origcheck");
} catch (err) {
  await stopAll();
  throw err;
}

server = spawn(process.execPath, ["--no-warnings=ExperimentalWarning", "backend/index.ts"], {
  cwd: CODE,
  stdio: ["ignore", "ignore", "ignore"],
  windowsHide: true,
  env: {
    ...process.env,
    API_PORT: String(port),
    DATABASE_URL: `postgres://postgres:origcheck@127.0.0.1:${pgPort}/dcrs_origcheck`,
    OVERVIEW_DATABASE_URL: "",
    // The super admin and the plant's named accounts, on the one password of this run.
    SEED_ACCOUNTS: "1",
    SEED_ACCOUNT_PASSWORD: PASSWORD,
    ALLOW_SIGNUP: "0",
    // The browser offers Mitra's sample fill on a Live record only where the server runs Demo Mode (engine/features.ts: the
    // server says sampleFill with its demoMode), as the e2e suites' server does.
    DEMO_MODE: "1",
    // Mitra's sample fill, as on every test server: plainly test data, never a Live record in the plant (REQUIREMENTS §98).
    ALLOW_SAMPLE_FILL: "1",
    ARCHIVE_BLANKS: "0",
    DCRS_WORKING_HOURS: "off",
    DCRS_MAX_DEVICES: "off",
    JOBS: "0",
    PUSH_ENABLED: "0",
    // No model, no key of any name: the assistant is "not configured" and no AI call can be made.
    CHATGPT_API_KEY: "",
    OPENAI_API_KEY: "",
    GROQ_API_KEY: "",
    CV_READ_WITH_ASSISTANT: "0",
    PICTURES_READ_WITH_ASSISTANT: "0",
    MITRA_SERVER_KEY: "",
    SQLITE_IMPORT: "0",
  },
});
server.on("exit", (code) => {
  if (!stopped) {
    console.log(`[originals-check] the server ended (exit ${code})`);
    void stopAll().then(() => process.exit(1));
  }
});

let up = false;
for (let i = 0; i < 240 && !up && !stopped; i++) {
  try {
    up = (await fetch(`http://127.0.0.1:${port}/api/health`)).ok || (await fetch(`http://127.0.0.1:${port}/api/auth/me`)).status > 0;
  } catch {
    await new Promise((r) => setTimeout(r, 500));
  }
}
if (!up) {
  console.log("[originals-check] the server did not come up");
  await stopAll();
  process.exit(1);
}
await new Promise((r) => setTimeout(r, 1500)); // the seeding of the named accounts finishes just after the first answer
console.log(`READY http://127.0.0.1:${port}`);

// Until the parent says stop (or goes away).
process.stdin.setEncoding("utf-8");
process.stdin.on("data", (d: string) => {
  if (d.includes("stop")) void stopAll().then(() => process.exit(0));
});
process.stdin.on("end", () => void stopAll().then(() => process.exit(0)));
process.stdin.on("close", () => void stopAll().then(() => process.exit(0)));
process.once("SIGINT", () => void stopAll().then(() => process.exit(130)));
process.once("SIGTERM", () => void stopAll().then(() => process.exit(143)));
