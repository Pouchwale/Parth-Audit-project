// A LOCAL RUN TO CHECK A CHANGE BEFORE THE PLANT SEES IT (the owner, 2-Nov-2026: "first always check a new feature by
// running it locally, and only then deploy"). One command, `npm run dev` (`npm run dev:local` is the same; the older
// scripts/dev-all.ts is `npm run dev:shared`), and nothing of the plant's is touched:
//
//   1. A PostgreSQL of its own, made fresh in a temporary folder on a free port and thrown away when this stops —
//      never backend/data/postgres, which holds the plant's records (the way scripts/run-e2e.ts does it).
//   2. DCRS's API behind the website, on this computer alone (LISTEN_HOST=127.0.0.1, port 4101 never reachable from the
//      network and never printed; LOCAL_API_PORT to choose another; no secure address), with the plant's named accounts
//      seeded on the LOCAL password below, sign-up open, Demo Mode on (a year of sample records in a click), the
//      working-hours gate and the device limit off, no scheduled jobs, and no email or push leaving this machine.
//      backend/.env's AI keys are kept, so Mitra can be tried.
//   3. The website from its dev server on port 5173 - THE ONE ADDRESS (the owner, 3-Nov-2026: "only run localhost on
//      port 5173, not another port"): it proxies /api to that API and serves the bundle from a loopback port of the
//      bundler's own, so a change to frontend/src shows on reload without a build. Port 5173 taken: the run stops and
//      says so; it never moves to another port.
//
// Open http://localhost:5173 and sign in as admin@gpp.local with the password Local@12345 (or kapila.barad@gpp.local,
// vinay.bhojak@gpp.local, sandeep.parekh@gpp.local, same password). Ctrl+C stops all three and removes the database.
// When the change is right: `npm run build` in the plant's copy, and the server on 4100 serves it.
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import { pgCtlPath } from "../backend/db.ts";
import { portFree } from "./dev-ports.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const nodeArgs = ["--no-warnings=ExperimentalWarning"];

/** The one local password, for every seeded account. Written here so the person running this knows it; it is never the plant's. */
export const LOCAL_PASSWORD = "Local@12345";
const API_PORT = Number(process.env.LOCAL_API_PORT || 4101);
const WEB_PORT = Number(process.env.LOCAL_WEB_PORT || 5173);

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

function waitFor(url: string, ms: number): Promise<boolean> {
  const until = Date.now() + ms;
  return new Promise((resolve) => {
    const tick = async () => {
      try {
        const res = await fetch(url);
        if (res.ok) return resolve(true);
      } catch {
        /* not up yet */
      }
      if (Date.now() > until) return resolve(false);
      setTimeout(() => void tick(), 500);
    };
    void tick();
  });
}

async function main(): Promise<void> {
  if (!(await portFree(API_PORT))) {
    console.error(`Port ${API_PORT} is in use. Stop what holds it, or run with LOCAL_API_PORT=<another port>.`);
    process.exit(1);
  }
  // The one address is port 5173 and no other: taken, the run stops here instead of moving (the owner, 3-Nov-2026).
  const webPort = WEB_PORT;
  if (!(await portFree(webPort))) {
    console.error(`Port ${webPort} is in use - another local run is probably still open. Stop it (Ctrl+C in its window), then start this again.`);
    process.exit(1);
  }

  console.log("Starting a fresh PostgreSQL for this local run (the plant's database is not touched)...");
  const pgPort = await freePort();
  const databaseDir = mkdtempSync(path.join(os.tmpdir(), "dcrs-local-pg-"));
  const database = new EmbeddedPostgres({
    databaseDir,
    user: "postgres",
    password: "local",
    port: pgPort,
    persistent: false,
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    onLog: () => {},
    onError: (message: unknown) => console.error("[postgres]", String(message)),
  });
  const pgCtl = await pgCtlPath();
  const children: ChildProcess[] = [];
  let stopping = false;
  const stop = async (code: number): Promise<never> => {
    if (stopping) return new Promise(() => {});
    stopping = true;
    for (const child of children) child.kill();
    spawnSync(pgCtl, ["stop", "-D", databaseDir, "-m", "fast", "-w", "-t", "60"], { stdio: "ignore", windowsHide: true });
    (database as unknown as { process?: unknown }).process = undefined;
    for (let i = 0; i < 10; i++) {
      try {
        rmSync(databaseDir, { recursive: true, force: true });
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    console.log("Stopped: the local servers are down and the local database removed.");
    process.exit(code);
  };
  process.once("SIGINT", () => void stop(0));
  process.once("SIGTERM", () => void stop(0));

  try {
    await database.initialise();
    await database.start();
    await database.createDatabase("dcrs_local");
  } catch (err) {
    console.error(`PostgreSQL for the local run did not start: ${err instanceof Error ? err.message : String(err)}`);
    await stop(1);
  }
  const DATABASE_URL = `postgres://postgres:local@127.0.0.1:${pgPort}/dcrs_local`;

  console.log("Starting DCRS's API behind the website, on this computer alone...");
  const api = spawn(process.execPath, [...nodeArgs, "backend/index.ts"], {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      API_PORT: String(API_PORT),
      // This computer alone, and no secure address: the website's port is the one address (backend/index.ts LISTEN_HOST).
      LISTEN_HOST: "127.0.0.1",
      DCRS_HTTPS: "off",
      DCRS_DEV: "1",
      DATABASE_URL,
      // The backups the page makes (REQUIREMENTS §160) go beside the scratch database, never into the plant's
      // backend/data/backups; they vanish with it when the run stops.
      BACKUP_DIR: path.join(databaseDir, "backups"),
      SQLITE_IMPORT: "0",
      SEED_ACCOUNTS: "1",
      SEED_ACCOUNT_PASSWORD: LOCAL_PASSWORD,
      ALLOW_SIGNUP: "1",
      DEMO_MODE: "1",
      DAYLIGHT_THEME: "1",
      ALLOW_SAMPLE_FILL: "1",
      DCRS_WORKING_HOURS: "off",
      DCRS_MAX_DEVICES: "off",
      JOBS: "0",
      PUSH_ENABLED: "0",
      MITRA_SERVER_KEY: "",
      GMAIL_USER: "",
      GMAIL_APP_PASSWORD: "",
      EMAIL_TRANSPORT: "capture",
    },
  });
  children.push(api);
  api.on("exit", (code) => void stop(code ?? 1));
  if (!(await waitFor(`http://127.0.0.1:${API_PORT}/api/health`, 90_000))) {
    console.error("DCRS's API did not answer within 90 seconds.");
    await stop(1);
  }

  const web = spawn(process.execPath, [...nodeArgs, "frontend/scripts/dev-server.ts"], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, PORT: String(webPort), API_PORT: String(API_PORT) },
  });
  children.push(web);
  web.on("exit", (code) => void stop(code ?? 1));
  await waitFor(`http://127.0.0.1:${webPort}/`, 60_000);

  console.log("");
  console.log("LOCAL RUN READY");
  console.log(`  Open:      http://localhost:${webPort}   (the one address: the website and, behind it, the API)`);
  console.log(`  Sign in:   admin@gpp.local  /  ${LOCAL_PASSWORD}   (also kapila.barad@, vinay.bhojak@, sandeep.parekh@gpp.local)`);
  console.log("  Database:  a scratch one, removed when this stops. The plant's server on 4100 and its records are not involved.");
  console.log("  Stop:      Ctrl+C here.");
  console.log("");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
