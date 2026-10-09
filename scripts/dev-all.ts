// Runs the API server and the frontend dev server together (one `npm run
// dev`), so the app works end-to-end (signup/login included) without two
// terminals. `npm run dev:frontend` / `npm run server` still work standalone.
//
// Before starting, it asks who holds its two ports (scripts/dev-ports.ts,
// REQUIREMENTS §101): a part DCRS already runs is not started twice, the
// website moves to a free port when another program holds 5173, and a taken
// API port stops the start with the program that holds it.
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { planDev } from "./dev-ports.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const nodeArgs = ["--no-warnings=ExperimentalWarning"];

// The same settings the two servers read (backend/index.ts, frontend/scripts/dev-server.ts).
const API_PORT = process.env.API_PORT ? Number(process.env.API_PORT) : 4000;
const WEB_PORT = process.env.PORT ? Number(process.env.PORT) : 5173;

const plan = await planDev(API_PORT, WEB_PORT);
for (const note of plan.notes) console.log(note);
if (plan.stop) {
  console.error(plan.stop);
  process.exit(1);
}

const children: ChildProcess[] = [];
// DCRS_DEV: the website comes from the dev server below, so the API does not build frontend/dist (backend/websiteBuild.ts).
if (plan.startApi) children.push(spawn(process.execPath, [...nodeArgs, "backend/index.ts"], { cwd: root, stdio: "inherit", env: { ...process.env, DCRS_DEV: "1" } }));
if (plan.webPort !== null) {
  children.push(
    spawn(process.execPath, [...nodeArgs, "frontend/scripts/dev-server.ts"], {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, PORT: String(plan.webPort), API_PORT: String(API_PORT) },
    })
  );
}
if (children.length === 0) process.exit(0);

let shuttingDown = false;
function shutdown(code: number): void {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill();
  process.exit(code);
}

for (const child of children) {
  // A child killed by a signal reports code null — that's a crash, not a
  // clean exit, so it mustn't turn into exit status 0.
  child.on("exit", (code, signal) => shutdown(code ?? (signal ? 1 : 0)));
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
