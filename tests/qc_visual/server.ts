// THE KIT'S PRIVATE DCRS (tests/qc_visual/README.md). Not the owner's database and not any port the owner uses: a temporary embedded
// PostgreSQL, a free port (or --port), the CURRENT worktree's code, the seeded super admin on the password the parent gives it in
// its environment (the kit generates a random one per run, in memory, and never writes it anywhere), sign-up off, working hours off,
// scheduled jobs off, no AI key, no push. Based on DCRS-handoff/tools/live-dcrs.ts.
//
//   QCVIS_PASSWORD=... node --no-warnings=ExperimentalWarning tests/qc_visual/server.ts [--port N] [--build]
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
const FORBIDDEN = new Set([3000, 4000, 4100, 8081, 8090, 8842, 8843, 5432, 5433]);
const PASSWORD = process.env.QCVIS_PASSWORD;
if (!PASSWORD) throw new Error("QCVIS_PASSWORD is not set (the kit's orchestrator sets it).");

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

const wanted = flag("--port") ? Number(flag("--port")) : 0;
if (wanted && FORBIDDEN.has(wanted)) throw new Error(`Port ${wanted} is one the kit never uses.`);
let port = wanted;
if (!port) {
  do port = await freePort();
  while (FORBIDDEN.has(port));
}
const pgPort = await freePort();

if (argv.includes("--build")) {
  console.log("[qc-visual] building the frontend of this worktree...");
  const built = spawnSync(process.execPath, ["--no-warnings=ExperimentalWarning", "frontend/scripts/build.ts"], { cwd: CODE, stdio: "inherit" });
  if (built.status !== 0) throw new Error("The frontend did not build.");
}

const { pgCtlPath } = await import(pathToFileURL(path.join(CODE, "backend/db.ts")).href);
const databaseDir = mkdtempSync(path.join(os.tmpdir(), "dcrs-qcvis-pg-"));
const database = new EmbeddedPostgres({
  databaseDir,
  user: "postgres",
  password: "qcvis",
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
  console.log("[qc-visual] stopped and cleaned up");
};

try {
  await database.initialise();
  await database.start();
  await database.createDatabase("dcrs_qcvis");
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
    DATABASE_URL: `postgres://postgres:qcvis@127.0.0.1:${pgPort}/dcrs_qcvis`,
    OVERVIEW_DATABASE_URL: "",
    // The super admin and the plant's named accounts, on the one password of this run.
    SEED_ACCOUNTS: "1",
    SEED_ACCOUNT_PASSWORD: PASSWORD,
    ALLOW_SIGNUP: "0",
    DEMO_MODE: "0",
    ALLOW_SAMPLE_FILL: "0",
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
    console.log(`[qc-visual] the server ended (exit ${code})`);
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
  console.log("[qc-visual] the server did not come up");
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
